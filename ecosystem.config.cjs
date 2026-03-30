/* eslint-env node */
/* global process, __dirname, module */

const appDir = process.env.APP_DIR || __dirname;

module.exports = {
    apps: [
        {
            name: 'laravel-scada',
            cwd: appDir,
            script: '/usr/bin/php',
            args: 'artisan serve --host=0.0.0.0 --port=8000',
            interpreter: 'none',
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000,
            kill_timeout: 5000,
            env: {
                APP_ENV: 'production',
            },
        },
        {
            name: 'python-modbus-worker',
            cwd: appDir,
            script: 'poller.py',
            interpreter: '/usr/bin/python3',
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000,
            kill_timeout: 5000,
            env: {
                APP_ENV: 'production',
            },
        },
        {
            name: 'laravel-scheduler',
            cwd: appDir,
            script: '/usr/bin/php',
            args: 'artisan schedule:work',
            interpreter: 'none',
            autorestart: true,
            max_restarts: 30,
            restart_delay: 3000,
            kill_timeout: 10000,
            env: {
                APP_ENV: 'production',
            },
        },
    ],
};
