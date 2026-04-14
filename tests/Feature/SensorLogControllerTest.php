<?php

use App\Mail\SensorLogExportMail;
use App\Models\GaugeSetting;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

// ─── Auth guard ──────────────────────────────────────────────────────────────

test('guests are redirected to login from logs.index', function () {
    $this->get(route('logs.index'))->assertRedirect(route('login'));
});

test('guests are redirected to login from logs.export-email', function () {
    $this->post(route('logs.export-email'), ['room' => 1])->assertRedirect(route('login'));
});

test('guests are redirected to login from logs.export-pdf', function () {
    $this->get(route('logs.export-pdf', ['room' => 1]))->assertRedirect(route('login'));
});

test('authenticated users can visit logs.index', function () {
    Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->component('logs/index')
                ->has('rooms')
                ->has('activeRoomId')
                ->has('sensors')
                ->has('logs')
                ->has('pagination')
                ->has('timeFilter')
                ->where('timeFilter.mode', 'none')
        );
});

test('logs index shows backup email as export recipient', function () {
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('exportRecipientEmail', 'backup@example.com')
        );
});

// ─── Room filtering ──────────────────────────────────────────────────────────

test('defaults to first room when no room param', function () {
    $room1 = Room::factory()->create(['name' => 'RUANG A']);
    Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('activeRoomId', $room1->id)
        );
});

test('can filter by room query param', function () {
    Room::factory()->create(['name' => 'RUANG A']);
    $room2 = Room::factory()->create(['name' => 'RUANG B']);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room2->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('activeRoomId', $room2->id)
        );
});

// ─── Data pivot ──────────────────────────────────────────────────────────────

test('log rows contain pivoted sensor data', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor1 = Sensor::factory()->create(['hmi_id' => $hmi->id]);
    $sensor2 = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    $timestamp = now();
    SensorReading::factory()->create([
        'sensor_id' => $sensor1->id,
        'avg_temp' => 25.50,
        'avg_hum' => 60.00,
        'created_at' => $timestamp,
    ]);
    SensorReading::factory()->create([
        'sensor_id' => $sensor2->id,
        'avg_temp' => 26.00,
        'avg_hum' => 58.00,
        'created_at' => $timestamp,
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->has('logs', 1)
                ->has('logs.0.temp_1')
                ->has('logs.0.temp_2')
                ->has('logs.0.hum_1')
                ->has('logs.0.hum_2')
                ->has('logs.0.avg_temp')
                ->has('logs.0.avg_hum')
                ->where('logs.0.time', fn($time) => is_string($time))
        );
});

test('chart series are returned with empty points when no readings exist', function () {
    $room = Room::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', ['room' => $room->id]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->has('logs', 0)
                ->has('sensors')
        );
});

test('can filter logs by recent minutes', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 25.10,
        'avg_hum' => 58.20,
        'created_at' => now()->subMinutes(2),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 22.40,
        'avg_hum' => 52.30,
        'created_at' => now()->subMinutes(20),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 5,
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('timeFilter.mode', 'recent')
                ->where('timeFilter.recent_minutes', 5)
                ->has('logs', 1)
        );
});

test('can filter logs by time interval', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 28.80,
        'avg_hum' => 62.10,
        'created_at' => now()->subMinutes(90),
    ]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 24.70,
        'avg_hum' => 54.20,
        'created_at' => now()->subMinutes(10),
    ]);

    $start = now()->subMinutes(30)->format('Y-m-d H:i:s');
    $end = now()->format('Y-m-d H:i:s');

    $this->actingAs(User::factory()->create())
        ->get(route('logs.index', [
            'room' => $room->id,
            'time_filter' => 'interval',
            'start_at' => $start,
            'end_at' => $end,
        ]))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page
                ->where('timeFilter.mode', 'interval')
                ->where('timeFilter.start_at', $start)
                ->where('timeFilter.end_at', $end)
                ->has('logs', 1)
        );
});

test('exported excel includes room metadata information', function () {
    $room = Room::factory()->create([
        'name' => 'RUANG UJI A',
        'location' => 'LANTAI 2',
    ]);
    $hmi = Hmi::factory()->create([
        'room_id' => $room->id,
        'ip_address' => '10.10.10.20',
    ]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 25.40,
        'avg_hum' => 59.20,
        'created_at' => now(),
    ]);

    ob_start();

    $response = $this->actingAs(User::factory()->create())
        ->get(route('logs.export', ['room' => $room->id]));

    $binaryContent = (string) ob_get_clean();

    $response->assertSuccessful();
    expect($binaryContent)->not->toBe('');

    $temporaryFilePath = tempnam(sys_get_temp_dir(), 'logs_export_');
    expect($temporaryFilePath)->not->toBeFalse();

    file_put_contents($temporaryFilePath, $binaryContent);

    $zipArchive = new ZipArchive;
    expect($zipArchive->open($temporaryFilePath))->toBeTrue();

    $worksheetXml = (string) ($zipArchive->getFromName('xl/worksheets/sheet1.xml') ?: '');
    $sharedStringsXml = (string) ($zipArchive->getFromName('xl/sharedStrings.xml') ?: '');
    $zipArchive->close();

    @unlink($temporaryFilePath);

    $xmlContent = $worksheetXml . $sharedStringsXml;

    expect($xmlContent)->toContain('Nama Ruangan');
    expect($xmlContent)->toContain('RUANG UJI A');
    expect($xmlContent)->toContain('Lokasi Ruangan');
    expect($xmlContent)->toContain('LANTAI 2');
    expect($xmlContent)->toContain('IP Address');
    expect($xmlContent)->toContain('10.10.10.20');
});

test('authenticated users can send log export to configured recipient email', function () {
    Mail::fake();

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'scada1.edutic@gmail.com'],
    );

    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 25.50,
        'avg_hum' => 58.70,
        'created_at' => now(),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->post(route('logs.export-email'), [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 30,
            'page' => 1,
        ]);

    $response->assertRedirect(route('logs.index', [
        'room' => $room->id,
        'page' => 1,
        'time_filter' => 'recent',
        'recent_minutes' => 30,
    ]));

    $response->assertSessionHas('success');

    Mail::assertSent(SensorLogExportMail::class, function (SensorLogExportMail $mail): bool {
        return $mail->hasTo('scada1.edutic@gmail.com');
    });
});

test('log export email fails when backup email is not configured', function () {
    Mail::fake();

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => null],
    );

    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 24.80,
        'avg_hum' => 57.20,
        'created_at' => now(),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->post(route('logs.export-email'), [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 30,
            'page' => 1,
        ]);

    $response->assertRedirect(route('logs.index', [
        'room' => $room->id,
        'page' => 1,
        'time_filter' => 'recent',
        'recent_minutes' => 30,
    ]));

    $response->assertSessionHas('error', 'Email backup otomatis belum diatur.');

    Mail::assertNothingSent();
});

test('authenticated users can download logs as pdf', function () {
    $room = Room::factory()->create([
        'name' => 'RUANG PDF',
        'location' => 'LANTAI 1',
    ]);
    $hmi = Hmi::factory()->create([
        'room_id' => $room->id,
        'ip_address' => '10.10.10.30',
    ]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id]);

    SensorReading::factory()->create([
        'sensor_id' => $sensor->id,
        'avg_temp' => 26.10,
        'avg_hum' => 61.20,
        'created_at' => now()->subMinutes(5),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->get(route('logs.export-pdf', [
            'room' => $room->id,
            'time_filter' => 'recent',
            'recent_minutes' => 30,
        ]));

    $response->assertSuccessful();
    $response->assertHeader('content-type', 'application/pdf');

    $contentDisposition = (string) $response->headers->get('content-disposition');
    expect($contentDisposition)->toContain('.pdf');

    $binaryContent = (string) $response->getContent();
    expect($binaryContent)->not->toBe('');
});
