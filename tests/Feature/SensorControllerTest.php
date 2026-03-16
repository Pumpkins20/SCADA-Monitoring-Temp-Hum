<?php

use App\Models\Hmi;
use App\Models\Sensor;
use App\Models\User;

// ─── sensors.store ────────────────────────────────────────────────────────────

test('can create a new sensor', function () {
    $hmi = Hmi::factory()->create();
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('sensors.store'), [
            'hmi_id' => $hmi->id,
            'name' => 'SENSOR-01',
            'unit_id' => 1,
            'modbus_address_temp' => 0,
            'modbus_address_hum' => 1,
        ])
        ->assertRedirect(route('rooms.devices', $hmi->room_id));

    $this->assertDatabaseHas('sensors', ['name' => 'SENSOR-01', 'hmi_id' => $hmi->id]);
});

test('sensor store validation fails when hmi_id does not exist', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('sensors.store'), [
            'hmi_id' => 99999,
            'name' => 'SENSOR-01',
            'unit_id' => 1,
            'modbus_address_temp' => 0,
            'modbus_address_hum' => 1,
        ])
        ->assertSessionHasErrors('hmi_id');
});

test('sensor store validation fails when unit_id is out of range', function () {
    $hmi = Hmi::factory()->create();
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('sensors.store'), [
            'hmi_id' => $hmi->id,
            'name' => 'SENSOR-01',
            'unit_id' => 300,
            'modbus_address_temp' => 0,
            'modbus_address_hum' => 1,
        ])
        ->assertSessionHasErrors('unit_id');
});

// ─── sensors.update ───────────────────────────────────────────────────────────

test('can update an existing sensor', function () {
    $sensor = Sensor::factory()->create(['name' => 'OLD-SENSOR']);
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('sensors.update', $sensor), [
            'name' => 'SENSOR-UPDATED',
            'unit_id' => 2,
            'modbus_address_temp' => 10,
            'modbus_address_hum' => 11,
        ])
        ->assertRedirect(route('rooms.devices', $sensor->hmi->room_id));

    $this->assertDatabaseHas('sensors', ['id' => $sensor->id, 'name' => 'SENSOR-UPDATED']);
});

// ─── sensors.destroy ──────────────────────────────────────────────────────────

test('can delete a sensor', function () {
    $sensor = Sensor::factory()->create();
    $roomId = $sensor->hmi->room_id;
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('sensors.destroy', $sensor))
        ->assertRedirect(route('rooms.devices', $roomId));

    $this->assertDatabaseMissing('sensors', ['id' => $sensor->id]);
});

test('non-admin users are forbidden from sensor mutations', function () {
    $hmi = Hmi::factory()->create();
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->post(route('sensors.store'), [
            'hmi_id' => $hmi->id,
            'name' => 'SENSOR-X',
            'unit_id' => 1,
            'modbus_address_temp' => 0,
            'modbus_address_hum' => 1,
        ])
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->put(route('sensors.update', $sensor), [
            'name' => 'SENSOR-Y',
            'unit_id' => 1,
            'modbus_address_temp' => 0,
            'modbus_address_hum' => 1,
        ])
        ->assertForbidden();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->delete(route('sensors.destroy', $sensor))
        ->assertForbidden();
});
