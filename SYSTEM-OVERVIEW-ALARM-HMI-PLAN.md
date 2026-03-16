# Ringkasan Sistem & Plan Fitur Baca Alarm dari HMI

## 1) Ringkasan Keseluruhan Sistem

Sistem ini adalah dashboard monitoring suhu dan kelembapan berbasis Laravel + Inertia React dengan proses polling Modbus terpisah di Python.

Arsitektur utama:

1. HMI (Modbus TCP) menyimpan register data lapangan.
2. `poller.py` membaca register per sensor dari HMI, lalu menulis hasil terbaru ke database (`sensor_latest_data`).
3. Laravel membaca data terbaru + data agregasi historis, lalu render ke UI React (Inertia).
4. Scheduler Laravel membuat data historis periodik dan membersihkan data lama.

## 2) Komponen Inti

### Backend (Laravel 12)

- Routing web: `routes/web.php`
- Routing scheduler/command: `routes/console.php`
- Dashboard utama: `app/Http/Controllers/DashboardController.php`
- Manajemen master data: `RoomController`, `HmiController`, `SensorController`
- Model inti: `Room`, `Hmi`, `Sensor`, `SensorLatestData`, `SensorLog`, `SensorReading`

### Poller Hardware (Python)

- File: `poller.py`
- Fungsi utama:
  - Load HMI aktif + sensor dari DB.
  - Baca register suhu dan kelembapan via Modbus TCP.
  - Hitung status (`NORMAL`, `WARNING`, `CRITICAL`) berbasis threshold room.
  - Upsert ke `sensor_latest_data`.
  - Jika koneksi/register gagal, set sensor/HMI terkait menjadi `OFFLINE`.

### Frontend (Inertia + React)

- Halaman: `resources/js/pages/dashboard.tsx`, `rooms/*`, `logs/*`
- Data dashboard dikirim dari `DashboardController@index` (room summary, sensor detail, chart logs, active alarms).

## 3) Alur Data End-to-End (Saat Ini)

1. User set Room/HMI/Sensor dari panel Laravel.
2. `poller.py` melakukan polling tiap beberapa detik.
3. Data terbaru tersimpan di `sensor_latest_data` (1 baris per sensor).
4. Command terjadwal membuat data historis:
   - `aggregate:sensor-readings` (per menit)
   - `aggregate:room-logs` (per 15 menit)
   - `purge:old-logs` (harian)
5. Dashboard menarik data Eloquent eager loading dan menampilkan:
   - nilai latest per sensor,
   - status room hasil agregasi status sensor,
   - jumlah alarm aktif dari status `WARNING`/`CRITICAL`.

## 4) Kondisi Alarm Saat Ini

Alarm saat ini bersifat turunan dari angka suhu/kelembapan terhadap threshold room:

- `NORMAL`: masih di bawah batas.
- `WARNING`: melewati batas.
- `CRITICAL`: melewati 2x batas.
- `OFFLINE`: pembacaan gagal/koneksi putus.

Implementasi ini ada di sisi poller (`compute_status`) dan dikonsumsi dashboard dari kolom `status` di `sensor_latest_data`.

## 5) Gap untuk Fitur "Baca Alarm dari HMI"

Saat ini belum ada pembacaan alarm bit/register dedicated dari HMI (misal coil/discrete/input register alarm). Artinya status alarm masih inferensi dari nilai analog, belum memakai alarm native dari PLC/HMI.

## 6) Plan Implementasi Fitur Baca Alarm dari HMI

Berikut plan yang disarankan agar aman, bertahap, dan minim gangguan produksi.

### Fase A - Discovery Register Alarm

1. Tentukan sumber alarm di HMI:
   - jenis register (`coil`, `discrete input`, `input register`, atau `holding register`),
   - alamat register alarm per sensor/per HMI,
   - format nilai (0/1, bitmask, multi-bit severity).
2. Definisikan mapping severity alarm ke status aplikasi:
   - Contoh: `0=NONE`, `1=WARNING`, `2=CRITICAL`.
3. Tentukan prioritas sumber status:
   - Opsi 1: alarm HMI override threshold logic.
   - Opsi 2: gabungan (ambil severity tertinggi antara alarm-HMI dan threshold).

Output fase ini:

- Dokumen mapping register alarm yang final.

### Fase B - Perubahan Skema Data

1. Tambah kolom alarm source di `sensor_latest_data` (migration baru), contoh:
   - `alarm_code` (nullable int/string)
   - `alarm_active` (boolean)
   - `alarm_source` (enum/string: `threshold` / `hmi` / `combined`)
2. Update model `SensorLatestData`:
   - `fillable` dan `casts` untuk kolom baru.
3. Jika alarm register spesifik per sensor, pertimbangkan tambah metadata di `sensors`:
   - `modbus_address_alarm`
   - `alarm_register_type`
   - `alarm_bit_index` (jika bitmask)

Output fase ini:

- Struktur DB siap menampung data alarm native HMI.

### Fase C - Update Poller Python

1. Perluas query loader sensor agar ikut menarik metadata alamat alarm.
2. Tambahkan fungsi baca register alarm sesuai tipe register.
3. Implementasi parser alarm value -> severity aplikasi.
4. Tentukan strategi fallback:
   - jika baca alarm gagal tapi suhu/kelembapan sukses, tetap simpan data analog,
   - status alarm fallback sesuai kebijakan (misalnya `threshold` atau `UNKNOWN`).
5. Update UPSERT agar menulis kolom alarm baru.
6. Logging terstruktur untuk memudahkan debugging alarm mismatch.

Output fase ini:

- Poller mampu membaca alarm langsung dari HMI dan menyimpan hasilnya.

### Fase D - Integrasi Dashboard & API

1. Update query select di `DashboardController` agar include field alarm baru.
2. Update payload sensor/room:
   - status alarm final,
   - optional badge sumber alarm (`HMI` vs `Threshold`).
3. Update hitungan `active_alarms` memakai status final yang disepakati.
4. (Opsional) tampilkan detail alarm code pada UI detail room/sensor.

Output fase ini:

- UI menampilkan alarm berbasis data native HMI secara konsisten.

### Fase E - Validasi & Testing

1. Test unit/feature backend:
   - mapping alarm code -> status,
   - agregasi status room,
   - hitung alarm aktif.
2. Test integrasi poller dengan simulator/dev HMI:
   - kondisi normal,
   - warning,
   - critical,
   - koneksi putus.
3. Uji regresi dashboard dan command scheduler.
4. Monitoring awal setelah deploy:
   - bandingkan alarm HMI vs threshold selama masa observasi.

Output fase ini:

- Fitur tervalidasi dan aman dipakai produksi.

## 7) Dampak File (Perkiraan)

- `database/migrations/*` (kolom alarm baru)
- `app/Models/Sensor.php` (jika metadata alarm disimpan per sensor)
- `app/Models/SensorLatestData.php`
- `poller.py`
- `app/Http/Controllers/DashboardController.php`
- `resources/js/pages/dashboard.tsx` (dan/atau halaman room detail)
- `tests/Feature/*` dan/atau `tests/Unit/*`

## 8) Catatan Teknis Penting

1. Data environment saat ini menunjukkan database engine PostgreSQL. Pastikan semua migration/SQL tetap kompatibel PostgreSQL.
2. Dokumen lama masih menyebut MySQL di beberapa bagian, jadi gunakan kondisi aktual runtime sebagai acuan implementasi.
3. Untuk transisi aman, disarankan release bertahap:
   - release 1: simpan data alarm HMI tanpa mengubah tampilan status,
   - release 2: aktifkan status final berbasis alarm HMI/combined.

## 9) Definition of Done (Fitur Alarm HMI)

Fitur dinyatakan selesai jika:

1. Poller membaca alarm register dari HMI secara stabil.
2. Data alarm tersimpan di DB dengan field yang jelas dan terdokumentasi.
3. Dashboard menampilkan status alarm sesuai kebijakan final.
4. Test otomatis utama lulus.
5. Tidak ada regresi pada alur monitoring suhu/kelembapan yang sudah berjalan.
