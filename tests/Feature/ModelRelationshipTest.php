<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\SensorLog;
use App\Models\SensorReading;

// ─── Room relationships ───────────────────────────────────────────────────────

test('room has many hmis', function () {
    $room = Room::factory()->create();
    Hmi::factory()->count(3)->create(['room_id' => $room->id]);

    expect($room->hmis)->toHaveCount(3)
        ->each->toBeInstanceOf(Hmi::class);
});

test('room has many sensor logs', function () {
    $room = Room::factory()->create();
    SensorLog::factory()->count(5)->create(['room_id' => $room->id]);

    expect($room->logs)->toHaveCount(5)
        ->each->toBeInstanceOf(SensorLog::class);
});

// ─── Hmi relationships ────────────────────────────────────────────────────────

test('hmi belongs to room', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    expect($hmi->room)->toBeInstanceOf(Room::class)
        ->and($hmi->room->id)->toBe($room->id);
});

test('hmi has many sensors', function () {
    $hmi = Hmi::factory()->create();
    Sensor::factory()->count(5)->create(['hmi_id' => $hmi->id]);

    expect($hmi->sensors)->toHaveCount(5)
        ->each->toBeInstanceOf(Sensor::class);
});

// ─── Sensor relationships ─────────────────────────────────────────────────────

test('sensor belongs to hmi', function () {
    $hmi = Hmi::factory()->create();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    expect($sensor->hmi)->toBeInstanceOf(Hmi::class)
        ->and($sensor->hmi->id)->toBe($hmi->id);
});

test('sensor has one latest data', function () {
    $sensor = Sensor::factory()->create();
    $latest = SensorLatestData::factory()->create(['sensor_id' => $sensor->id]);

    expect($sensor->latestData)->toBeInstanceOf(SensorLatestData::class)
        ->and($sensor->latestData->id)->toBe($latest->id);
});

test('sensor has many readings', function () {
    $sensor = Sensor::factory()->create();
    SensorReading::factory()->count(12)->create(['sensor_id' => $sensor->id]);

    expect($sensor->readings)->toHaveCount(12)
        ->each->toBeInstanceOf(SensorReading::class);
});

// ─── SensorLatestData relationships ──────────────────────────────────────────

test('sensor latest data belongs to sensor', function () {
    $sensor = Sensor::factory()->create();
    $latest = SensorLatestData::factory()->create(['sensor_id' => $sensor->id]);

    expect($latest->sensor)->toBeInstanceOf(Sensor::class)
        ->and($latest->sensor->id)->toBe($sensor->id);
});

// ─── SensorLog relationships ──────────────────────────────────────────────────

test('sensor log belongs to room', function () {
    $room = Room::factory()->create();
    $log = SensorLog::factory()->create(['room_id' => $room->id]);

    expect($log->room)->toBeInstanceOf(Room::class)
        ->and($log->room->id)->toBe($room->id);
});

// ─── SensorReading relationships ──────────────────────────────────────────────

test('sensor reading belongs to sensor', function () {
    $sensor = Sensor::factory()->create();
    $reading = SensorReading::factory()->create(['sensor_id' => $sensor->id]);

    expect($reading->sensor)->toBeInstanceOf(Sensor::class)
        ->and($reading->sensor->id)->toBe($sensor->id);
});

test('sensor reading has no updated_at attribute', function () {
    $sensor = Sensor::factory()->create();
    $reading = SensorReading::factory()->create(['sensor_id' => $sensor->id]);

    expect($reading->updated_at)->toBeNull();
});

// ─── Factory states ───────────────────────────────────────────────────────────

test('sensor latest data factory normal state', function () {
    $latest = SensorLatestData::factory()->normal()->create();

    expect($latest->status)->toBe('NORMAL');
});

test('sensor latest data factory warning state', function () {
    $latest = SensorLatestData::factory()->warning()->create();

    expect($latest->status)->toBe('WARNING');
});

test('sensor latest data factory critical state', function () {
    $latest = SensorLatestData::factory()->critical()->create();

    expect($latest->status)->toBe('CRITICAL');
});

test('sensor latest data factory offline state', function () {
    $latest = SensorLatestData::factory()->offline()->create();

    expect($latest->status)->toBe('OFFLINE');
});

// ─── Eager loading (N+1 guard) ────────────────────────────────────────────────

test('eager loading hmis sensors and latest data avoids extra queries', function () {
    // Build: 2 rooms × 1 HMI × 3 sensors each
    $rooms = Room::factory()->count(2)->create();
    $rooms->each(function (Room $room) {
        $hmi = Hmi::factory()->create(['room_id' => $room->id]);
        Sensor::factory()->count(3)->create(['hmi_id' => $hmi->id])
            ->each(fn ($sensor) => SensorLatestData::factory()->create(['sensor_id' => $sensor->id]));
    });

    // Single eager-loaded query should access all nested data without extra queries
    $loaded = Room::with([
        'hmis.sensors' => fn ($q) => $q->select(['id', 'hmi_id', 'name']),
        'hmis.sensors.latestData' => fn ($q) => $q->select(['id', 'sensor_id', 'temperature', 'humidity', 'status', 'last_read_at']),
    ])
        ->select(['id', 'name', 'location', 'temp_max_limit', 'hum_max_limit'])
        ->get();

    expect($loaded)->toHaveCount(2);

    $loaded->each(function (Room $room) {
        expect($room->relationLoaded('hmis'))->toBeTrue();
        $room->hmis->each(function (Hmi $hmi) {
            expect($hmi->relationLoaded('sensors'))->toBeTrue();
            $hmi->sensors->each(function (Sensor $sensor) {
                expect($sensor->relationLoaded('latestData'))->toBeTrue();
            });
        });
    });
});

// ─── DatabaseSeeder ───────────────────────────────────────────────────────────

test('database seeder creates 1 room with 5 sensors and latest data', function () {
    $this->seed();

    expect(Room::count())->toBe(1);
    expect(Hmi::count())->toBe(1);
    expect(Sensor::count())->toBe(5);
    expect(SensorLatestData::count())->toBe(5);
});

test('database seeder produces mixed sensor statuses', function () {
    $this->seed();

    $statuses = SensorLatestData::query()->pluck('status')->toArray();

    expect($statuses)->toContain('NORMAL')
        ->toContain('WARNING')
        ->toContain('CRITICAL')
        ->toContain('OFFLINE');
});
