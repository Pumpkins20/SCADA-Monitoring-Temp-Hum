<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ─── rooms ────────────────────────────────────────────────────────────────────

test('rooms table has correct columns', function () {
    expect(Schema::hasTable('rooms'))->toBeTrue();

    foreach (['id', 'name', 'location', 'temp_max_limit', 'hum_max_limit', 'created_at', 'updated_at'] as $column) {
        expect(Schema::hasColumn('rooms', $column))
            ->toBeTrue("rooms.{$column} column is missing");
    }
});

// ─── hmis ─────────────────────────────────────────────────────────────────────

test('hmis table has correct columns', function () {
    expect(Schema::hasTable('hmis'))->toBeTrue();

    foreach (['id', 'room_id', 'name', 'ip_address', 'port', 'register_function', 'is_active', 'is_preview', 'created_at', 'updated_at'] as $column) {
        expect(Schema::hasColumn('hmis', $column))
            ->toBeTrue("hmis.{$column} column is missing");
    }
});

// ─── sensors ──────────────────────────────────────────────────────────────────

test('sensors table has correct columns', function () {
    expect(Schema::hasTable('sensors'))->toBeTrue();

    foreach ([
        'id',
        'hmi_id',
        'name',
        'modbus_address_temp',
        'modbus_address_hum',
        'unit_id',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('sensors', $column))
            ->toBeTrue("sensors.{$column} column is missing");
    }
});

// ─── sensor_latest_data ───────────────────────────────────────────────────────

test('sensor_latest_data table has correct columns', function () {
    expect(Schema::hasTable('sensor_latest_data'))->toBeTrue();

    foreach ([
        'id',
        'sensor_id',
        'temperature',
        'humidity',
        'status',
        'alarm_temp',
        'alarm_hum',
        'alarm_disconnect',
        'calibrate_temp',
        'calibrate_hum',
        'last_read_at',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('sensor_latest_data', $column))
            ->toBeTrue("sensor_latest_data.{$column} column is missing");
    }
});

// ─── hmi_latest_data ─────────────────────────────────────────────────────────

test('hmi_latest_data table has correct columns', function () {
    expect(Schema::hasTable('hmi_latest_data'))->toBeTrue();

    foreach ([
        'id',
        'hmi_id',
        'avg_temp',
        'avg_hum',
        'last_read_at',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('hmi_latest_data', $column))
            ->toBeTrue("hmi_latest_data.{$column} column is missing");
    }
});

test('sensor_latest_data enforces unique sensor_id', function () {
    DB::table('rooms')->insert(['id' => 1, 'name' => 'R1', 'temp_max_limit' => 25.00, 'hum_max_limit' => 60.00]);
    DB::table('hmis')->insert(['id' => 1, 'room_id' => 1, 'name' => 'HMI-1', 'ip_address' => '192.168.1.1', 'port' => 502, 'is_active' => 1]);
    DB::table('sensors')->insert(['id' => 1, 'hmi_id' => 1, 'name' => 'S1', 'modbus_address_temp' => 1, 'modbus_address_hum' => 0, 'unit_id' => 1]);

    DB::table('sensor_latest_data')->insert(['sensor_id' => 1, 'status' => 'OFFLINE']);

    expect(fn () => DB::table('sensor_latest_data')->insert(['sensor_id' => 1, 'status' => 'NORMAL']))
        ->toThrow(Exception::class);
});

// ─── sensor_logs ──────────────────────────────────────────────────────────────

test('sensor_logs table has correct columns', function () {
    expect(Schema::hasTable('sensor_logs'))->toBeTrue();

    foreach (['id', 'room_id', 'avg_temperature', 'avg_humidity', 'created_at', 'updated_at'] as $column) {
        expect(Schema::hasColumn('sensor_logs', $column))
            ->toBeTrue("sensor_logs.{$column} column is missing");
    }
});

// ─── sensor_readings ──────────────────────────────────────────────────────────

test('sensor_readings table has correct columns', function () {
    expect(Schema::hasTable('sensor_readings'))->toBeTrue();

    foreach (['id', 'sensor_id', 'avg_temp', 'avg_hum', 'created_at'] as $column) {
        expect(Schema::hasColumn('sensor_readings', $column))
            ->toBeTrue("sensor_readings.{$column} column is missing");
    }
});

test('sensor_readings has no updated_at column', function () {
    expect(Schema::hasColumn('sensor_readings', 'updated_at'))->toBeFalse();
});

// ─── cascade deletes ──────────────────────────────────────────────────────────

test('deleting a room cascades to hmis and sensors', function () {
    DB::table('rooms')->insert(['id' => 1, 'name' => 'R1', 'temp_max_limit' => 25.00, 'hum_max_limit' => 60.00]);
    DB::table('hmis')->insert(['id' => 1, 'room_id' => 1, 'name' => 'HMI-1', 'ip_address' => '192.168.1.1', 'port' => 502, 'is_active' => 1]);
    DB::table('sensors')->insert(['id' => 1, 'hmi_id' => 1, 'name' => 'S1', 'modbus_address_temp' => 1, 'modbus_address_hum' => 0, 'unit_id' => 1]);
    DB::table('sensor_latest_data')->insert(['sensor_id' => 1, 'status' => 'OFFLINE']);

    DB::table('rooms')->where('id', 1)->delete();

    expect(DB::table('hmis')->count())->toBe(0);
    expect(DB::table('sensors')->count())->toBe(0);
    expect(DB::table('sensor_latest_data')->count())->toBe(0);
});

test('deleting a sensor cascades to sensor_latest_data and sensor_readings', function () {
    DB::table('rooms')->insert(['id' => 1, 'name' => 'R1', 'temp_max_limit' => 25.00, 'hum_max_limit' => 60.00]);
    DB::table('hmis')->insert(['id' => 1, 'room_id' => 1, 'name' => 'HMI-1', 'ip_address' => '192.168.1.1', 'port' => 502, 'is_active' => 1]);
    DB::table('sensors')->insert(['id' => 1, 'hmi_id' => 1, 'name' => 'S1', 'modbus_address_temp' => 1, 'modbus_address_hum' => 2]);
    DB::table('sensor_latest_data')->insert(['sensor_id' => 1, 'status' => 'OFFLINE']);
    DB::table('sensor_readings')->insert(['sensor_id' => 1, 'avg_temp' => 22.50, 'avg_hum' => 55.00, 'created_at' => now()]);

    DB::table('sensors')->where('id', 1)->delete();

    expect(DB::table('sensor_latest_data')->count())->toBe(0);
    expect(DB::table('sensor_readings')->count())->toBe(0);
});
