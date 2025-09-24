<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role' => ['required', Rule::in(['admin', 'leader', 'member'])],
            'employment_type' => ['required', Rule::in(['full_time', 'part_time', 'contract'])],
            'can_night_shift' => ['sometimes', 'boolean'],
            'contract_hours_per_week' => ['nullable', 'integer', 'between:0,168'],
            'organization_code' => ['required', 'string', 'max:32'],
            'organization_name' => ['nullable', 'string', 'max:255'],
        ];
    }
}
