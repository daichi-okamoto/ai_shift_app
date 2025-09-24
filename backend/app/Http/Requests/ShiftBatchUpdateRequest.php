<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ShiftBatchUpdateRequest extends FormRequest
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
            'entries' => ['required', 'array', 'min:1'],
            'entries.*.member_id' => ['required', 'integer', 'exists:users,id'],
            'entries.*.work_date' => ['required', 'date'],
            'entries.*.shift_type_id' => ['nullable', 'integer', 'exists:shift_types,id'],
            'entries.*.start_at' => ['nullable', 'date_format:H:i'],
            'entries.*.end_at' => ['nullable', 'date_format:H:i'],
            'entries.*.status' => ['nullable', 'in:draft,published'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $entries = $this->input('entries', []);

            foreach ($entries as $index => $entry) {
                $shiftTypeId = $entry['shift_type_id'] ?? null;
                $startAt = $entry['start_at'] ?? null;
                $endAt = $entry['end_at'] ?? null;

                if ($shiftTypeId) {
                    if (($startAt && ! $endAt) || (! $startAt && $endAt)) {
                        $validator->errors()->add("entries.$index.start_at", '開始と終了時刻は両方指定する必要があります。');
                    }
                } elseif ($startAt || $endAt) {
                    if (! $startAt || ! $endAt) {
                        $validator->errors()->add("entries.$index.start_at", 'カスタム時刻を設定する場合は開始と終了を指定してください。');
                    } elseif ($startAt >= $endAt) {
                        $validator->errors()->add("entries.$index.start_at", '終了時刻は開始時刻より後にしてください。');
                    }
                }
            }
        });
    }
}
