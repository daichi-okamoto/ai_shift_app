<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ShiftTypeResource;
use App\Models\ShiftType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $this->ensureSystemShiftTypes($user->organization_id);

        $shiftTypes = ShiftType::query()
            ->where('organization_id', $user->organization_id)
            ->orderBy('start_at')
            ->get();

        return ShiftTypeResource::collection($shiftTypes)
            ->additional([
                'meta' => [
                    'count' => $shiftTypes->count(),
                ],
            ])->response();
    }

    private function ensureSystemShiftTypes(int $organizationId): void
    {
        ShiftType::firstOrCreate([
            'organization_id' => $organizationId,
            'code' => 'OFF',
        ], [
            'name' => '休み',
            'start_at' => '00:00',
            'end_at' => '23:59',
            'break_minutes' => 0,
            'is_default' => false,
        ]);

        ShiftType::firstOrCreate([
            'organization_id' => $organizationId,
            'code' => 'NIGHT_AFTER',
        ], [
            'name' => '夜勤明け',
            'start_at' => '09:30',
            'end_at' => '13:30',
            'break_minutes' => 0,
            'is_default' => false,
        ]);
    }
}
