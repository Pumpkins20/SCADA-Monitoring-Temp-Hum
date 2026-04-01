<?php

use App\Models\Room;
use App\Models\Sensor;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

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

test('admin can upload floor plan image with dimensions', function () {
    Storage::fake('public');

    $room = Room::factory()->create([
        'floor_plan_image' => null,
        'floor_plan_width' => 9000,
        'floor_plan_height' => 9000,
    ]);

    $image = UploadedFile::fake()->image('floor-plan.png', 1280, 720);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('floor-plan-settings.upload-image', $room), [
            'image' => $image,
            'floor_plan_width' => 7600,
            'floor_plan_height' => 5400,
        ])
        ->assertRedirect();

    $room->refresh();

    expect($room->floor_plan_image)->not->toBeNull();
    expect($room->floor_plan_width)->toBe(7600);
    expect($room->floor_plan_height)->toBe(5400);

    Storage::disk('public')->assertExists($room->floor_plan_image);
});

test('admin can remove uploaded floor plan image', function () {
    Storage::fake('public');

    $storedPath = UploadedFile::fake()
        ->image('existing-plan.png', 1200, 900)
        ->store('floor-plans', 'public');

    $room = Room::factory()->create([
        'floor_plan_image' => $storedPath,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('floor-plan-settings.remove-image', $room))
        ->assertRedirect();

    $room->refresh();

    expect($room->floor_plan_image)->toBeNull();
    Storage::disk('public')->assertMissing($storedPath);
});

test('admin can update floor plan dimensions', function () {
    $room = Room::factory()->create([
        'floor_plan_width' => 9000,
        'floor_plan_height' => 9000,
    ]);

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->patch(route('floor-plan-settings.update-dimensions', $room), [
            'floor_plan_width' => 6200,
            'floor_plan_height' => 4300,
        ])
        ->assertRedirect();

    $room->refresh();

    expect($room->floor_plan_width)->toBe(6200);
    expect($room->floor_plan_height)->toBe(4300);
});

test('update floor plan dimensions validates min and max range', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create(['is_admin' => true]))
        ->withSession(['auth.password_confirmed_at' => time()])
        ->from(route('floor-plan-settings.index'))
        ->patch(route('floor-plan-settings.update-dimensions', $room), [
            'floor_plan_width' => 99,
            'floor_plan_height' => 70000,
        ])
        ->assertRedirect(route('floor-plan-settings.index'))
        ->assertSessionHasErrors(['floor_plan_width', 'floor_plan_height']);
});
