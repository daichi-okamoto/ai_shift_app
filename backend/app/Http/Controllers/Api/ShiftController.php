<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\ShiftBatchUpdateRequest;
use App\Http\Requests\ShiftBulkDeleteRequest;
use App\Http\Requests\ShiftStoreRequest;
use App\Http\Resources\ShiftResource;
use App\Models\Assignment;
use App\Models\Shift;
use App\Models\ShiftType;
use App\Models\Unit;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ShiftController extends Controller
{
    public function index(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role !== UserRole::Admin) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not a member of this unit.');
            }
        }

        $startDate = $this->resolveDate($request->query('start_date'), Carbon::now()->startOfWeek());
        $endDate = $this->resolveDate($request->query('end_date'), (clone $startDate)->addDays(6));

        if ($endDate->lessThan($startDate)) {
            $endDate = (clone $startDate)->addDays(6);
        }

        $unit->loadMissing(['memberships.user.allowedShiftTypes']);

        $shifts = Shift::query()
            ->with(['shiftType', 'assignments.user'])
            ->where('unit_id', $unit->id)
            ->whereDate('work_date', '>=', $startDate->toDateString())
            ->whereDate('work_date', '<=', $endDate->toDateString())
            ->orderBy('work_date')
            ->orderBy('start_at')
            ->get();

        $memberMeta = $unit->memberships
            ->map(function ($membership) {
                $user = $membership->user;

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'role' => $membership->role,
                    'employment_type' => $user->employment_type,
                    'allowed_shift_types' => $user->allowedShiftTypes
                        ? $user->allowedShiftTypes
                            ->map(fn ($shiftType) => [
                                'id' => $shiftType->id,
                                'code' => $shiftType->code,
                                'name' => $shiftType->name,
                            ])
                            ->values()
                            ->all()
                        : [],
                ];
            })
            ->values()
            ->all();

        return ShiftResource::collection($shifts)
            ->additional([
                'meta' => [
                    'unit' => [
                        'id' => $unit->id,
                        'name' => $unit->name,
                        'code' => $unit->code,
                    ],
                    'range' => [
                        'start_date' => $startDate->toDateString(),
                        'end_date' => $endDate->toDateString(),
                    ],
                    'members' => $memberMeta,
                ],
            ])->response();
    }

    public function exportMonthly(Request $request, Unit $unit): StreamedResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role !== UserRole::Admin) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not a member of this unit.');
            }
        }

        $month = (string) $request->query('month', '');

        if ($month === '') {
            abort(422, 'エクスポートする月を指定してください。');
        }

        try {
            $startDate = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        } catch (\Throwable $e) {
            abort(422, '月の形式が正しくありません。');
        }

        $endDate = (clone $startDate)->endOfMonth();

        $unit->loadMissing(['memberships.user']);

        $memberships = $unit->memberships()
            ->with(['user'])
            ->orderBy('display_order')
            ->get();

        $shifts = Shift::query()
            ->with(['shiftType', 'assignments.user'])
            ->where('unit_id', $unit->id)
            ->whereDate('work_date', '>=', $startDate->toDateString())
            ->whereDate('work_date', '<=', $endDate->toDateString())
            ->orderBy('work_date')
            ->orderBy('start_at')
            ->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Monthly Schedule');

        $dates = iterator_to_array(CarbonPeriod::create($startDate, $endDate));
        $dateColumns = [];

        $sheet->setCellValue('A1', 'メンバー');
        $sheet->getStyle('A1')->getFont()->setBold(true);

        foreach ($dates as $index => $date) {
            /** @var Carbon $date */
            $columnIndex = $index + 2; // start from column B
            $columnLetter = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($columnIndex);
            $sheet->setCellValue("{$columnLetter}1", $date->format('m/d (D)'));
            $sheet->getStyle("{$columnLetter}1")->getFont()->setBold(true);
            $sheet->getColumnDimension($columnLetter)->setWidth(18);

            if ($date->isWeekend()) {
                $sheet->getStyle("{$columnLetter}1")
                    ->getFill()
                    ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
                    ->getStartColor()
                    ->setRGB('FEE2E2');
            }

            $dateColumns[$date->toDateString()] = $columnLetter;
        }

        $assignmentMatrix = [];

        foreach ($shifts as $shift) {
            $workDate = $shift->work_date instanceof Carbon ? $shift->work_date->toDateString() : (string) $shift->work_date;

            if (! isset($dateColumns[$workDate])) {
                continue;
            }

            $label = $shift->shiftType?->name ?? 'カスタム';
            $cellValue = $label;

            foreach ($shift->assignments as $assignment) {
                $userId = $assignment->user?->id ?? $assignment->user_id;
                if (! $userId) {
                    continue;
                }

                $assignmentMatrix[$userId][$workDate][] = $cellValue;
            }
        }

        foreach ($memberships as $rowIndex => $membership) {
            $rowNumber = $rowIndex + 2;
            $member = $membership->user;
            $sheet->setCellValue("A{$rowNumber}", $member?->name ?? '未登録メンバー');
            $sheet->getStyle("A{$rowNumber}")->getFont()->setBold(true);

            foreach ($dateColumns as $dateKey => $columnLetter) {
                $entries = $assignmentMatrix[$member?->id][$dateKey] ?? [];
                if (empty($entries)) {
                    continue;
                }

                $sheet->setCellValue("{$columnLetter}{$rowNumber}", implode("\n", array_unique($entries)));
                $sheet->getStyle("{$columnLetter}{$rowNumber}")->getAlignment()->setWrapText(true);
            }
        }

        $lastRow = $memberships->count() + 1;
        $lastColumn = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(count($dates) + 1);
        $sheet->getColumnDimension('A')->setWidth(20);
        $sheet->getStyle("A1:{$lastColumn}{$lastRow}")
            ->getAlignment()
            ->setVertical(\PhpOffice\PhpSpreadsheet\Style\Alignment::VERTICAL_CENTER);
        $sheet->freezePane('B2');

        $fileName = sprintf('%s_%s_shifts.xlsx', $unit->code, $startDate->format('Y-m'));

        return response()->streamDownload(function () use ($spreadsheet): void {
            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            $writer->save('php://output');
            $spreadsheet->disconnectWorksheets();
        }, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function store(ShiftStoreRequest $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role !== UserRole::Admin) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not a member of this unit.');
            }
        }

        $data = $request->validated();

        $shiftType = ShiftType::query()
            ->where('id', $data['shift_type_id'])
            ->where('organization_id', $user->organization_id)
            ->first();

        if (! $shiftType) {
            throw ValidationException::withMessages([
                'shift_type_id' => '指定されたシフト種別を利用できません。',
            ]);
        }

        $startAt = $data['start_at'] ?? $shiftType->start_at;
        $endAt = $data['end_at'] ?? $shiftType->end_at;

        if (! $startAt || ! $endAt) {
            throw ValidationException::withMessages([
                'start_at' => '開始と終了時刻を指定してください。',
            ]);
        }

        $status = $data['status'] ?? 'draft';

        $shift = DB::transaction(function () use ($unit, $shiftType, $data, $startAt, $endAt, $status) {
            $shift = Shift::create([
                'unit_id' => $unit->id,
                'shift_type_id' => $shiftType->id,
                'work_date' => $data['work_date'],
                'start_at' => $startAt,
                'end_at' => $endAt,
                'status' => $status,
                'meta' => [
                    'created_via' => 'api',
                ],
            ]);

            if (! empty($data['assignment_user_id'])) {
                $membershipExists = $unit->memberships()
                    ->where('user_id', $data['assignment_user_id'])
                    ->exists();

                if (! $membershipExists) {
                    throw ValidationException::withMessages([
                        'assignment_user_id' => '指定した職員はこのユニットに所属していません。',
                    ]);
                }

                Assignment::create([
                    'shift_id' => $shift->id,
                    'user_id' => $data['assignment_user_id'],
                    'status' => $status === 'published' ? 'final' : 'draft',
                    'note' => $data['note'] ?? null,
                ]);

                if ($shiftType->code === 'NIGHT') {
                    $this->ensureNightFollowRest($unit, $data['assignment_user_id'], $shift, $status, $user);
                }
            }

            return $shift;
        });

        $shift->load(['shiftType', 'assignments.user']);

        return (new ShiftResource($shift))
            ->response()
            ->setStatusCode(201);
    }

    private function resolveDate(?string $value, Carbon $default): Carbon
    {
        if (! $value) {
            return $default;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return $default;
        }
    }

    public function batchUpsert(ShiftBatchUpdateRequest $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role !== UserRole::Admin) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not a member of this unit.');
            }
        }

        $entries = $request->validated('entries');

        DB::transaction(function () use ($entries, $unit, $user) {
            foreach ($entries as $entry) {
                $membershipExists = $unit->memberships()
                    ->where('user_id', $entry['member_id'])
                    ->exists();

                if (! $membershipExists) {
                    throw ValidationException::withMessages([
                        'member_id' => '指定した職員はこのユニットに所属していません。',
                    ]);
                }

                $status = $entry['status'] ?? 'draft';

                $existingAssignment = Assignment::query()
                    ->where('user_id', $entry['member_id'])
                    ->whereHas('shift', function ($query) use ($unit, $entry) {
                        $query->where('unit_id', $unit->id)
                            ->where('work_date', $entry['work_date']);
                    })
                    ->with('shift')
                    ->first();

                $shiftTypeId = $entry['shift_type_id'] ?? null;
                $startAt = $entry['start_at'] ?? null;
                $endAt = $entry['end_at'] ?? null;

                $shiftType = null;

                if ($shiftTypeId) {
                    $shiftType = ShiftType::query()
                        ->where('id', $shiftTypeId)
                        ->where('organization_id', $user->organization_id)
                        ->first();

                    if (! $shiftType) {
                        throw ValidationException::withMessages([
                            'shift_type_id' => '指定されたシフト種別を利用できません。',
                        ]);
                    }

                    $startAt = $startAt ?? $shiftType->start_at;
                    $endAt = $endAt ?? $shiftType->end_at;
                } elseif ($startAt && $endAt) {
                    // custom shift with manual times
                    $shiftTypeId = null;
                } else {
                    // treat as rest shift
                    $shiftType = ShiftType::firstOrCreate([
                        'organization_id' => $user->organization_id,
                        'code' => 'OFF',
                    ], [
                        'name' => '休み',
                        'start_at' => '00:00',
                        'end_at' => '23:59',
                        'break_minutes' => 0,
                        'is_default' => false,
                    ]);

                    $shiftTypeId = $shiftType->id;
                    $startAt = $shiftType->start_at;
                    $endAt = $shiftType->end_at;
                }

                if (! $startAt || ! $endAt) {
                    throw ValidationException::withMessages([
                        'start_at' => '開始と終了時刻を指定してください。',
                    ]);
                }

                if ($existingAssignment) {
                    $shift = $existingAssignment->shift;
                    $meta = $shift->meta ?? [];
                    if (is_array($meta)) {
                        $meta = array_filter(
                            $meta,
                            static fn ($value, $key) => ! in_array($key, ['night_follow_up', 'source_shift_id'], true),
                            ARRAY_FILTER_USE_BOTH
                        );
                    } else {
                        $meta = [];
                    }

                    $shift->update([
                        'shift_type_id' => $shiftType?->id,
                        'start_at' => $startAt,
                        'end_at' => $endAt,
                        'status' => $status,
                        'meta' => empty($meta) ? null : $meta,
                    ]);

                    $existingAssignment->update([
                        'status' => $status === 'published' ? 'final' : 'draft',
                    ]);
                    $assignmentUserId = $existingAssignment->user_id;
                } else {
                    $shift = Shift::create([
                        'unit_id' => $unit->id,
                        'shift_type_id' => $shiftType?->id,
                        'work_date' => $entry['work_date'],
                        'start_at' => $startAt,
                        'end_at' => $endAt,
                        'status' => $status,
                        'meta' => [
                            'created_via' => 'batch-api',
                        ],
                    ]);

                    Assignment::create([
                        'shift_id' => $shift->id,
                        'user_id' => $entry['member_id'],
                        'status' => $status === 'published' ? 'final' : 'draft',
                    ]);
                    $assignmentUserId = $entry['member_id'];
                }

                $this->cleanupDuplicateAssignments(
                    $unit,
                    $assignmentUserId,
                    $entry['work_date'],
                    $shift->id,
                );

                if ($shiftType && $shiftType->code === 'NIGHT') {
                    $this->ensureNightFollowRest($unit, $assignmentUserId, $shift, $status, $user);
                }
            }
        });

        return response()->json([
            'updated' => count($entries),
        ]);
    }

    public function bulkDelete(ShiftBulkDeleteRequest $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role !== UserRole::Admin) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not a member of this unit.');
            }
        }

        $data = $request->validated();
        $rangeType = $data['range_type'];

        $startDate = null;
        $endDate = null;

        switch ($rangeType) {
            case 'day':
                $target = Carbon::parse($data['target_date'])->startOfDay();
                $startDate = $target->copy();
                $endDate = $target->copy();
                break;
            case 'week':
                $target = Carbon::parse($data['target_date'])->startOfDay();
                $startDate = $target->copy()->startOfWeek();
                $endDate = $startDate->copy()->addDays(6);
                break;
            case 'month':
                $monthString = $data['month'];
                try {
                    $startDate = Carbon::createFromFormat('Y-m', $monthString)->startOfMonth();
                } catch (\Throwable $e) {
                    abort(422, '削除対象の月の形式が正しくありません。');
                }
                $endDate = $startDate->copy()->endOfMonth();
                break;
            default:
                abort(422, '削除範囲が正しく指定されていません。');
        }

        if (! $startDate || ! $endDate) {
            abort(422, '削除範囲が正しく指定されていません。');
        }

        $deletedCount = DB::transaction(function () use ($unit, $startDate, $endDate) {
            $shifts = Shift::query()
                ->with(['shiftType', 'assignments'])
                ->where('unit_id', $unit->id)
                ->whereDate('work_date', '>=', $startDate->toDateString())
                ->whereDate('work_date', '<=', $endDate->toDateString())
                ->orderBy('work_date')
                ->get();

            $deleted = 0;

            foreach ($shifts as $shift) {
                $deleted += $this->deleteShiftWithDependencies($unit, $shift);
            }

            return $deleted;
        });

        return response()->json([
            'deleted' => $deletedCount,
            'range' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
            ],
        ]);
    }

    private function ensureNightFollowRest(Unit $unit, int $memberId, Shift $nightShift, string $status, $user): void
    {
        $nextDate = Carbon::parse($nightShift->work_date)->addDay()->toDateString();

        $nightAfterType = ShiftType::firstOrCreate([
            'organization_id' => $user->organization_id,
            'code' => 'NIGHT_AFTER',
        ], [
            'name' => '夜勤明け',
            'start_at' => $nightShift->end_at,
            'end_at' => Carbon::parse($nightShift->end_at)->addHours(4)->format('H:i'),
            'break_minutes' => 0,
            'is_default' => false,
        ]);

        $restShiftType = ShiftType::firstOrCreate([
            'organization_id' => $user->organization_id,
            'code' => 'OFF',
        ], [
            'name' => '休み',
            'start_at' => '00:00',
            'end_at' => '23:59',
            'break_minutes' => 0,
            'is_default' => false,
        ]);

        $nextDayAssignment = Assignment::query()
            ->where('user_id', $memberId)
            ->whereHas('shift', function ($query) use ($unit, $nextDate) {
                $query->where('unit_id', $unit->id)
                    ->where('work_date', $nextDate);
            })
            ->with('shift')
            ->first();

        $restDate = Carbon::parse($nextDate)->addDay()->toDateString();

        // Handle night-after day
        if ($nextDayAssignment) {
            $shift = $nextDayAssignment->shift;
            $isAuto = ($shift->meta['night_follow_up'] ?? null) === 'after';

            if ($isAuto) {
                $shift->update([
                    'shift_type_id' => $nightAfterType->id,
                    'start_at' => $nightAfterType->start_at,
                    'end_at' => $nightAfterType->end_at,
                    'status' => $status,
                    'meta' => array_merge($shift->meta ?? [], [
                        'night_follow_up' => 'after',
                        'source_shift_id' => $nightShift->id,
                    ]),
                ]);

                $nextDayAssignment->update([
                    'status' => $status === 'published' ? 'final' : 'draft',
                ]);
            }
        } else {
            $afterShift = Shift::create([
                'unit_id' => $unit->id,
                'shift_type_id' => $nightAfterType->id,
                'work_date' => $nextDate,
                'start_at' => $nightAfterType->start_at,
                'end_at' => $nightAfterType->end_at,
                'status' => $status,
                'meta' => [
                    'night_follow_up' => 'after',
                    'source_shift_id' => $nightShift->id,
                ],
            ]);

            Assignment::create([
                'shift_id' => $afterShift->id,
                'user_id' => $memberId,
                'status' => $status === 'published' ? 'final' : 'draft',
            ]);
        }

        // Handle rest day after night-after
        $restAssignment = Assignment::query()
            ->where('user_id', $memberId)
            ->whereHas('shift', function ($query) use ($unit, $restDate) {
                $query->where('unit_id', $unit->id)
                    ->where('work_date', $restDate);
            })
            ->with('shift')
            ->first();

        if ($restAssignment) {
            $shift = $restAssignment->shift;
            $isAuto = ($shift->meta['night_follow_up'] ?? null) === 'rest';

            if ($isAuto) {
                $shift->update([
                    'shift_type_id' => $restShiftType->id,
                    'start_at' => $restShiftType->start_at,
                    'end_at' => $restShiftType->end_at,
                    'status' => $status,
                    'meta' => array_merge($shift->meta ?? [], [
                        'night_follow_up' => 'rest',
                        'source_shift_id' => $nightShift->id,
                    ]),
                ]);

                $restAssignment->update([
                    'status' => $status === 'published' ? 'final' : 'draft',
                ]);
            }
        } else {
            $restShift = Shift::create([
                'unit_id' => $unit->id,
                'shift_type_id' => $restShiftType->id,
                'work_date' => $restDate,
                'start_at' => $restShiftType->start_at,
                'end_at' => $restShiftType->end_at,
                'status' => $status,
                'meta' => [
                    'night_follow_up' => 'rest',
                    'source_shift_id' => $nightShift->id,
                ],
            ]);

            Assignment::create([
                'shift_id' => $restShift->id,
                'user_id' => $memberId,
                'status' => $status === 'published' ? 'final' : 'draft',
            ]);
        }
    }

    private function cleanupDuplicateAssignments(Unit $unit, int $memberId, string $workDate, int $keepShiftId): void
    {
        $duplicateShifts = Shift::query()
            ->where('unit_id', $unit->id)
            ->where('id', '!=', $keepShiftId)
            ->whereDate('work_date', $workDate)
            ->whereHas('assignments', function ($query) use ($memberId) {
                $query->where('user_id', $memberId);
            })
            ->with('assignments')
            ->get();

        foreach ($duplicateShifts as $duplicate) {
            $duplicate->assignments()
                ->where('user_id', $memberId)
                ->get()
                ->each(fn (Assignment $assignment) => $assignment->delete());

            if ($duplicate->assignments()->doesntExist()) {
                $duplicate->delete();
            }
        }
    }

    private function deleteShiftWithDependencies(Unit $unit, Shift $shift): int
    {
        $shift->loadMissing(['shiftType', 'assignments']);
        $deleted = 0;

        $assignmentMemberIds = $shift->assignments->pluck('user_id')->all();
        $shiftTypeCode = optional($shift->shiftType)->code;

        if ($this->deleteShiftRecord($shift)) {
            $deleted++;
        }

        if ($shiftTypeCode === 'NIGHT' && ! empty($assignmentMemberIds)) {
            $deleted += $this->deleteNightFollowUps($unit, $shift, $assignmentMemberIds);
        }

        return $deleted;
    }

    private function deleteNightFollowUps(Unit $unit, Shift $nightShift, array $memberIds): int
    {
        $deleted = 0;
        $nightDate = Carbon::parse($nightShift->work_date);
        $nextDate = $nightDate->copy()->addDay()->toDateString();
        $restDate = $nightDate->copy()->addDays(2)->toDateString();

        foreach ($memberIds as $memberId) {
            $nightAfter = Shift::query()
                ->with(['shiftType', 'assignments'])
                ->where('unit_id', $unit->id)
                ->whereDate('work_date', $nextDate)
                ->whereHas('shiftType', fn ($query) => $query->where('code', 'NIGHT_AFTER'))
                ->whereHas('assignments', fn ($query) => $query->where('user_id', $memberId))
                ->first();

            if ($nightAfter && $this->deleteShiftRecord($nightAfter)) {
                $deleted++;
            }

            $restShift = Shift::query()
                ->with(['shiftType', 'assignments'])
                ->where('unit_id', $unit->id)
                ->whereDate('work_date', $restDate)
                ->whereHas('shiftType', fn ($query) => $query->where('code', 'OFF'))
                ->whereHas('assignments', fn ($query) => $query->where('user_id', $memberId))
                ->first();

            if ($restShift && $this->deleteShiftRecord($restShift)) {
                $deleted++;
            }
        }

        return $deleted;
    }

    private function deleteShiftRecord(Shift $shift): bool
    {
        $shift->assignments()->delete();

        return (bool) $shift->delete();
    }
}
