<?php

use App\Http\Controllers\ChartLogController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GaugeSettingController;
use App\Http\Controllers\HeaderLogoSettingController;
use App\Http\Controllers\HmiController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\SensorController;
use App\Http\Controllers\SensorLogController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::redirect('/', '/dashboard')->name('home');

Route::inertia('/welcome', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('welcome');

Route::middleware(['auth'])->group(function () {
    Route::get('user/confirm-password', fn () => Inertia::render('auth/confirm-password', [
        'timeoutSeconds' => (int) config('auth.password_timeout', 900),
    ]))
        ->name('password.confirm');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class.'@index')->name('dashboard');

    Route::get('rooms/{room}', [DashboardController::class, 'show'])->name('rooms.show');

    Route::get('logs', [SensorLogController::class, 'index'])->name('logs.index');
    Route::get('logs/export', [SensorLogController::class, 'export'])->name('logs.export');

    Route::get('chart-logs', [ChartLogController::class, 'index'])->name('chart-logs.index');

    Route::middleware(['can:manage-devices'])->group(function () {
        Route::post('hmis/test-connection', [HmiController::class, 'testConnection'])->name('hmis.test-connection');

        Route::middleware(['password.confirm'])->group(function () {
            Route::get('rooms', [RoomController::class, 'index'])->name('rooms.index');
            Route::post('rooms', [RoomController::class, 'store'])->name('rooms.store');
            Route::put('rooms/{room}', [RoomController::class, 'update'])->name('rooms.update');
            Route::delete('rooms/{room}', [RoomController::class, 'destroy'])->name('rooms.destroy');
            Route::get('rooms/{room}/devices', [RoomController::class, 'devices'])->name('rooms.devices');
            Route::get('settings-general', [GaugeSettingController::class, 'index'])->name('settings-general.index');
            Route::get('gauge-settings', [GaugeSettingController::class, 'edit'])->name('gauge-settings.edit');
            Route::put('gauge-settings', [GaugeSettingController::class, 'update'])->name('gauge-settings.update');
            Route::get('logo-settings', [HeaderLogoSettingController::class, 'edit'])->name('logo-settings.edit');
            Route::post('logo-settings', [HeaderLogoSettingController::class, 'update'])->name('logo-settings.update');

            Route::post('hmis', [HmiController::class, 'store'])->name('hmis.store');
            Route::put('hmis/{hmi}', [HmiController::class, 'update'])->name('hmis.update');
            Route::delete('hmis/{hmi}', [HmiController::class, 'destroy'])->name('hmis.destroy');

            Route::post('sensors', [SensorController::class, 'store'])->name('sensors.store');
            Route::put('sensors/{sensor}', [SensorController::class, 'update'])->name('sensors.update');
            Route::delete('sensors/{sensor}', [SensorController::class, 'destroy'])->name('sensors.destroy');
        });
    });
});

require __DIR__.'/settings.php';
