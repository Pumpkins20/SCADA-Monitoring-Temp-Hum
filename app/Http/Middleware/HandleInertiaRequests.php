<?php

namespace App\Http\Middleware;

use App\Models\GaugeSetting;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $passwordConfirmedAt = (int) $request->session()->get('auth.password_confirmed_at', 0);
        $passwordTimeout = (int) config('auth.password_timeout', 900);
        $expiresAtTimestamp = $passwordConfirmedAt > 0
            ? $passwordConfirmedAt + $passwordTimeout
            : null;
        $remainingSeconds = $expiresAtTimestamp !== null
            ? max($expiresAtTimestamp - now()->getTimestamp(), 0)
            : 0;
        $gaugeSetting = GaugeSetting::query()->first();

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'headerLogos' => GaugeSetting::resolveHeaderLogos($gaugeSetting),
            'headerTitle' => GaugeSetting::resolveHeaderTitle($gaugeSetting),
            'auth' => [
                'user' => $request->user(),
                'can' => [
                    'manage_devices' => $request->user()?->can('manage-devices') ?? false,
                ],
                'password_confirmation' => [
                    'is_active' => $remainingSeconds > 0,
                    'timeout_seconds' => $passwordTimeout,
                    'remaining_seconds' => $remainingSeconds,
                    'expires_at' => $expiresAtTimestamp !== null
                        ? now()->setTimestamp($expiresAtTimestamp)->toIso8601String()
                        : null,
                ],
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
