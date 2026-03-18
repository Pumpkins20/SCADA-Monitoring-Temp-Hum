		Implementasi Fitur Alarm HMI
Sistem Monitoring Suhu & Kelembapan
Dokumen Teknis Final — v1.0

1. Ringkasan Eksekutif
Dokumen ini adalah panduan implementasi final untuk fitur pembacaan alarm dari HMI Haiwell D4 ke dalam sistem dashboard monitoring berbasis Laravel + Inertia React + Python Poller.

Keputusan Arsitektur: Pull via Modbus TCP — poller membaca coil alarm langsung dari HMI setiap siklus polling, selaras dengan cara kerja pembacaan suhu dan kelembapan yang sudah berjalan.

Berdasarkan data register yang diberikan teknisi, HMI Haiwell D4 mengekspose alarm sebagai Coil (register tipe 0X) yang dapat dibaca via Modbus FC01. Setiap sensor memiliki 2 coil alarm (suhu dan kelembapan) ditambah 1 coil status koneksi.

2. Pemetaan Register HMI
Seluruh register berikut menggunakan tipe 0X (Coil), dibaca dengan fungsi Modbus FC01 read_coils(). Unit ID (slave address) sama dengan yang digunakan untuk membaca register suhu dan kelembapan.

2.1 Alarm State — per Sensor
Variable	Alamat Coil	Makna	Nilai
Device_1_Temp	1	Alarm suhu sensor 1	True = alarm aktif
Device_1_Hum	2	Alarm hum sensor 1	True = alarm aktif
Device_2_Temp	3	Alarm suhu sensor 2	True = alarm aktif
Device_2_Hum	4	Alarm hum sensor 2	True = alarm aktif
Device_3_Temp	5	Alarm suhu sensor 3	True = alarm aktif
Device_3_Hum	6	Alarm hum sensor 3	True = alarm aktif
Device_4_Temp	7	Alarm suhu sensor 4	True = alarm aktif
Device_4_Hum	8	Alarm hum sensor 4	True = alarm aktif

2.2 Connection Status — per Device
Variable	Alamat Coil	Makna	Catatan
Device_1	9	Status koneksi sensor 1	True = terhubung (invert untuk alarm_disconnect)
Device_2	10	Status koneksi sensor 2	True = terhubung
Device_3	11	Status koneksi sensor 3	True = terhubung
Device_4	12	Status koneksi sensor 4	True = terhubung

Catatan Penting: Coil connection bernilai True saat sensor TERHUBUNG. Di aplikasi, field alarm_disconnect bernilai True saat sensor TERPUTUS. Nilai harus di-invert saat disimpan ke database.

3. Perubahan Skema Database
Dua migration baru diperlukan. Tidak ada perubahan pada tabel yang sudah ada — semua penambahan menggunakan nilai default yang aman untuk backward compatibility.

3.1 Migration: sensor_latest_data
Tambah 3 kolom alarm boolean:

Schema::table('sensor_latest_data', function (Blueprint $table) {
    $table->boolean('alarm_temp')      ->default(false)->after('status');
    $table->boolean('alarm_hum')       ->default(false)->after('alarm_temp');
    $table->boolean('alarm_disconnect')->default(false)->after('alarm_hum');
});

Mengapa default(false)? Data sensor lama di DB langsung dianggap tidak ada alarm aktif — kondisi paling aman dan tidak memerlukan data migration.

3.2 Migration: sensors
Tambah 3 kolom alamat coil alarm per sensor:

Schema::table('sensors', function (Blueprint $table) {
    $table->integer('modbus_coil_alarm_temp') ->nullable()->after('modbus_address_hum');
    $table->integer('modbus_coil_alarm_hum')  ->nullable()->after('modbus_coil_alarm_temp');
    $table->integer('modbus_coil_connection')  ->nullable()->after('modbus_coil_alarm_hum');
});

Nilai nullable memungkinkan sensor lama tetap valid tanpa konfigurasi alarm. Jika null, poller akan skip pembacaan coil dan fallback ke inferensi threshold.

4. Update Model PHP
4.1 Sensor.php
protected $fillable = [
    'hmi_id',
    'name',
    'modbus_address_temp',
    'modbus_address_hum',
    'modbus_coil_alarm_temp',   // ← tambah
    'modbus_coil_alarm_hum',    // ← tambah
    'modbus_coil_connection',   // ← tambah
    'unit_id',
];

protected function casts(): array {
    return [
        'modbus_address_temp'     => 'integer',
        'modbus_address_hum'      => 'integer',
        'modbus_coil_alarm_temp'  => 'integer', // ← tambah
        'modbus_coil_alarm_hum'   => 'integer', // ← tambah
        'modbus_coil_connection'  => 'integer', // ← tambah
        'unit_id'                 => 'integer',
    ];
}

4.2 SensorLatestData.php
protected $fillable = [
    'sensor_id',
    'temperature',
    'humidity',
    'status',
    'alarm_temp',        // ← tambah
    'alarm_hum',         // ← tambah
    'alarm_disconnect',  // ← tambah
    'last_read_at',
];

protected function casts(): array {
    return [
        'temperature'      => 'decimal:2',
        'humidity'         => 'decimal:2',
        'alarm_temp'       => 'boolean', // ← tambah
        'alarm_hum'        => 'boolean', // ← tambah
        'alarm_disconnect' => 'boolean', // ← tambah
        'last_read_at'     => 'datetime',
    ];
}

5. Update poller.py
Lima perubahan pada poller, berurutan dari fungsi terkecil hingga main loop.

5.1 Fungsi read_coil()
Fungsi baru untuk membaca 1 coil via FC01. Mengembalikan True/False, atau None jika gagal.

def read_coil(
    client: ModbusTcpClient, address: int, unit_id: int
) -> bool | None:
    """
    Baca 1 coil alarm dari HMI via FC01 read_coils().
    Haiwell D4 mendefinisikan alamat coil mulai dari 1.
    pymodbus menggunakan 0-based — wajib address - 1.
    """
    try:
        result = client.read_coils(
            address=address - 1, count=1, device_id=unit_id
        )
        if result.isError():
            return None
        return bool(result.bits[0])
    except (ModbusException, OSError):
        return None

Mengapa address - 1? Haiwell D4 mendefinisikan alamat coil mulai dari 1 di dokumentasinya, sedangkan pymodbus menggunakan 0-based addressing. Tanpa offset ini, semua pembacaan coil akan salah alamat 1 posisi.

5.2 Fungsi compute_alarms()
Menggantikan compute_status(). Menggabungkan alarm native HMI dengan inferensi threshold sebagai fallback.

def compute_alarms(
    temp: float,
    hum: float,
    temp_limit: float,
    hum_limit: float,
    alarm_temp: bool | None,
    alarm_hum: bool | None,
    alarm_disconnect: bool | None,
) -> dict:
    # Disconnect override semua kondisi lain
    if alarm_disconnect:
        return {
            'alarm_temp': False,
            'alarm_hum': False,
            'alarm_disconnect': True,
            'status': 'OFFLINE',
        }

    # Pakai coil HMI jika berhasil dibaca, fallback ke threshold
    final_alarm_temp = alarm_temp if alarm_temp is not None \
                       else (temp > temp_limit)
    final_alarm_hum  = alarm_hum  if alarm_hum  is not None \
                       else (hum  > hum_limit)

    if temp > temp_limit * 2 or hum > hum_limit * 2:
        status = 'CRITICAL'
    elif final_alarm_temp or final_alarm_hum:
        status = 'WARNING'
    else:
        status = 'NORMAL'

    return {
        'alarm_temp':       final_alarm_temp,
        'alarm_hum':        final_alarm_hum,
        'alarm_disconnect': False,
        'status':           status,
    }

5.3 Update load_hmis()
Sertakan 3 kolom coil baru pada query sensor:

cursor.execute(
    f'''
    SELECT id, hmi_id, name,
           modbus_address_temp, modbus_address_hum,
           modbus_coil_alarm_temp,   -- ← tambah
           modbus_coil_alarm_hum,    -- ← tambah
           modbus_coil_connection,   -- ← tambah
           unit_id
    FROM sensors
    WHERE hmi_id IN ({placeholders})
    ''',
    list(hmis.keys()),
)
for (sensor_id, hmi_id, sensor_name,
     addr_temp, addr_hum,
     coil_alarm_temp, coil_alarm_hum, coil_connection,
     unit_id) in cursor.fetchall():
    hmis[hmi_id]['sensors'].append({
        'sensor_id':       sensor_id,
        'name':            sensor_name,
        'addr_temp':       addr_temp,
        'addr_hum':        addr_hum,
        'coil_alarm_temp': coil_alarm_temp,  # None = belum dikonfigurasi
        'coil_alarm_hum':  coil_alarm_hum,
        'coil_connection': coil_connection,
        'unit_id':         unit_id,
    })

5.4 Update poll_hmi()
Baca 3 coil setelah baca register analog, lalu panggil compute_alarms():

for sensor in hmi['sensors']:
    unit_id = sensor['unit_id']
    try:
        temp = read_register(client, sensor['addr_temp'], unit_id)
        hum  = read_register(client, sensor['addr_hum'],  unit_id)

        # Baca coil — None jika alamat belum dikonfigurasi
        alarm_temp = (
            read_coil(client, sensor['coil_alarm_temp'], unit_id)
            if sensor['coil_alarm_temp'] is not None else None
        )
        alarm_hum = (
            read_coil(client, sensor['coil_alarm_hum'], unit_id)
            if sensor['coil_alarm_hum'] is not None else None
        )
        connected = (
            read_coil(client, sensor['coil_connection'], unit_id)
            if sensor['coil_connection'] is not None else None
        )
        # Invert: coil True = connected, alarm_disconnect True = terputus
        alarm_disconnect = (not connected) if connected is not None else None

        alarms = compute_alarms(
            temp, hum,
            hmi['temp_max_limit'], hmi['hum_max_limit'],
            alarm_temp, alarm_hum, alarm_disconnect,
        )

        ok_rows.append((
            sensor['sensor_id'],
            round(temp, 2), round(hum, 2),
            alarms['status'],
            alarms['alarm_temp'],
            alarms['alarm_hum'],
            alarms['alarm_disconnect'],
            now, now,
        ))
    except (ModbusException, OSError) as exc:
        # ... logika offline tetap sama

5.5 Update upsert_sensor_data()
cursor.executemany(
    '''
    INSERT INTO sensor_latest_data
        (sensor_id, temperature, humidity, status,
         alarm_temp, alarm_hum, alarm_disconnect,
         last_read_at, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (sensor_id) DO UPDATE SET
        temperature      = EXCLUDED.temperature,
        humidity         = EXCLUDED.humidity,
        status           = EXCLUDED.status,
        alarm_temp       = EXCLUDED.alarm_temp,
        alarm_hum        = EXCLUDED.alarm_hum,
        alarm_disconnect = EXCLUDED.alarm_disconnect,
        last_read_at     = EXCLUDED.last_read_at,
        updated_at       = EXCLUDED.updated_at
    ''',
    rows,
)

5.6 Update mark_hmi_offline() dan blok offline per-sensor
Saat OFFLINE, set alarm_disconnect = TRUE dan reset alarm lain ke FALSE:

# mark_hmi_offline() — koneksi HMI putus total
cursor.execute(
    '''
    UPDATE sensor_latest_data sld
    SET status           = 'OFFLINE',
        alarm_disconnect = TRUE,
        alarm_temp       = FALSE,
        alarm_hum        = FALSE,
        updated_at       = %s
    FROM sensors s
    WHERE s.id = sld.sensor_id
      AND s.hmi_id = %s
      AND sld.status != 'OFFLINE'
    ''',
    (now, hmi_id),
)

Mengapa alarm lain di-reset ke FALSE saat OFFLINE? Saat koneksi putus, nilai suhu dan hum terakhir tidak valid lagi. Membiarkan alarm_temp atau alarm_hum tetap True dari data lama akan menyesatkan operator dashboard.

6. Update DashboardController.php
Dua perubahan kecil — update select eager loading dan tambah nested object alarms ke payload sensor.

6.1 Update select eager loading
'hmis.sensors.latestData' => fn ($q) => $q->select([
    'id', 'sensor_id', 'temperature', 'humidity', 'status',
    'alarm_temp', 'alarm_hum', 'alarm_disconnect', // ← tambah
    'last_read_at',
]),

6.2 Update payload sensor
'sensors' => $sensors->map(fn ($s) => [
    'id'          => $s->id,
    'name'        => $s->name,
    'temperature' => $s->latestData?->temperature !== null
                       ? (float) $s->latestData->temperature : null,
    'humidity'    => $s->latestData?->humidity !== null
                       ? (float) $s->latestData->humidity : null,
    'status'      => $s->latestData?->status ?? 'OFFLINE',
    'alarms'      => [                               // ← tambah nested object
        'temp'       => $s->latestData?->alarm_temp       ?? false,
        'hum'        => $s->latestData?->alarm_hum        ?? false,
        'disconnect' => $s->latestData?->alarm_disconnect ?? true,
    ],
    'last_read_at' => $s->latestData?->last_read_at?->format('Y-m-d H:i:s'),
])->values()->all(),

Mengapa disconnect default true saat latestData null? Jika belum ada data sama sekali di DB untuk sensor tersebut, sensor memang belum pernah terbaca — kondisi paling jujur adalah disconnect.

7. Ringkasan File yang Berubah
File	Jenis Perubahan	Detail
migrations/add_alarm_fields_sensor_latest_data	Baru	Tambah alarm_temp, alarm_hum, alarm_disconnect
migrations/add_coil_columns_sensors	Baru	Tambah modbus_coil_alarm_temp, _hum, _connection
app/Models/Sensor.php	Edit	Tambah 3 field coil di fillable & casts
app/Models/SensorLatestData.php	Edit	Tambah 3 field alarm di fillable & casts
poller.py	Edit	Tambah read_coil(), compute_alarms(), update load_hmis(), poll_hmi(), upsert, mark_offline
app/Http/Controllers/DashboardController.php	Edit	Update select + payload sensor + show()

8. Strategi Deploy
Dua release bertahap untuk zero-risk deployment ke produksi.

Release 1 — Data Masuk, UI Tidak Berubah
•	Jalankan kedua migration
•	Update Sensor.php dan SensorLatestData.php
•	Deploy poller.py baru
•	Pantau log poller: pastikan coil terbaca dan nilai alarm masuk ke DB dengan benar
•	Observasi minimal 1-2 hari: bandingkan alarm coil HMI vs status suhu/hum analog

Release 2 — Alarm Tampil di Dashboard
•	Update DashboardController.php (select + payload)
•	Update frontend React untuk tampilkan badge alarm per kondisi
•	Deploy dan monitor

Keuntungan 2 Release: Jika ada bug di pembacaan coil atau nilai tidak sesuai ekspektasi, dampaknya nol ke UI produksi. Operator tetap melihat dashboard normal selama Release 1.

9. Definition of Done
•	Poller membaca 3 coil per sensor (alarm_temp, alarm_hum, connection) secara stabil setiap siklus
•	Nilai coil tersimpan benar di sensor_latest_data dengan semantik yang tepat (connection di-invert)
•	Fallback ke inferensi threshold berjalan saat coil gagal dibaca
•	Saat OFFLINE, alarm_disconnect = TRUE dan alarm lain = FALSE
•	Dashboard menampilkan nested object alarms per sensor
•	Tidak ada regresi pada pembacaan suhu, kelembapan, dan status yang sudah berjalan
•	Migration dapat di-rollback tanpa kehilangan data lama
