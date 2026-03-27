<?php

use App\Models\Sensor;
use App\Models\User;

test('guests are redirected to login when updating floor plan sensor position', function () {
    $sensor = Sensor::factory()->create();

    $this->patch(route('floor-plan-settings.update-position', $sensor), [
        'pos_x' => 1200,
        'pos_y' => 3400,
    ])->assertRedirect(route('login'));
});

test('admin can update floor plan sensor position with valid coordinates', function () {
    $sensor = Sensor::factory()->create([
        'pos_x' => null,
        'pos_y' => null,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->patch(route('floor-plan-settings.update-position', $sensor), [
            'pos_x' => 1234,
            'pos_y' => 4321,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('sensors', [
        'id' => $sensor->id,
        'pos_x' => 1234,
        'pos_y' => 4321,
    ]);
});

test('admin can clear floor plan sensor position', function () {
    $sensor = Sensor::factory()->create([
        'pos_x' => 100,
        'pos_y' => 200,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->patch(route('floor-plan-settings.update-position', $sensor), [
            'pos_x' => null,
            'pos_y' => null,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('sensors', [
        'id' => $sensor->id,
        'pos_x' => null,
        'pos_y' => null,
    ]);
});

test('update floor plan sensor position validates coordinate range', function () {
    $sensor = Sensor::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->from(route('floor-plan-settings.index'))
        ->patch(route('floor-plan-settings.update-position', $sensor), [
            'pos_x' => -1,
            'pos_y' => 70000,
        ])
        ->assertRedirect(route('floor-plan-settings.index'))
        ->assertSessionHasErrors(['pos_x', 'pos_y']);
});

test('non admin users are forbidden from updating floor plan sensor position', function () {
    $sensor = Sensor::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->patch(route('floor-plan-settings.update-position', $sensor), [
            'pos_x' => 500,
            'pos_y' => 600,
        ])
        ->assertForbidden();
});

test('admin update floor plan sensor position requires password confirmation', function () {
    $sensor = Sensor::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->patch(route('floor-plan-settings.update-position', $sensor), [
            'pos_x' => 500,
            'pos_y' => 600,
        ])
        ->assertRedirect(route('password.confirm'));
});
