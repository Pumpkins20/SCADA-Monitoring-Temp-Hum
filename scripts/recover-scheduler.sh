#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/edutic/temperature-humidity-monitor}"
cd "$APP_DIR"

echo "Clearing stale schedule mutex..."
php artisan schedule:clear-cache

echo "Interrupting scheduler loop gracefully..."
php artisan schedule:interrupt || true

echo "Restarting laravel-scheduler via PM2..."
pm2 restart laravel-scheduler --update-env

echo "Running one foreground tick for verification..."
php artisan schedule:run -v || true

echo "Scheduler recovery completed"
