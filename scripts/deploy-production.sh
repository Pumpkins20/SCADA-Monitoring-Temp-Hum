#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/edutic/temperature-humidity-monitor}"
cd "$APP_DIR"

echo "[1/8] Pull latest code"
git pull --ff-only

echo "[2/8] Install PHP dependencies"
composer install --no-dev --optimize-autoloader --no-interaction

echo "[3/8] Install JS dependencies"
npm ci

echo "[4/8] Build assets"
npm run build

echo "[5/8] Refresh Laravel caches"
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "[6/8] Reset scheduler runtime state"
php artisan schedule:interrupt || true
php artisan schedule:clear-cache

echo "[7/8] Restart PM2 processes"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[8/8] Post-deploy smoke check"
php artisan schedule:run -v || true
php artisan aggregate:sensor-readings || true

echo "Deploy finished"
