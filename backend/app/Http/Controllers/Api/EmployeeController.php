<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\EmployeeStoreRequest;
use App\Http\Requests\EmployeeUpdateRequest;
use App\Http\Resources\UserResource;
use App\Models\ShiftType;
use App\Models\User;
use App\Support\SchedulePreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $currentUser = $request->user();

        $employees = User::query()
            ->with(['organization', 'memberships.unit', 'allowedShiftTypes'])
            ->where('organization_id', $currentUser->organization_id)
            ->orderBy('name')
            ->get();

        return UserResource::collection($employees)
            ->additional([
                'meta' => [
                    'count' => $employees->count(),
                ],
            ])->response();
    }

    public function show(Request $request, User $employee): JsonResponse
    {
        $this->ensureSameOrganization($request, $employee);

        $employee->loadMissing(['organization', 'memberships.unit', 'allowedShiftTypes']);

        return (new UserResource($employee))->response();
    }

    public function store(EmployeeStoreRequest $request): JsonResponse
    {
        $currentUser = $request->user();
        $data = $request->validated();

        $schedulePreferenceSettings = null;
        if (array_key_exists('schedule_preferences', $data)) {
            $normalizedPreferences = SchedulePreference::normalize($data['schedule_preferences']);
            $prunedPreferences = SchedulePreference::prune($normalizedPreferences);
            if (! empty($prunedPreferences)) {
                $schedulePreferenceSettings = ['schedule_preferences' => $prunedPreferences];
            }
        }

        unset($data['schedule_preferences']);

        $employee = DB::transaction(function () use ($data, $currentUser, $schedulePreferenceSettings) {
            $employee = User::create([
                'organization_id' => $currentUser->organization_id,
                'name' => $data['name'],
                'email' => $data['email'],
                'role' => $data['role'],
                'employment_type' => $data['employment_type'],
                'can_night_shift' => (bool) ($data['can_night_shift'] ?? false),
                'contract_hours_per_week' => $data['contract_hours_per_week'] ?? null,
                'password' => $data['password'],
                'settings' => $schedulePreferenceSettings,
            ]);

            $memberships = collect($data['memberships'] ?? [])->map(function (array $membership) {
                return [
                    'unit_id' => $membership['unit_id'],
                    'role' => $membership['role'],
                ];
            });

            $this->syncMemberships($employee, $memberships, $currentUser->organization_id);

            $this->syncAllowedShiftTypes(
                $employee,
                $data['allowed_shift_type_ids'] ?? null,
                $currentUser->organization_id
            );

            return $employee;
        });

        $employee->loadMissing(['organization', 'memberships.unit', 'allowedShiftTypes']);

        return (new UserResource($employee))
            ->response()
            ->setStatusCode(201);
    }

    public function update(EmployeeUpdateRequest $request, User $employee): JsonResponse
    {
        $this->ensureSameOrganization($request, $employee);

        $data = $request->validated();

        $updateSchedulePreferences = array_key_exists('schedule_preferences', $data);
        $schedulePreferenceSettings = null;
        if ($updateSchedulePreferences) {
            $normalizedPreferences = SchedulePreference::normalize($data['schedule_preferences']);
            $prunedPreferences = SchedulePreference::prune($normalizedPreferences);
            $schedulePreferenceSettings = $prunedPreferences;
        }

        unset($data['schedule_preferences']);

        DB::transaction(function () use ($employee, $data, $request, $schedulePreferenceSettings, $updateSchedulePreferences) {
            $employee->fill([
                'name' => $data['name'],
                'email' => $data['email'],
                'role' => $data['role'],
                'employment_type' => $data['employment_type'],
                'can_night_shift' => (bool) ($data['can_night_shift'] ?? false),
                'contract_hours_per_week' => $data['contract_hours_per_week'] ?? null,
            ]);

            if (! empty($data['password'])) {
                $employee->password = $data['password'];
            }

            if ($updateSchedulePreferences) {
                $currentSettings = $employee->settings ?? [];
                if (! empty($schedulePreferenceSettings)) {
                    $currentSettings['schedule_preferences'] = $schedulePreferenceSettings;
                } else {
                    unset($currentSettings['schedule_preferences']);
                }
                $employee->settings = empty($currentSettings) ? null : $currentSettings;
            }

            $employee->save();

            $memberships = collect($data['memberships'] ?? [])->map(function (array $membership) {
                return [
                    'unit_id' => $membership['unit_id'],
                    'role' => $membership['role'],
                ];
            });

            $this->syncMemberships($employee, $memberships, $request->user()->organization_id);

            $this->syncAllowedShiftTypes(
                $employee,
                $data['allowed_shift_type_ids'] ?? null,
                $request->user()->organization_id
            );
        });

        $employee->loadMissing(['organization', 'memberships.unit', 'allowedShiftTypes']);

        return (new UserResource($employee))->response();
    }

    public function destroy(Request $request, User $employee): JsonResponse
    {
        $this->ensureSameOrganization($request, $employee);

        if ($employee->id === $request->user()->id) {
            return response()->json([
                'message' => '自分自身を削除することはできません。',
            ], 422);
        }

        DB::transaction(function () use ($employee) {
            $employee->memberships()->delete();
            $employee->delete();
        });

        return response()->json(null, 204);
    }

    private function ensureSameOrganization(Request $request, User $employee): void
    {
        $currentUser = $request->user();

        if ($employee->organization_id !== $currentUser->organization_id) {
            abort(404);
        }
    }

    private function syncMemberships(User $employee, Collection $memberships, int $organizationId): void
    {
        $employee->memberships()
            ->whereHas('unit', fn ($query) => $query->where('organization_id', $organizationId))
            ->delete();

        foreach ($memberships->values() as $index => $membership) {
            $employee->memberships()->create([
                'unit_id' => $membership['unit_id'],
                'role' => $membership['role'],
                'display_order' => $index,
            ]);
        }
    }

    private function syncAllowedShiftTypes(User $employee, $allowedShiftTypeIds, int $organizationId): void
    {
        $query = ShiftType::query()->where('organization_id', $organizationId);

        if (! is_array($allowedShiftTypeIds)) {
            $defaultIds = (clone $query)
                ->whereNotIn('code', ['OFF', 'NIGHT_AFTER'])
                ->pluck('id')
                ->all();

            $employee->allowedShiftTypes()->sync($defaultIds);

            return;
        }

        $ids = collect($allowedShiftTypeIds)
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            $employee->allowedShiftTypes()->sync([]);

            return;
        }

        $validIds = $query
            ->whereIn('id', $ids)
            ->whereNotIn('code', ['OFF', 'NIGHT_AFTER'])
            ->pluck('id')
            ->all();

        $employee->allowedShiftTypes()->sync($validIds);
    }
}
