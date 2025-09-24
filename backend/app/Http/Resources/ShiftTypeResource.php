<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShiftTypeResource extends JsonResource
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
            'name' => $this->name,
            'code' => $this->code,
            'start_at' => $this->start_at,
            'end_at' => $this->end_at,
            'break_minutes' => $this->break_minutes,
            'is_default' => (bool) $this->is_default,
        ];
    }
}
