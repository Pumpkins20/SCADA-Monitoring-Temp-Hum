# Plan: Integrasi Lengkap Data Register HMI

## Konteks

Dokumen ini adalah plan komprehensif untuk membaca **semua data yang tersedia di register
HMI Haiwell D4** dan mengintegrasikannya ke sistem dashboard. Berdasarkan file Excel
`Data_Register.xlsx`, register HMI mencakup lebih dari sekadar suhu dan kelembapan —
termasuk nama sensor, kalibrasi, threshold, alarm, average, nama ruangan, dan detail lokasi.

---

## Pemetaan Register Lengkap (Referensi)

### Holding Register 4X (FC03) — Read & Write

#### Per Sensor (pola berulang untuk 4 sensor)

| Variable | Sensor 1 | Sensor 2 | Sensor 3 | Sensor 4 | Keterangan |
|---|---|---|---|---|---|
| `name` | 1 | 25 | 49 | 73 | Nama sensor — string, tersimpan di HMI |
| `temp` | 9 | 33 | 57 | 81 | Data suhu aktual (°C, sudah aktual) |
| `hum` | 11 | 35 | 59 | 83 | Data hum aktual (%RH, sudah aktual) |
| `calibrate_temp` | 13 | 37 | 61 | 85 | Nilai kalibrasi suhu (float + atau -) |
| `calibrate_hum` | 15 | 39 | 63 | 87 | Nilai kalibrasi hum (float + atau -) |
| `over_temp` | 17 | 41 | 65 | 89 | Threshold atas suhu |
| `under_temp` | 19 | 43 | 67 | 91 | Threshold bawah suhu |
| `over_hum` | 21 | 45 | 69 | 93 | Threshold atas hum |
| `under_hum` | 23 | 47 | 71 | 95 | Threshold bawah hum |

#### Average & Room (per HMI)

| Variable | Alamat | Keterangan |
|---|---|---|
| `avg_temp` | 97 | Rata-rata suhu 4 sensor, dihitung HMI |
| `avg_hum` | 99 | Rata-rata hum 4 sensor, dihitung HMI |
| `room_name` | 101 | Nama ruangan (string) |
| `room_detail` | 107 | Detail lokasi ruangan (string) |

### Coil 0X (FC01) — Read & Write

| Variable | Alamat | Keterangan |
|---|---|---|
| `alarm_temp_s1` | 1 | Alarm suhu sensor 1 |
| `alarm_hum_s1` | 2 | Alarm hum sensor 1 |
| `alarm_temp_s2` | 3 | Alarm suhu sensor 2 |
| `alarm_hum_s2` | 4 | Alarm hum sensor 2 |
| `alarm_temp_s3` | 5 | Alarm suhu sensor 3 |
| `alarm_hum_s3` | 6 | Alarm hum sensor 3 |
| `alarm_temp_s4` | 7 | Alarm suhu sensor 4 |
| `alarm_hum_s4` | 8 | Alarm hum sensor 4 |
| `alarm_data_status` | 9 | Enable/disable semua alarm data |
| `connection_s1` | 10 | Status koneksi sensor 1 |
| `connection_s2` | 11 | Status koneksi sensor 2 |
| `connection_s3` | 12 | Status koneksi sensor 3 |
| `connection_s4` | 13 | Status koneksi sensor 4 |
| `alarm_conn_status` | 14 | Enable/disable semua alarm koneksi |

---

## Keputusan Arsitektur

| Data | Perlakuan |
|---|---|
| Nama sensor dari HMI | Sumber kebenaran utama — poller sync ke DB setiap siklus |
| Nama & detail room dari HMI | Auto-populate saat preview, poller sync ke DB setiap siklus |
| Kalibrasi temp/hum | Simpan ke DB, tampilkan di halaman detail sensor |
| Average temp/hum dari HMI | Dibaca poller, disimpan ke DB, dipakai sebagai cross-check di dashboard |
| Threshold (over/under) | Dibaca poller setiap siklus, dipakai `compute_alarms()` |
| Alarm coil | Dibaca poller setiap siklus, disimpan ke `sensor_latest_data` |

---

## 1. Perubahan SENSOR_MAP di `poller.py`

`SENSOR_MAP` diperluas untuk mencakup semua register per sensor termasuk nama dan kalibrasi.
Register nama sensor adalah string yang tersimpan dalam beberapa register berurutan
(Haiwell menyimpan string sebagai multi-register, setiap register = 2 karakter ASCII).

```python
SENSOR_MAP = {
    1: {
        "name":          1,   # string register — baca multi-register
        "temp":          9,
        "hum":           11,
        "calibrate_temp": 13,
        "calibrate_hum":  15,
        "over_temp":     17,
        "under_temp":    19,
        "over_hum":      21,
        "under_hum":     23,
    },
    2: {
        "name":          25,
        "temp":          33,
        "hum":           35,
        "calibrate_temp": 37,
        "calibrate_hum":  39,
        "over_temp":     41,
        "under_temp":    43,
        "over_hum":      45,
        "under_hum":     47,
    },
    3: {
        "name":          49,
        "temp":          57,
        "hum":           59,
        "calibrate_temp": 61,
        "calibrate_hum":  63,
        "over_temp":     65,
        "under_temp":    67,
        "over_hum":      69,
        "under_hum":     71,
    },
    4: {
        "name":          73,
        "temp":          81,
        "hum":           83,
        "calibrate_temp": 85,
        "calibrate_hum":  87,
        "over_temp":     89,
        "under_temp":    91,
        "over_hum":      93,
        "under_hum":     95,
    },
}

# Register HMI-level (bukan per sensor)
HMI_REGISTERS = {
    "avg_temp":    97,
    "avg_hum":     99,
    "room_name":   101,  # string, multi-register
    "room_detail": 107,  # string, multi-register
}
```

### Fungsi Baca String dari Register

Nama sensor dan nama/detail ruangan tersimpan sebagai string multi-register di Haiwell.
Setiap register 16-bit menyimpan 2 karakter ASCII (big-endian).

```python
def read_string_register(
    client: ModbusTcpClient,
    address: int,
    count: int,
    unit_id: int,
    func: str = "03",
) -> str | None:
    """
    Baca string dari holding register Haiwell.
    Setiap register = 2 byte = 2 karakter ASCII.
    count = jumlah register yang dibaca (panjang string / 2, dibulatkan ke atas).

    Contoh: nama sensor 'SENSOR 1' = 8 karakter = 4 register.
    Null byte (0x00) mengakhiri string.
    """
    try:
        if func == "03":
            result = client.read_holding_registers(
                address=address, count=count, device_id=unit_id
            )
        else:
            result = client.read_input_registers(
                address=address, count=count, device_id=unit_id
            )
        if result.isError():
            return None

        chars = []
        for reg in result.registers:
            high = (reg >> 8) & 0xFF
            low  = reg & 0xFF
            if high == 0:
                break
            chars.append(chr(high))
            if low == 0:
                break
            chars.append(chr(low))

        return ''.join(chars).strip() or None

    except (ModbusException, OSError):
        return None
```

Jumlah register yang dibaca per string:
- `sensor name` : 8 register (address 1..8, 25..32, dst.) — cover nama hingga 16 karakter
- `room_name`   : 3 register (address 101..103) — cover nama hingga 6 karakter
- `room_detail` : 6 register (address 107..112) — cover detail hingga 12 karakter

> **Catatan:** Jumlah register string perlu dikonfirmasi ke teknisi karena bergantung
> pada konfigurasi project HMI. Nilai di atas adalah perkiraan umum untuk Haiwell D4.
> Jika nama sensor bisa lebih panjang, tambah jumlah register yang dibaca.

---

## 2. Perubahan Database

### 2a. Migration — kolom kalibrasi di `sensor_latest_data`

Kalibrasi disimpan di `sensor_latest_data` (bukan di `sensors`) karena nilainya bisa
berubah setiap siklus jika teknisi mengubah kalibrasi dari HMI.

```php
// database/migrations/xxxx_add_calibration_to_sensor_latest_data.php

Schema::table('sensor_latest_data', function (Blueprint $table) {
    $table->decimal('calibrate_temp', 5, 2)->nullable()->after('alarm_disconnect');
    $table->decimal('calibrate_hum',  5, 2)->nullable()->after('calibrate_temp');
});
```

### 2b. Migration — kolom average di `sensor_latest_data` level HMI

Average dari HMI disimpan per HMI, bukan per sensor. Opsi terbaik adalah tabel
terpisah `hmi_latest_data` agar tidak redundan di tiap baris sensor:

```php
// database/migrations/xxxx_create_hmi_latest_data_table.php

Schema::create('hmi_latest_data', function (Blueprint $table) {
    $table->id();
    $table->foreignId('hmi_id')->unique()->constrained('hmis')->cascadeOnDelete();
    $table->decimal('avg_temp', 5, 2)->nullable();
    $table->decimal('avg_hum',  5, 2)->nullable();
    $table->timestamp('last_read_at')->nullable();
    $table->timestamps();
});
```

### 2c. Nama sensor dan room — tidak butuh kolom baru

Nama sensor sudah ada di kolom `sensors.name`. Nama dan detail room sudah ada di
`rooms.name` dan `rooms.location`. Poller cukup UPDATE kolom yang sudah ada setiap
siklus jika nilai dari HMI berbeda.

---

## 3. Perubahan Model PHP

### `SensorLatestData.php`

```php
protected $fillable = [
    'sensor_id',
    'temperature',
    'humidity',
    'status',
    'alarm_temp',
    'alarm_hum',
    'alarm_disconnect',
    'calibrate_temp',   // ← tambah
    'calibrate_hum',    // ← tambah
    'last_read_at',
];

protected function casts(): array
{
    return [
        'temperature'      => 'decimal:2',
        'humidity'         => 'decimal:2',
        'calibrate_temp'   => 'decimal:2',  // ← tambah
        'calibrate_hum'    => 'decimal:2',  // ← tambah
        'alarm_temp'       => 'boolean',
        'alarm_hum'        => 'boolean',
        'alarm_disconnect' => 'boolean',
        'last_read_at'     => 'datetime',
    ];
}
```

### Model baru `HmiLatestData.php`

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HmiLatestData extends Model
{
    protected $fillable = [
        'hmi_id',
        'avg_temp',
        'avg_hum',
        'last_read_at',
    ];

    protected function casts(): array
    {
        return [
            'avg_temp'     => 'decimal:2',
            'avg_hum'      => 'decimal:2',
            'last_read_at' => 'datetime',
        ];
    }

    public function hmi(): BelongsTo
    {
        return $this->belongsTo(Hmi::class);
    }
}
```

---

## 4. Perubahan `poller.py` — Komprehensif

### Update `poll_hmi()` — baca semua data

```python
def poll_hmi(hmi: dict, cursor, now) -> None:
    client = ModbusTcpClient(
        host=hmi["ip_address"],
        port=hmi["port"],
        timeout=MODBUS_TIMEOUT,
    )
    try:
        if not client.connect():
            raise ConnectionException(
                f"Cannot connect to {hmi['ip_address']}:{hmi['port']}"
            )

        func = hmi["register_function"]

        # ── Baca data HMI-level (average + room info) ──────────────────────
        avg_temp = read_data_register(client, HMI_REGISTERS["avg_temp"], 1, func)
        avg_hum  = read_data_register(client, HMI_REGISTERS["avg_hum"],  1, func)

        # Nama dan detail room dari HMI — sync ke DB jika berbeda
        room_name_hmi   = read_string_register(client, HMI_REGISTERS["room_name"],   3, 1, func)
        room_detail_hmi = read_string_register(client, HMI_REGISTERS["room_detail"], 6, 1, func)

        if room_name_hmi or room_detail_hmi:
            sync_room_info(cursor, hmi["room_id"], room_name_hmi, room_detail_hmi)

        # UPSERT average ke hmi_latest_data
        upsert_hmi_average(cursor, hmi["hmi_id"], avg_temp, avg_hum, now)

        # ── Baca status global alarm ────────────────────────────────────────
        alarm_enabled      = read_coil(client, COIL_ALARM_STATUS,      1)
        connection_enabled = read_coil(client, COIL_CONNECTION_STATUS,  1)

        ok_rows     = []
        offline_ids = []

        for sensor in hmi["sensors"]:
            unit_id  = sensor["unit_id"]
            position = sensor["position"]
            regs     = SENSOR_MAP.get(position)
            coils    = COIL_MAP.get(position)

            if regs is None:
                continue

            try:
                # ── Nama sensor dari HMI — sync ke DB ──
                sensor_name_hmi = read_string_register(
                    client, regs["name"], 8, unit_id, func
                )
                if sensor_name_hmi and sensor_name_hmi != sensor["name"]:
                    sync_sensor_name(cursor, sensor["sensor_id"], sensor_name_hmi)
                    sensor["name"] = sensor_name_hmi  # update local cache

                # ── Baca data aktual ──
                temp = read_data_register(client, regs["temp"], unit_id, func)
                hum  = read_data_register(client, regs["hum"],  unit_id, func)

                # ── Baca kalibrasi ──
                calibrate_temp = read_data_register(client, regs["calibrate_temp"], unit_id, func)
                calibrate_hum  = read_data_register(client, regs["calibrate_hum"],  unit_id, func)

                # ── Baca threshold dari HMI ──
                over_temp  = read_data_register(client, regs["over_temp"],  unit_id, func)
                under_temp = read_data_register(client, regs["under_temp"], unit_id, func)
                over_hum   = read_data_register(client, regs["over_hum"],   unit_id, func)
                under_hum  = read_data_register(client, regs["under_hum"],  unit_id, func)

                # ── Baca coil alarm ──
                alarm_temp_coil = (
                    read_coil(client, coils["alarm_temp"], unit_id)
                    if coils and alarm_enabled else None
                )
                alarm_hum_coil = (
                    read_coil(client, coils["alarm_hum"], unit_id)
                    if coils and alarm_enabled else None
                )
                connected = (
                    read_coil(client, coils["connection"], unit_id)
                    if coils and connection_enabled else None
                )
                alarm_disconnect = (not connected) if connected is not None else None

                alarms = compute_alarms(
                    temp, hum,
                    over_temp, under_temp,
                    over_hum, under_hum,
                    alarm_temp_coil, alarm_hum_coil,
                    alarm_disconnect,
                )

                ok_rows.append((
                    sensor["sensor_id"],
                    round(temp, 2),
                    round(hum, 2),
                    alarms["status"],
                    alarms["alarm_temp"],
                    alarms["alarm_hum"],
                    alarms["alarm_disconnect"],
                    round(calibrate_temp, 2) if calibrate_temp is not None else None,
                    round(calibrate_hum,  2) if calibrate_hum  is not None else None,
                    now,
                    now,
                ))

            except (ModbusException, OSError) as exc:
                log.warning(
                    "HMI %d sensor '%s' (pos=%d) OFFLINE — %s",
                    hmi["hmi_id"], sensor["name"], position, exc,
                )
                offline_ids.append(sensor["sensor_id"])

        if ok_rows:
            upsert_sensor_data(cursor, ok_rows)

        if offline_ids:
            # ... logika offline tetap sama

    except (ConnectionException, ModbusException, OSError) as exc:
        log.warning("HMI %d (%s) OFFLINE — %s", hmi["hmi_id"], hmi["ip_address"], exc)
        mark_hmi_offline(cursor, hmi["hmi_id"], now)

    finally:
        client.close()
```

### Fungsi Helper Baru

```python
def sync_room_info(cursor, room_id: int, name: str | None, detail: str | None) -> None:
    """
    Sync nama dan detail ruangan dari HMI ke tabel rooms di DB.
    Hanya update jika nilai dari HMI tidak None dan berbeda dari DB.
    HMI adalah sumber kebenaran utama untuk nama dan detail room.
    """
    fields, values = [], []
    if name:
        fields.append("name = %s")
        values.append(name)
    if detail:
        fields.append("location = %s")
        values.append(detail)
    if not fields:
        return

    values.append(room_id)
    cursor.execute(
        f"UPDATE rooms SET {', '.join(fields)} WHERE id = %s",
        values,
    )


def sync_sensor_name(cursor, sensor_id: int, name: str) -> None:
    """
    Sync nama sensor dari HMI ke tabel sensors di DB.
    HMI adalah sumber kebenaran utama — nama di DB selalu mengikuti HMI.
    """
    cursor.execute(
        "UPDATE sensors SET name = %s WHERE id = %s",
        (name, sensor_id),
    )


def upsert_hmi_average(
    cursor, hmi_id: int, avg_temp: float, avg_hum: float, now
) -> None:
    """
    UPSERT data average HMI ke tabel hmi_latest_data.
    Dipakai sebagai cross-check terhadap kalkulasi average Laravel.
    """
    cursor.execute(
        """
        INSERT INTO hmi_latest_data (hmi_id, avg_temp, avg_hum, last_read_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (hmi_id) DO UPDATE SET
            avg_temp     = EXCLUDED.avg_temp,
            avg_hum      = EXCLUDED.avg_hum,
            last_read_at = EXCLUDED.last_read_at,
            updated_at   = EXCLUDED.updated_at
        """,
        (hmi_id, round(avg_temp, 2), round(avg_hum, 2), now, now),
    )
```

### Update `upsert_sensor_data()` — tambah kolom kalibrasi

```python
cursor.executemany(
    """
    INSERT INTO sensor_latest_data
        (sensor_id, temperature, humidity, status,
         alarm_temp, alarm_hum, alarm_disconnect,
         calibrate_temp, calibrate_hum,
         last_read_at, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (sensor_id) DO UPDATE SET
        temperature      = EXCLUDED.temperature,
        humidity         = EXCLUDED.humidity,
        status           = EXCLUDED.status,
        alarm_temp       = EXCLUDED.alarm_temp,
        alarm_hum        = EXCLUDED.alarm_hum,
        alarm_disconnect = EXCLUDED.alarm_disconnect,
        calibrate_temp   = EXCLUDED.calibrate_temp,
        calibrate_hum    = EXCLUDED.calibrate_hum,
        last_read_at     = EXCLUDED.last_read_at,
        updated_at       = EXCLUDED.updated_at
    """,
    rows,
)
```

### Update `load_hmis()` — sertakan `room_id`

Poller perlu tahu `room_id` dari HMI untuk sync nama ruangan:

```python
cursor.execute("""
    SELECT
        h.id            AS hmi_id,
        h.ip_address,
        h.port,
        h.register_function,
        h.is_preview,
        h.room_id                   -- ← tambah
    FROM hmis h
    WHERE h.is_active IS TRUE
       OR h.is_preview IS TRUE
""")

hmis: dict[int, dict] = {
    row[0]: {
        "hmi_id":            row[0],
        "ip_address":        row[1],
        "port":              row[2],
        "register_function": row[3] or "03",
        "is_preview":        row[4],
        "room_id":           row[5],       # ← tambah
        "sensors":           [],
    }
    for row in rows
}
```

---

## 5. Perubahan Flow Preview — Data Tambahan

Dengan data lengkap dari HMI, tampilan preview saat "Connect & Preview" menjadi
jauh lebih informatif. Endpoint `previewData()` di Laravel perlu diperluas:

```php
// HmiController@previewData

return response()->json([
    'ready'       => $hasData,
    'room_name'   => $hmi->room->name,        // sudah di-sync poller dari HMI
    'room_detail' => $hmi->room->location,    // sudah di-sync poller dari HMI
    'hmi_avg'     => [                         // dari hmi_latest_data
        'temp' => $hmi->latestData?->avg_temp,
        'hum'  => $hmi->latestData?->avg_hum,
    ],
    'sensors' => $sensors->map(fn ($s) => [
        'id'             => $s->id,
        'name'           => $s->name,          // sudah di-sync dari HMI
        'temperature'    => $s->latestData?->temperature,
        'humidity'       => $s->latestData?->humidity,
        'calibrate_temp' => $s->latestData?->calibrate_temp,
        'calibrate_hum'  => $s->latestData?->calibrate_hum,
        'over_temp'      => null,   // threshold tidak disimpan di sensor_latest_data
        'under_temp'     => null,   // pertimbangkan tambah jika perlu ditampilkan
        'over_hum'       => null,
        'under_hum'      => null,
        'status'         => $s->latestData?->status,
        'alarm_temp'     => $s->latestData?->alarm_temp,
        'alarm_hum'      => $s->latestData?->alarm_hum,
    ])->values(),
]);
```

> **Catatan:** Threshold (`over_temp`, `under_temp`, dst.) saat ini tidak disimpan
> di DB — hanya dibaca poller setiap siklus untuk `compute_alarms()`. Jika ingin
> ditampilkan di preview atau halaman detail sensor, perlu tambah kolom di
> `sensor_latest_data` atau tabel terpisah. Ini bisa jadi fase berikutnya.

---

## 6. Perubahan `DashboardController.php` — Cross-check Average

Average dari HMI dipakai sebagai cross-check, bukan pengganti. Tambahkan ke payload
room jika `HmiLatestData` tersedia:

```php
// Eager load hmi latest data
$rooms = Room::with([
    'hmis' => fn ($q) => $q->where('is_active', true)->where('is_preview', false),
    'hmis.latestData',                           // ← HmiLatestData
    'hmis.sensors' => fn ($q) => $q->select(['id', 'hmi_id', 'name']),
    'hmis.sensors.latestData' => fn ($q) => $q->select([
        'id', 'sensor_id', 'temperature', 'humidity', 'status',
        'alarm_temp', 'alarm_hum', 'alarm_disconnect',
        'calibrate_temp', 'calibrate_hum',       // ← tambah
        'last_read_at',
    ]),
])
->select(['id', 'name', 'location', 'temp_max_limit', 'hum_max_limit'])
->get();
```

Di payload room, tambah `hmi_avg` sebagai cross-check:

```php
// Di dalam map room
'hmi_avg_temp' => $room->hmis
    ->whereNotNull('latestData')
    ->avg(fn ($h) => $h->latestData->avg_temp),   // rata-rata avg dari semua HMI di room
'hmi_avg_hum'  => $room->hmis
    ->whereNotNull('latestData')
    ->avg(fn ($h) => $h->latestData->avg_hum),
```

Di UI, bisa ditampilkan sebagai tooltip atau badge kecil di sebelah nilai rata-rata
utama untuk validasi operator.

---

## 7. Perubahan UI — Halaman Detail Sensor

Kalibrasi tampil di halaman detail sensor. Tambahkan section baru di bawah data
suhu/hum:

```
┌─────────────────────────────────────────┐
│ RUANG TEST T/H 1                        │
│ Suhu    : 24.5 °C    Hum : 61.2 %RH   │
│ Status  : NORMAL                        │
├─────────────────────────────────────────┤
│ KALIBRASI (dari HMI)                    │
│ Offset Suhu : +0.5 °C                  │
│ Offset Hum  : -1.0 %RH                 │
│ (nilai kalibrasi diterapkan HMI)        │
└─────────────────────────────────────────┘
```

Data kalibrasi bersifat read-only di UI — tidak bisa diubah dari dashboard karena
sumber kebenarannya adalah HMI.

---

## 8. Ringkasan Semua Perubahan File

### Database

| Migration | Keterangan |
|---|---|
| `add_calibration_to_sensor_latest_data` | Kolom `calibrate_temp`, `calibrate_hum` |
| `create_hmi_latest_data_table` | Tabel baru untuk average dari HMI |
| `add_is_preview_to_hmis` | Sudah di plan sebelumnya |
| `add_register_function_to_hmis` | Sudah di plan sebelumnya |

### Backend Laravel

| File | Perubahan |
|---|---|
| `app/Models/SensorLatestData.php` | Tambah `calibrate_temp`, `calibrate_hum` |
| `app/Models/HmiLatestData.php` | Model baru |
| `app/Models/Hmi.php` | Tambah relasi `latestData()` ke `HmiLatestData` |
| `app/Http/Controllers/HmiController.php` | Update `previewData()` — data lebih lengkap |
| `app/Http/Controllers/DashboardController.php` | Eager load `HmiLatestData`, tambah `hmi_avg` di payload |

### Poller Python

| Fungsi | Perubahan |
|---|---|
| `SENSOR_MAP` | Perluas — tambah `name`, `calibrate_temp`, `calibrate_hum` |
| `HMI_REGISTERS` | Konstanta baru — `avg_temp`, `avg_hum`, `room_name`, `room_detail` |
| `read_string_register()` | Fungsi baru — baca string multi-register |
| `read_data_register()` | Rename dari `read_holding_register()` — support FC03/FC04 |
| `sync_room_info()` | Fungsi baru — sync nama/lokasi room ke DB |
| `sync_sensor_name()` | Fungsi baru — sync nama sensor ke DB |
| `upsert_hmi_average()` | Fungsi baru — UPSERT average ke `hmi_latest_data` |
| `upsert_sensor_data()` | Update — tambah kolom kalibrasi |
| `poll_hmi()` | Update — baca semua data termasuk nama, kalibrasi, average, room |
| `load_hmis()` | Update — tambah `room_id` dari query |

### Frontend React

| File | Perubahan |
|---|---|
| `devices.tsx` | Tampilkan data preview lebih lengkap (nama dari HMI, kalibrasi, avg) |
| Halaman detail sensor | Tambah section kalibrasi read-only |
| Dashboard | Tampilkan `hmi_avg` sebagai cross-check (opsional, tooltip/badge) |

---

## 9. Urutan Implementasi

```
1. Jalankan migration baru (calibrate columns + hmi_latest_data table)
2. Update model SensorLatestData + buat model HmiLatestData
3. Update Hmi model — tambah relasi latestData()
4. Update poller.py:
   a. Perluas SENSOR_MAP + tambah HMI_REGISTERS
   b. Tambah read_string_register()
   c. Tambah sync_room_info(), sync_sensor_name(), upsert_hmi_average()
   d. Update poll_hmi() — baca semua data
   e. Update upsert_sensor_data() — tambah kolom kalibrasi
   f. Update load_hmis() — tambah room_id
5. Test poller — verifikasi nama sensor dan room ter-sync ke DB
6. Update HmiController@previewData — payload lebih lengkap
7. Update DashboardController — eager load HmiLatestData + payload hmi_avg
8. Update UI — preview lengkap + section kalibrasi di detail sensor
```

---

## 10. Catatan Penting

**String register Haiwell perlu dikonfirmasi ke teknisi.** Jumlah register yang
dialokasikan untuk string (nama sensor, nama room, detail room) bergantung pada
konfigurasi project HMI. Nilai `count` di `read_string_register()` perlu diverifikasi
sebelum deploy — terlalu sedikit register dibaca akan memotong nama yang panjang,
terlalu banyak tidak bermasalah tapi kurang efisien.

**Nama sensor dan room di-sync setiap siklus.** Jika operator mengubah nama sensor
dari HMI langsung, perubahan akan terefleksi di dashboard dalam 5 detik (1 siklus
poller). Ini adalah konsekuensi dari keputusan "HMI sebagai sumber kebenaran utama".
User tidak bisa mengubah nama sensor dari dashboard — perubahan harus dilakukan
dari HMI atau via sistem lain yang write ke register HMI.

**Threshold tidak disimpan ke DB saat ini.** Nilai `over_temp`, `under_temp`,
`over_hum`, `under_hum` hanya dibaca poller untuk `compute_alarms()` dan tidak
dipersist. Jika suatu saat perlu ditampilkan di UI detail sensor atau laporan,
perlu tambah kolom di `sensor_latest_data`. Ini bisa jadi fase berikutnya setelah
implementasi dasar selesai.
