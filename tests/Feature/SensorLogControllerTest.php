<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;

// ─── Auth guard ──────────────────────────────────────────────────────────────

test('guests are redirected to login from logs.index', function () {
    $this->get(route('logs.index'))->assertRedirect(route('login'));
});

test('authenticated users can visit logs.index', function () {
    Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->component('logs/index')
                ->has('rooms')
                ->has('activeRoomId')
                ->has('sensors')
                ->has('logs')
                ->has('pagination')
                ->has('timeFilter')
                ->where('timeFilter.mode', 'none')
        );
});

// ─── Room filtering ──────────────────────────────────────────────────────────

test('defaults to first room when no room param', function () {
    $room1 = Room::factory()->create(['name' => 'RUANG A']);
    Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->where('activeRoomId', $room1->id)
        );
});

test('can filter by room query param', function () {
    Room::factory()->create(['name' => 'RUANG A']);
    $room2 = Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room2->id]))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->where('activeRoomId', $room2->id)
        );
});

// ─── Data pivot ──────────────────────────────────────────────────────────────

test('log rows contain pivoted sensor data', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor1 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    $sensor2 = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $timestamp = now();
    SensorReading::factory()->create([
        'sensor_id' => $sensor1->id,
        'avg_temp' => 25.50,
        'avg_hum' => 60.00,
        'created_at' => $timestamp,
    ]);
    SensorReading::factory()->create([
        'sensor_id' => $sensor2->id,
        'avg_temp' => 26.00,
        'avg_hum' => 58.00,
        'created_at' => $timestamp,
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->has('logs', 1)
                ->has('logs.0.temp_1')
                ->has('logs.0.temp_2')
                ->has('logs.0.hum_1')
                ->has('logs.0.hum_2')
                ->has('logs.0.avg_temp')
                ->has('logs.0.avg_hum')
                ->where('logs.0.time', fn ($time) => is_string($time))
        );
});

test('chart series are returned with empty points when no readings exist', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->has('logs', 0)
                ->has('sensors')
        );
});

test('can filter logs by recent minutes', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 25.10,
        'avg_hum' => 58.20,
        'created_at' => now()->subMinutes(2),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 22.40,
        'avg_hum' => 52.30,
        'created_at' => now()->subMinutes(20),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 5,
        ]))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->where('timeFilter.mode', 'recent')
                ->where('timeFilter.recent_minutes', 5)
                ->has('logs', 1)
        );
});

test('can filter logs by time interval', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 28.80,
        'avg_hum' => 62.10,
        'created_at' => now()->subMinutes(90),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 24.70,
        'avg_hum' => 54.20,
        'created_at' => now()->subMinutes(10),
    ]);

    $start = now()->subMinutes(30)->format('Y-m-d H:i:s');
    $end = now()->format('Y-m-d H:i:s');

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', [
            'room' => $room->id,
            'time_filter' => 'interval',
            'start_at' => $start,
            'end_at' => $end,
        ]))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->where('timeFilter.mode', 'interval')
                ->where('timeFilter.start_at', $start)
                ->where('timeFilter.end_at', $end)
                ->has('logs', 1)
        );
});
