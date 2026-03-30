<?php

use App\Models\Hmi;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Agregasi rata-rata per-room ke sensor_logs (setiap 15 menit)
Schedule::command('aggregate:room-logs')
    ->name('aggregate-room-logs')
    ->everyFifteenMinutes()
    ->withoutOverlapping(30);

// Agregasi rata-rata per-sensor ke sensor_readings (setiap 1 menit)
Schedule::command('aggregate:sensor-readings')
    ->name('aggregate-sensor-readings')
    ->everyMinute()
    ->withoutOverlapping(5);

// Purge data > 90 hari (setiap hari tengah malam)
Schedule::command('purge:old-logs')
    ->name('purge-old-logs')
    ->daily()
    ->withoutOverlapping(180);

Schedule::call(function (): void {
    Hmi::query()
        ->where('is_preview', true)
        ->where('updated_at', '<', now()->subMinutes(5))
        ->delete();
})
    ->name('cleanup-preview-hmis')
    ->everyFiveMinutes()
    ->withoutOverlapping(10);
