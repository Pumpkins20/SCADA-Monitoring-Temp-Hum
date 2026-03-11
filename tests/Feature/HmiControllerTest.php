<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\User;

// ─── rooms.devices ────────────────────────────────────────────────────────────

test('guests are redirected to login from rooms.devices', function () {
    $room = Room::factory()->create();
    $this->get(route('rooms.devices', $room))->assertRedirect(route('login'));
});

test('authenticated users can visit rooms.devices', function () {
    $room = Room::factory()->create();
    $this->actingAs(User::factory()->create())
        ->get(route('rooms.devices', $room))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('rooms/devices')
                ->has('room')
                ->has('hmis')
        );
});

// ─── hmis.store ───────────────────────────────────────────────────────────────

test('can create a new hmi', function () {
    $room = Room::factory()->create();
    $this->actingAs(User::factory()->create())
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-01',
            'ip_address' => '192.168.1.10',
            'port' => 502,
            'is_active' => true,
        ])
        ->assertRedirect(route('rooms.devices', $room));

    $this->assertDatabaseHas('hmis', ['name' => 'HMI-01', 'room_id' => $room->id]);
});

test('hmi store validation fails when ip_address is invalid', function () {
    $room = Room::factory()->create();
    $this->actingAs(User::factory()->create())
        ->post(route('hmis.store'), [
            'room_id' => $room->id,
            'name' => 'HMI-01',
            'ip_address' => 'not-an-ip',
            'port' => 502,
            'is_active' => true,
        ])
        ->assertSessionHasErrors('ip_address');
});

test('hmi store validation fails when room_id does not exist', function () {
    $this->actingAs(User::factory()->create())
        ->post(route('hmis.store'), [
            'room_id' => 99999,
            'name' => 'HMI-01',
            'ip_address' => '192.168.1.10',
            'port' => 502,
            'is_active' => true,
        ])
        ->assertSessionHasErrors('room_id');
});

// ─── hmis.update ──────────────────────────────────────────────────────────────

test('can update an existing hmi', function () {
    $hmi = Hmi::factory()->create(['name' => 'OLD-HMI']);
    $this->actingAs(User::factory()->create())
        ->put(route('hmis.update', $hmi), [
            'name' => 'HMI-UPDATED',
            'ip_address' => '10.0.0.5',
            'port' => 502,
            'is_active' => false,
        ])
        ->assertRedirect(route('rooms.devices', $hmi->room_id));

    $this->assertDatabaseHas('hmis', ['id' => $hmi->id, 'name' => 'HMI-UPDATED', 'is_active' => false]);
});

// ─── hmis.destroy ─────────────────────────────────────────────────────────────

test('can delete an hmi', function () {
    $hmi = Hmi::factory()->create();
    $this->actingAs(User::factory()->create())
        ->delete(route('hmis.destroy', $hmi))
        ->assertRedirect(route('rooms.devices', $hmi->room_id));

    $this->assertDatabaseMissing('hmis', ['id' => $hmi->id]);
});

// ─── hmis.test-connection ─────────────────────────────────────────────────────

test('test-connection returns json response', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
        ])
        ->assertOk()
        ->assertJsonStructure(['success', 'message']);
});

test('test-connection validates ip_address format', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => 'bad-ip',
            'port' => 502,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('ip_address');
});

test('test-connection without hmi_id does not update any hmi record', function () {
    $hmi = Hmi::factory()->create(['is_active' => true]);

    $this->actingAs(User::factory()->create())
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
        ])
        ->assertOk();

    $this->assertDatabaseHas('hmis', ['id' => $hmi->id, 'is_active' => true]);
});

test('test-connection with valid hmi_id updates is_active to false on failure', function () {
    $hmi = Hmi::factory()->create(['is_active' => true]);

    $this->actingAs(User::factory()->create())
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
    $this->actingAs(User::factory()->create())
        ->postJson(route('hmis.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 502,
            'hmi_id' => 99999,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('hmi_id');
});
