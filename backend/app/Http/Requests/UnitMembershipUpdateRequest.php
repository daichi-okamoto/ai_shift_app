<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UnitMembershipUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $unit = $this->route('unit');

        if (! $user || ! $unit instanceof Unit) {
            return false;
        }

        if (! in_array($user->role, [UserRole::Admin, UserRole::Leader], true)) {
            return false;
        }

        if ($unit->organization_id !== $user->organization_id) {
            return false;
        }

        if ($user->role === UserRole::Leader) {
            return $user->memberships()->where('unit_id', $unit->id)->exists();
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $organizationId = $this->user()?->organization_id ?? 0;

        return [
            'members' => ['array'],
            'members.*.user_id' => [
                'required',
                'integer',
                'distinct',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('organization_id', $organizationId)),
            ],
            'members.*.role' => ['required', Rule::in(['leader', 'member'])],
        ];
    }
}
