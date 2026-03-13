<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HmiController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\SensorController;
use App\Http\Controllers\SensorLogController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::redirect('/', '/dashboard')->name('home');

Route::inertia('/welcome', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('welcome');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class.'@index')->name('dashboard');

    Route::get('rooms', [RoomController::class, 'index'])->name('rooms.index');
    Route::post('rooms', [RoomController::class, 'store'])->name('rooms.store');
    Route::get('rooms/{room}', [DashboardController::class, 'show'])->name('rooms.show');
    Route::put('rooms/{room}', [RoomController::class, 'update'])->name('rooms.update');
    Route::delete('rooms/{room}', [RoomController::class, 'destroy'])->name('rooms.destroy');
    Route::get('rooms/{room}/devices', [RoomController::class, 'devices'])->name('rooms.devices');

    Route::post('hmis/test-connection', [HmiController::class, 'testConnection'])->name('hmis.test-connection');
    Route::post('hmis', [HmiController::class, 'store'])->name('hmis.store');
    Route::put('hmis/{hmi}', [HmiController::class, 'update'])->name('hmis.update');
    Route::delete('hmis/{hmi}', [HmiController::class, 'destroy'])->name('hmis.destroy');

    Route::post('sensors', [SensorController::class, 'store'])->name('sensors.store');
    Route::put('sensors/{sensor}', [SensorController::class, 'update'])->name('sensors.update');
    Route::delete('sensors/{sensor}', [SensorController::class, 'destroy'])->name('sensors.destroy');

    Route::get('logs', [SensorLogController::class, 'index'])->name('logs.index');
    Route::get('logs/export', [SensorLogController::class, 'export'])->name('logs.export');
});

require __DIR__.'/settings.php';
