<?php

use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\User;

// ─── Auth guard ──────────────────────────────────────────────────────────────

test('guests are redirected to login from rooms.index', function () {
    $this->get(route('rooms.index'))->assertRedirect(route('login'));
});

test('authenticated users can visit rooms.index', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('rooms.index'))
        ->assertOk()
        ->assertInertia(
            fn ($page) => $page->component('rooms/index')->has('rooms')
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
