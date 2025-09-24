<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UnitUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $unit = $this->route('unit');

        if (! $user || ! $unit instanceof Unit) {
            return false;
        }

        return $user->role === UserRole::Admin && $unit->organization_id === $user->organization_id;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $unit = $this->route('unit');
        $organizationId = $this->user()?->organization_id ?? 0;
        $unitId = $unit instanceof Unit ? $unit->id : 0;

        return [
            'name' => ['required', 'string', 'max:255'],
            'code' => [
                'required',
                'string',
                'max:32',
                Rule::unique('units', 'code')
                    ->where(fn ($query) => $query->where('organization_id', $organizationId))
                    ->ignore($unitId),
            ],
            'coverage_requirements' => ['required', 'array'],
            'coverage_requirements.early' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.day' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.late' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.night' => ['required', 'integer', 'between:0,10'],
        ];
    }
}
