<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UnitStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->role === UserRole::Admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $organizationId = $this->user()?->organization_id ?? 0;

        return [
            'name' => ['required', 'string', 'max:255'],
            'code' => [
                'required',
                'string',
                'max:32',
                Rule::unique('units', 'code')->where(fn ($query) => $query->where('organization_id', $organizationId)),
            ],
            'coverage_requirements' => ['required', 'array'],
            'coverage_requirements.early' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.day' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.late' => ['required', 'integer', 'between:0,10'],
            'coverage_requirements.night' => ['required', 'integer', 'between:0,10'],
        ];
    }
}
