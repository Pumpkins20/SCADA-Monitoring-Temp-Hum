<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::redirect('/', '/dashboard')->name('home');

Route::inertia('/welcome', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('welcome');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class . '@index')->name('dashboard');

    Route::get('rooms', RoomController::class . '@index')->name('rooms.index');
    Route::post('rooms', RoomController::class . '@store')->name('rooms.store');
    Route::get('rooms/{room}', DashboardController::class . '@show')->name('rooms.show');
    Route::put('rooms/{room}', RoomController::class . '@update')->name('rooms.update');
    Route::delete('rooms/{room}', RoomController::class . '@destroy')->name('rooms.destroy');
});

require __DIR__ . '/settings.php';
