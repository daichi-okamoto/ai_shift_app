<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\AvailabilityRequestStoreRequest;
use App\Http\Resources\AvailabilityRequestResource;
use App\Models\AvailabilityReminderTask;
use App\Models\AvailabilityRequest;
use App\Models\Membership;
use App\Models\Unit;
use App\Models\User;
use App\Services\AvailabilityScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AvailabilityRequestController extends Controller
{
    public function index(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanAccessUnit($unit, $user);

        $service = new AvailabilityScheduleService($unit);
        $periodData = $service->compute($request->query('period'));

        $scope = $request->query('scope');
        if (! in_array($scope, ['unit', 'self'], true)) {
            $scope = $this->defaultScopeFor($user);
        }

        if ($scope === 'unit' && ! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
            $scope = 'self';
        }

        $query = AvailabilityRequest::query()
            ->with(['user:id,name,role,email'])
            ->where('unit_id', $unit->id)
            ->whereBetween('work_date', [$periodData['period_start'], $periodData['period_end']])
            ->orderBy('work_date');

        if ($scope === 'self' && $user->role !== UserRole::Admin) {
            $query->where('user_id', $user->id);
        } elseif ($request->filled('member_id')) {
            if (! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
                abort(403, 'You are not allowed to view other members\' requests.');
            }

            $query->where('user_id', $request->integer('member_id'));
        }

        $requests = $query->get();

        return AvailabilityRequestResource::collection($requests)
            ->additional(['meta' => ['period' => $periodData['period']]])
            ->response();
    }

    public function store(AvailabilityRequestStoreRequest $request, Unit $unit): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanAccessUnit($unit, $user);

        $payload = $request->validated();

        $targetUser = $user;

        if ($request->filled('user_id')) {
            $userId = (int) $request->input('user_id');

            if ($userId !== $user->id) {
                if ($user->role === UserRole::Admin) {
                    $targetUser = $this->resolveTargetUser($user, $unit, $userId);
                } elseif ($user->role === UserRole::Leader) {
                    $targetUser = $this->resolveTargetUser($user, $unit, $userId);
                } else {
                    abort(403, 'You are not allowed to submit on behalf of other members.');
                }
            }
        }

        $payload['user_id'] = $targetUser->id;
        $payload['unit_id'] = $unit->id;

        $availability = AvailabilityRequest::create($payload);
        $availability->load(['user:id,name,role,email']);

        return (new AvailabilityRequestResource($availability))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, Unit $unit, AvailabilityRequest $availabilityRequest): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanAccessUnit($unit, $user);

        if ($availabilityRequest->unit_id !== $unit->id) {
            abort(404);
        }

        $mayDelete = $user->role === UserRole::Admin
            || $availabilityRequest->user_id === $user->id
            || ($user->role === UserRole::Leader
                && $user->memberships()->where('unit_id', $unit->id)->exists());

        if (! $mayDelete) {
            abort(403, 'You are not allowed to delete this request.');
        }

        $availabilityRequest->delete();

        return response()->json(null, 204);
    }

    public function schedule(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();
        $this->ensureCanAccessUnit($unit, $user);

        $service = new AvailabilityScheduleService($unit);

        return response()->json([
            'data' => $service->compute($request->query('period')),
        ]);
    }

    public function sendReminder(Request $request, Unit $unit): JsonResponse
    {
        $user = $request->user();

        if (! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
            abort(403, 'Only administrators or leaders can send reminders.');
        }

        $this->ensureCanAccessUnit($unit, $user, allowLeader: true);

        $service = new AvailabilityScheduleService($unit);
        $periodData = $service->compute($request->query('period'));

        $service->markReminderSent($periodData['period'], CarbonImmutable::now($periodData['timezone']));

        $refresh = $service->compute($periodData['period']);

        $reminderMessage = AvailabilityReminderTask::query()
            ->where('unit_id', $unit->id)
            ->where('period', $periodData['period'])
            ->orderByDesc('created_at')
            ->value('message');

        AvailabilityReminderTask::query()
            ->where('unit_id', $unit->id)
            ->where('period', $periodData['period'])
            ->where('status', 'pending')
            ->update([
                'status' => 'sent',
                'triggered_at' => CarbonImmutable::now(),
            ]);

        $this->sendSlackReminder($unit, $periodData['period'], $reminderMessage);

        return response()->json([
            'data' => $refresh,
        ]);
    }

    private function ensureCanAccessUnit(Unit $unit, $user, bool $allowLeader = true): void
    {
        if ($user->organization_id !== $unit->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }

        if ($user->role === UserRole::Admin) {
            return;
        }

        if ($user->role === UserRole::Leader && ! $allowLeader) {
            abort(403, 'Leaders are not permitted to perform this action.');
        }

        $belongsToUnit = $user->memberships()
            ->where('unit_id', $unit->id)
            ->exists();

        if (! $belongsToUnit) {
            abort(403, 'You are not assigned to this unit.');
        }
    }

    private function defaultScopeFor($user): string
    {
        return in_array($user->role, [UserRole::Admin, UserRole::Leader], true) ? 'unit' : 'self';
    }

    private function sendSlackReminder(Unit $unit, string $period, ?string $message = null): void
    {
        $webhookUrl = $unit->organization->settings['availability']['slack_webhook_url'] ?? null;

        if (! $webhookUrl) {
            return;
        }

        $payload = [
            'text' => $message ?? sprintf('%s の希望・休暇申請が未提出の方は提出をお願いします。', $period),
        ];

        try {
            Http::post($webhookUrl, $payload);
        } catch (\Throwable $e) {
            Log::error('Failed to send Slack availability reminder', [
                'unit_id' => $unit->id,
                'period' => $period,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function resolveTargetUser(User $actor, Unit $unit, int $targetUserId): User
    {
        $target = User::query()
            ->where('organization_id', $actor->organization_id)
            ->find($targetUserId);

        if (! $target) {
            abort(404, 'The specified member could not be found.');
        }

        $isMember = Membership::query()
            ->where('unit_id', $unit->id)
            ->where('user_id', $target->id)
            ->exists();

        if (! $isMember) {
            abort(422, '指定した従業員はこのユニットに所属していません。');
        }

        return $target;
    }
}
