<?php

namespace Database\Factories;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Unit>
 */
class UnitFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'name' => fake()->randomElement(['1AB ユニット', '1CD ユニット', '2AB ユニット', '2CD ユニット', '2EF ユニット']),
            'code' => strtoupper(fake()->bothify('U##')),
            'display_order' => fake()->numberBetween(1, 10),
            'coverage_requirements' => [
                'early' => 1,
                'day' => 1,
                'late' => 1,
                'night' => 1,
            ],
        ];
    }
}
