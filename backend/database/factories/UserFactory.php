<?php

namespace Database\Factories;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $jpFaker = fake('ja_JP');

        $familyName = $jpFaker->lastName();
        $givenName = $jpFaker->firstName();

        return [
            'organization_id' => Organization::factory(),
            'name' => sprintf('%s %s', $familyName, $givenName),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'role' => fake()->randomElement(['admin', 'leader', 'member']),
            'employment_type' => fake()->randomElement(['full_time', 'part_time', 'contract']),
            'can_night_shift' => fake()->boolean(70),
            'contract_hours_per_week' => fake()->numberBetween(24, 40),
            'settings' => [
                'color' => fake()->hexColor(),
            ],
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
