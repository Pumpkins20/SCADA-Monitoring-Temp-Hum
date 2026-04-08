<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateHeaderLogoSettingRequest;
use App\Models\GaugeSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class HeaderLogoSettingController extends Controller
{
    public function edit(): Response
    {
        return Inertia::render('logo-settings/index');
    }

    public function update(UpdateHeaderLogoSettingRequest $request): RedirectResponse
    {
        $gaugeSetting = GaugeSetting::query()->firstOrCreate(['id' => 1]);

        if ($request->has('header_title_line_1')) {
            $gaugeSetting->header_title_line_1 = $this->normalizeHeaderTitle(
                $request->input('header_title_line_1'),
                GaugeSetting::DEFAULT_HEADER_TITLE_LINE_1,
            );
        }

        if ($request->has('header_title_line_2')) {
            $gaugeSetting->header_title_line_2 = $this->normalizeHeaderTitle(
                $request->input('header_title_line_2'),
                GaugeSetting::DEFAULT_HEADER_TITLE_LINE_2,
            );
        }

        if ($request->hasFile('logo_left')) {
            $this->deleteManagedLogo($gaugeSetting->logo_left_path);
            $gaugeSetting->logo_left_path = $request->file('logo_left')?->store('header-logos', 'public');
        }

        if ($request->hasFile('logo_center')) {
            $this->deleteManagedLogo($gaugeSetting->logo_center_path);
            $gaugeSetting->logo_center_path = $request->file('logo_center')?->store('header-logos', 'public');
        }

        $gaugeSetting->save();

        return redirect()->route('logo-settings.edit');
    }

    private function normalizeHeaderTitle(mixed $value, string $fallback): string
    {
        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : $fallback;
    }

    private function deleteManagedLogo(?string $path): void
    {
        if (! $path) {
            return;
        }

        if (! str_starts_with($path, 'header-logos/')) {
            return;
        }

        Storage::disk('public')->delete($path);
    }
}
