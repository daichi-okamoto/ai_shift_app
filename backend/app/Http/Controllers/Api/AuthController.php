<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\UpdatePasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\Organization;
use App\Models\ShiftType;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::with(['organization', 'memberships.unit', 'allowedShiftTypes'])
            ->where('email', $credentials['email'])
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'The provided credentials are incorrect.',
            ]);
        }

        // Token abilities are derived from the user's role.
        $token = $user->createToken('api-token', $user->tokenAbilities());

        return response()->json([
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'abilities' => $user->tokenAbilities(),
            'user' => new UserResource($user),
        ]);
    }

    public function logout(Request $request): Response
    {
        $user = $request->user();

        if ($user && $user->currentAccessToken()) {
            $user->currentAccessToken()->delete();
        }

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        return new UserResource(
            $request->user()->load(['organization', 'memberships.unit', 'allowedShiftTypes'])
        );
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $organizationCode = strtoupper($data['organization_code']);

        $organization = Organization::query()
            ->whereRaw('UPPER(code) = ?', [$organizationCode])
            ->first();

        if (! $organization) {
            if ($data['role'] !== UserRole::Admin->value) {
                throw ValidationException::withMessages([
                    'organization_code' => '指定された事業所コードは存在しません。',
                ]);
            }

            if (empty($data['organization_name'])) {
                throw ValidationException::withMessages([
                    'organization_name' => '新規事業所を作成する場合は名称を入力してください。',
                ]);
            }

            if (Organization::query()->whereRaw('UPPER(code) = ?', [$organizationCode])->exists()) {
                throw ValidationException::withMessages([
                    'organization_code' => '指定された事業所コードは既に利用されています。別のコードを指定してください。',
                ]);
            }

            $organization = Organization::create([
                'name' => $data['organization_name'],
                'code' => $organizationCode,
                'settings' => [
                    'timezone' => 'Asia/Tokyo',
                ],
            ]);
        }

        $user = User::create([
            'organization_id' => $organization->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'role' => $data['role'],
            'employment_type' => $data['employment_type'],
            'can_night_shift' => (bool) ($data['can_night_shift'] ?? false),
            'contract_hours_per_week' => $data['contract_hours_per_week'] ?? null,
        ]);

        $defaultShiftTypeIds = ShiftType::query()
            ->where('organization_id', $organization->id)
            ->pluck('id')
            ->all();

        if (! empty($defaultShiftTypeIds)) {
            $user->allowedShiftTypes()->sync($defaultShiftTypeIds);
        }

        $user->load(['organization', 'memberships.unit', 'allowedShiftTypes']);

        $token = $user->createToken('api-token', $user->tokenAbilities());

        return response()->json([
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'abilities' => $user->tokenAbilities(),
            'user' => new UserResource($user),
        ], 201);
    }

    public function updatePassword(UpdatePasswordRequest $request): Response
    {
        $user = $request->user();
        $data = $request->validated();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => '現在のパスワードが正しくありません。',
            ]);
        }

        $user->password = Hash::make($data['password']);
        $user->save();

        return response()->noContent();
    }
}
