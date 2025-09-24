<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShiftResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'unit_id' => $this->unit_id,
            'work_date' => $this->work_date instanceof \Carbon\CarbonInterface ? $this->work_date->toDateString() : $this->work_date,
            'start_at' => $this->start_at,
            'end_at' => $this->end_at,
            'status' => $this->status,
            'meta' => $this->meta ?? [],
            'shift_type' => $this->whenLoaded('shiftType', function () {
                return [
                    'id' => $this->shiftType->id,
                    'code' => $this->shiftType->code,
                    'name' => $this->shiftType->name,
                    'start_at' => $this->shiftType->start_at,
                    'end_at' => $this->shiftType->end_at,
                ];
            }),
            'assignments' => AssignmentResource::collection(
                $this->whenLoaded('assignments')
            ),
        ];
    }
}
