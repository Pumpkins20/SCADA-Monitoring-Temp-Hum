<?php

namespace Database\Factories;

use App\Models\Hmi;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Sensor>
 */
class SensorFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'hmi_id' => Hmi::factory(),
            'name' => 'T/H '.fake()->numberBetween(1, 99),
            'modbus_address_temp' => 1,
            'modbus_address_hum' => 0,
            'unit_id' => fake()->numberBetween(1, 5),
            'modbus_register_function' => '04',
        ];
    }
}
