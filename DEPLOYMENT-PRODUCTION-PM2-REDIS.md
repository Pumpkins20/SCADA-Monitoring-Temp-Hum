# Deployment Production PM2 + Redis (Anti Mutex Stuck)

Dokumen ini adalah prosedur deployment yang aman untuk mencegah scheduler berhenti karena mutex lock tersisa.

## 1) Ringkasan Arsitektur Runtime

Service yang wajib hidup:

1. laravel-scada
2. python-modbus-worker
3. laravel-scheduler (daemon mode, schedule:work)

Gunakan PM2 ecosystem file agar cwd, command, restart policy, dan env konsisten di setiap reboot/deploy.

## 2) Prasyarat Mini PC (Ubuntu)

1. PHP, Composer, Node.js, npm, Python3, pip, PostgreSQL/MySQL sesuai environment.
2. PM2 terpasang global.
3. Redis server terpasang dan aktif.

Contoh install cepat:

```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping
```

Hasil yang benar: `PONG`.

## 3) Konfigurasi ENV Saat Cache Store Pindah ke Redis

Atur di file `.env` production:

```env
CACHE_STORE=redis
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
REDIS_CACHE_DB=1
```

Jika Redis memakai password:

```env
REDIS_PASSWORD=your_strong_password
```

Lalu refresh cache konfigurasi Laravel:

```bash
php artisan optimize:clear
php artisan config:cache
```

## 4) Start PM2 (Mode Daemon yang Benar)

Dari root project:

```bash
export APP_DIR=/home/edutic/temperature-humidity-monitor
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 startup
```

Verifikasi:

```bash
pm2 list
pm2 describe laravel-scheduler
pm2 logs laravel-scheduler --lines 100
```

Pastikan tidak ada error `Could not open input file: artisan`.

## 5) Prosedur Deploy Harian (Recommended)

Gunakan script deploy terstandar:

```bash
chmod +x scripts/deploy-production.sh
APP_DIR=/home/edutic/temperature-humidity-monitor ./scripts/deploy-production.sh
```

Script ini melakukan:

1. Pull code
2. Install dependency
3. Build frontend
4. Refresh Laravel cache
5. schedule:interrupt + schedule:clear-cache
6. Reload PM2
7. Smoke test scheduler

## 6) Recovery Cepat Saat Has Mutex Berulang

Jika scheduler terlihat berjalan tapi job terus skipped karena mutex:

```bash
chmod +x scripts/recover-scheduler.sh
APP_DIR=/home/edutic/temperature-humidity-monitor ./scripts/recover-scheduler.sh
```

Script recovery melakukan:

1. schedule:clear-cache
2. schedule:interrupt
3. restart PM2 process laravel-scheduler
4. schedule:run -v untuk verifikasi

## 7) Checklist Validasi Pascadeploy

Jalankan ini setiap selesai deploy:

```bash
php artisan schedule:list
php artisan schedule:run -v
php artisan aggregate:sensor-readings
```

Cek data freshness di database:

```sql
SELECT MAX(updated_at) FROM sensor_latest_data;
SELECT MAX(created_at) FROM sensor_readings;
SELECT MAX(created_at) FROM sensor_logs;
```

Kriteria sehat:

1. sensor_latest_data bergerak setiap beberapa detik/siklus poller.
2. sensor_readings bertambah tiap menit.
3. sensor_logs bertambah tiap 15 menit.

## 8) Anti-Pattern yang Harus Dihindari

1. Menjalankan `schedule:work` dan cron `schedule:run` bersamaan di server yang sama.
2. Menjalankan lebih dari satu process `laravel-scheduler` untuk app yang sama.
3. Deploy tanpa `schedule:clear-cache` saat sebelumnya ada indikasi stuck mutex.
4. Menjalankan PM2 tanpa cwd yang benar.

## 9) Catatan Development Lokal

Jika di development Anda juga ingin pakai Redis lock:

```env
CACHE_STORE=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_CACHE_DB=1
```

Lalu:

```bash
php artisan optimize:clear
php artisan config:cache
php artisan test --compact tests/Feature/SchedulerTest.php
```

Dengan setup ini, perilaku lock scheduler di development akan lebih mirip production.
