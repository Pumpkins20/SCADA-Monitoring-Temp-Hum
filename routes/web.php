<?php

use App\Http\Controllers\AlarmController;
use App\Http\Controllers\BackupSettingController;
use App\Http\Controllers\ChartLogController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FloorPlanSettingController;
use App\Http\Controllers\GaugeSettingController;
use App\Http\Controllers\HeaderLogoSettingController;
use App\Http\Controllers\HmiController;
use App\Http\Controllers\MirrorController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\SensorController;
use App\Http\Controllers\SensorLogController;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
    Route::get('mirror', [MirrorController::class, 'index'])->name('mirror.index');
    Route::post('mirror/test-connection', [MirrorController::class, 'testConnection'])
        ->middleware('throttle:30,1')
        ->name('mirror.test-connection');

    Route::get('rooms/{room}', [DashboardController::class, 'show'])->name('rooms.show');

    Route::get('logs', [SensorLogController::class, 'index'])->name('logs.index');
    Route::get('logs/export', [SensorLogController::class, 'export'])->name('logs.export');
    Route::post('logs/export/email', [SensorLogController::class, 'exportToEmail'])->name('logs.export-email');
    Route::get('alarms', [AlarmController::class, 'index'])->name('alarms.index');
    Route::get('alarms/export', [AlarmController::class, 'export'])->name('alarms.export');
    Route::post('alarms/export/email', [AlarmController::class, 'exportToEmail'])->name('alarms.export-email');

    Route::get('chart-logs', [ChartLogController::class, 'index'])->name('chart-logs.index');

    Route::middleware(['can:manage-devices'])->group(function () {
        Route::post('hmis/test-connection', [HmiController::class, 'testConnection'])->name('hmis.test-connection');

        Route::post('settings-session/logout', function (Request $request): RedirectResponse {
            $request->session()->forget('auth.password_confirmed_at');

            return redirect()->route('dashboard');
        })->name('settings-session.logout');

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
            Route::get('backup-settings', [BackupSettingController::class, 'edit'])->name('backup-settings.edit');
            Route::put('backup-settings', [BackupSettingController::class, 'update'])->name('backup-settings.update');
            Route::get('floor-plan-settings', [FloorPlanSettingController::class, 'index'])->name('floor-plan-settings.index');
            Route::patch('floor-plan-settings/sensors/{sensor}', [FloorPlanSettingController::class, 'updatePosition'])->name('floor-plan-settings.update-position');
            Route::post('floor-plan-settings/{room}/image', [FloorPlanSettingController::class, 'uploadImage'])->name('floor-plan-settings.upload-image');
            Route::delete('floor-plan-settings/{room}/image', [FloorPlanSettingController::class, 'removeImage'])->name('floor-plan-settings.remove-image');
            Route::patch('floor-plan-settings/{room}/dimensions', [FloorPlanSettingController::class, 'updateDimensions'])->name('floor-plan-settings.update-dimensions');

            Route::post('hmis', [HmiController::class, 'store'])->name('hmis.store');
            Route::get('hmis/{hmi}/preview-data', [HmiController::class, 'previewData'])->name('hmis.preview-data');
            Route::post('hmis/{hmi}/confirm', [HmiController::class, 'confirm'])->name('hmis.confirm');
            Route::delete('hmis/{hmi}/cancel-preview', [HmiController::class, 'cancelPreview'])->name('hmis.cancel-preview');
            Route::put('hmis/{hmi}', [HmiController::class, 'update'])->name('hmis.update');
            Route::delete('hmis/{hmi}', [HmiController::class, 'destroy'])->name('hmis.destroy');

            Route::post('sensors', [SensorController::class, 'store'])->name('sensors.store');
            Route::put('sensors/{sensor}', [SensorController::class, 'update'])->name('sensors.update');
            Route::delete('sensors/{sensor}', [SensorController::class, 'destroy'])->name('sensors.destroy');
        });
    });
});

require __DIR__.'/settings.php';
