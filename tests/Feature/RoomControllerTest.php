<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;

// ─── Auth guard ──────────────────────────────────────────────────────────────

test('guests are redirected to login from rooms.index', function () {
    $this->get(route('rooms.index'))->assertRedirect(route('login'));
});

test('authenticated users can visit rooms.index', function () {
    $room = Room::factory()->create(['name' => 'RUANG ONLINE']);

    $hmi = Hmi::factory()->create([
        'room_id' => $room->id,
        'ip_address' => '192.168.10.11',
        'is_active' => true,
        'is_preview' => false,
    ]);

    $sensor = Sensor::factory()->create([
        'hmi_id' => $hmi->id,
    ]);

    SensorLatestData::factory()->normal()->create([
        'sensor_id' => $sensor->id,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->component('rooms/index')
                ->has('rooms', 1)
                ->where('rooms.0.name', 'RUANG ONLINE')
                ->where('rooms.0.status', 'ONLINE')
                ->where('rooms.0.ip_address', '192.168.10.11')
        );
});

test('rooms.index marks room offline when all connected hmis are inactive', function () {
    $room = Room::factory()->create(['name' => 'RUANG OFFLINE']);

    Hmi::factory()->inactive()->create([
        'room_id' => $room->id,
        'ip_address' => '10.0.0.21',
        'is_preview' => false,
    ]);

    Hmi::factory()->create([
        'room_id' => $room->id,
        'ip_address' => '10.0.0.22',
        'is_active' => true,
        'is_preview' => true,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->component('rooms/index')
                ->has('rooms', 1)
                ->where('rooms.0.status', 'OFFLINE')
                ->where('rooms.0.ip_address', '10.0.0.21')
        );
});

test('rooms.index marks room offline when active hmi has no latest data', function () {
    $room = Room::factory()->create(['name' => 'RUANG TANPA DATA']);

    $hmi = Hmi::factory()->create([
        'room_id' => $room->id,
        'ip_address' => '10.10.10.10',
        'is_active' => true,
        'is_preview' => false,
    ]);

    Sensor::factory()->create([
        'hmi_id' => $hmi->id,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->component('rooms/index')
                ->has('rooms', 1)
                ->where('rooms.0.status', 'OFFLINE')
                ->where('rooms.0.ip_address', '10.10.10.10')
        );
});

test('devices page includes calibration and ideal threshold values', function () {
    $room = Room::factory()->create(['name' => 'RUANG DEVICES']);

    $hmi = Hmi::factory()->create([
        'room_id' => $room->id,
        'name' => 'HMI DEVICES',
        'ip_address' => '192.168.100.10',
        'is_active' => true,
        'is_preview' => false,
    ]);

    $sensor = Sensor::factory()->create([
        'hmi_id' => $hmi->id,
        'name' => 'SENSOR DEVICES',
        'unit_id' => 1,
    ]);

    SensorLatestData::factory()->create([
        'sensor_id' => $sensor->id,
        'calibrate_temp' => 0.80,
        'calibrate_hum' => 1.20,
        'over_temp' => 28.00,
        'under_temp' => 18.00,
        'over_hum' => 75.00,
        'under_hum' => 45.00,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.devices', $room))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page
                ->component('rooms/devices')
                ->where('hmis.0.sensors.0.calibrate_temp', 0.8)
                ->where('hmis.0.sensors.0.calibrate_hum', 1.2)
                ->where('hmis.0.sensors.0.over_temp', 28)
                ->where('hmis.0.sensors.0.under_temp', 18)
                ->where('hmis.0.sensors.0.over_hum', 75)
                ->where('hmis.0.sensors.0.under_hum', 45)
        );
});

test('non-admin users are forbidden from rooms.index', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.index'))
        ->assertForbidden();
});

test('rooms.index requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('rooms.index'))
        ->assertRedirect(route('password.confirm'));
});

// ─── Store ───────────────────────────────────────────────────────────────────

test('can create a new room', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('rooms.store'), [
            'name' => 'RUANG SERVER A',
            'location' => 'LT.3',
            'temp_max_limit' => 25.00,
            'hum_max_limit' => 60.00,
        ])
        ->assertRedirect(route('rooms.index'));

    $this->assertDatabaseHas('rooms', ['name' => 'RUANG SERVER A', 'location' => 'LT.3']);
});

test('store validation fails when name is missing', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('rooms.store'), [
            'name' => '',
            'temp_max_limit' => 25.00,
            'hum_max_limit' => 60.00,
        ])
        ->assertSessionHasErrors('name');
});

test('store validation fails when temp_max_limit is not numeric', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('rooms.store'), [
            'name' => 'RUANG TEST',
            'temp_max_limit' => 'abc',
            'hum_max_limit' => 60.00,
        ])
        ->assertSessionHasErrors('temp_max_limit');
});

// ─── Update ──────────────────────────────────────────────────────────────────

test('can update an existing room', function () {
    $room = Room::factory()->create(['name' => 'OLD NAME']);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('rooms.update', $room), [
            'name' => 'NEW NAME',
            'location' => 'LT.5',
            'temp_max_limit' => 28.00,
            'hum_max_limit' => 65.00,
        ])
        ->assertRedirect(route('rooms.index'));

    $this->assertDatabaseHas('rooms', ['id' => $room->id, 'name' => 'NEW NAME']);
});

// ─── Destroy ─────────────────────────────────────────────────────────────────

test('can delete a room', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('rooms.destroy', $room))
        ->assertRedirect(route('rooms.index'));

    $this->assertDatabaseMissing('rooms', ['id' => $room->id]);
});

test('deleting a room cascades to hmis and sensors', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('rooms.destroy', $room));

    $this->assertDatabaseMissing('rooms', ['id' => $room->id]);
    $this->assertDatabaseMissing('hmis', ['id' => $hmi->id]);
    $this->assertDatabaseMissing('sensors', ['id' => $sensor->id]);
});
