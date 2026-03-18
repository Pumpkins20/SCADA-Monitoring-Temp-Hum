<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGaugeSettingRequest;
use App\Models\GaugeSetting;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class GaugeSettingController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings-general/index');
    }

    public function edit(): Response
    {
        $gaugeSetting = GaugeSetting::query()->first();

        return Inertia::render('gauge-settings/index', [
            'gaugeSettings' => [
                'temperature' => [
                    'min' => $gaugeSetting?->temp_min ?? 0,
                    'max' => $gaugeSetting?->temp_max ?? 80,
                    'zones' => [
                        ['from' => $gaugeSetting?->temp_green_from ?? 0, 'to' => $gaugeSetting?->temp_green_to ?? 36, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->temp_yellow_from ?? 36, 'to' => $gaugeSetting?->temp_yellow_to ?? 56, 'color' => '#facc15'],
                        ['from' => $gaugeSetting?->temp_red_from ?? 56, 'to' => $gaugeSetting?->temp_red_to ?? 80, 'color' => '#ef4444'],
                    ],
                ],
                'humidity' => [
                    'min' => $gaugeSetting?->hum_min ?? 0,
                    'max' => $gaugeSetting?->hum_max ?? 100,
                    'zones' => [
                        ['from' => $gaugeSetting?->hum_green_from ?? 0, 'to' => $gaugeSetting?->hum_green_to ?? 60, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->hum_yellow_from ?? 60, 'to' => $gaugeSetting?->hum_yellow_to ?? 80, 'color' => '#f59e0b'],
                        ['from' => $gaugeSetting?->hum_red_from ?? 80, 'to' => $gaugeSetting?->hum_red_to ?? 100, 'color' => '#ef4444'],
                    ],
                ],
            ],
        ]);
    }

    public function update(UpdateGaugeSettingRequest $request): RedirectResponse
    {
        GaugeSetting::query()->updateOrCreate(
            ['id' => 1],
            $request->validated(),
        );

        return redirect()->route('gauge-settings.edit');
    }
}
