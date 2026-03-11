# Blueprint Fitur Manajemen Perangkat (Modular / Tree-View)

**Tujuan:** Membangun antarmuka CRUD untuk mengelola Hierarki SCADA (Ruangan -> HMI -> Sensor) yang *scalable*, mudah di- *maintenance* oleh teknisi lapangan, dan memiliki fitur *Test Connection* Modbus TCP.

---

## 1. Konsep UI/UX (Modular Master-Detail)

Sistem tidak menggunakan alur *Wizard* berurutan, melainkan menggunakan navigasi berbasis hierarki (Pohon).

### Level 1: Halaman Master (Daftar Ruangan)
* **Tampilan:** Tabel atau barisan Kartu (*Cards*) berisi daftar Ruangan.
* **Aksi Utama:** Tombol **"+ Tambah Ruangan"** (Buka Modal).
* **Modal Ruangan:** Input `name`, `location`, `temp_max_limit`, `hum_max_limit`.
* **Navigasi:** Mengklik satu Ruangan akan membawa *user* ke Level 2.

### Level 2: Halaman Detail Ruangan (Menu Konfigurasi)
* **Tampilan:** Info Ruangan di bagian atas. Di bawahnya terdapat barisan Kartu HMI (*HmiCard*).
* **Aksi Utama:** Tombol **"+ Tambah HMI / RTU"** (Buka Modal).
* **Modal HMI:** Input `name`, `ip_address`, `port` (default 502), `is_active` (Toggle). **Terdapat tombol khusus "Test Connection" di sebelah input IP.**

### Level 3: Daftar Sensor (Di dalam Kotak HMI)
* **Tampilan:** Tabel daftar sensor yang berada di dalam masing-masing *HmiCard*.
* **Aksi Utama:** Tombol **"+ Tambah Sensor"** di pojok tabel HMI terkait.
* **Modal Sensor:** Input `name`, `unit_id` (Slave ID), `modbus_address_temp` (Reg Suhu), `modbus_address_hum` (Reg Hum).

---

## 2. Rencana Backend (Laravel)
**Assignee:** Backend Developer

### A. Struktur Routing (`routes/web.php`)
```php
use App\Http\Controllers\RoomController;
use App\Http\Controllers\HmiController;
use App\Http\Controllers\SensorController;

// 1. API Khusus Test Connection (Non-Inertia)
Route::post('/hmis/test-connection', [HmiController::class, 'testConnection'])->name('hmis.test-connection');

// 2. Resource Routes (Inertia)
Route::resource('rooms', RoomController::class)->except(['create', 'edit']);
Route::resource('hmis', HmiController::class)->only(['store', 'update', 'destroy']);
Route::resource('sensors', SensorController::class)->only(['store', 'update', 'destroy']);