# Temperature & Humidity Monitor — SCADA Dashboard

Sistem monitoring suhu & kelembapan berbasis web untuk HMI Haiwell via Modbus TCP.  
Stack: **Laravel 12 + React (Inertia.js) + Python Poller + MySQL**

---

## Arsitektur Singkat
[HMI Haiwell] ──Modbus TCP──▶ [poller.py] ──UPSERT──▶ [MySQL]
│
[Laravel + Inertia React]
│
[Browser]


- **`poller.py`** — Script Python yang polling data sensor tiap 5 detik langsung ke MySQL (tanpa hit Laravel).
- **Laravel** — Mengelola CRUD Room/HMI/Sensor, autentikasi, scheduler log historis, dan render UI via Inertia.

---

## Prerequisites

| Tool | Versi |
|------|-------|
| PHP | ^8.2 |
| Composer | ^2 |
| Node.js | ^20 |
| MySQL | ^8 |
| Python | ^3.10 |

---

## Setup Lokal

### 1. Clone & Install Dependency

```bash
git clone https://github.com/NoveraCode/temperature-humidity-monitor.git
cd temperature-humidity-monitor


composer install
npm install

cp .env.example .env
php artisan key:generate

php artisan migrate
php artisan db:seed

npm run build
# atau untuk development dengan hot-reload:
npm run dev

php artisan serve
Akses di: http://localhost:8000
```

# Menjalankan Python Poller
```bash
# Install dependency Python
pip install -r requirements.txt

# Jalankan poller
python poller.py
```

# Development Workflow
```bash
# Jalankan semua service sekaligus (Laravel + Vite + Queue)
composer run dev

# Format PHP
vendor/bin/pint --dirty

# Format JS/CSS
npm run format

# Jalankan tests
php artisan test --compact
```

# Deployment (Production)
```bash
pm2 start "php artisan serve --host=0.0.0.0 --port=80" --name "laravel-scada"
pm2 start poller.py --name "python-modbus-worker" --interpreter python3
pm2 start "php artisan schedule:work" --name "laravel-scheduler"
pm2 save
pm2 startup
```