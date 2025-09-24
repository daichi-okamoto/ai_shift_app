<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ShiftStoreRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'shift_type_id' => ['required', 'exists:shift_types,id'],
            'work_date' => ['required', 'date'],
            'start_at' => ['nullable', 'date_format:H:i'],
            'end_at' => ['nullable', 'date_format:H:i', 'after:start_at'],
            'status' => ['nullable', 'in:draft,published'],
            'assignment_user_id' => ['nullable', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
