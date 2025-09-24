<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Organization>
 */
class OrganizationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->company().' 介護サービス';

        return [
            'name' => $name,
            'code' => strtoupper(Str::random(6)),
            'settings' => [
                'timezone' => 'Asia/Tokyo',
            ],
        ];
    }
}
