<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Support\SchedulePreference;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class EmployeeStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        $role = $user->role instanceof UserRole
            ? $user->role
            : UserRole::tryFrom((string) $user->role);

        return $role === UserRole::Admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $organizationId = $this->user()?->organization_id ?? 0;

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', Rule::in(['admin', 'leader', 'member'])],
            'employment_type' => ['required', Rule::in(['full_time', 'part_time', 'contract'])],
            'password' => ['required', 'string', 'min:8'],
            'allowed_shift_type_ids' => ['sometimes', 'array'],
            'allowed_shift_type_ids.*' => [
                'integer',
                Rule::exists('shift_types', 'id')->where(fn ($query) => $query->where('organization_id', $organizationId)),
            ],
            'memberships' => ['sometimes', 'array'],
            'memberships.*.unit_id' => [
                'required',
                'integer',
                Rule::exists('units', 'id')->where(fn ($query) => $query->where('organization_id', $organizationId)),
            ],
            'memberships.*.role' => ['required', Rule::in(['leader', 'member'])],
        ];

        $rules['schedule_preferences'] = ['sometimes', 'array'];
        $rules['schedule_preferences.fixed_days_off'] = ['sometimes', 'array'];
        foreach (SchedulePreference::DAY_KEYS as $dayKey) {
            $rules["schedule_preferences.fixed_days_off.$dayKey"] = ['sometimes', 'boolean'];
        }
        $rules['schedule_preferences.custom_dates_off'] = ['sometimes', 'array'];
        $rules['schedule_preferences.custom_dates_off.*'] = ['date'];

        return $rules;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $allowedShiftTypeIds = $this->input('allowed_shift_type_ids');

            if (is_array($allowedShiftTypeIds) && collect($allowedShiftTypeIds)->filter(fn ($value) => $value !== null)->isEmpty()) {
                $validator->errors()->add('allowed_shift_type_ids', '勤務可能シフトを1つ以上選択してください。');
            }

            $memberships = collect($this->input('memberships', []));

            if ($memberships->isEmpty()) {
                return;
            }

            $uniqueUnitCount = $memberships->pluck('unit_id')->filter()->unique()->count();

            if ($uniqueUnitCount !== $memberships->count()) {
                $validator->errors()->add('memberships', '同じユニットを複数回登録することはできません。');
            }

        });
    }
}
