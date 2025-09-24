<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ShiftBulkDeleteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'range_type' => ['required', 'in:day,week,month'],
            'target_date' => ['required_if:range_type,day,week', 'date'],
            'month' => ['required_if:range_type,month', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }
}

