<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Models\SensorLatestData;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(fn(Request $request) => Inertia::render('auth/login', [
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'canRegister' => Features::enabled(Features::registration()),
            'status' => $request->session()->get('status'),
            'liveReadings' => $this->resolveLoginLiveReadings(),
        ]));

        Fortify::resetPasswordView(fn(Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]));

        Fortify::requestPasswordResetLinkView(fn(Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn(Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::registerView(fn() => Inertia::render('auth/register'));

        Fortify::twoFactorChallengeView(fn() => Inertia::render('auth/two-factor-challenge'));

        Fortify::confirmPasswordView(fn() => Inertia::render('auth/confirm-password', [
            'timeoutSeconds' => (int) config('auth.password_timeout', 900),
        ]));
    }

    /**
     * @return array<string, float|int|string|null>
     */
    private function resolveLoginLiveReadings(): array
    {
        $statusCounts = SensorLatestData::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $onlineAverages = SensorLatestData::query()
            ->where('status', '!=', 'OFFLINE')
            ->selectRaw('AVG(temperature) as avg_temperature, AVG(humidity) as avg_humidity')
            ->first();

        $onlineSensors = (int) $statusCounts
            ->except('OFFLINE')
            ->sum();

        $overallStatus = 'No Data';

        if ($onlineSensors > 0) {
            $overallStatus = $statusCounts->has('CRITICAL')
                ? 'Kritis'
                : ($statusCounts->has('WARNING') ? 'Waspada' : 'Optimal');
        } elseif ($statusCounts->isNotEmpty()) {
            $overallStatus = 'Offline';
        }

        $latestReadAt = SensorLatestData::query()->max('last_read_at');

        return [
            'avgTemperature' => $onlineAverages?->avg_temperature !== null
                ? round((float) $onlineAverages->avg_temperature, 1)
                : null,
            'avgHumidity' => $onlineAverages?->avg_humidity !== null
                ? round((float) $onlineAverages->avg_humidity, 1)
                : null,
            'onlineSensors' => $onlineSensors,
            'overallStatus' => $overallStatus,
            'lastSyncLabel' => $latestReadAt !== null
                ? Carbon::parse($latestReadAt)->locale('id')->diffForHumans()
                : 'Belum ada data',
        ];
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())) . '|' . $request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });
    }
}
