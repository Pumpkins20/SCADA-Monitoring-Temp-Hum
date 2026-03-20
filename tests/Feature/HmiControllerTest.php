<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;

// ─── rooms.devices ────────────────────────────────────────────────────────────

test('guests are redirected to login from rooms.devices', function () {
    $room = Room::factory()->create();

    $this->get(route('rooms.devices', $room))->assertRedirect(route('login'));
});

test('authenticated users can visit rooms.devices', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.devices', $room))
        ->assertOk()
        ->assertInertia(
            function ($page) {
                return $page->component('rooms/devices')
                    ->has('room')
                    ->has('hmis');
            }
        );
});

test('non-admin users are forbidden from rooms.devices', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.devices', $room))
        ->assertForbidden();
});

test('rooms.devices requires password confirmation for admins', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('rooms.devices', $room))
        ->assertRedirect(route('password.confirm'));
});

// ─── hmis.store (preview mode) ───────────────────────────────────────────────

test('can create a preview hmi and auto-create 4 sensors', function () {
    $response = $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->postJson(route('hmis.store'), [
            'ip_address' => '192.168.1.10',
            'port' => 502,
        ])
        ->assertCreated()
        ->assertJsonStructure(['hmi_id', 'message']);

    $hmiId = $response->json('hmi_id');
    $hmi = Hmi::query()->findOrFail($hmiId);
    $room = Room::query()->findOrFail($hmi->room_id);

    $this->assertDatabaseHas('hmis', [
        'id' => $hmiId,
        'name' => 'HMI 192.168.1.10',
        'room_id' => $room->id,
        'register_function' => '03',
        'is_active' => false,
        'is_preview' => true,
    ]);

    $this->assertDatabaseHas('rooms', [
        'id' => $room->id,
        'name' => 'ROOM 192.168.1.10',
    ]);

    expect(Sensor::query()->where('hmi_id', $hmiId)->count())->toBe(4);

    $this->assertDatabaseHas('sensors', [
        'hmi_id' => $hmiId,
        'name' => 'Sensor 1',
        'unit_id' => 1,
        'modbus_address_temp' => 9,
        'modbus_address_hum' => 11,
    ]);
});

test('hmi store validation fails when ip_address is invalid', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->postJson(route('hmis.store'), [
            'ip_address' => 'not-an-ip',
            'port' => 502,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('ip_address');
});

test('hmi store validation fails when port is out of range', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->postJson(route('hmis.store'), [
            'ip_address' => '192.168.1.10',
            'port' => 70000,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('port');
});

// ─── hmis.preview-data ────────────────────────────────────────────────────────

test('preview-data returns ready false when no latest data exists', function () {
    $hmi = Hmi::factory()->create([
        'is_active' => false,
        'is_preview' => true,
    ]);

    Sensor::factory()->count(4)->create([
        'hmi_id' => $hmi->id,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('hmis.preview-data', $hmi))
        ->assertOk()
        ->assertJson([
            'ready' => false,
        ]);
});

test('preview-data returns ready true when all sensors have latest data', function () {
    $hmi = Hmi::factory()->create([
        'is_active' => false,
        'is_preview' => true,
    ]);

    $sensors = Sensor::factory()->count(4)->create([
        'hmi_id' => $hmi->id,
    ]);

    foreach ($sensors as $sensor) {
        SensorLatestData::factory()->normal()->create([
            'sensor_id' => $sensor->id,
        ]);
    }

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('hmis.preview-data', $hmi))
        ->assertOk()
        ->assertJson([
            'ready' => true,
        ])
        ->assertJsonCount(4, 'sensors');
});

// ─── hmis.confirm / hmis.cancel-preview ──────────────────────────────────────

test('confirm activates preview hmi and updates sensor names', function () {
    $hmi = Hmi::factory()->create([
        'is_active' => false,
        'is_preview' => true,
    ]);

    $sensors = Sensor::factory()->count(2)->create([
        'hmi_id' => $hmi->id,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->postJson(route('hmis.confirm', $hmi), [
            'sensor_names' => [
                $sensors[0]->id => 'Sensor Utara',
                $sensors[1]->id => 'Sensor Selatan',
            ],
        ])
        ->assertOk()
        ->assertJson(['success' => true]);

    $this->assertDatabaseHas('hmis', [
        'id' => $hmi->id,
        'is_active' => true,
        'is_preview' => false,
    ]);

    $this->assertDatabaseHas('sensors', [
        'id' => $sensors[0]->id,
        'name' => 'Sensor Utara',
    ]);

    $this->assertDatabaseHas('sensors', [
        'id' => $sensors[1]->id,
        'name' => 'Sensor Selatan',
    ]);
});

test('cancel-preview deletes preview hmi', function () {
    $hmi = Hmi::factory()->create([
        'is_active' => false,
        'is_preview' => true,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->deleteJson(route('hmis.cancel-preview', $hmi))
        ->assertOk()
        ->assertJson([
            'success' => true,
            'room_id' => $hmi->room_id,
        ]);

    $this->assertDatabaseMissing('hmis', ['id' => $hmi->id]);
});

// ─── hmis.update / hmis.destroy ──────────────────────────────────────────────

test('can update an existing hmi', function () {
    $hmi = Hmi::factory()->create(['name' => 'OLD-HMI']);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('hmis.update', $hmi), [
            'name' => 'HMI-UPDATED',
            'ip_address' => '10.0.0.5',
            'port' => 502,
            'register_function' => '04',
            'is_active' => false,
        ])
        ->assertRedirect(route('rooms.devices', $hmi->room_id));

    $this->assertDatabaseHas('hmis', [
        'id' => $hmi->id,
        'name' => 'HMI-UPDATED',
        'register_function' => '04',
        'is_active' => false,
    ]);
});

test('can delete an hmi', function () {
    $hmi = Hmi::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('hmis.destroy', $hmi))
        ->assertRedirect(route('rooms.devices', $hmi->room_id));

    $this->assertDatabaseMissing('hmis', ['id' => $hmi->id]);
});

// ─── hmis.test-connection ─────────────────────────────────────────────────────

test('test-connection returns json response', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
        ])
        ->assertOk()
        ->assertJsonStructure(['success', 'message']);
});

test('test-connection validates ip_address format', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => 'bad-ip',
            'port' => 502,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('ip_address');
});

// ─── authorization ────────────────────────────────────────────────────────────

test('non-admin users are forbidden from hmi mutations', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->postJson(route('hmis.store'), [
            'ip_address' => '192.168.1.11',
            'port' => 502,
        ])
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->getJson(route('hmis.preview-data', $hmi))
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->postJson(route('hmis.confirm', $hmi), [
            'sensor_names' => [],
        ])
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->deleteJson(route('hmis.cancel-preview', $hmi))
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->put(route('hmis.update', $hmi), [
            'name' => 'HMI-Y',
            'ip_address' => '192.168.1.12',
            'port' => 502,
            'register_function' => '04',
            'is_active' => true,
        ])
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->delete(route('hmis.destroy', $hmi))
        ->assertForbidden();
});
