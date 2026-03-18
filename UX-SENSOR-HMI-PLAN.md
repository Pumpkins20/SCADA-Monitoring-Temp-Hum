# Plan Perubahan UX & Poller Dinamis

## Konteks

Sistem bergeser dari arsitektur lama (poller baca langsung ke sensor fisik via Modbus TCP dengan
alamat per-sensor yang disimpan di DB) ke arsitektur baru (poller baca semua data dari IP HMI
menggunakan `SENSOR_MAP` dan `COIL_MAP` konstan). Perubahan ini berdampak ke UI manajemen
perangkat, skema DB, controller Laravel, dan fleksibilitas poller di lapangan.

---

## 1. Form HMI — Disederhanakan

### Kondisi Saat Ini
Form tambah/edit HMI meminta banyak field: IP address, port, room, unit ID, dan konfigurasi
register. Ini berlebihan karena register map sudah konstan untuk semua HMI Haiwell D4.

### Target
Form tambah HMI hanya membutuhkan 4 field:

| Field | Tipe | Keterangan |
|---|---|---|
| Nama HMI | Text input | Identifikasi HMI di UI |
| IP Address | Text input | IP HMI di jaringan LAN |
| Port | Number input | Default 502 |
| Function Register | Dropdown | FC03 atau FC04 — lihat bagian 5 |

### Perilaku Auto-create Sensor
Saat HMI baru disimpan, sistem otomatis membuat 4 sensor dengan konfigurasi default.
User tidak perlu input apapun untuk sensor — cukup rename jika diperlukan.

### Perubahan File
- `resources/js/pages/hmis/create.tsx` — hapus field yang tidak relevan
- `resources/js/pages/hmis/edit.tsx` — sesuaikan form edit
- `app/Http/Controllers/HmiController.php` — lihat bagian 2

---

## 2. `HmiController@store` — Auto-create 4 Sensor

### Kondisi Saat Ini
Sensor dibuat manual oleh user setelah HMI ditambahkan. User harus input unit ID, alamat
register, dan konfigurasi coil satu per satu.

### Target
Setelah `Hmi::create()` berhasil, controller langsung buat 4 sensor secara otomatis.

### Implementasi

```php
// app/Http/Controllers/HmiController.php

public function store(Request $request): RedirectResponse
{
    $validated = $request->validate([
        'name'              => 'required|string|max:255',
        'ip_address'        => 'required|ip',
        'port'              => 'required|integer|min:1|max:65535',
        'register_function' => 'required|in:03,04',
        'room_id'           => 'required|exists:rooms,id',
        'is_active'         => 'boolean',
    ]);

    $hmi = Hmi::create($validated);

    // Auto-create 4 sensor sesuai posisi Device_1..4 di HMI
    foreach (range(1, 4) as $position) {
        Sensor::create([
            'hmi_id'  => $hmi->id,
            'name'    => "Sensor {$position}",
            'unit_id' => 1, // default unit ID, bisa diubah via edit sensor jika diperlukan
        ]);
    }

    return redirect()->route('hmis.show', $hmi)
        ->with('success', 'HMI berhasil ditambahkan dengan 4 sensor.');
}
```

### Catatan
- `unit_id` default `1` karena slave address HMI Haiwell D4 umumnya 1. Bisa diubah
  via form edit sensor jika ada HMI dengan slave address berbeda.
- Nama sensor bisa diubah kapanpun via form edit sensor.
- Jika HMI dihapus, 4 sensor ikut terhapus via `onDelete('cascade')` di migration.

---

## 3. Tabel `sensors` — Kolom Lama

### Kolom yang Terdampak

| Kolom | Status | Alasan |
|---|---|---|
| `modbus_address_temp` | Nullable, pertahankan | Dipakai di UI untuk referensi, mungkin dipakai sistem lain |
| `modbus_address_hum` | Nullable, pertahankan | Sama seperti di atas |
| `unit_id` | Pertahankan, tetap dipakai | Masih dipakai poller untuk slave address HMI |
| `modbus_coil_alarm_temp` | Drop atau nullable | Tidak dipakai poller — COIL_MAP konstan |
| `modbus_coil_alarm_hum` | Drop atau nullable | Tidak dipakai poller — COIL_MAP konstan |
| `modbus_coil_connection` | Drop atau nullable | Tidak dipakai poller — COIL_MAP konstan |

### Rekomendasi: Nullable, Bukan Drop
Kolom `modbus_address_temp` dan `modbus_address_hum` dipertahankan sebagai nullable karena:
- Masih direferensikan di UI untuk keperluan display/laporan
- Jika suatu saat ada HMI vendor lain dengan alamat custom, kolom sudah tersedia
- Menghindari migration drop yang berisiko di produksi

Kolom `modbus_coil_*` boleh di-drop jika sudah dipastikan tidak ada referensi lain di kodebase.

### Migration

```php
// database/migrations/xxxx_cleanup_sensor_columns.php

Schema::table('sensors', function (Blueprint $table) {
    // Nullable — tidak dipakai poller tapi dipertahankan untuk referensi UI
    $table->integer('modbus_address_temp')->nullable()->change();
    $table->integer('modbus_address_hum')->nullable()->change();

    // Drop kolom coil — tidak dipakai, sudah di-handle COIL_MAP konstan
    // Uncomment jika sudah dipastikan tidak ada referensi lain
    // $table->dropColumn(['modbus_coil_alarm_temp', 'modbus_coil_alarm_hum', 'modbus_coil_connection']);
});
```

---

## 4. Form Edit Sensor — Read-only Display dari SENSOR_MAP

### Kondisi Saat Ini
Form edit sensor menampilkan semua field sebagai input yang bisa diubah: unit ID, function
register, alamat register, dan coil alarm. Ini berpotensi menyebabkan konfigurasi yang tidak
konsisten dengan `SENSOR_MAP` di poller.

### Target
Form edit sensor hanya memiliki **1 field yang bisa diedit**: Nama Sensor.
Semua field konfigurasi ditampilkan sebagai informasi read-only yang di-populate otomatis
dari `SENSOR_MAP` dan `COIL_MAP` berdasarkan posisi sensor dalam HMI.

### Tampilan yang Diusulkan

```
┌─────────────────────────────────────────────────┐
│ Edit Sensor                                      │
│ Ubah konfigurasi sensor.                         │
├─────────────────────────────────────────────────┤
│ NAMA SENSOR                                      │
│ ┌─────────────────────────────────────────────┐ │
│ │ RUANG TEST T/H 1                            │ │  ← editable
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ UNIT ID (SLAVE ADDRESS)                          │
│ ┌──────────┐                                     │
│ │ 1        │  ← editable (slave address HMI)    │
│ └──────────┘                                     │
│                                                  │
│ KONFIGURASI REGISTER AKTIF                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ 🔒 Terisi otomatis dari konfigurasi HMI     │ │
│ │                                             │ │
│ │ Posisi di HMI   : Device 1                  │ │
│ │ Function Code   : FC03 — Holding Register   │ │  ← read-only
│ │ Register Suhu   : 9                         │ │  ← read-only
│ │ Register Hum    : 11                        │ │  ← read-only
│ │                                             │ │
│ │ Coil Alarm Suhu : 1  (FC01)                │ │  ← read-only
│ │ Coil Alarm Hum  : 2  (FC01)                │ │  ← read-only
│ │ Coil Koneksi    : 10 (FC01)                │ │  ← read-only
│ └─────────────────────────────────────────────┘ │
│                                                  │
│              [Batal]  [Simpan Perubahan]         │
└─────────────────────────────────────────────────┘
```

### Data yang Dikirim Controller

`SensorController@update` hanya perlu terima dan update 2 field:

```php
public function update(Request $request, Sensor $sensor): RedirectResponse
{
    $validated = $request->validate([
        'name'    => 'required|string|max:255',
        'unit_id' => 'required|integer|min:1|max:247',
    ]);

    $sensor->update($validated);

    return redirect()->back()->with('success', 'Sensor berhasil diperbarui.');
}
```

### Populate Read-only dari SENSOR_MAP di Frontend

Karena `SENSOR_MAP` ada di Python (poller), nilai yang sama perlu didefinisikan ulang di
frontend sebagai konstanta TypeScript untuk keperluan display:

```typescript
// resources/js/constants/sensor-map.ts

export const SENSOR_MAP: Record<number, {
    temp: number
    hum: number
    over_temp: number
    under_temp: number
    over_hum: number
    under_hum: number
}> = {
    1: { temp: 9,  hum: 11, over_temp: 17, under_temp: 19, over_hum: 21, under_hum: 23 },
    2: { temp: 33, hum: 35, over_temp: 41, under_temp: 43, over_hum: 45, under_hum: 47 },
    3: { temp: 57, hum: 59, over_temp: 65, under_temp: 67, over_hum: 69, under_hum: 71 },
    4: { temp: 81, hum: 83, over_temp: 89, under_temp: 91, over_hum: 93, under_hum: 95 },
}

export const COIL_MAP: Record<number, {
    alarm_temp: number
    alarm_hum: number
    connection: number
}> = {
    1: { alarm_temp: 1,  alarm_hum: 2,  connection: 10 },
    2: { alarm_temp: 3,  alarm_hum: 4,  connection: 11 },
    3: { alarm_temp: 5,  alarm_hum: 6,  connection: 12 },
    4: { alarm_temp: 7,  alarm_hum: 8,  connection: 13 },
}
```

Komponen form menggunakan posisi sensor (index dalam daftar sensor HMI) untuk lookup konstanta
di atas dan render sebagai teks, bukan input field.

### Perubahan File
- `resources/js/pages/sensors/edit.tsx` — hapus field input, tambah read-only display
- `resources/js/constants/sensor-map.ts` — file baru, konstanta untuk display
- `app/Http/Controllers/SensorController.php` — sederhanakan validasi update
- `app/Http/Requests/UpdateSensorRequest.php` — jika ada, sesuaikan rules

---

## 5. Poller Dinamis — `register_function` per HMI

### Masalah
Jika di lapangan teknisi mengganti function register HMI (misalnya dari FC03 ke FC04),
poller harus di-deploy ulang hanya untuk mengubah konstanta. Ini tidak ideal untuk sistem
produksi.

### Solusi: Kolom `register_function` di Tabel `hmis`

Simpan function register di level HMI (bukan per sensor) karena semua sensor dalam 1 HMI
selalu menggunakan function code yang sama — ini sesuai dengan arsitektur Haiwell D4.

#### Migration

```php
// database/migrations/xxxx_add_register_function_to_hmis.php

Schema::table('hmis', function (Blueprint $table) {
    $table->string('register_function', 2)
          ->default('03')
          ->after('port')
          ->comment('Modbus function code untuk baca register: 03=Holding, 04=Input');
});
```

#### Update `load_hmis()` di Poller

```python
def load_hmis(cursor) -> list[dict]:
    cursor.execute("""
        SELECT
            h.id            AS hmi_id,
            h.ip_address,
            h.port,
            h.register_function   -- ← tambah kolom ini
        FROM hmis h
        WHERE h.is_active IS TRUE
    """)
    rows = cursor.fetchall()
    if not rows:
        return []

    hmis: dict[int, dict] = {
        row[0]: {
            "hmi_id":            row[0],
            "ip_address":        row[1],
            "port":              row[2],
            "register_function": row[3] or "03",   -- ← default "03" jika null
            "sensors":           [],
        }
        for row in rows
    }
    # ... sisa query sensor tetap sama
```

#### Update `read_holding_register()` di Poller

Rename dan perluas fungsi untuk support FC03 dan FC04:

```python
def read_data_register(
    client: ModbusTcpClient,
    address: int,
    unit_id: int,
    func: str = "03",
) -> float:
    """
    Baca 1 data register dari HMI.
    func="03" → FC03 read_holding_registers (Holding Register)
    func="04" → FC04 read_input_registers   (Input Register)
    Nilai sudah dalam satuan aktual — tidak perlu scaling.
    Raise ModbusException jika gagal.
    """
    if func == "03":
        result = client.read_holding_registers(
            address=address, count=1, device_id=unit_id
        )
    elif func == "04":
        result = client.read_input_registers(
            address=address, count=1, device_id=unit_id
        )
    else:
        raise ModbusException(f"Function code '{func}' tidak didukung")

    if result.isError():
        raise ModbusException(
            f"Slave {unit_id} FC{func} register {address} returned error"
        )
    return float(result.registers[0])
```

#### Update `poll_hmi()` — Teruskan `register_function`

```python
def poll_hmi(hmi: dict, cursor, now) -> None:
    func = hmi["register_function"]   # ← ambil dari data HMI
    # ...
    try:
        temp      = read_data_register(client, regs["temp"],       unit_id, func)
        hum       = read_data_register(client, regs["hum"],        unit_id, func)
        over_temp = read_data_register(client, regs["over_temp"],  unit_id, func)
        under_temp= read_data_register(client, regs["under_temp"], unit_id, func)
        over_hum  = read_data_register(client, regs["over_hum"],   unit_id, func)
        under_hum = read_data_register(client, regs["under_hum"],  unit_id, func)
        # ... sisa logika tetap sama
```

#### Update Form Edit HMI di UI

Tambah 1 field dropdown **Function Register** di form tambah dan edit HMI:

```
FUNCTION REGISTER
┌──────────────────────────────────┐
│ 03: Holding Register         ▼  │
└──────────────────────────────────┘
  ○ 03: Holding Register (FC03) ← default untuk Haiwell D4
  ○ 04: Input Register   (FC04)
```

#### Update `HmiController` Validasi

```php
$request->validate([
    'name'              => 'required|string|max:255',
    'ip_address'        => 'required|ip',
    'port'              => 'required|integer|min:1|max:65535',
    'register_function' => 'required|in:03,04',
    'room_id'           => 'required|exists:rooms,id',
    'is_active'         => 'boolean',
]);
```

---

## 6. Ringkasan Semua Perubahan

### Database

| Tabel | Perubahan |
|---|---|
| `hmis` | Tambah kolom `register_function` (string, default `'03'`) |
| `sensors` | `modbus_address_temp` dan `modbus_address_hum` → nullable |
| `sensor_latest_data` | Tambah `alarm_temp`, `alarm_hum`, `alarm_disconnect` (sudah di plan sebelumnya) |

### Backend Laravel

| File | Perubahan |
|---|---|
| `HmiController.php` | `store()` tambah auto-create 4 sensor, validasi `register_function` |
| `SensorController.php` | `update()` hanya validasi `name` dan `unit_id` |
| `Hmi.php` (model) | Tambah `register_function` ke `fillable` dan `casts` |

### Frontend React

| File | Perubahan |
|---|---|
| `hmis/create.tsx` | Sederhanakan form, tambah dropdown `register_function` |
| `hmis/edit.tsx` | Sesuaikan form edit |
| `sensors/edit.tsx` | Hanya `name` dan `unit_id` editable, tampilkan konfigurasi read-only |
| `constants/sensor-map.ts` | File baru — konstanta `SENSOR_MAP` dan `COIL_MAP` untuk display |

### Poller Python

| Fungsi | Perubahan |
|---|---|
| `load_hmis()` | Tambah kolom `register_function` dari query `hmis` |
| `read_holding_register()` | Rename ke `read_data_register()`, support FC03 dan FC04 |
| `poll_hmi()` | Teruskan `func = hmi["register_function"]` ke `read_data_register()` |

---

## 7. Urutan Implementasi yang Disarankan

1. **Migration** — tambah `register_function` di `hmis`, nullable kolom di `sensors`
2. **Model** — update `Hmi.php` fillable dan casts
3. **HmiController** — update validasi + auto-create sensor
4. **SensorController** — sederhanakan validasi update
5. **Poller** — update `load_hmis()`, rename fungsi baca, update `poll_hmi()`
6. **Frontend** — update form HMI, buat `sensor-map.ts`, update form edit sensor
7. **Test** — tambah HMI baru dari UI, verifikasi 4 sensor terbuat, verifikasi poller
   baca dengan function register yang benar dari DB

---

## 8. Catatan Penting

**Satu sumber kebenaran untuk register map.** `SENSOR_MAP` dan `COIL_MAP` didefinisikan
di dua tempat: `poller.py` (Python) dan `constants/sensor-map.ts` (TypeScript). Ini adalah
konsekuensi dari arsitektur yang memisahkan poller dan frontend. Jika register map berubah
(misalnya teknisi update project HMI dengan alamat baru), kedua file harus diupdate
bersamaan. Pertimbangkan membuat catatan di komentar kedua file bahwa perubahan harus
disinkronkan.

**`register_function` adalah satu-satunya konfigurasi yang dinamis.** Semua konfigurasi
lain (alamat register, alamat coil) tetap konstan karena register map Haiwell D4 sudah
terdokumentasi dan tidak berubah selama project HMI tidak di-reprogram ulang. Jika suatu
saat teknisi reprogram project HMI dengan alamat berbeda, update `SENSOR_MAP` di poller
dan konstanta TypeScript adalah satu-satunya yang perlu diubah — tidak perlu perubahan DB
atau UI.

**Default `register_function = '03'`** sesuai kondisi aktual Haiwell D4 di sistem ini.
Migration menggunakan `default('03')` sehingga HMI yang sudah ada di DB tidak perlu
diupdate manual.
