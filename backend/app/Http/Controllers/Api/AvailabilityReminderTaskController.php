<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\AvailabilityReminderTaskResource;
use App\Models\AvailabilityReminderTask;
use App\Models\Unit;
use App\Services\AvailabilityScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AvailabilityReminderTaskController extends Controller
{
    public function index(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanManage($unit, $user);

        $tasks = AvailabilityReminderTask::query()
            ->with(['creator:id,name'])
            ->where('unit_id', $unit->id)
            ->orderBy('scheduled_for')
            ->get();

        return AvailabilityReminderTaskResource::collection($tasks)->response();
    }

    public function store(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanManage($unit, $user);

        $validator = Validator::make($request->all(), [
            'period' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'scheduled_for' => ['required', 'date'],
        ]);

        $validator->validate();

        $payload = $validator->validated();

        $service = new AvailabilityScheduleService($unit);
        $settings = $service->settings();
        $timezone = $settings['timezone'] ?? 'Asia/Tokyo';

        try {
            $scheduledFor = CarbonImmutable::parse($payload['scheduled_for'], $timezone)->startOfDay();
        } catch (\Throwable $e) {
            abort(422, '無効な日付が指定されました。');
        }

        $today = CarbonImmutable::now($timezone)->startOfDay();
        if ($scheduledFor->lt($today)) {
            abort(422, '過去の日付は指定できません。');
        }

        $task = AvailabilityReminderTask::updateOrCreate(
            [
                'unit_id' => $unit->id,
                'period' => $payload['period'],
                'scheduled_for' => $scheduledFor->toDateString(),
            ],
            [
                'status' => 'pending',
                'triggered_at' => null,
                'created_by' => $user->id,
            ],
        );

        $task->load(['creator:id,name']);

        return (new AvailabilityReminderTaskResource($task))
            ->response()
            ->setStatusCode(201);
    }

    private function ensureCanManage(Unit $unit, $user): void
    {
        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if (! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
            abort(403, 'Only administrators or leaders can manage reminders.');
        }

        if ($user->role === UserRole::Leader) {
            $belongsToUnit = $user->memberships()
                ->where('unit_id', $unit->id)
                ->exists();

            if (! $belongsToUnit) {
                abort(403, 'You are not assigned to this unit.');
            }
        }
    }
}
