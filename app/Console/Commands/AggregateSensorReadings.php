<?php

namespace App\Console\Commands;

use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Console\Command;

class AggregateSensorReadings extends Command
{
    protected $signature = 'aggregate:sensor-readings';

    protected $description = 'Aggregate per-sensor values into sensor_readings (runs every minute)';

    public function handle(): int
    {
        $sensors = Sensor::with('latestData')
            ->whereHas('latestData', fn ($q) => $q->where('status', '!=', 'OFFLINE'))
            ->get();

        if ($sensors->isEmpty()) {
            $this->info('No online sensors found, skipping.');

            return self::SUCCESS;
        }

        $rows = $sensors->map(fn ($s) => [
            'sensor_id' => $s->id,
            'avg_temp' => $s->latestData->temperature,
            'avg_hum' => $s->latestData->humidity,
            'created_at' => now(),
        ])->toArray();

        SensorReading::insert($rows);

        $this->info('Sensor reading aggregation complete.');

        return self::SUCCESS;
    }
}
