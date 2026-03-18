<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
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
            fn ($page) => $page->component('rooms/devices')
                ->has('room')
                ->has('hmis')
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

// ─── hmis.store ───────────────────────────────────────────────────────────────

test('can create a new hmi', function () {
    $room = Room::factory()->create();
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-01',
            'ip_address' => '192.168.1.10',
            'port' => 502,
            'register_function' => '03',
            'is_active' => true,
        ])
        ->assertRedirect(route('rooms.devices', $room));

    $hmi = Hmi::query()->where('name', 'HMI-01')->firstOrFail();

    $this->assertDatabaseHas('hmis', [
        'id' => $hmi->id,
        'name' => 'HMI-01',
        'room_id' => $room->id,
        'register_function' => '03',
    ]);

    expect(Sensor::query()->where('hmi_id', $hmi->id)->count())->toBe(4);

    $this->assertDatabaseHas('sensors', [
        'hmi_id' => $hmi->id,
        'name' => 'Sensor 1',
        'unit_id' => 1,
    ]);
});

test('hmi store validation fails when ip_address is invalid', function () {
    $room = Room::factory()->create();
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-01',
            'ip_address' => 'not-an-ip',
            'port' => 502,
            'register_function' => '03',
            'is_active' => true,
        ])
        ->assertSessionHasErrors('ip_address');
});

test('hmi store validation fails when room_id does not exist', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('hmis.store'), [
            'room_id' => 99999,
            'name' => 'HMI-01',
            'ip_address' => '192.168.1.10',
            'port' => 502,
            'register_function' => '03',
            'is_active' => true,
        ])
        ->assertSessionHasErrors('room_id');
});

test('hmi store validation fails when register function is invalid', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-01',
            'ip_address' => '192.168.1.10',
            'port' => 502,
            'register_function' => '99',
            'is_active' => true,
        ])
        ->assertSessionHasErrors('register_function');
});

// ─── hmis.update ──────────────────────────────────────────────────────────────

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

// ─── hmis.destroy ─────────────────────────────────────────────────────────────

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

test('test-connection without hmi_id does not update any hmi record', function () {
    $hmi = Hmi::factory()->create(['is_active' => true]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
        ])
        ->assertOk();

    $this->assertDatabaseHas('hmis', ['id' => $hmi->id, 'is_active' => true]);
});

test('test-connection with valid hmi_id updates is_active to false on failure', function () {
    $hmi = Hmi::factory()->create(['is_active' => true]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
            'hmi_id' => $hmi->id,
        ])
        ->assertOk()
        ->assertJson(['success' => false]);

    $this->assertDatabaseHas('hmis', ['id' => $hmi->id, 'is_active' => false]);
});

test('test-connection validates hmi_id must exist in hmis table', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 502,
            'hmi_id' => 99999,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('hmi_id');
});

test('non-admin users are forbidden from hmis test-connection endpoint', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 502,
        ])
        ->assertForbidden();
});

test('non-admin users are forbidden from hmi mutations', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-X',
            'ip_address' => '192.168.1.11',
            'port' => 502,
            'register_function' => '03',
            'is_active' => true,
        ])
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
