<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\ShiftAutoGenerateRequest;
use App\Models\Assignment;
use App\Models\Shift;
use App\Models\ShiftType;
use App\Models\Unit;
use App\Support\JapaneseHolidayResolver;
use App\Support\SchedulePreference;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

class ShiftGenerationController extends Controller
{
    public function generate(ShiftAutoGenerateRequest $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if (! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
            abort(403, 'This operation is restricted to admins or leaders.');
        }

        $month = $request->validated('month');
        $constraints = array_merge([
            'enforce_night_after_rest' => true,
            'enforce_night_rest_pairing' => true,
            'forbid_late_to_early' => true,
            'limit_fulltime_repeat' => true,
            'balance_workload' => true,
            'max_nights_per_member' => 7,
            'max_consecutive_workdays' => 5,
            'time_limit' => 20,
            'min_off_days' => 4,
            'min_off_days_full_time' => 8,
            'min_off_days_part_time' => 4,
        ], $request->validated('constraints') ?? []);
        $preserveExisting = $request->boolean('preserve_existing', true);
        $enforceNightRestPairing = (bool) ($constraints['enforce_night_rest_pairing'] ?? true);
        $commit = $request->boolean('commit', false);

        try {
            $monthStart = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        } catch (\Throwable $e) {
            abort(422, '月の形式が正しくありません。');
        }

        $monthEnd = (clone $monthStart)->endOfMonth();

        $rangeInput = $request->input('range');
        if (is_array($rangeInput) && isset($rangeInput['start_date'], $rangeInput['end_date'])) {
            try {
                $windowStart = Carbon::parse($rangeInput['start_date'])->startOfDay();
                $windowEnd = Carbon::parse($rangeInput['end_date'])->startOfDay();
            } catch (\Throwable $e) {
                abort(422, '自動生成する期間の日付形式が正しくありません。');
            }

            if ($windowEnd->lt($windowStart)) {
                abort(422, '自動生成範囲の終了日は開始日以降にしてください。');
            }
        } else {
            $windowStart = $monthStart->copy();
        $windowEnd = $monthEnd->copy();
    }

    $extendedEnd = (clone $windowEnd)->addDays(2);

        if (! isset($constraints['generation_end_date'])) {
            $constraints['generation_end_date'] = $windowEnd->toDateString();
        }

        $holidayDates = JapaneseHolidayResolver::between($windowStart, $extendedEnd);
        if (! empty($holidayDates)) {
            $constraints['holiday_dates'] = array_values(array_unique(array_merge(
                $constraints['holiday_dates'] ?? [],
                $holidayDates,
            )));
        }

        $memberships = $unit->memberships()
            ->with(['user.allowedShiftTypes'])
            ->orderBy('display_order')
            ->get();

        if ($memberships->isEmpty()) {
            abort(422, 'ユニットにメンバーが登録されていません。');
        }

        $days = [];
        $cursor = $windowStart->copy();
        while ($cursor->lte($extendedEnd)) {
            $days[] = $cursor->toDateString();
            $cursor->addDay();
        }

        $coverage = array_merge(
            [
                'early' => 1,
                'day' => 1,
                'late' => 1,
                'night' => 1,
            ],
            $unit->coverage_requirements ?? []
        );

        $existingAssignments = [];

        if ($preserveExisting) {
            $existingShifts = $unit->shifts()
                ->with(['shiftType', 'assignments'])
                ->whereBetween('work_date', [$windowStart->toDateString(), $extendedEnd->toDateString()])
                ->get();

            foreach ($existingShifts as $shift) {
                $code = strtoupper(optional($shift->shiftType)->code ?? '');

                if (! in_array($code, ['EARLY', 'DAY', 'LATE', 'NIGHT', 'NIGHT_AFTER', 'OFF'], true)) {
                    continue;
                }

                foreach ($shift->assignments as $assignment) {
                    $existingAssignments[] = [
                        'date' => $shift->work_date instanceof Carbon
                            ? $shift->work_date->toDateString()
                            : (string) $shift->work_date,
                        'shift_code' => $code,
                        'user_id' => $assignment->user_id,
                    ];
                }
            }
        }

        $payload = $this->buildPayloadForUnit(
            $unit,
            $month,
            $days,
            $memberships->values()->all(),
            $coverage,
            $constraints,
            $existingAssignments,
        );

        $result = $this->runOptimizer($payload);

        if (isset($result['error'])) {
            abort(422, $result['error']);
        }

        if (! isset($result['assignments'])) {
            abort(500, '不正なレスポンスが返されました。');
        }

        if ($commit) {
            $this->storeGeneratedSchedule(
                $unit,
                $month,
                $result,
                $preserveExisting,
                $windowStart,
                $windowEnd,
                $extendedEnd,
                $enforceNightRestPairing,
            );
        }

        $resultWithMeta = $result;
        $resultWithMeta['committed'] = $commit;
        $resultWithMeta['generated_range'] = [
            'start_date' => $windowStart->toDateString(),
            'end_date' => $windowEnd->toDateString(),
        ];

        return response()->json([
            'message' => '自動シフト案を作成しました。',
            'data' => $resultWithMeta,
        ]);
    }

    public function buildPayloadForUnit(
        Unit $unit,
        string $month,
        ?array $days = null,
        ?array $memberships = null,
        ?array $coverage = null,
        array $constraints = [],
        array $existingAssignments = []
    ): array {
        if ($days === null || $memberships === null || $coverage === null) {
            $startDate = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
            $endDate = (clone $startDate)->endOfMonth();
            $days = [];
            $cursor = $startDate->copy();
            while ($cursor->lte($endDate)) {
                $days[] = $cursor->toDateString();
                $cursor->addDay();
            }

            $memberships = $unit->memberships()
                ->with(['user.allowedShiftTypes'])
                ->orderBy('display_order')
                ->get()
                ->all();
            $coverage = array_merge(
                [
                    'early' => 1,
                    'day' => 1,
                    'late' => 1,
                    'night' => 1,
                ],
                $unit->coverage_requirements ?? []
            );

            $constraints['generation_end_date'] = $constraints['generation_end_date'] ?? $endDate->toDateString();
        } else {
            $constraints['generation_end_date'] = $constraints['generation_end_date']
                ?? (count($days) ? Carbon::parse(end($days))->toDateString() : null);
        }

        if (! empty($days)) {
            $startBoundary = Carbon::parse($days[0]);
            $endBoundary = Carbon::parse(end($days));
            $existingHolidayDates = collect($constraints['holiday_dates'] ?? [])
                ->map(function ($value) {
                    try {
                        return Carbon::parse($value)->toDateString();
                    } catch (\Throwable $e) {
                        return null;
                    }
                })
                ->filter()
                ->unique()
                ->values()
                ->all();

            $holidayDates = JapaneseHolidayResolver::between($startBoundary, $endBoundary);
            $constraints['holiday_dates'] = array_values(array_unique(array_merge($holidayDates, $existingHolidayDates)));
        }

        return [
            'unit' => [
                'id' => $unit->id,
                'code' => $unit->code,
                'name' => $unit->name,
            ],
            'month' => $month,
            'days' => $days,
            'members' => collect($memberships)->map(function ($membership) {
                $user = is_object($membership) ? $membership->user : Arr::get($membership, 'user');

                $allowedShiftCodes = null;

                if ($user && method_exists($user, 'allowedShiftTypes')) {
                    $allowedCollection = $user->relationLoaded('allowedShiftTypes')
                        ? $user->allowedShiftTypes
                        : ($user->allowedShiftTypes ?? null);

                    if ($allowedCollection instanceof Collection && $allowedCollection->isNotEmpty()) {
                        $allowedShiftCodes = $allowedCollection
                            ->pluck('code')
                            ->filter()
                            ->map(fn ($code) => strtoupper((string) $code))
                            ->unique()
                            ->values()
                            ->all();
                    }
                }

                if (is_array($allowedShiftCodes)) {
                    $allowedShiftCodes = collect($allowedShiftCodes)
                        ->map(fn ($code) => strtoupper((string) $code))
                        ->filter(fn ($code) => $code !== '')
                        ->unique()
                        ->values()
                        ->all();

                    if (! in_array('OFF', $allowedShiftCodes, true)) {
                        $allowedShiftCodes[] = 'OFF';
                    }

                    if (! in_array('NIGHT_AFTER', $allowedShiftCodes, true)) {
                        $allowedShiftCodes[] = 'NIGHT_AFTER';
                    }
                }

                $schedulePreferences = SchedulePreference::expand(
                    data_get($user, 'settings.schedule_preferences')
                        ?? data_get($membership, 'user.settings.schedule_preferences')
                );

                return [
                    'id' => $user->id ?? Arr::get($membership, 'user_id'),
                    'name' => $user->name ?? Arr::get($membership, 'name', ''),
                    'employment_type' => $user->employment_type ?? Arr::get($membership, 'employment_type', 'member'),
                    'can_night_shift' => (bool) ($user->can_night_shift ?? Arr::get($membership, 'can_night_shift', true)),
                    'allowed_shift_codes' => $allowedShiftCodes,
                    'schedule_preferences' => $schedulePreferences,
                ];
            })->values()->all(),
            'coverage_requirements' => $coverage,
            'constraints' => $constraints,
            'existing_assignments' => $existingAssignments,
        ];
    }

    public function runOptimizer(array $payload): array
    {
        $scriptPath = base_path('scripts/optimizer/generate_schedule.py');
        if (! file_exists($scriptPath)) {
            return ['error' => "Optimizer script not found: {$scriptPath}"];
        }

        $baseCommand = $this->resolvePythonCommand();
        $command = array_merge($baseCommand, [$scriptPath]);

        $process = new Process($command);
        $process->setInput(json_encode($payload));
        $process->setTimeout((float) ($payload['constraints']['time_limit'] ?? 60));
        $process->run();

        if (! $process->isSuccessful()) {
            $errorOutput = trim($process->getErrorOutput()) ?: trim($process->getOutput());
            $decoded = json_decode($errorOutput, true);

            \Log::error('Shift optimizer failed', [
                'payload_month' => $payload['month'] ?? null,
                'payload_unit' => $payload['unit']['id'] ?? null,
                'error_raw' => $errorOutput,
            ]);

            if (! config('app.shift_optimizer_command')
                && str_contains(strtolower($errorOutput), 'incompatible architecture')
                && ($archBinary = $this->resolveArchBinary())) {
                $fallback = [$archBinary, '-arm64', $this->resolvePythonBinary(), $scriptPath];
                $process = new Process($fallback);
                $process->setInput(json_encode($payload));
                $process->setTimeout((float) ($payload['constraints']['time_limit'] ?? 60));
                $process->run();

                if ($process->isSuccessful()) {
                    return json_decode($process->getOutput(), true) ?? ['error' => '不正なレスポンスが返されました。'];
                }

                $errorOutput = trim($process->getErrorOutput()) ?: trim($process->getOutput());
                $decoded = json_decode($errorOutput, true);
            }

            return ['error' => $decoded['error'] ?? 'シフトの自動作成に失敗しました。'];
        }

        $result = json_decode($process->getOutput(), true);

        if (! is_array($result)) {
            return ['error' => '不正なレスポンスが返されました。'];
        }

        return $result;
    }

    private function resolvePythonCommand(): array
    {
        $config = config('app.shift_optimizer_command')
            ?? env('SHIFT_OPTIMIZER_PYTHON');

        if ($config) {
            if (is_array($config)) {
                return $config;
            }

            if (is_string($config)) {
                return preg_split('/\s+/', trim($config)) ?: [$this->resolvePythonBinary()];
            }
        }

        $pythonBinary = $this->resolvePythonBinary();

        if ($this->shouldForceArm64Python() && ($archBinary = $this->resolveArchBinary())) {
            return [$archBinary, '-arm64', $pythonBinary];
        }

        return [$pythonBinary];
    }

    private function shouldForceArm64Python(): bool
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            return false;
        }

        if (! is_callable('shell_exec')) {
            return false;
        }

        $supportsArm = @shell_exec('/usr/sbin/sysctl -in hw.optional.arm64');

        return trim((string) $supportsArm) === '1';
    }

    private function resolveArchBinary(): ?string
    {
        $candidates = ['/usr/bin/arch', 'arch'];

        foreach ($candidates as $candidate) {
            if ($candidate === 'arch' && ! is_callable('shell_exec')) {
                continue;
            }

            if ($candidate !== 'arch' && is_executable($candidate)) {
                return $candidate;
            }

            if ($candidate === 'arch') {
                $resolved = @shell_exec('command -v arch');

                if (is_string($resolved) && trim($resolved) !== '') {
                    return trim($resolved);
                }
            }
        }

        return null;
    }

    private function resolvePythonBinary(): string
    {
        $configured = config('app.shift_optimizer_python_binary')
            ?? env('SHIFT_OPTIMIZER_PYTHON_BINARY');

        if (is_string($configured) && trim($configured) !== '') {
            return trim($configured);
        }

        if (is_callable('shell_exec')) {
            $detected = @shell_exec('command -v python3');

            if (is_string($detected) && trim($detected) !== '') {
                return trim($detected);
            }
        }

        return 'python3';
    }

    public function storeGeneratedSchedule(
        Unit $unit,
        string $month,
        array $result,
        bool $preserveExisting = false,
        ?Carbon $windowStart = null,
        ?Carbon $windowEnd = null,
        ?Carbon $extendedEnd = null,
        bool $enforceNightRestPairing = true
    ): void
    {
        try {
            $startDate = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        } catch (\Throwable $e) {
            abort(422, '保存対象の月の形式が正しくありません。');
        }

        $endDate = (clone $startDate)->endOfMonth();

        $windowStart ??= $startDate->copy();
        $windowEnd ??= $endDate->copy();
        $extendedEnd ??= $windowEnd->copy();

        $shiftTypes = ShiftType::query()
            ->where('organization_id', $unit->organization_id)
            ->get()
            ->keyBy(fn (ShiftType $type) => strtoupper($type->code));

        DB::transaction(function () use ($unit, $windowStart, $windowEnd, $extendedEnd, $result, $shiftTypes, $preserveExisting, $enforceNightRestPairing) {
            if (! $preserveExisting) {
                Shift::query()
                    ->where('unit_id', $unit->id)
                    ->whereBetween('work_date', [$windowStart->toDateString(), $windowEnd->toDateString()])
                    ->where('status', 'draft')
                    ->delete();
            }

            foreach ($result['assignments'] as $entry) {
                $date = Arr::get($entry, 'date');
                $shifts = Arr::get($entry, 'shifts', []);
                if (! $date) {
                    continue;
                }

                try {
                    $dateCarbon = Carbon::parse($date)->startOfDay();
                } catch (\Throwable $e) {
                    continue;
                }

                if ($dateCarbon->lt($windowStart) || $dateCarbon->gt($extendedEnd)) {
                    continue;
                }

                foreach ($shifts as $code => $assignmentData) {
                    $code = strtoupper($code);
                    $userIds = $this->normalizeOptimizerAssignmentUsers($assignmentData);
                    if (empty($userIds)) {
                        continue;
                    }

                    /** @var \App\Models\ShiftType|null $shiftType */
                    $shiftType = $shiftTypes->get($code);
                    if (! $shiftType) {
                        continue;
                    }

                    $existingShift = Shift::query()
                        ->where('unit_id', $unit->id)
                        ->whereDate('work_date', $date)
                        ->where('shift_type_id', $shiftType->id)
                        ->first();

                    if ($existingShift) {
                        if (! $preserveExisting) {
                            $existingShift->assignments()->delete();
                        }

                        foreach ($userIds as $userId) {
                            $existingShift->assignments()->updateOrCreate(
                                ['user_id' => $userId],
                                ['status' => 'draft']
                            );

                            if ($code === 'NIGHT' && $enforceNightRestPairing) {
                                $this->ensureOptimizerNightFollowUp($unit, $existingShift, $userId, $preserveExisting, $enforceNightRestPairing);
                            }
                        }

                        continue;
                    }

                    $shift = Shift::create([
                        'unit_id' => $unit->id,
                        'shift_type_id' => $shiftType->id,
                        'work_date' => $date,
                        'start_at' => $shiftType->start_at,
                        'end_at' => $shiftType->end_at,
                        'status' => 'draft',
                        'meta' => [
                            'generated_via' => 'optimizer',
                        ],
                    ]);

                    foreach ($userIds as $userId) {
                        $shift->assignments()->create([
                            'user_id' => $userId,
                            'status' => 'draft',
                        ]);

                        if ($code === 'NIGHT' && $enforceNightRestPairing) {
                            $this->ensureOptimizerNightFollowUp($unit, $shift, $userId, $preserveExisting, $enforceNightRestPairing);
                        }
                    }
                }
            }
        });
    }

    /**
     * @param mixed $assignmentData
     * @return int[]
     */
    private function normalizeOptimizerAssignmentUsers($assignmentData): array
    {
        if (! is_array($assignmentData)) {
            return [];
        }

        $items = $this->isListArray($assignmentData) ? $assignmentData : [$assignmentData];
        $userIds = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $userId = Arr::get($item, 'user_id')
                ?? Arr::get($item, 'userId')
                ?? Arr::get($item, 'member_id');

            $userId = (int) $userId;
            if ($userId > 0) {
                $userIds[$userId] = $userId;
            }
        }

        return array_values($userIds);
    }

    private function isListArray(array $value): bool
    {
        if (function_exists('array_is_list')) {
            return array_is_list($value);
        }

        $expected = 0;
        foreach ($value as $key => $_) {
            if ($key !== $expected) {
                return false;
            }
            $expected++;
        }

        return true;
    }

    private function ensureOptimizerNightFollowUp(Unit $unit, Shift $nightShift, int $userId, bool $preserveExisting, bool $enforceNightRestPairing): void
    {
        if (! $enforceNightRestPairing) {
            return;
        }

        $nightEnd = $nightShift->end_at
            ? Carbon::parse($nightShift->end_at)
            : Carbon::parse('09:30');

        $nightAfterType = ShiftType::firstOrCreate([
            'organization_id' => $unit->organization_id,
            'code' => 'NIGHT_AFTER',
        ], [
            'name' => '夜勤明け',
            'start_at' => $nightEnd->copy()->format('H:i'),
            'end_at' => $nightEnd->copy()->addHours(4)->format('H:i'),
            'break_minutes' => 0,
            'is_default' => false,
        ]);

        $restType = ShiftType::firstOrCreate([
            'organization_id' => $unit->organization_id,
            'code' => 'OFF',
        ], [
            'name' => '休み',
            'start_at' => '00:00',
            'end_at' => '23:59',
            'break_minutes' => 0,
            'is_default' => false,
        ]);

        $workDate = $nightShift->work_date instanceof Carbon
            ? $nightShift->work_date->toDateString()
            : (string) $nightShift->work_date;

        $baseDate = Carbon::parse($workDate);

        $this->syncOptimizerFollowUpShift(
            $unit,
            $nightShift,
            $userId,
            $nightAfterType,
            $baseDate->copy()->addDay()->toDateString(),
            'night_after',
            $preserveExisting
        );

        $this->syncOptimizerFollowUpShift(
            $unit,
            $nightShift,
            $userId,
            $restType,
            $baseDate->copy()->addDays(2)->toDateString(),
            'rest',
            $preserveExisting
        );
    }

    private function syncOptimizerFollowUpShift(
        Unit $unit,
        Shift $sourceShift,
        int $userId,
        ShiftType $shiftType,
        string $date,
        string $tag,
        bool $preserveExisting
    ): void {
        $existingAssignment = Assignment::query()
            ->where('user_id', $userId)
            ->whereHas('shift', function ($query) use ($unit, $date) {
                $query->where('unit_id', $unit->id)
                    ->whereDate('work_date', $date);
            })
            ->with('shift')
            ->first();

        if ($existingAssignment) {
            $shift = $existingAssignment->shift;

            if ($shift->shift_type_id !== $shiftType->id) {
                if ($preserveExisting && ($shift->meta['generated_via'] ?? null) !== 'optimizer') {
                    return;
                }

                $shift->update([
                    'shift_type_id' => $shiftType->id,
                    'start_at' => $shiftType->start_at,
                    'end_at' => $shiftType->end_at,
                    'status' => 'draft',
                    'meta' => array_merge($shift->meta ?? [], [
                        'generated_via' => 'optimizer',
                        'optimizer_follow_up' => $tag,
                        'source_shift_id' => $sourceShift->id,
                    ]),
                ]);
            } else {
                $shift->update([
                    'start_at' => $shiftType->start_at,
                    'end_at' => $shiftType->end_at,
                    'status' => 'draft',
                    'meta' => array_merge($shift->meta ?? [], [
                        'generated_via' => $shift->meta['generated_via'] ?? 'optimizer',
                        'optimizer_follow_up' => $tag,
                        'source_shift_id' => $sourceShift->id,
                    ]),
                ]);
            }

            $existingAssignment->update([
                'status' => 'draft',
            ]);

            return;
        }

        if ($preserveExisting && Shift::query()
            ->where('unit_id', $unit->id)
            ->whereDate('work_date', $date)
            ->where('shift_type_id', $shiftType->id)
            ->exists()) {
            return;
        }

        $followUpShift = Shift::create([
            'unit_id' => $unit->id,
            'shift_type_id' => $shiftType->id,
            'work_date' => $date,
            'start_at' => $shiftType->start_at,
            'end_at' => $shiftType->end_at,
            'status' => 'draft',
            'meta' => [
                'generated_via' => 'optimizer',
                'optimizer_follow_up' => $tag,
                'source_shift_id' => $sourceShift->id,
            ],
        ]);

        $followUpShift->assignments()->create([
            'user_id' => $userId,
            'status' => 'draft',
        ]);
    }
}
