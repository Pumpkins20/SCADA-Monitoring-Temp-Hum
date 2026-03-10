<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertOk();
});

// ─── globalStats structure ────────────────────────────────────────────────────

test('dashboard response contains globalStats with required keys', function () {
    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->component('dashboard')
                ->has('globalStats')
                ->has('globalStats.avg_temp')
                ->has('globalStats.avg_hum')
                ->has('globalStats.active_alarms')
                ->has('globalStats.last_update')
        );
});

test('dashboard response contains rooms array', function () {
    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->has('rooms')
        );
});

// ─── Room payload structure ───────────────────────────────────────────────────

test('each room in payload has required keys', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $sensor->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->has(
                    'rooms.0',
                    fn($r) => $r
                        ->has('id')
                        ->has('name')
                        ->has('location')
                        ->has('room_avg_temp')
                        ->has('room_avg_hum')
                        ->has('status')
                        ->has('sensors')
                        ->etc()
                )
        );
});

test('each sensor in payload has required keys', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $sensor->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->has(
                    'rooms.0.sensors.0',
                    fn($s) => $s
                        ->has('id')
                        ->has('name')
                        ->has('temperature')
                        ->has('humidity')
                        ->has('status')
                        ->etc()
                )
        );
});

// ─── Edge case: all sensors OFFLINE ──────────────────────────────────────────

test('room with all offline sensors has null avg and OFFLINE status', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->offline()->create(['sensor_id' => $sensor->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->where('rooms.0.room_avg_temp', null)
                ->where('rooms.0.room_avg_hum', null)
                ->where('rooms.0.status', 'OFFLINE')
        );
});

// ─── Status propagation ───────────────────────────────────────────────────────

test('room status is CRITICAL when any sensor is CRITICAL', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    $s1 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    $s2 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $s1->id]);
    SensorLatestData::factory()->critical()->create(['sensor_id' => $s2->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->where('rooms.0.status', 'CRITICAL')
        );
});

test('room status is WARNING when any sensor is WARNING but none CRITICAL', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    $s1 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    $s2 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $s1->id]);
    SensorLatestData::factory()->warning()->create(['sensor_id' => $s2->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->where('rooms.0.status', 'WARNING')
        );
});

// ─── active_alarms count ──────────────────────────────────────────────────────

test('globalStats active_alarms counts WARNING and CRITICAL sensors', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    $sensors = Sensor::factory()->count(5)->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $sensors[0]->id]);
    SensorLatestData::factory()->warning()->create(['sensor_id' => $sensors[1]->id]);
    SensorLatestData::factory()->warning()->create(['sensor_id' => $sensors[2]->id]);
    SensorLatestData::factory()->critical()->create(['sensor_id' => $sensors[3]->id]);
    SensorLatestData::factory()->offline()->create(['sensor_id' => $sensors[4]->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(
            fn($page) => $page
                ->where('globalStats.active_alarms', 3)
        );
});

// ─── Room Show ────────────────────────────────────────────────────────────────

test('guests are redirected to login from rooms.show', function () {
    $room = Room::factory()->create();
    $this->get(route('rooms.show', $room))->assertRedirect(route('login'));
});

test('authenticated users can visit rooms.show', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('rooms.show', $room))
        ->assertOk();
});

test('rooms.show payload contains room data with sensors and chartLogs', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->normal()->create(['sensor_id' => $sensor->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('rooms.show', $room))
        ->assertInertia(
            fn($page) => $page
                ->component('rooms/show')
                ->has(
                    'room',
                    fn($r) => $r
                        ->has('id')
                        ->has('name')
                        ->has('room_avg_temp')
                        ->has('room_avg_hum')
                        ->has('status')
                        ->has('sensors')
                        ->has(
                            'sensors.0',
                            fn($s) => $s
                                ->has('id')
                                ->has('name')
                                ->has('temperature')
                                ->has('humidity')
                                ->has('status')
                                ->etc()
                        )
                        ->etc()
                )
                ->has('chartLogs')
        );
});
