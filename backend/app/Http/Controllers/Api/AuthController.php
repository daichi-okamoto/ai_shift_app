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
            'organization_code' => ['required', 'string'],
        ]);

        $organizationCode = strtoupper($credentials['organization_code']);

        $organization = Organization::query()
            ->whereRaw('UPPER(code) = ?', [$organizationCode])
            ->first();

        if (! $organization) {
            throw ValidationException::withMessages([
                'organization_code' => '指定された事業所コードは存在しません。',
            ]);
        }

        /** @var User|null $user */
        $user = User::with(['organization', 'memberships.unit', 'allowedShiftTypes'])
            ->where('email', $credentials['email'])
            ->where('organization_id', $organization->id)
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => '入力された認証情報が正しくありません。',
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

        $this->ensureDefaultShiftTypes($organization);

        $user = User::create([
            'organization_id' => $organization->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'role' => UserRole::Admin->value,
            'employment_type' => 'full_time',
        ]);

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

    private function ensureDefaultShiftTypes(Organization $organization): void
    {
        $existingCount = ShiftType::query()
            ->where('organization_id', $organization->id)
            ->count();

        if ($existingCount > 0) {
            return;
        }

        $definitions = [
            ['code' => 'EARLY', 'name' => '早番', 'start_at' => '07:00', 'end_at' => '15:45', 'break' => 60, 'is_default' => true],
            ['code' => 'DAY', 'name' => '日勤', 'start_at' => '08:30', 'end_at' => '17:15', 'break' => 60, 'is_default' => true],
            ['code' => 'LATE', 'name' => '遅番', 'start_at' => '11:45', 'end_at' => '20:30', 'break' => 60, 'is_default' => true],
            ['code' => 'NIGHT', 'name' => '夜勤', 'start_at' => '16:30', 'end_at' => '09:30', 'break' => 90, 'is_default' => true],
            ['code' => 'NIGHT_AFTER', 'name' => '夜勤明け', 'start_at' => '09:30', 'end_at' => '13:30', 'break' => 0, 'is_default' => false],
            ['code' => 'OFF', 'name' => '休み', 'start_at' => '00:00', 'end_at' => '23:59', 'break' => 0, 'is_default' => false],
        ];

        foreach ($definitions as $definition) {
            ShiftType::create([
                'organization_id' => $organization->id,
                'name' => $definition['name'],
                'code' => $definition['code'],
                'start_at' => $definition['start_at'],
                'end_at' => $definition['end_at'],
                'break_minutes' => $definition['break'],
                'is_default' => $definition['is_default'],
            ]);
        }
    }
}
