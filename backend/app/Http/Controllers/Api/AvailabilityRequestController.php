<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\AvailabilityRequestStoreRequest;
use App\Http\Resources\AvailabilityRequestResource;
use App\Models\AvailabilityRequest;
use App\Models\Unit;
use App\Services\AvailabilityScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $payload['user_id'] = $user->id;
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

        $mayDelete = $user->role === UserRole::Admin || $availabilityRequest->user_id === $user->id;

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
}
