<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\UnitMembershipUpdateRequest;
use App\Http\Requests\UnitReorderRequest;
use App\Http\Requests\UnitStoreRequest;
use App\Http\Requests\UnitUpdateRequest;
use App\Http\Resources\UnitResource;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use function collect;

class UnitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Unit::query()
            ->with(['memberships.user'])
            ->where('organization_id', $user->organization_id)
            ->orderBy('display_order');

        if ($user->role !== UserRole::Admin) {
            $query->whereHas('memberships', function ($builder) use ($user): void {
                $builder->where('user_id', $user->id);
            });
        }

        $units = $query->get();

        return UnitResource::collection($units)
            ->additional([
                'meta' => [
                    'count' => $units->count(),
                ],
            ])->response();
    }

    public function store(UnitStoreRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();

        $displayOrder = Unit::query()
            ->where('organization_id', $user->organization_id)
            ->max('display_order');

        $unit = Unit::create([
            'organization_id' => $user->organization_id,
            'name' => $data['name'],
            'code' => $data['code'],
            'display_order' => ($displayOrder ?? 0) + 1,
            'coverage_requirements' => $data['coverage_requirements'],
        ]);

        $unit->load(['memberships.user']);

        return (new UnitResource($unit))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UnitUpdateRequest $request, Unit $unit): JsonResponse
    {
        $this->ensureSameOrganization($unit, $request->user());

        $data = $request->validated();

        $unit->fill([
            'name' => $data['name'],
            'code' => $data['code'],
            'coverage_requirements' => $data['coverage_requirements'],
        ]);
        $unit->save();

        $unit->load(['memberships.user']);

        return (new UnitResource($unit))->response();
    }

    public function destroy(Request $request, Unit $unit): JsonResponse
    {
        $this->ensureSameOrganization($unit, $request->user());

        $unit->delete();

        return response()->json(null, 204);
    }

    public function reorder(UnitReorderRequest $request): JsonResponse
    {
        $user = $request->user();
        $order = array_map('intval', $request->validated('order'));

        $units = Unit::query()
            ->where('organization_id', $user->organization_id)
            ->whereIn('id', $order)
            ->pluck('id')
            ->all();

        $missing = array_diff($order, $units);
        if (! empty($missing)) {
            abort(422, '一部のユニットが見つかりませんでした。');
        }

        DB::transaction(function () use ($order, $user): void {
            foreach ($order as $index => $unitId) {
                Unit::query()
                    ->where('organization_id', $user->organization_id)
                    ->where('id', $unitId)
                    ->update(['display_order' => $index + 1]);
            }

            $remainingUnits = Unit::query()
                ->where('organization_id', $user->organization_id)
                ->whereNotIn('id', $order)
                ->orderBy('display_order')
                ->get();

            if ($remainingUnits->isNotEmpty()) {
                $start = count($order) + 1;
                foreach ($remainingUnits as $offset => $unit) {
                    $unit->update(['display_order' => $start + $offset]);
                }
            }
        });

        return response()->json(null, 204);
    }

    public function updateMemberships(UnitMembershipUpdateRequest $request, Unit $unit): JsonResponse
    {
        $this->ensureSameOrganization($unit, $request->user());

        $members = collect($request->validated('members'))->values();

        DB::transaction(function () use ($unit, $members): void {
            $userIds = $members->pluck('user_id')->all();

            if (empty($userIds)) {
                $unit->memberships()->delete();
            } else {
                $unit->memberships()
                    ->whereNotIn('user_id', $userIds)
                    ->delete();
            }

            foreach ($members as $index => $member) {
                $unit->memberships()->updateOrCreate(
                    ['user_id' => $member['user_id']],
                    [
                        'role' => $member['role'],
                        'display_order' => $index,
                    ],
                );
            }
        });

        $unit->load(['memberships.user']);

        return (new UnitResource($unit))->response();
    }

    private function ensureSameOrganization(Unit $unit, $user): void
    {
        if ($unit->organization_id !== $user->organization_id) {
            abort(403, 'You are not authorized to access this unit.');
        }
    }
}
