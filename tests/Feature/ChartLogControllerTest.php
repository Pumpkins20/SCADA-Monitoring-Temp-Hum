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
                ->where('timeFilter.mode', 'none')
                ->has('rooms')
                ->has('timeFilter')
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
                ->where('timeFilter.mode', 'none')
                ->has('activeRoomName')
                ->has('rooms')
                ->has('sensors')
                ->has('timeFilter')
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

test('overview mode can filter logs by recent minutes', function () {
    $room = Room::factory()->create();

    SensorLog::factory()->create([
        'room_id' => $room->id,
        'avg_temperature' => 23.40,
        'avg_humidity' => 60.20,
        'created_at' => now()->subMinutes(2),
    ]);

    SensorLog::factory()->create([
        'room_id' => $room->id,
        'avg_temperature' => 25.10,
        'avg_humidity' => 63.40,
        'created_at' => now()->subMinutes(40),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'time_filter' => 'recent',
            'recent_minutes' => 5,
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'overview')
                ->where('timeFilter.mode', 'recent')
                ->where('timeFilter.recent_minutes', 5)
                ->has('roomChartSeries.0.points', 1)
        );
});

test('detail mode can filter logs by recent minutes', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 24.20,
        'avg_hum' => 56.40,
        'created_at' => now()->subMinutes(3),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 21.50,
        'avg_hum' => 50.30,
        'created_at' => now()->subMinutes(25),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 10,
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'detail')
                ->where('timeFilter.mode', 'recent')
                ->where('timeFilter.recent_minutes', 10)
                ->has('chartSeriesPerSensor.0.points', 1)
        );
});

test('detail mode can filter logs by custom interval', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 20.40,
        'avg_hum' => 52.10,
        'created_at' => now()->subHours(3),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 26.30,
        'avg_hum' => 61.50,
        'created_at' => now()->subMinutes(15),
    ]);

    $startAt = now()->subHour()->format('Y-m-d H:i:s');
    $endAt = now()->format('Y-m-d H:i:s');

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'room' => $room->id,
            'time_filter' => 'interval',
            'start_at' => $startAt,
            'end_at' => $endAt,
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'detail')
                ->where('timeFilter.mode', 'interval')
                ->where('timeFilter.start_at', $startAt)
                ->where('timeFilter.end_at', $endAt)
                ->has('chartSeriesPerSensor.0.points', 1)
        );
});

test('invalid custom interval falls back to no time filter', function () {
    Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'time_filter' => 'interval',
            'start_at' => 'invalid-date',
            'end_at' => 'invalid-date',
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('mode', 'overview')
                ->where('timeFilter.mode', 'none')
                ->has('roomChartSeries')
        );
});

test('custom interval is capped to 30 days in detail mode', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 19.80,
        'avg_hum' => 48.20,
        'created_at' => now()->subDays(35),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 24.90,
        'avg_hum' => 58.60,
        'created_at' => now()->subDays(5),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'room' => $room->id,
            'time_filter' => 'interval',
            'start_at' => now()->subDays(60)->format('Y-m-d H:i:s'),
            'end_at' => now()->format('Y-m-d H:i:s'),
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('timeFilter.mode', 'interval')
                ->has('chartSeriesPerSensor.0.points', 1)
        );
});

test('filtered detail mode is sampled to 400 points max', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $rows = [];
    for ($i = 0; $i < 450; $i++) {
        $rows[] = [
            'sensor_id' => $sensor->id,
            'avg_temp' => 24.00,
            'avg_hum' => 55.00,
            'created_at' => now()->subMinutes(449 - $i),
        ];
    }

    SensorReading::query()->insert($rows);

    $this->actingAs(User::factory()->create())
        ->get(route('chart-logs.index', [
            'room' => $room->id,
            'time_filter' => 'interval',
            'start_at' => now()->subHours(8)->format('Y-m-d H:i:s'),
            'end_at' => now()->format('Y-m-d H:i:s'),
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('timeFilter.mode', 'interval')
                ->has('chartSeriesPerSensor.0.points', 400)
        );
});
