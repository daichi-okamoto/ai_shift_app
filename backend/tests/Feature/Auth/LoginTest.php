<?php

namespace Tests\Feature\Auth;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::factory()->create([
            'code' => 'CARE001',
        ]);
    }

    public function test_login_with_correct_credentials_and_organization_code_succeeds(): void
    {
        $user = User::factory()
            ->for($this->organization)
            ->state([
                'email' => 'member@example.com',
                'password' => Hash::make('secret123'),
            ])->create();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'member@example.com',
            'password' => 'secret123',
            'organization_code' => 'CARE001',
        ]);

        $response
            ->assertOk()
            ->assertJsonStructure([
                'token',
                'token_type',
                'abilities',
                'user' => [
                    'id',
                    'name',
                    'email',
                ],
            ])
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_login_fails_with_invalid_organization_code(): void
    {
        User::factory()
            ->for($this->organization)
            ->state([
                'email' => 'member@example.com',
                'password' => Hash::make('secret123'),
            ])->create();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'member@example.com',
            'password' => 'secret123',
            'organization_code' => 'UNKNOWN01',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['organization_code']);
    }

    public function test_login_fails_with_wrong_password_in_same_organization(): void
    {
        User::factory()
            ->for($this->organization)
            ->state([
                'email' => 'member@example.com',
                'password' => Hash::make('secret123'),
            ])->create();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'member@example.com',
            'password' => 'wrong-password',
            'organization_code' => 'CARE001',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_requires_organization_code(): void
    {
        User::factory()
            ->for($this->organization)
            ->state([
                'email' => 'member@example.com',
                'password' => Hash::make('secret123'),
            ])->create();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'member@example.com',
            'password' => 'secret123',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['organization_code']);
    }
}
