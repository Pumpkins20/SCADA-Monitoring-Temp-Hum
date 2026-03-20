# Plan: Flow Connect → Preview → Confirm HMI

## Gambaran Besar

Flow baru menggantikan pendekatan lama di mana user harus input konfigurasi register
secara manual. Sekarang user cukup input IP, Port, dan Function Register — sistem yang
baca dan tampilkan semua data dari HMI secara otomatis sebelum dikonfirmasi.

```
Input IP + Port + FC  →  Connect & Preview  →  Poller baca 1 siklus
        →  Data muncul di UI  →  User cross-check  →  Konfirmasi Aktifkan
```

---

## Flow Detail

### Step 1 — User Input & Connect

User membuka dialog "Tambah HMI", isi 3 field:
- Nama HMI
- Alamat IP
- Port (default 502)
- Function Register (FC03 atau FC04)

Klik tombol **"Connect & Preview"**.

### Step 2 — Laravel Simpan HMI (is_active=false, is_preview=true)

`HmiController@store` menerima request, simpan HMI dengan status:
- `is_active = false` — HMI belum aktif untuk monitoring normal
- `is_preview = true` — flag untuk poller agar tetap baca HMI ini

Sekaligus auto-create 4 sensor dengan nama default `Sensor 1..4`.

### Step 3 — Poller Baca HMI Preview

Poller yang jalan setiap 5 detik membaca semua HMI dengan kondisi:
```sql
WHERE is_active = TRUE OR is_preview = TRUE
```

Data suhu, hum, threshold, dan alarm dari HMI disimpan ke `sensor_latest_data`
seperti biasa.

### Step 4 — UI Polling Sampai Data Tersedia

Setelah HMI disimpan, dialog beralih ke mode **Preview**. UI melakukan polling ke
endpoint Laravel setiap 2 detik untuk cek apakah data sudah tersedia di DB:

```
GET /hmis/{hmi}/preview-data
```

Maksimal menunggu 15 detik (3 siklus poller). Jika lewat 15 detik data belum muncul,
tampilkan pesan error koneksi HMI gagal.

### Step 5 — Preview Data Tampil

Setelah data tersedia, UI menampilkan preview 4 sensor dalam format card:

```
┌─────────────────────────────────────────────────────┐
│  Preview Data HMI — 192.168.1.10:502                │
│  ✓ Data berhasil dibaca dari HMI                    │
├──────────────┬──────────────┬──────────────┬────────┤
│  Sensor 1    │  Sensor 2    │  Sensor 3    │Sensor 4│
│  24.5 °C     │  23.8 °C     │  25.1 °C     │ 24.0°C │
│  61.2 %RH    │  59.8 %RH    │  62.0 %RH    │ 60.5%  │
│  Over: 28°C  │  Over: 28°C  │  Over: 28°C  │ 28°C   │
│  Under: 18°C │  Under: 18°C │  Under: 18°C │ 18°C   │
└──────────────┴──────────────┴──────────────┴────────┘

          [Batalkan]        [Aktifkan HMI]
```

User bisa rename sensor langsung dari tampilan ini sebelum konfirmasi.

### Step 6 — User Konfirmasi

Klik **"Aktifkan HMI"** → Laravel update:
- `is_active = true`
- `is_preview = false`

HMI sekarang masuk siklus polling normal. Poller otomatis lanjut baca tanpa restart.

### Step 6b — User Batalkan

Klik **"Batalkan"** → Laravel hapus HMI dan 4 sensor yang baru dibuat
(cascade delete). Tidak ada data yang tertinggal di DB.

---

## Perubahan yang Diperlukan

### Database — Migration Baru

```php
// database/migrations/xxxx_add_is_preview_to_hmis_table.php

public function up(): void
{
    Schema::table('hmis', function (Blueprint $table) {
        $table->boolean('is_preview')
              ->default(false)
              ->after('is_active')
              ->comment('True = HMI sedang dalam mode preview, poller baca tapi tidak ditampilkan di dashboard');
    });
}

public function down(): void
{
    Schema::table('hmis', function (Blueprint $table) {
        $table->dropColumn('is_preview');
    });
}
```

### Model `Hmi.php`

Tambah `is_preview` ke `fillable` dan `casts`:

```php
protected $fillable = [
    'room_id',
    'name',
    'ip_address',
    'port',
    'register_function',
    'is_active',
    'is_preview',   // ← tambah
];

protected function casts(): array
{
    return [
        'port'       => 'integer',
        'is_active'  => 'boolean',
        'is_preview' => 'boolean',  // ← tambah
    ];
}
```

### `HmiController.php` — 3 Method Baru/Update

#### `store()` — simpan dengan is_preview=true

```php
public function store(StoreHmiRequest $request): JsonResponse
{
    // Return JSON bukan redirect — karena flow sekarang via dialog async
    $hmi = Hmi::create([
        ...$request->validated(),
        'is_active'  => false,
        'is_preview' => true,
    ]);

    foreach (range(1, 4) as $position) {
        Sensor::create([
            'hmi_id'  => $hmi->id,
            'name'    => "Sensor {$position}",
            'unit_id' => 1,
        ]);
    }

    return response()->json([
        'hmi_id'  => $hmi->id,
        'message' => 'HMI disimpan, menunggu data dari poller...',
    ]);
}
```

Mengapa return JSON? Karena setelah store, UI tidak redirect — melainkan masuk ke
mode polling untuk menunggu data preview. Inertia `post()` perlu diganti `fetch()`
biasa atau Inertia dengan `preserveState: true`.

#### `previewData()` — endpoint polling UI

```php
public function previewData(Hmi $hmi): JsonResponse
{
    // Pastikan HMI ini memang dalam mode preview
    if (! $hmi->is_preview) {
        return response()->json(['ready' => false, 'sensors' => []]);
    }

    $sensors = $hmi->sensors()->with('latestData')->get();

    // Cek apakah sudah ada data yang masuk dari poller
    $hasData = $sensors->every(
        fn ($s) => $s->latestData !== null
    );

    return response()->json([
        'ready'   => $hasData,
        'sensors' => $sensors->map(fn ($s) => [
            'id'          => $s->id,
            'name'        => $s->name,
            'temperature' => $s->latestData?->temperature,
            'humidity'    => $s->latestData?->humidity,
            'status'      => $s->latestData?->status,
            'alarm_temp'  => $s->latestData?->alarm_temp,
            'alarm_hum'   => $s->latestData?->alarm_hum,
        ])->values(),
    ]);
}
```

#### `confirm()` — aktifkan HMI setelah user konfirmasi

```php
public function confirm(Request $request, Hmi $hmi): JsonResponse
{
    // Update nama sensor jika user rename di preview
    $sensorNames = $request->input('sensor_names', []);
    foreach ($sensorNames as $sensorId => $name) {
        $hmi->sensors()->where('id', $sensorId)->update(['name' => $name]);
    }

    $hmi->update([
        'is_active'  => true,
        'is_preview' => false,
    ]);

    return response()->json([
        'success' => true,
        'message' => 'HMI berhasil diaktifkan.',
    ]);
}

#### `cancelPreview()` — batalkan dan hapus HMI

```php
public function cancelPreview(Hmi $hmi): JsonResponse
{
    // Pastikan hanya HMI preview yang bisa dibatalkan
    if (! $hmi->is_preview) {
        return response()->json(['success' => false], 403);
    }

    $roomId = $hmi->room_id;
    $hmi->delete(); // cascade hapus 4 sensor

    return response()->json([
        'success' => true,
        'room_id' => $roomId,
    ]);
}
```

### Routes Baru

```php
// routes/web.php

Route::post('/hmis', [HmiController::class, 'store']);
Route::get('/hmis/{hmi}/preview-data', [HmiController::class, 'previewData']);
Route::post('/hmis/{hmi}/confirm', [HmiController::class, 'confirm']);
Route::delete('/hmis/{hmi}/cancel-preview', [HmiController::class, 'cancelPreview']);
Route::put('/hmis/{hmi}', [HmiController::class, 'update']);
Route::delete('/hmis/{hmi}', [HmiController::class, 'destroy']);
Route::post('/hmis/test-connection', [HmiController::class, 'testConnection']);
```

### `poller.py` — Update `load_hmis()`

Satu baris yang berubah — tambah kondisi `OR is_preview IS TRUE`:

```python
cursor.execute("""
    SELECT
        h.id            AS hmi_id,
        h.ip_address,
        h.port,
        h.register_function,
        h.is_preview                -- ← tambah untuk logging
    FROM hmis h
    WHERE h.is_active IS TRUE
       OR h.is_preview IS TRUE      -- ← tambah kondisi ini
""")

# Di dict hmis, tambah flag is_preview
hmis: dict[int, dict] = {
    row[0]: {
        "hmi_id":            row[0],
        "ip_address":        row[1],
        "port":              row[2],
        "register_function": row[3] or "03",
        "is_preview":        row[4],   # ← tambah
        "sensors":           [],
    }
    for row in rows
}
```

Tambah log yang berbeda untuk HMI preview agar mudah dibedakan di log output:

```python
# Di poll_hmi(), setelah log.info OK/OFFLINE
if hmi.get("is_preview"):
    log.info(
        "HMI %d (%s) [PREVIEW MODE] — data tersimpan untuk preview UI",
        hmi["hmi_id"], hmi["ip_address"],
    )
```

### `DashboardController.php` — Filter HMI Preview

Dashboard tidak boleh menampilkan HMI yang masih dalam mode preview. Tambah filter:

```php
$rooms = Room::with([
    // Tambah filter — hanya HMI yang sudah aktif dan bukan preview
    'hmis' => fn ($q) => $q->where('is_active', true)
                            ->where('is_preview', false),
    'hmis.sensors' => fn ($q) => $q->select(['id', 'hmi_id', 'name']),
    'hmis.sensors.latestData' => fn ($q) => $q->select([...]),
])
->select([...])
->get();
```

Hal yang sama berlaku di `show()` method jika ada.

### `devices.tsx` — Update Dialog HMI

Ini perubahan terbesar di frontend. `HmiFormDialog` perlu 3 fase tampilan:

```
Fase 1: FORM    → user input IP, Port, FC, Nama
Fase 2: WAITING → spinner, menunggu poller baca (polling setiap 2 detik)
Fase 3: PREVIEW → tampilkan data 4 sensor, user rename, konfirmasi
```

#### State management

```typescript
type DialogPhase = 'form' | 'waiting' | 'preview';

function HmiFormDialog({ open, onOpenChange, roomId }) {
    const [phase, setPhase] = useState<DialogPhase>('form');
    const [hmiId, setHmiId] = useState<number | null>(null);
    const [previewData, setPreviewData] = useState<PreviewSensor[]>([]);
    const [sensorNames, setSensorNames] = useState<Record<number, string>>({});
    const [waitElapsed, setWaitElapsed] = useState(0);
    const PREVIEW_TIMEOUT = 15; // detik

    // ... polling logic
}
```

#### Polling logic setelah store

```typescript
async function startPolling(hmiId: number) {
    setPhase('waiting');
    setWaitElapsed(0);

    const interval = setInterval(async () => {
        setWaitElapsed(prev => {
            if (prev >= PREVIEW_TIMEOUT) {
                clearInterval(interval);
                // Timeout — batalkan HMI, tampilkan error
                handleCancel(hmiId);
                return prev;
            }
            return prev + 2;
        });

        const res = await fetch(`/hmis/${hmiId}/preview-data`);
        const json = await res.json();

        if (json.ready) {
            clearInterval(interval);
            setPreviewData(json.sensors);
            // Init nama sensor dari data yang datang
            const names: Record<number, string> = {};
            json.sensors.forEach((s: PreviewSensor) => {
                names[s.id] = s.name;
            });
            setSensorNames(names);
            setPhase('preview');
        }
    }, 2000);
}
```

#### Tampilan fase WAITING

```tsx
{phase === 'waiting' && (
    <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <div className="text-center">
            <p className="text-sm font-medium text-white">
                Menunggu data dari HMI...
            </p>
            <p className="text-xs text-slate-400">
                Poller sedang membaca register. Maksimal {PREVIEW_TIMEOUT} detik.
            </p>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
            <div
                className="h-full bg-cyan-500 transition-all duration-1000"
                style={{ width: `${(waitElapsed / PREVIEW_TIMEOUT) * 100}%` }}
            />
        </div>
        <Button
            type="button"
            variant="ghost"
            onClick={() => handleCancel(hmiId!)}
            className="text-slate-400"
        >
            Batalkan
        </Button>
    </div>
)}
```

#### Tampilan fase PREVIEW

```tsx
{phase === 'preview' && (
    <div className="flex flex-col gap-4">
        {/* Status badge */}
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30
                        bg-green-500/10 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-xs text-green-400">
                Data berhasil dibaca dari HMI
            </span>
        </div>

        {/* Grid 4 sensor */}
        <div className="grid grid-cols-2 gap-2">
            {previewData.map((sensor) => (
                <div key={sensor.id}
                     className="rounded-lg border border-slate-700/60
                                bg-slate-900/60 p-3">
                    {/* Nama sensor — editable */}
                    <Input
                        value={sensorNames[sensor.id] ?? sensor.name}
                        onChange={(e) => setSensorNames(prev => ({
                            ...prev,
                            [sensor.id]: e.target.value,
                        }))}
                        className="mb-2 h-7 border-slate-600 bg-slate-800
                                   text-xs text-white"
                    />
                    {/* Data */}
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Suhu</span>
                        <span className="font-mono text-cyan-300">
                            {sensor.temperature ?? '—'} °C
                        </span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Hum</span>
                        <span className="font-mono text-blue-300">
                            {sensor.humidity ?? '—'} %RH
                        </span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Status</span>
                        <span className={`font-mono text-xs font-semibold ${
                            sensor.status === 'NORMAL'   ? 'text-green-400' :
                            sensor.status === 'WARNING'  ? 'text-amber-400' :
                            sensor.status === 'CRITICAL' ? 'text-red-400'   :
                                                           'text-slate-500'
                        }`}>
                            {sensor.status ?? 'OFFLINE'}
                        </span>
                    </div>
                </div>
            ))}
        </div>

        {/* Footer */}
        <DialogFooter>
            <Button
                type="button"
                variant="ghost"
                onClick={() => handleCancel(hmiId!)}
                className="text-slate-400"
            >
                Batalkan
            </Button>
            <Button
                type="button"
                onClick={() => handleConfirm(hmiId!)}
                className="bg-cyan-600 text-white hover:bg-cyan-500"
            >
                Aktifkan HMI
            </Button>
        </DialogFooter>
    </div>
)}
```

---

## Ringkasan Semua File yang Berubah

| File | Perubahan |
|---|---|
| `migrations/xxxx_add_is_preview_to_hmis` | Migration baru — kolom `is_preview` |
| `app/Models/Hmi.php` | Tambah `is_preview` ke fillable + casts |
| `app/Http/Controllers/HmiController.php` | Update `store()`, tambah `previewData()`, `confirm()`, `cancelPreview()` |
| `app/Http/Requests/StoreHmiRequest.php` | Tambah `register_function` |
| `routes/web.php` | Tambah route `preview-data`, `confirm`, `cancel-preview` |
| `poller.py` | Update `load_hmis()` — query tambah `OR is_preview IS TRUE` |
| `app/Http/Controllers/DashboardController.php` | Filter HMI preview dari query dashboard |
| `resources/js/pages/rooms/devices.tsx` | Refactor `HmiFormDialog` — 3 fase (form/waiting/preview) |

---

## Catatan Edge Case

**Poller mati saat user di fase WAITING** — UI akan timeout setelah 15 detik dan
otomatis cancel (hapus HMI). User perlu pastikan poller berjalan sebelum tambah HMI.
Pertimbangkan tampilkan status poller di halaman devices sebagai indikator.

**User tutup browser saat fase WAITING** — HMI dengan `is_preview=true` dan
`is_active=false` akan tertinggal di DB. Perlu scheduler Laravel yang membersihkan
HMI preview yang sudah lebih dari N menit (misalnya 5 menit):

```php
// routes/console.php atau Kernel.php
Schedule::call(function () {
    Hmi::where('is_preview', true)
        ->where('updated_at', '<', now()->subMinutes(5))
        ->delete(); // cascade hapus sensor
})->everyFiveMinutes();
```

**HMI preview tidak muncul di dashboard** — sudah di-handle dengan filter
`where('is_preview', false)` di `DashboardController`. Operator tidak akan
melihat data preview yang belum dikonfirmasi.
