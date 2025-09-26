<?php

namespace App\Http\Resources;

use App\Support\SchedulePreference;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $memberships = $this->whenLoaded('memberships');

        $membershipsArray = [];

        if ($memberships instanceof Collection) {
            $membershipsArray = $memberships->map(function ($membership) {
                return [
                    'unit_id' => $membership->unit_id,
                    'unit_name' => $membership->unit?->name,
                    'role' => $membership->role,
                ];
            })->values()->all();
        }

        $allowedShiftTypes = $this->whenLoaded('allowedShiftTypes');
        $allowedShiftTypesArray = [];

        if ($allowedShiftTypes instanceof Collection) {
            $allowedShiftTypesArray = $allowedShiftTypes
                ->map(function ($shiftType) {
                    return [
                        'id' => $shiftType->id,
                        'code' => $shiftType->code,
                        'name' => $shiftType->name,
                    ];
                })
                ->values()
                ->all();
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role?->value ?? $this->role,
            'role_label' => $this->role?->label() ?? null,
            'employment_type' => $this->employment_type,
            'organization' => $this->organization ? [
                'id' => $this->organization->id,
                'name' => $this->organization->name,
            ] : null,
            'memberships' => $membershipsArray,
            'allowed_shift_types' => $allowedShiftTypesArray,
            'schedule_preferences' => SchedulePreference::expand($this->settings['schedule_preferences'] ?? null),
        ];
    }
}
