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
            fn($page) => $page
                ->component('logs/index')
                ->has('rooms')
                ->has('activeRoomId')
                ->has('sensors')
                ->has('logs')
                ->has('pagination')
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
            fn($page) => $page->where('activeRoomId', $room1->id)
        );
});

test('can filter by room query param', function () {
    Room::factory()->create(['name' => 'RUANG A']);
    $room2 = Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room2->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('activeRoomId', $room2->id)
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
            fn($page) => $page
                ->has('logs', 1)
                ->has('logs.0.temp_1')
                ->has('logs.0.temp_2')
                ->has('logs.0.hum_1')
                ->has('logs.0.hum_2')
                ->has('logs.0.avg_temp')
                ->has('logs.0.avg_hum')
                ->where('logs.0.time', fn($time) => is_string($time))
        );
});

test('chart series are returned with empty points when no readings exist', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->has('logs', 0)
                ->has('sensors')
        );
});
