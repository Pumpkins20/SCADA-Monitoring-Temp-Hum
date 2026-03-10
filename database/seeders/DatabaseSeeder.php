<?php

namespace Database\Seeders;

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\SensorLog;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * Topology: 5 rooms × 1 HMI × 5 sensors = 25 sensors total (real hardware).
     * Status distribution: 15 NORMAL · 5 WARNING · 3 CRITICAL · 2 OFFLINE
     */
    public function run(): void
    {
        // ─── Admin user ───────────────────────────────────────────────────────

        User::factory()->create([
            'name' => 'Admin SCADA',
            'email' => 'admin@scada.local',
        ]);

        // ─── Real hardware configuration ──────────────────────────────────────
        // Test device: 1 HMI · IP: 192.168.1.113 · Port: 502 (Modbus TCP)
        // Function: Input Register (FC4) · Humidity=0 · Temperature=1
        // Slave ID per sensor: 1-5 (unit_id)
        $rooms = [
            ['name' => 'RUANG TEST', 'location' => null, 'ip' => '192.168.1.252'],
        ];

        // Status pool: 2 NORMAL, 1 WARNING, 1 CRITICAL, 1 OFFLINE (total 5)
        $statusPool = ['NORMAL', 'NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE'];
        shuffle($statusPool);
        $statusIndex = 0;

        foreach ($rooms as $index => $roomData) {
            $room = Room::factory()->create([
                'name' => $roomData['name'],
                'location' => $roomData['location'],
            ]);

            $hmi = Hmi::factory()->create([
                'room_id' => $room->id,
                'name' => 'HMI-01',
                'ip_address' => $roomData['ip'],
                'port' => 502,
            ]);

            for ($unitId = 1; $unitId <= 5; $unitId++) {
                $sensor = Sensor::factory()->create([
                    'hmi_id' => $hmi->id,
                    'name' => "{$roomData['name']} T/H {$unitId}",
                    'modbus_address_hum' => 0,   // Input Register 0
                    'modbus_address_temp' => 1,   // Input Register 1
                    'unit_id' => $unitId,
                ]);

                $status = $statusPool[$statusIndex++];
                $factory = SensorLatestData::factory();

                match ($status) {
                    'NORMAL' => $factory->normal()->create(['sensor_id' => $sensor->id]),
                    'WARNING' => $factory->warning()->create(['sensor_id' => $sensor->id]),
                    'CRITICAL' => $factory->critical()->create(['sensor_id' => $sensor->id]),
                    'OFFLINE' => $factory->offline()->create(['sensor_id' => $sensor->id]),
                };
            }

            // ─── Chart history: 20 log points per room (1 minute apart) ──────
            for ($m = 19; $m >= 0; $m--) {
                SensorLog::factory()->create([
                    'room_id' => $room->id,
                    'created_at' => now()->subMinutes($m),
                    'updated_at' => now()->subMinutes($m),
                ]);
            }
        }
    }
}
