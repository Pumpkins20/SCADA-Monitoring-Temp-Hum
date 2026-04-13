<?php

use App\Mail\OldLogsBackupMail;
use App\Models\GaugeSetting;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\SensorLog;
use App\Models\SensorReading;
use Illuminate\Support\Facades\Mail;

// ─── aggregate:room-logs ──────────────────────────────────────────────────────

test('aggregate:room-logs creates a sensor_log for a room with online sensors', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->for($room)->create();
    $sensor = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->normal()->for($sensor)->create();

    $this->artisan('aggregate:room-logs')->assertSuccessful();

    expect(SensorLog::where('room_id', $room->id)->count())->toBe(1);
});

test('aggregate:room-logs skips rooms where all sensors are OFFLINE', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->for($room)->create();
    $sensor = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->offline()->for($sensor)->create();

    $this->artisan('aggregate:room-logs')->assertSuccessful();

    expect(SensorLog::where('room_id', $room->id)->count())->toBe(0);
});

test('aggregate:room-logs calculates correct averages from online sensors', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->for($room)->create();

    $sensorA = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->for($sensorA)->create([
        'temperature' => 20.00,
        'humidity' => 50.00,
        'status' => 'NORMAL',
    ]);

    $sensorB = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->for($sensorB)->create([
        'temperature' => 30.00,
        'humidity' => 70.00,
        'status' => 'WARNING',
    ]);

    // OFFLINE sensor harus dikecualikan dari rata-rata
    $sensorC = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->offline()->for($sensorC)->create([
        'temperature' => null,
        'humidity' => null,
    ]);

    $this->artisan('aggregate:room-logs')->assertSuccessful();

    $log = SensorLog::where('room_id', $room->id)->first();
    expect((float) $log->avg_temperature)->toBe(25.00)
        ->and((float) $log->avg_humidity)->toBe(60.00);
});

test('aggregate:room-logs skips rooms with no sensors at all', function () {
    Room::factory()->create();

    $this->artisan('aggregate:room-logs')->assertSuccessful();

    expect(SensorLog::count())->toBe(0);
});

// ─── aggregate:sensor-readings ───────────────────────────────────────────────

test('aggregate:sensor-readings inserts a reading for each online sensor', function () {
    $hmi = Hmi::factory()->create();

    $sensorOnline = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->normal()->for($sensorOnline)->create();

    $sensorOffline = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->offline()->for($sensorOffline)->create();

    $this->artisan('aggregate:sensor-readings')->assertSuccessful();

    expect(SensorReading::where('sensor_id', $sensorOnline->id)->count())->toBe(1)
        ->and(SensorReading::where('sensor_id', $sensorOffline->id)->count())->toBe(0);
});

test('aggregate:sensor-readings stores correct values', function () {
    $hmi = Hmi::factory()->create();
    $sensor = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->for($sensor)->create([
        'temperature' => 22.50,
        'humidity' => 55.00,
        'status' => 'NORMAL',
    ]);

    $this->artisan('aggregate:sensor-readings')->assertSuccessful();

    $reading = SensorReading::where('sensor_id', $sensor->id)->first();
    expect((float) $reading->avg_temp)->toBe(22.50)
        ->and((float) $reading->avg_hum)->toBe(55.00);
});

test('aggregate:sensor-readings exits early when all sensors are offline', function () {
    $hmi = Hmi::factory()->create();
    $sensor = Sensor::factory()->for($hmi)->create();
    SensorLatestData::factory()->offline()->for($sensor)->create();

    $this->artisan('aggregate:sensor-readings')->assertSuccessful();

    expect(SensorReading::count())->toBe(0);
});

// ─── purge:old-logs ───────────────────────────────────────────────────────────

test('purge:old-logs deletes sensor_logs older than 90 days', function () {
    SensorLog::factory()->create(['created_at' => now()->subDays(91)]);
    SensorLog::factory()->create(['created_at' => now()->subDays(89)]);

    $this->artisan('purge:old-logs')->assertSuccessful();

    expect(SensorLog::count())->toBe(1);
});

test('purge:old-logs deletes sensor_readings older than 90 days', function () {
    SensorReading::factory()->create(['created_at' => now()->subDays(91)]);
    SensorReading::factory()->create(['created_at' => now()->subDays(89)]);

    $this->artisan('purge:old-logs')->assertSuccessful();

    expect(SensorReading::count())->toBe(1);
});

test('purge:old-logs keeps records exactly at 90 days boundary', function () {
    SensorLog::factory()->create(['created_at' => now()->subDays(90)]);
    SensorReading::factory()->create(['created_at' => now()->subDays(90)]);

    $this->artisan('purge:old-logs')->assertSuccessful();

    expect(SensorLog::count())->toBe(1)
        ->and(SensorReading::count())->toBe(1);
});

test('purge:old-logs sends automatic backup email when backup email is configured', function () {
    Mail::fake();

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    SensorLog::factory()->create(['created_at' => now()->subDays(91)]);
    SensorReading::factory()->create(['created_at' => now()->subDays(91)]);

    $this->artisan('purge:old-logs')->assertSuccessful();

    Mail::assertSent(OldLogsBackupMail::class, function (OldLogsBackupMail $mail): bool {
        return $mail->hasTo('backup@example.com')
            && $mail->sensorLogsCount === 1
            && $mail->sensorReadingsCount === 1;
    });

    expect(SensorLog::count())->toBe(0)
        ->and(SensorReading::count())->toBe(0);
});

test('purge:old-logs skips automatic backup email when backup email is empty', function () {
    Mail::fake();

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => null],
    );

    SensorLog::factory()->create(['created_at' => now()->subDays(91)]);

    $this->artisan('purge:old-logs')->assertSuccessful();

    Mail::assertNothingSent();

    expect(SensorLog::count())->toBe(0);
});

test('purge:old-logs still deletes old data when backup email send fails', function () {
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    SensorLog::factory()->create(['created_at' => now()->subDays(91)]);
    SensorReading::factory()->create(['created_at' => now()->subDays(91)]);

    Mail::shouldReceive('to')
        ->once()
        ->with('backup@example.com')
        ->andReturn(new class
        {
            public function send(mixed $mailable): void
            {
                throw new RuntimeException('SMTP gagal');
            }
        });

    $this->artisan('purge:old-logs')->assertSuccessful();

    expect(SensorLog::count())->toBe(0)
        ->and(SensorReading::count())->toBe(0);
});

// ─── schedule registration ────────────────────────────────────────────────────

test('aggregate:room-logs is scheduled every fifteen minutes', function () {
    $this->artisan('schedule:list')
        ->expectsOutputToContain('aggregate:room-logs')
        ->assertSuccessful();
});

test('aggregate:sensor-readings is scheduled every five minutes', function () {
    $this->artisan('schedule:list')
        ->expectsOutputToContain('aggregate:sensor-readings')
        ->assertSuccessful();
});

test('purge:old-logs is scheduled daily', function () {
    $this->artisan('schedule:list')
        ->expectsOutputToContain('purge:old-logs')
        ->assertSuccessful();
});
