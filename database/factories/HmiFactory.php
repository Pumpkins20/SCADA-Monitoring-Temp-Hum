<?php

namespace Database\Factories;

use App\Models\Hmi;
use App\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Hmi>
 */
class HmiFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'room_id' => Room::factory(),
            'name' => 'HMI-'.fake()->unique()->numberBetween(1, 99),
            'ip_address' => fake()->localIpv4(),
            'port' => 502,
            'register_function' => '03',
            'is_active' => true,
            'is_preview' => false,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_active' => false,
        ]);
    }
}
