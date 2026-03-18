# Saran Perubahan: Device Management — Arsitektur HMI-Centric

## Konteks

Setelah membaca semua file (`devices.tsx`, `HmiController.php`, `SensorController.php`,
dan 4 file migration), berikut kondisi aktual vs target yang perlu dicapai.

**Kondisi aktual:**
- Sensor dibuat manual — user input unit_id, function register, alamat reg suhu/hum, dan 3
  coil alarm satu per satu
- `SensorFormDialog` punya 7 field input yang sebagian besar sudah tidak relevan
- Tabel sensor di `HmiCard` masih tampilkan kolom Slave ID, Function, Reg. Suhu, Reg. Hum
- `HmiController@store` hanya buat HMI, sensor dibuat terpisah manual
- Migration `add_modbus_register_function_to_sensors_table` masih per-sensor (seharusnya per-HMI)
- Migration `add_alarm_coil_columns_to_sensors_table` masih ada meski COIL_MAP sudah konstan

**Target:**
- HMI tambah → 4 sensor otomatis terbuat
- Form sensor hanya edit nama + unit_id
- Konfigurasi register tampil read-only dari SENSOR_MAP/COIL_MAP
- `register_function` pindah ke tabel `hmis` (per-HMI, bukan per-sensor)
- Kolom coil di `sensors` di-drop karena sudah di-handle COIL_MAP konstan di poller

---

## 1. Perubahan Migration

### 1a. Tambah `register_function` ke tabel `hmis`

Buat migration baru:

```php
// database/migrations/xxxx_add_register_function_to_hmis_table.php

public function up(): void
{
    Schema::table('hmis', function (Blueprint $table) {
        $table->string('register_function', 2)
              ->default('03')
              ->after('port')
              ->comment('FC untuk baca data register: 03=Holding, 04=Input');
    });
}

public function down(): void
{
    Schema::table('hmis', function (Blueprint $table) {
        $table->dropColumn('register_function');
    });
}
```

**Mengapa di `hmis` bukan `sensors`?** Semua sensor dalam 1 HMI Haiwell D4 selalu
pakai function code yang sama karena register map-nya identik. Menyimpan per-sensor
hanya membuka peluang inkonsistensi (sensor 1 FC03, sensor 2 FC04 di HMI yang sama
— tidak mungkin terjadi di Haiwell D4).

**Default `'03'`** karena kondisi aktual sistem sudah pakai holding register (FC03).

### 1b. Rollback migration `add_modbus_register_function_to_sensors_table`

Migration `2026_03_18_111457_add_modbus_register_function_to_sensors_table.php` yang
sudah ada perlu di-rollback karena kolom ini sekarang pindah ke `hmis`.

```bash
php artisan migrate:rollback --path=database/migrations/2026_03_18_111457_add_modbus_register_function_to_sensors_table.php
```

Setelah rollback, file migration ini bisa dihapus dari project.

### 1c. Drop kolom coil dari `sensors`

Migration `2026_03_18_115049_add_alarm_coil_columns_to_sensors_table.php` sudah
dijalankan dan menambah `modbus_coil_alarm_temp`, `modbus_coil_alarm_hum`,
`modbus_coil_connection`. Kolom ini tidak dipakai poller (sudah di-handle `COIL_MAP`
konstan). Rollback migration ini:

```bash
php artisan migrate:rollback --path=database/migrations/2026_03_18_115049_add_alarm_coil_columns_to_sensors_table.php
```

### 1d. Nullable kolom alamat register di `sensors`

Kolom `modbus_address_temp` dan `modbus_address_hum` di migration awal
(`create_sensors_table`) adalah `unsignedInteger` (NOT NULL). Sekarang tidak dipakai
poller tapi masih ditampilkan di UI sebagai read-only dari SENSOR_MAP. Perlu di-nullable-kan:

```php
// database/migrations/xxxx_nullable_modbus_address_on_sensors_table.php

public function up(): void
{
    Schema::table('sensors', function (Blueprint $table) {
        $table->unsignedInteger('modbus_address_temp')->nullable()->change();
        $table->unsignedInteger('modbus_address_hum')->nullable()->change();
    });
}

public function down(): void
{
    Schema::table('sensors', function (Blueprint $table) {
        $table->unsignedInteger('modbus_address_temp')->nullable(false)->change();
        $table->unsignedInteger('modbus_address_hum')->nullable(false)->change();
    });
}
```

**Mengapa nullable bukan drop?** Kolom ini masih ditampilkan di UI (tabel sensor
di HmiCard) dan mungkin direferensikan di laporan. Nullable aman — data lama tetap
valid, sensor baru yang dibuat otomatis tidak perlu mengisinya.

---

## 2. Perubahan `HmiController.php`

### 2a. `store()` — tambah `register_function` dan auto-create 4 sensor

`StoreHmiRequest` perlu ditambah validasi `register_function`. Setelah HMI dibuat,
langsung buat 4 sensor dengan nama default.

```php
public function store(StoreHmiRequest $request): RedirectResponse
{
    $hmi = Hmi::create($request->validated());

    // Auto-create 4 sensor sesuai posisi Device_1..4 di HMI
    // unit_id default 1 — slave address standar Haiwell D4
    foreach (range(1, 4) as $position) {
        \App\Models\Sensor::create([
            'hmi_id'  => $hmi->id,
            'name'    => "Sensor {$position}",
            'unit_id' => 1,
        ]);
    }

    return redirect()->route('rooms.devices', $request->validated('room_id'));
}
```

### 2b. `StoreHmiRequest` — tambah validasi `register_function`

```php
// app/Http/Requests/StoreHmiRequest.php

public function rules(): array
{
    return [
        'room_id'           => ['required', 'integer', 'exists:rooms,id'],
        'name'              => ['required', 'string', 'max:255'],
        'ip_address'        => ['required', 'ip'],
        'port'              => ['required', 'integer', 'min:1', 'max:65535'],
        'register_function' => ['required', 'in:03,04'],
        'is_active'         => ['boolean'],
    ];
}
```

### 2c. `UpdateHmiRequest` — sama, tambah `register_function`

```php
// app/Http/Requests/UpdateHmiRequest.php

public function rules(): array
{
    return [
        'name'              => ['required', 'string', 'max:255'],
        'ip_address'        => ['required', 'ip'],
        'port'              => ['required', 'integer', 'min:1', 'max:65535'],
        'register_function' => ['required', 'in:03,04'],
        'is_active'         => ['boolean'],
    ];
}
```

---

## 3. Perubahan `SensorController.php`

Controller-nya sudah bersih — hanya perlu sesuaikan `UpdateSensorRequest` agar
hanya validasi `name` dan `unit_id`. `StoreSensorRequest` tidak perlu diubah
strukturnya karena store sekarang dilakukan otomatis dari `HmiController`, tapi
perlu disesuaikan jika form tambah sensor manual masih dipertahankan.

```php
// app/Http/Requests/UpdateSensorRequest.php

public function rules(): array
{
    return [
        'name'    => ['required', 'string', 'max:255'],
        'unit_id' => ['required', 'integer', 'min:1', 'max:247'],
        // Semua field lain (modbus_address_*, coil_*) dihapus dari validasi
        // karena tidak dikirim dari form lagi
    ];
}
```

`SensorController@store` tetap bisa dipertahankan untuk keperluan masa depan,
tapi tombol "Tambah Sensor" di UI perlu dipertimbangkan apakah masih ditampilkan
atau disembunyikan (lihat bagian 4).

---

## 4. Perubahan `devices.tsx`

Ini bagian terbesar. Ada 4 area yang perlu diubah.

### 4a. Interface — update `SensorItem` dan `HmiItem`

```typescript
// Hapus field yang tidak relevan lagi dari SensorItem
interface SensorItem {
    id: number;
    name: string;
    unit_id: number;
    // modbus_register_function dihapus — sekarang di HmiItem
    // modbus_address_temp/hum tetap ada untuk display read-only
    modbus_address_temp: number | null;
    modbus_address_hum: number | null;
    // modbus_coil_* dihapus — tidak ada di DB lagi
}

// Tambah register_function ke HmiItem
interface HmiItem {
    id: number;
    name: string;
    ip_address: string;
    port: number;
    register_function: '03' | '04';  // ← tambah
    is_active: boolean;
    sensors: SensorItem[];
}
```

### 4b. `HmiFormDialog` — tambah field `register_function`

Tambah state dan field dropdown di form HMI. Letakkan setelah field Port:

```typescript
// Tambah ke useForm
const { data, setData, ... } = useForm({
    room_id: roomId,
    name: hmi?.name ?? '',
    ip_address: hmi?.ip_address ?? '',
    port: hmi?.port?.toString() ?? '502',
    register_function: hmi?.register_function ?? '03',  // ← tambah
    is_active: hmi?.is_active ?? true,
});
```

```tsx
{/* Register Function — letakkan setelah Port/Status grid */}
<div className="flex flex-col gap-1.5">
    <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
        Function Register
    </Label>
    <div className="grid grid-cols-2 gap-2">
        {(['03', '04'] as const).map((fc) => (
            <button
                key={fc}
                type="button"
                onClick={() => setData('register_function', fc)}
                className={`flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ${
                    data.register_function === fc
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-600 bg-slate-800/80 text-slate-400'
                }`}
            >
                {fc === '03' ? '03: Holding Register' : '04: Input Register'}
            </button>
        ))}
    </div>
    {errors.register_function && (
        <span className="text-xs text-red-400">{errors.register_function}</span>
    )}
</div>
```

### 4c. `SensorFormDialog` — refactor total

Form ini perlu dibagi jadi dua mode yang jelas berbeda:

**Mode Tambah (isEdit = false):** Pertimbangkan untuk dihapus atau disembunyikan
tombol "Tambah Sensor" di `HmiCard`, karena sensor sekarang dibuat otomatis. Jika
tetap dipertahankan untuk kasus khusus, form tambah cukup minta nama saja.

**Mode Edit (isEdit = true):** Form edit yang dipakai operator sehari-hari.
Hanya 2 field editable + 1 read-only info block.

```typescript
// useForm yang disederhanakan
const { data, setData, put, processing, errors, reset } = useForm({
    hmi_id: hmiId,
    name: sensor?.name ?? '',
    unit_id: sensor?.unit_id?.toString() ?? '1',
    // Semua field modbus_* dihapus dari form state
});
```

```tsx
<form onSubmit={submit} className="flex flex-col gap-4">
    {/* 1. Nama Sensor — editable */}
    <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
            Nama Sensor
        </Label>
        <Input
            value={data.name}
            onChange={(e) => setData('name', e.target.value)}
            placeholder="SENSOR-01"
            className="border-slate-600 bg-slate-800/80 text-white ..."
        />
        {errors.name && <span className="text-xs text-red-400">{errors.name}</span>}
    </div>

    {/* 2. Unit ID — editable */}
    <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
            Slave ID (Unit ID)
        </Label>
        <Input
            type="number"
            min={1}
            max={247}
            value={data.unit_id}
            onChange={(e) => setData('unit_id', e.target.value)}
            className="border-slate-600 bg-slate-800/80 text-white ..."
        />
        {errors.unit_id && <span className="text-xs text-red-400">{errors.unit_id}</span>}
    </div>

    {/* 3. Info konfigurasi aktif — READ ONLY, dari SENSOR_MAP/COIL_MAP */}
    {isEdit && sensor && <SensorConfigInfo sensor={sensor} hmi={hmi} />}

    <DialogFooter>...</DialogFooter>
</form>
```

Komponen `SensorConfigInfo` menampilkan konfigurasi read-only:

```tsx
// Konstanta ini harus sama persis dengan SENSOR_MAP dan COIL_MAP di poller.py
// Jika register map berubah, update KEDUA file sekaligus.
const SENSOR_MAP = {
    1: { temp: 9,  hum: 11, over_temp: 17, under_temp: 19, over_hum: 21, under_hum: 23 },
    2: { temp: 33, hum: 35, over_temp: 41, under_temp: 43, over_hum: 45, under_hum: 47 },
    3: { temp: 57, hum: 59, over_temp: 65, under_temp: 67, over_hum: 69, under_hum: 71 },
    4: { temp: 81, hum: 83, over_temp: 89, under_temp: 91, over_hum: 93, under_hum: 95 },
} as const;

const COIL_MAP = {
    1: { alarm_temp: 1,  alarm_hum: 2,  connection: 10 },
    2: { alarm_temp: 3,  alarm_hum: 4,  connection: 11 },
    3: { alarm_temp: 5,  alarm_hum: 6,  connection: 12 },
    4: { alarm_temp: 7,  alarm_hum: 8,  connection: 13 },
} as const;

function SensorConfigInfo({
    position,   // 1-based, index sensor dalam HMI
    registerFunction,  // dari hmi.register_function
}: {
    position: number;
    registerFunction: '03' | '04';
}) {
    const regs  = SENSOR_MAP[position as keyof typeof SENSOR_MAP];
    const coils = COIL_MAP[position  as keyof typeof COIL_MAP];

    if (!regs || !coils) return null;

    const fcLabel = registerFunction === '03'
        ? 'FC03 — Holding Register'
        : 'FC04 — Input Register';

    return (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                {/* Lock icon */}
                Konfigurasi Register Aktif
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-500">Posisi di HMI</span>
                <span className="font-mono text-slate-300">Device {position}</span>

                <span className="text-slate-500">Function Code</span>
                <span className="font-mono text-slate-300">{fcLabel}</span>

                <span className="text-slate-500">Reg. Suhu</span>
                <span className="font-mono text-cyan-400">{regs.temp}</span>

                <span className="text-slate-500">Reg. Hum</span>
                <span className="font-mono text-blue-400">{regs.hum}</span>

                <span className="text-slate-500">Coil Alarm Suhu</span>
                <span className="font-mono text-slate-300">{coils.alarm_temp} (FC01)</span>

                <span className="text-slate-500">Coil Alarm Hum</span>
                <span className="font-mono text-slate-300">{coils.alarm_hum} (FC01)</span>

                <span className="text-slate-500">Coil Koneksi</span>
                <span className="font-mono text-slate-300">{coils.connection} (FC01)</span>
            </div>
        </div>
    );
}
```

**Cara menentukan `position`** — posisi sensor adalah index-nya dalam array
`hmi.sensors` (1-based). Saat `SensorFormDialog` dipanggil dari `HmiCard`, perlu
diteruskan posisi sensor:

```typescript
// Di HmiCard — saat render sensor list
hmi.sensors.map((sensor, index) => (
    // index + 1 = posisi 1-based
    <button onClick={() => setEditSensor({ ...sensor, position: index + 1 })}>
```

Interface `SensorItem` perlu tambah field `position` yang di-derive di frontend
(tidak perlu disimpan di DB).

### 4d. Tabel sensor di `HmiCard` — update kolom

Tabel sekarang tampilkan: Slave ID, Function, Reg. Suhu, Reg. Hum.
Dengan arsitektur baru, Function Register pindah ke level HMI dan Reg. Suhu/Hum
tampil dari SENSOR_MAP berdasarkan posisi.

**Perubahan yang disarankan:**

Hapus kolom "Function" dari tabel sensor — sudah ditampilkan di header HMI card.
Ganti kolom "Reg. Suhu" dan "Reg. Hum" dengan nilai dari SENSOR_MAP (read-only,
otomatis berdasarkan posisi):

```tsx
// Header HMI card — tampilkan register_function di sini
<span className="rounded-full border border-slate-600/80 px-2 py-0.5 text-[10px]">
    FC{hmi.register_function}
</span>

// Tabel sensor — kolom yang tersisa
<TableHead>Nama Sensor</TableHead>
<TableHead>Slave ID</TableHead>
<TableHead>Reg. Suhu</TableHead>   {/* dari SENSOR_MAP[index+1].temp */}
<TableHead>Reg. Hum</TableHead>    {/* dari SENSOR_MAP[index+1].hum */}
<TableHead>Aksi</TableHead>

// Row sensor
{hmi.sensors.map((sensor, index) => {
    const position = index + 1;
    const regs = SENSOR_MAP[position as keyof typeof SENSOR_MAP];
    return (
        <TableRow key={sensor.id}>
            <TableCell>{sensor.name}</TableCell>
            <TableCell>{sensor.unit_id}</TableCell>
            <TableCell className="text-cyan-300">{regs?.temp ?? '—'}</TableCell>
            <TableCell className="text-blue-300">{regs?.hum ?? '—'}</TableCell>
            <TableCell>/* tombol edit & hapus */</TableCell>
        </TableRow>
    );
})}
```

---

## 5. Perubahan Model `Hmi.php`

Tambah `register_function` ke `fillable` dan `casts`:

```php
protected $fillable = [
    'room_id',
    'name',
    'ip_address',
    'port',
    'register_function',  // ← tambah
    'is_active',
];

protected function casts(): array
{
    return [
        'port'      => 'integer',
        'is_active' => 'boolean',
        // register_function tidak perlu cast — sudah string
    ];
}
```

---

## 6. Perubahan `DashboardController` — sertakan `register_function`

Jika `register_function` perlu diteruskan ke frontend via Inertia (misalnya untuk
display di halaman lain), tambahkan ke select di eager loading:

```php
'hmis' => fn ($q) => $q->select(['id', 'room_id', 'name', 'ip_address', 'port',
                                   'register_function', 'is_active']),
```

---

## 7. Urutan Implementasi

Ikuti urutan ini untuk menghindari breaking change:

```
1. Rollback 2 migration terakhir (coil + register_function per sensor)
2. Jalankan migration baru:
   - add register_function ke hmis
   - nullable modbus_address_temp/hum di sensors
3. Update model Hmi.php (fillable + casts)
4. Update StoreHmiRequest + UpdateHmiRequest (tambah register_function)
5. Update HmiController@store (auto-create 4 sensor)
6. Update UpdateSensorRequest (hapus field yang tidak relevan)
7. Update devices.tsx:
   a. Update interface SensorItem dan HmiItem
   b. Tambah field register_function di HmiFormDialog
   c. Refactor SensorFormDialog (hapus field, tambah SensorConfigInfo)
   d. Update tabel sensor di HmiCard
8. Update poller.py (sudah selesai di sesi sebelumnya):
   - load_hmis() tambah register_function dari hmis
   - read_holding_register() → read_data_register() support FC03/FC04
```

---

## 8. Catatan Penting

**Tombol "Tambah Sensor" di HmiCard** — dengan auto-create 4 sensor, tombol ini
secara teknis tidak dibutuhkan lagi untuk flow normal. Pertimbangkan dua opsi:
- Sembunyikan tombol sepenuhnya jika yakin 1 HMI = selalu 4 sensor
- Pertahankan sebagai escape hatch dengan form yang sudah disederhanakan (hanya nama)
  untuk kasus di mana sensor perlu ditambah manual karena suatu alasan

**Satu sumber kebenaran yang terpecah** — `SENSOR_MAP` dan `COIL_MAP` ada di dua
tempat: `poller.py` (Python) dan `devices.tsx` (TypeScript). Ini tidak bisa dihindari
dengan arsitektur saat ini. Tambahkan komentar di kedua file:

```python
# PENTING: SENSOR_MAP dan COIL_MAP ini harus sinkron dengan
# konstanta di resources/js/pages/rooms/devices.tsx
# Jika register map berubah, update KEDUA file sekaligus.
```

```typescript
// PENTING: Konstanta ini harus sinkron dengan SENSOR_MAP dan COIL_MAP
// di poller.py. Jika register map berubah, update KEDUA file sekaligus.
```

**`unit_id` di tabel `sensors`** — migration awal (`create_sensors_table`) tidak
menyertakan kolom `unit_id`, tapi `SensorItem` di frontend dan query poller
menggunakannya. Pastikan kolom ini sudah ada di DB — kemungkinan ditambahkan di
migration lain yang tidak disertakan dalam file yang dibagikan.
