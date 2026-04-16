<?php

use App\Mail\AlarmLogExportMail;
use App\Models\AlarmEvent;
use App\Models\GaugeSetting;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLatestData;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

test('guests are redirected to login from alarms.index', function () {
    $this->get(route('alarms.index'))->assertRedirect(route('login'));
});

test('guests are redirected to login from alarms.export-email', function () {
    $this->post(route('alarms.export-email'), ['tab' => 'history'])->assertRedirect(route('login'));
});

test('guests are redirected to login from alarms.export-pdf', function () {
    $this->get(route('alarms.export-pdf', ['tab' => 'history']))->assertRedirect(route('login'));
});

test('authenticated users can visit alarms.index', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index'))
        ->assertOk()
        ->assertInertia(fn($page) => $page
            ->component('alarms/index')
            ->has('rooms')
            ->has('rows')
            ->has('filters')
            ->has('pagination')
            ->where('tabInfo.isViewOnly', true));
});

test('alarm index shows backup email as export recipient', function () {
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'backup@example.com'],
    );

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index'))
        ->assertOk()
        ->assertInertia(
            fn($page) => $page->where('exportRecipientEmail', 'backup@example.com')
        );
});

test('alarm index filters by room and date range', function () {
    Carbon::setTestNow(Carbon::parse('2026-03-28 09:00:00'));

    $roomA = Room::factory()->create(['name' => 'RUANG A']);
    $roomB = Room::factory()->create(['name' => 'RUANG B']);

    $hmiA = Hmi::factory()->create(['room_id' => $roomA->id]);
    $hmiB = Hmi::factory()->create(['room_id' => $roomB->id]);

    $sensorA = Sensor::factory()->create(['hmi_id' => $hmiA->id, 'unit_id' => 1]);
    $sensorB = Sensor::factory()->create(['hmi_id' => $hmiB->id, 'unit_id' => 2]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensorA->id,
        'alarm_type' => 'disconnect',
        'current_value' => 0,
        'occurred_at' => now()->subMinutes(5),
    ]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensorB->id,
        'alarm_type' => 'temp',
        'current_value' => 34.5,
        'occurred_at' => now()->subDays(3),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', [
            'room' => $roomA->id,
            'start_date' => now()->subDay()->format('Y-m-d'),
            'end_date' => now()->format('Y-m-d'),
            'tab' => 'history',
        ]))
        ->assertOk()
        ->assertInertia(fn($page) => $page
            ->component('alarms/index')
            ->has('rows', 1)
            ->where('rows.0.room_name', 'RUANG A')
            ->where('rows.0.variable_name', 'Ext_Device_1_commStatus'));

    Carbon::setTestNow();
});

test('been-confirmed tab returns empty rows in view-only mode', function () {
    $room = Room::factory()->create();
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 3]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'temp',
        'current_value' => 30.2,
        'occurred_at' => now(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', ['tab' => 'been-confirmed']))
        ->assertOk()
        ->assertInertia(fn($page) => $page
            ->component('alarms/index')
            ->has('rows', 0)
            ->where('tabInfo.confirmedAvailableFromHmi', false));
});

test('can export alarms as excel with selected filters', function () {
    $room = Room::factory()->create(['name' => 'RUANG EXPORT']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 4, 'name' => 'T/H 4']);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'disconnect',
        'current_value' => 0,
        'occurred_at' => now(),
    ]);

    ob_start();

    $response = $this->actingAs(User::factory()->create())
        ->get(route('alarms.export', [
            'tab' => 'history',
            'room' => $room->id,
        ]));

    $binaryContent = (string) ob_get_clean();

    $response->assertSuccessful();
    expect($binaryContent)->not->toBe('');

    $temporaryFilePath = tempnam(sys_get_temp_dir(), 'alarms_export_');
    expect($temporaryFilePath)->not->toBeFalse();

    file_put_contents($temporaryFilePath, $binaryContent);

    $zipArchive = new ZipArchive;
    expect($zipArchive->open($temporaryFilePath))->toBeTrue();

    $worksheetXml = (string) ($zipArchive->getFromName('xl/worksheets/sheet1.xml') ?: '');
    $sharedStringsXml = (string) ($zipArchive->getFromName('xl/sharedStrings.xml') ?: '');
    $zipArchive->close();

    @unlink($temporaryFilePath);

    $xmlContent = $worksheetXml . $sharedStringsXml;

    expect($xmlContent)->toContain('Alarm Logs');
    expect($xmlContent)->toContain('History Alarm');
    expect($xmlContent)->toContain('RUANG EXPORT');
    expect($xmlContent)->toContain('Alarm time');
    expect($xmlContent)->toContain('Room name');
});

test('authenticated users can send alarm export to configured recipient email', function () {
    Mail::fake();
    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => 'scada1.edutic@gmail.com'],
    );

    $room = Room::factory()->create(['name' => 'RUANG EMAIL']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 2]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'temp',
        'current_value' => 33.7,
        'occurred_at' => now(),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->post(route('alarms.export-email'), [
            'tab' => 'history',
            'room' => $room->id,
            'page' => 1,
        ]);

    $response->assertRedirect(route('alarms.index', [
        'tab' => 'history',
        'page' => 1,
        'room' => $room->id,
    ]));

    $response->assertSessionHas('success');

    Mail::assertSent(AlarmLogExportMail::class, function (AlarmLogExportMail $mail): bool {
        return $mail->hasTo('scada1.edutic@gmail.com')
            && str_starts_with($mail->subjectExportLabel, 'EXPORT_DATA_ALARM_LOGS_(');
    });
});

test('alarm export email fails when backup email is not configured', function () {
    Mail::fake();

    GaugeSetting::query()->updateOrCreate(
        ['id' => 1],
        ['backup_email' => null],
    );

    $room = Room::factory()->create(['name' => 'RUANG TANPA EMAIL']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 1]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'disconnect',
        'current_value' => 0,
        'occurred_at' => now(),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->post(route('alarms.export-email'), [
            'tab' => 'history',
            'room' => $room->id,
            'page' => 1,
        ]);

    $response->assertRedirect(route('alarms.index', [
        'tab' => 'history',
        'page' => 1,
        'room' => $room->id,
    ]));

    $response->assertSessionHas('error', 'Email backup otomatis belum diatur.');

    Mail::assertNothingSent();
});

test('authenticated users can download alarms as pdf', function () {
    $room = Room::factory()->create(['name' => 'RUANG PDF ALARM']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 2]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'temp',
        'current_value' => 33.2,
        'occurred_at' => now()->subMinutes(5),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->get(route('alarms.export-pdf', [
            'tab' => 'history',
            'room' => $room->id,
        ]));

    $response->assertSuccessful();
    $response->assertHeader('content-type', 'application/pdf');

    $contentDisposition = (string) $response->headers->get('content-disposition');
    expect($contentDisposition)->toContain('.pdf');

    $binaryContent = (string) $response->getContent();
    expect($binaryContent)->not->toBe('');
});

test('realtime tab falls back to sensor latest alarms when alarm events are empty', function () {
    $room = Room::factory()->create(['name' => 'RUANG LIVE']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create(['hmi_id' => $hmi->id, 'unit_id' => 2]);

    SensorLatestData::query()->create([
        'sensor_id' => $sensor->id,
        'temperature' => null,
        'humidity' => null,
        'status' => 'OFFLINE',
        'alarm_temp' => false,
        'alarm_hum' => false,
        'alarm_disconnect' => true,
        'calibrate_temp' => null,
        'calibrate_hum' => null,
        'last_read_at' => now(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', [
            'tab' => 'realtime',
            'room' => $room->id,
        ]))
        ->assertOk()
        ->assertInertia(fn($page) => $page
            ->component('alarms/index')
            ->has('rows', 1)
            ->where('rows.0.alarm_text', 'Device 2 Disconnected')
            ->where('rows.0.variable_name', 'Ext_Device_2_commStatus'));
});

test('alarm text follows HMI high low format and resolves device number from sensor name', function () {
    $room = Room::factory()->create(['name' => 'RUANG FORMAT']);
    $hmi = Hmi::factory()->create(['room_id' => $room->id]);
    $sensor = Sensor::factory()->create([
        'hmi_id' => $hmi->id,
        'unit_id' => 1,
        'name' => 'Sensor 4',
    ]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'temp_high',
        'current_value' => 31.2,
        'occurred_at' => now(),
    ]);

    AlarmEvent::query()->create([
        'sensor_id' => $sensor->id,
        'alarm_type' => 'hum_low',
        'current_value' => 42.1,
        'occurred_at' => now()->subSecond(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('alarms.index', ['tab' => 'history', 'room' => $room->id]))
        ->assertOk()
        ->assertInertia(fn($page) => $page
            ->component('alarms/index')
            ->where('rows.0.alarm_text', 'Device 4 High Temperature')
            ->where('rows.0.variable_name', 'Ext_Device_4_temp')
            ->where('rows.1.alarm_text', 'Device 4 Low Humidity')
            ->where('rows.1.variable_name', 'Ext_Device_4_hum'));
});
