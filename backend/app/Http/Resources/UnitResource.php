<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UnitResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $memberships = $this->whenLoaded('memberships');

        $leaderMembership = null;

        if ($memberships instanceof \Illuminate\Support\Collection) {
            $leaderMembership = $memberships->firstWhere('role', 'leader');
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'display_order' => $this->display_order,
            'coverage_requirements' => $this->coverage_requirements ?? [],
            'member_count' => $memberships instanceof \Illuminate\Support\Collection ? $memberships->count() : 0,
            'leader' => $leaderMembership ? [
                'id' => $leaderMembership->user->id,
                'name' => $leaderMembership->user->name,
                'email' => $leaderMembership->user->email,
            ] : null,
            'members' => $memberships instanceof \Illuminate\Support\Collection
                ? $memberships
                    ->map(function ($membership) {
                        return [
                            'id' => $membership->user->id,
                            'name' => $membership->user->name,
                            'role' => $membership->role,
                            'employment_type' => $membership->user->employment_type,
                            'display_order' => $membership->display_order,
                        ];
                    })
                    ->values()
                    ->all()
                : [],
        ];
    }
}
