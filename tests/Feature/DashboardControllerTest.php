<?php

use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;

// ─── dashboard.index ──────────────────────────────────────────────────────────

test('guests are redirected from dashboard to login', function () {
    $this->get(route('dashboard'))->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->has('rooms')
                ->has('globalStats')
        );
});

// ─── resolveRoomStatus ────────────────────────────────────────────────────────

test('room with no sensors reports OFFLINE status', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'OFFLINE')
        );
});

test('room with sensors but no latest data reports OFFLINE status', function () {
    $room = Room::factory()->hasHmis(1)->create();
    $hmi = $room->hmis->first();
    Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'OFFLINE')
        );
});

test('room with all sensors offline reports OFFLINE status', function () {
    $room = Room::factory()->hasHmis(1)->create();
    $hmi = $room->hmis->first();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->create(['sensor_id' => $sensor->id, 'status' => 'OFFLINE']);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'OFFLINE')
        );
});

test('room with a warning sensor reports WARNING status', function () {
    $room = Room::factory()->hasHmis(1)->create();
    $hmi = $room->hmis->first();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->create(['sensor_id' => $sensor->id, 'status' => 'WARNING']);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'WARNING')
        );
});

test('room with a critical sensor reports CRITICAL status', function () {
    $room = Room::factory()->hasHmis(1)->create();
    $hmi = $room->hmis->first();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->create(['sensor_id' => $sensor->id, 'status' => 'CRITICAL']);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'CRITICAL')
        );
});

test('room with all sensors normal reports NORMAL status', function () {
    $room = Room::factory()->hasHmis(1)->create();
    $hmi = $room->hmis->first();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    SensorLatestData::factory()->create(['sensor_id' => $sensor->id, 'status' => 'NORMAL']);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('dashboard')
                ->where('rooms.0.status', 'NORMAL')
        );
});
