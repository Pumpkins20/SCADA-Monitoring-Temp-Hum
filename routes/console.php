<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Agregasi rata-rata per-room ke sensor_logs (setiap 15 menit)
Schedule::command('aggregate:room-logs')
    ->everyFifteenMinutes()
    ->withoutOverlapping();

// Agregasi rata-rata per-sensor ke sensor_readings (setiap 1 menit)
Schedule::command('aggregate:sensor-readings')
    ->everyMinute()
    ->withoutOverlapping();

// Purge data > 90 hari (setiap hari tengah malam)
Schedule::command('purge:old-logs')
    ->daily()
    ->withoutOverlapping();
