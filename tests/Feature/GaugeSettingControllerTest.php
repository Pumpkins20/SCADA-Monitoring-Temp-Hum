<?php

use App\Models\GaugeSetting;
use App\Models\User;

test('guests are redirected to login from settings-general.index', function () {
    $this->get(route('settings-general.index'))->assertRedirect(route('login'));
});

test('non-admin users are forbidden from settings-general.index', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('settings-general.index'))
        ->assertForbidden();
});

test('settings-general.index requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('settings-general.index'))
        ->assertRedirect(route('password.confirm'));
});

test('admin can open settings general page', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('settings-general.index'))
        ->assertOk()
        ->assertInertia(fn($page) => $page->component('settings-general/index'));
});

test('guests are redirected to login from gauge-settings.edit', function () {
    $this->get(route('gauge-settings.edit'))->assertRedirect(route('login'));
});

test('non-admin users are forbidden from gauge-settings.edit', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('gauge-settings.edit'))
        ->assertForbidden();
});

test('gauge-settings.edit requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('gauge-settings.edit'))
        ->assertRedirect(route('password.confirm'));
});

test('admin can open gauge settings page', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('gauge-settings.edit'))
        ->assertOk()
        ->assertInertia(fn($page) => $page->component('gauge-settings/index')->has('gaugeSettings'));
});

test('guests are redirected to login from gauge-settings.update', function () {
    $this->put(route('gauge-settings.update'), [])->assertRedirect(route('login'));
});

test('non-admin users are forbidden from gauge-settings.update', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('gauge-settings.update'), [])
        ->assertForbidden();
});

test('gauge-settings.update requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->put(route('gauge-settings.update'), [])
        ->assertRedirect(route('password.confirm'));
});

test('admin can update global gauge settings', function () {
    $payload = [
        'temp_min' => 0,
        'temp_max' => 80,
        'temp_green_from' => 0,
        'temp_green_to' => 30,
        'temp_yellow_from' => 30,
        'temp_yellow_to' => 55,
        'temp_red_from' => 55,
        'temp_red_to' => 80,
        'hum_min' => 0,
        'hum_max' => 100,
        'hum_green_from' => 0,
        'hum_green_to' => 50,
        'hum_yellow_from' => 50,
        'hum_yellow_to' => 75,
        'hum_red_from' => 75,
        'hum_red_to' => 100,
    ];

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('gauge-settings.update'), $payload)
        ->assertRedirect(route('gauge-settings.edit'));

    expect(GaugeSetting::query()->count())->toBe(1);

    $this->assertDatabaseHas('gauge_settings', [
        'id' => 1,
        'temp_green_to' => 30,
        'temp_red_to' => 80,
        'hum_green_to' => 50,
        'hum_red_to' => 100,
    ]);
});

test('update validation fails when range is not contiguous', function () {
    $payload = [
        'temp_min' => 0,
        'temp_max' => 80,
        'temp_green_from' => 0,
        'temp_green_to' => 30,
        'temp_yellow_from' => 32,
        'temp_yellow_to' => 55,
        'temp_red_from' => 55,
        'temp_red_to' => 80,
        'hum_min' => 0,
        'hum_max' => 100,
        'hum_green_from' => 0,
        'hum_green_to' => 60,
        'hum_yellow_from' => 60,
        'hum_yellow_to' => 80,
        'hum_red_from' => 80,
        'hum_red_to' => 100,
    ];

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('gauge-settings.update'), $payload)
        ->assertSessionHasErrors('temp_yellow_from');
});
