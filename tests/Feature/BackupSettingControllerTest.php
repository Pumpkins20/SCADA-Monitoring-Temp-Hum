<?php

use App\Models\GaugeSetting;
use App\Models\User;

test('guests are redirected to login from backup-settings.edit', function () {
    $this->get(route('backup-settings.edit'))->assertRedirect(route('login'));
});

test('non-admin users are forbidden from backup-settings.edit', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('backup-settings.edit'))
        ->assertForbidden();
});

test('backup-settings.edit requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('backup-settings.edit'))
        ->assertRedirect(route('password.confirm'));
});

test('admin can open backup settings page', function () {
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('backup-settings.edit'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('backup-settings/index')
            ->where('backupSettings.backupEmail', 'backup@example.com'));
});

test('guests are redirected to login from backup-settings.update', function () {
    $this->put(route('backup-settings.update'), [])->assertRedirect(route('login'));
});

test('non-admin users are forbidden from backup-settings.update', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('backup-settings.update'), ['backup_email' => 'backup@example.com'])
        ->assertForbidden();
});

test('backup-settings.update requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->put(route('backup-settings.update'), ['backup_email' => 'backup@example.com'])
        ->assertRedirect(route('password.confirm'));
});

test('admin can update backup email setting', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('backup-settings.update'), [
            'backup_email' => 'backup@example.com',
        ])
        ->assertRedirect(route('backup-settings.edit'));

    $this->assertDatabaseHas('gauge_settings', [
        'id' => 1,
        'backup_email' => 'backup@example.com',
    ]);
});

test('admin can clear backup email setting', function () {
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('backup-settings.update'), [
            'backup_email' => '',
        ])
        ->assertRedirect(route('backup-settings.edit'));

    expect(GaugeSetting::query()->first()?->backup_email)->toBeNull();
});

test('backup settings validation fails for invalid email', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('backup-settings.update'), [
            'backup_email' => 'not-an-email',
        ])
        ->assertSessionHasErrors('backup_email');
});
