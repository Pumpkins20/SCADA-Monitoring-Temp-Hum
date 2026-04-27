# Temperature Humidity Monitor

Production-ready SCADA web application for temperature and humidity monitoring through Haiwell HMI over Modbus TCP.

## Overview

This repository combines:

- Laravel 12 backend for authentication, business logic, scheduling, and exports.
- Inertia.js + React frontend for the dashboard and device management interface.
- Python Modbus poller that reads HMI registers/coils and writes live data directly to the database.

Runtime data flow:

1. HMI devices expose sensor values via Modbus TCP.
2. poller.py reads registers/coils in cycles and upserts to database tables.
3. Laravel serves dashboards, logs, alarms, exports, and settings using the latest stored values.

## Core Features

- Real-time dashboard with room, HMI, and sensor health status.
- Alarm monitoring with active/cleared event tracking.
- Historical logs and chart logs with export options (XLSX and PDF).
- Device hierarchy management: Room -> HMI -> Sensor.
- HMI preview and connection testing before final activation.
- Floor-plan positioning and visualization support.
- Fortify-based auth flow including profile, password update, and two-factor support.
- Automated scheduled aggregation and retention jobs.

## Technology Stack

- Backend: PHP 8.2+, Laravel 12, Fortify, Inertia Laravel v2
- Frontend: React 19, Inertia React v2, Tailwind CSS v4, Vite 7
- Poller: Python 3.10+, pymodbus 3.x, psycopg2
- Process manager (production): PM2
- Cache/lock (production recommended): Redis
- Database: PostgreSQL (required by current poller implementation)

## Production Services

The PM2 ecosystem runs 3 main processes:

1. laravel-scada (web runtime)
2. python-modbus-worker (poller)
3. laravel-scheduler (schedule:work daemon)

Configuration file: ecosystem.config.cjs

## Local Development Setup

### 1. Install application dependencies

```bash
composer install
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
php artisan key:generate
```

Set your database credentials in .env.

### 3. Run migrations

```bash
php artisan migrate
```

### 4. Build or run frontend

```bash
npm run dev
# or
npm run build
```

### 5. Run Laravel app

```bash
php artisan serve
```

### 6. Run Python poller

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python poller.py
```

For Windows PowerShell activation:

```powershell
.\.venv\Scripts\Activate.ps1
```

## Poller Environment Notes

poller.py reads its DB and Modbus behavior from environment values.
Important variables include:

- DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD
- NUMERIC_REGISTER_FORMAT
- NUMERIC_FLOAT_WORD_ORDER
- NUMERIC_ADDRESS_OFFSETS
- STRING_BYTE_ORDER
- COIL_ADDRESS_SHIFT
- CONNECTION_COIL_MODE
- ALLOW_FC_FALLBACK
- DEBUG_RAW_REGISTERS
- DIAGNOSTIC_SCAN

Defaults are tuned for current Haiwell deployments and can be overridden per environment.

## Scheduler Jobs

Defined in routes/console.php:

- aggregate:room-logs every 15 minutes
- aggregate:sensor-readings every minute
- purge:old-logs daily (includes backup email flow before delete)
- cleanup-preview-hmis every 5 minutes

Validate scheduler state with:

```bash
php artisan schedule:list
php artisan schedule:run -v
```

## Deployment

Recommended deployment entrypoint:

```bash
chmod +x scripts/deploy-production.sh
APP_DIR=/home/edutic/temperature-humidity-monitor ./scripts/deploy-production.sh
```

Scheduler recovery helper:

```bash
chmod +x scripts/recover-scheduler.sh
APP_DIR=/home/edutic/temperature-humidity-monitor ./scripts/recover-scheduler.sh
```


## Quality Commands

```bash
vendor/bin/pint
npm run lint
npm run types
php artisan test --compact
```

## Repository Structure

```text
app/                 Laravel domain logic
resources/js/        Inertia React frontend pages/components
routes/              Web and scheduler route definitions
database/            Migrations, factories, seeders
scripts/             Deployment and operational scripts
poller.py            Python Modbus worker
ecosystem.config.cjs PM2 process definitions
```