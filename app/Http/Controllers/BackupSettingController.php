<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateBackupSettingRequest;
use App\Models\GaugeSetting;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class BackupSettingController extends Controller
{
    public function edit(): Response
    {
        $gaugeSetting = GaugeSetting::query()->first();

        return Inertia::render('backup-settings/index', [
            'backupSettings' => [
                'backupEmail' => $gaugeSetting?->backup_email ?? '',
            ],
        ]);
    }

    public function update(UpdateBackupSettingRequest $request): RedirectResponse
    {
        $backupEmail = trim((string) $request->validated('backup_email', ''));

        GaugeSetting::query()->updateOrCreate(
            ['id' => 1],
            [
                'backup_email' => $backupEmail !== '' ? $backupEmail : null,
            ],
        );

        return redirect()->route('backup-settings.edit');
    }
}
