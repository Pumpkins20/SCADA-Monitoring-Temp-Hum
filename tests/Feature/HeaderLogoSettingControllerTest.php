<?php

use App\Models\GaugeSetting;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

test('guests are redirected to login from logo-settings.edit', function () {
    $this->get(route('logo-settings.edit'))->assertRedirect(route('login'));
});

test('non-admin users are forbidden from logo-settings.edit', function () {
    $this->actingAs(User::factory()->create(['is_admin' => false]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('logo-settings.edit'))
        ->assertForbidden();
});

test('logo-settings.edit requires password confirmation for admins', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->get(route('logo-settings.edit'))
        ->assertRedirect(route('password.confirm'));
});

test('admin can open logo settings page', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('logo-settings.edit'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->component('logo-settings/index')
                ->where('headerLogos.right', '/images/logo/edutic.png')
                ->where('headerTitle.line1', GaugeSetting::DEFAULT_HEADER_TITLE_LINE_1)
                ->where('headerTitle.line2', GaugeSetting::DEFAULT_HEADER_TITLE_LINE_2)
                ->has('headerLogos.left')
                ->has('headerLogos.center')
        );
});

test('admin can update header title text from logo settings', function () {
    $line1 = 'SCADA MONITORING AC PRESISI - TERMINAL 3';
    $line2 = 'BANDARA INTERNASIONAL SOEKARNO HATTA';

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('logo-settings.update'), [
            'header_title_line_1' => $line1,
            'header_title_line_2' => $line2,
        ])
        ->assertRedirect(route('logo-settings.edit'));

    $setting = GaugeSetting::query()->first();

    expect($setting)->not->toBeNull();
    expect($setting?->header_title_line_1)->toBe($line1);
    expect($setting?->header_title_line_2)->toBe($line2);
});

test('admin can upload left and center logos', function () {
    Storage::fake('public');

    $leftLogo = UploadedFile::fake()->image('left-logo.png');
    $centerLogo = UploadedFile::fake()->image('center-logo.png');

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('logo-settings.update'), [
            'logo_left' => $leftLogo,
            'logo_center' => $centerLogo,
        ])
        ->assertRedirect(route('logo-settings.edit'));

    $setting = GaugeSetting::query()->first();

    expect($setting)->not->toBeNull();
    expect($setting?->logo_left_path)->not->toBeNull();
    expect($setting?->logo_center_path)->not->toBeNull();

    expect(Storage::disk('public')->exists($setting->logo_left_path))->toBeTrue();
    expect(Storage::disk('public')->exists($setting->logo_center_path))->toBeTrue();
});

test('logo update validation fails for non image files', function () {
    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('logo-settings.update'), [
            'logo_left' => UploadedFile::fake()->create('logo-left.txt', 50, 'text/plain'),
            'logo_center' => UploadedFile::fake()->create('logo-center.txt', 50, 'text/plain'),
        ])
        ->assertSessionHasErrors(['logo_left', 'logo_center']);
});

test('dashboard receives configured header logos and keeps right logo fixed', function () {
    Storage::fake('public');
    Storage::disk('public')->put('header-logos/custom-left.png', 'left-logo');
    Storage::disk('public')->put('header-logos/custom-center.png', 'center-logo');

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        [
            'logo_left_path' => 'header-logos/custom-left.png',
            'logo_center_path' => 'header-logos/custom-center.png',
            'header_title_line_1' => 'SCADA MONITORING CUSTOM TITLE 1',
            'header_title_line_2' => 'CUSTOM TITLE 2',
        ],
    );

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->component('dashboard')
                ->where('headerLogos.left', '/storage/header-logos/custom-left.png')
                ->where('headerLogos.center', '/storage/header-logos/custom-center.png')
                ->where('headerLogos.right', '/images/logo/edutic.png')
                ->where('headerTitle.line1', 'SCADA MONITORING CUSTOM TITLE 1')
                ->where('headerTitle.line2', 'CUSTOM TITLE 2')
        );
});
