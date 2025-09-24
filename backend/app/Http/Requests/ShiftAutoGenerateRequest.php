<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ShiftAutoGenerateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'constraints' => ['sometimes', 'array'],
            'constraints.max_nights_per_member' => ['sometimes', 'integer', 'min:0', 'max:31'],
            'constraints.max_consecutive_workdays' => ['sometimes', 'integer', 'min:1', 'max:31'],
            'constraints.desired_day_headcount' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'constraints.time_limit' => ['sometimes', 'numeric', 'min:1', 'max:120'],
            'constraints.enforce_night_after_rest' => ['sometimes', 'boolean'],
            'constraints.enforce_night_rest_pairing' => ['sometimes', 'boolean'],
            'constraints.forbid_late_to_early' => ['sometimes', 'boolean'],
            'constraints.limit_fulltime_repeat' => ['sometimes', 'boolean'],
            'constraints.balance_workload' => ['sometimes', 'boolean'],
            'preserve_existing' => ['sometimes', 'boolean'],
            'constraints.min_off_days' => ['sometimes', 'integer', 'min:0', 'max:31'],
            'constraints.min_off_days_full_time' => ['sometimes', 'integer', 'min:0', 'max:31'],
            'constraints.min_off_days_part_time' => ['sometimes', 'integer', 'min:0', 'max:31'],
            'constraints.holiday_dates' => ['sometimes', 'array'],
            'constraints.holiday_dates.*' => ['date'],
            'range' => ['sometimes', 'array'],
            'range.start_date' => ['required_with:range', 'date'],
            'range.end_date' => ['required_with:range', 'date'],
            'commit' => ['sometimes', 'boolean'],
        ];
    }
}
