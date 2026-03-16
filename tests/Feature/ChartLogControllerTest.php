<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLog;
use App\Models\SensorReading;
use App\Models\User;

// ─── Auth guard ──────────────────────────────────────────────────────────────

test('guests are redirected to login from chart-logs.index', function () {
    $this->get(route('chart-logs.index'))->assertRedirect(route('login'));
});

// ─── Overview mode ───────────────────────────────────────────────────────────

test('overview mode renders with correct props', function () {
    Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->component('chart-logs/index')
                ->where('mode', 'overview')
                ->has('rooms')
                ->has('roomChartSeries')
        );
});

test('overview roomChartSeries contains a series per room', function () {
    $room1 = Room::factory()->create(['name' => 'RUANG A']);
    $room2 = Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'overview')
                ->has('roomChartSeries', 2)
                ->where('roomChartSeries.0.roomId', $room1->id)
                ->where('roomChartSeries.1.roomId', $room2->id)
        );
});

test('overview points include avg_temperature and avg_humidity from sensor_logs', function () {
    $room = Room::factory()->create();
    SensorLog::factory()->create([
        'room_id' => $room->id,
        'avg_temperature' => 23.50,
        'avg_humidity' => 61.00,
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'overview')
                ->has('roomChartSeries.0.points', 1)
                ->has('roomChartSeries.0.points.0.time')
                ->has('roomChartSeries.0.points.0.avg_temperature')
                ->has('roomChartSeries.0.points.0.avg_humidity')
        );
});

// ─── Detail mode ─────────────────────────────────────────────────────────────

test('detail mode renders with correct props when room param given', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->component('chart-logs/index')
                ->where('mode', 'detail')
                ->where('activeRoomId', $room->id)
                ->has('activeRoomName')
                ->has('rooms')
                ->has('sensors')
                ->has('chartSeriesPerSensor')
        );
});

test('detail mode returns per-sensor chart series', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor1 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    $sensor2 = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $timestamp = now();
    SensorReading::factory()->create([
        'sensor_id' => $sensor1->id,
        'avg_temp' => 24.00,
        'avg_hum' => 62.00,
        'created_at' => $timestamp,
    ]);
    SensorReading::factory()->create([
        'sensor_id' => $sensor2->id,
        'avg_temp' => 25.50,
        'avg_hum' => 59.00,
        'created_at' => $timestamp,
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'detail')
                ->has('chartSeriesPerSensor', 2)
                ->where('chartSeriesPerSensor.0.sensorId', $sensor1->id)
                ->where('chartSeriesPerSensor.1.sensorId', $sensor2->id)
                ->has('chartSeriesPerSensor.0.points', 1)
                ->has('chartSeriesPerSensor.0.points.0.avg_temperature')
                ->has('chartSeriesPerSensor.0.points.0.avg_humidity')
        );
});

test('detail mode activeRoomName matches the room name', function () {
    $room = Room::factory()->create(['name' => 'RUANG SERVER']);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('activeRoomName', 'RUANG SERVER')
        );
});
