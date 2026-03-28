<?php

use App\Models\AlarmEvent;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;
use Illuminate\Support\Carbon;

test('guests are redirected to login from alarms.index', function () {
    $this->get(route('alarms.index'))->assertRedirect(route('login'));
});

test('authenticated users can visit alarms.index', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('alarms/index')
            ->has('rooms')
            ->has('rows')
            ->has('filters')
            ->has('pagination')
            ->where('tabInfo.isViewOnly', true));
});

test('alarm index filters by room and date range', function () {
    Carbon::setTestNow(Carbon::parse('2026-03-28 09:00:00'));

    $roomA = Room::factory()->create(['name' => 'RUANG A']);
    $roomB = Room::factory()->create(['name' => 'RUANG B']);

    $hmiA = Hmi::factory()->create(['room_id' => $roomA->id]);
    $hmiB = Hmi::factory()->create(['room_id' => $roomB->id]);

    $sensorA = Sensor::factory()->create(['hmi_id' => $hmiA->id, 'unit_id' => 1]);
    $sensorB = Sensor::factory()->create(['hmi_id' => $hmiB->id, 'unit_id' => 2]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensorA->id,
        'alarm_type' => 'disconnect',
        'current_value' => 0,
        'occurred_at' => now()->subMinutes(5),
    ]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensorB->id,
        'alarm_type' => 'temp',
        'current_value' => 34.5,
        'occurred_at' => now()->subDays(3),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', [
            'room' => $roomA->id,
            'start_date' => now()->subDay()->format('Y-m-d'),
            'end_date' => now()->format('Y-m-d'),
            'tab' => 'history',
        ]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('alarms/index')
            ->has('rows', 1)
            ->where('rows.0.room_name', 'RUANG A')
            ->where('rows.0.variable_name', 'Ext_Device_1_commStatus'));

    Carbon::setTestNow();
});

test('been-confirmed tab returns empty rows in view-only mode', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 3]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'temp',
        'current_value' => 30.2,
        'occurred_at' => now(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', ['tab' => 'been-confirmed']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('alarms/index')
            ->has('rows', 0)
            ->where('tabInfo.confirmedAvailableFromHmi', false));
});

test('can export alarms as csv with selected filters', function () {
    $room = Room::factory()->create(['name' => 'RUANG EXPORT']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 4, 'name' => 'T/H 4']);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'disconnect',
        'current_value' => 0,
        'occurred_at' => now(),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->get(route('alarms.export', [
            'tab' => 'history',
            'room' => $room->id,
        ]));

    $response->assertOk();
    $response->assertHeader('content-type', 'text/csv; charset=UTF-8');
});

test('realtime tab falls back to sensor latest alarms when alarm events are empty', function () {
    $room = Room::factory()->create(['name' => 'RUANG LIVE']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 2]);

    SensorLatestData::query()->create([
        'sensor_id' => $sensor->id,
        'temperature' => null,
        'humidity' => null,
        'status' => 'OFFLINE',
        'alarm_temp' => false,
        'alarm_hum' => false,
        'alarm_disconnect' => true,
        'calibrate_temp' => null,
        'calibrate_hum' => null,
        'last_read_at' => now(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', [
            'tab' => 'realtime',
            'room' => $room->id,
        ]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('alarms/index')
            ->has('rows', 1)
            ->where('rows.0.alarm_text', 'Device 2 Disconnected')
            ->where('rows.0.variable_name', 'Ext_Device_2_commStatus'));
});
