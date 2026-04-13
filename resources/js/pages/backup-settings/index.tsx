import { Head, Link, useForm } from '@inertiajs/react';
import { Archive, ArrowLeft, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PasswordSessionFloating } from '@/components/scada/password-session-floating';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BackupSettings {
    backupEmail?: string | null;
}

interface BackupSettingsPageProps {
    backupSettings?: BackupSettings;
}

interface BackupSettingsFormData {
    backup_email: string;
}

export default function BackupSettingsPage({
    backupSettings,
}: BackupSettingsPageProps) {
    const [now, setNow] = useState(new Date());

    const { data, setData, put, processing, errors, recentlySuccessful } =
        useForm<BackupSettingsFormData>({
            backup_email: backupSettings?.backupEmail ?? '',
        });

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);

        return () => clearInterval(timer);
    }, []);

    const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const dateStr = now
        .toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
        .toUpperCase();

    function saveBackupSettings(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        put('/backup-settings', {
            preserveScroll: true,
        });
    }

    return (
        <>
            <Head title="Backup Otomatis" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <PasswordSessionFloating className="top-[92px]" />

                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Link
                                href="/settings-general"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <Archive className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    SETTINGS
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Backup Otomatis
                                </p>
                            </div>
                        </div>

                        <ScadaHeaderTitle />

                        <div className="flex w-48 shrink-0 items-center justify-end">
                            <div className="text-right">
                                <p className="text-xl font-bold text-white tabular-nums">
                                    {timeStr}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {dateStr}
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
                    <form
                        onSubmit={saveBackupSettings}
                        className="w-full max-w-3xl space-y-5 rounded-2xl border border-slate-700/60 bg-slate-800/45 p-5"
                    >
                        <div>
                            <p className="text-lg font-bold tracking-wider text-white uppercase">
                                Backup Otomatis Data 90 Hari
                            </p>
                            <p className="text-xs text-slate-400">
                                Isi satu email penerima backup otomatis.
                                Scheduler akan mencoba mengirim backup data lama
                                terlebih dahulu sebelum data dihapus.
                            </p>
                        </div>

                        <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                            <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                Email Tujuan Backup
                            </Label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <Input
                                    type="email"
                                    value={data.backup_email}
                                    onChange={(event) =>
                                        setData(
                                            'backup_email',
                                            event.target.value,
                                        )
                                    }
                                    className="border-slate-600 bg-slate-800/80 pl-9 text-white placeholder:text-slate-500"
                                    placeholder="contoh: backup@domain.com"
                                />
                            </div>
                            {errors.backup_email && (
                                <p className="text-[11px] text-red-300">
                                    {errors.backup_email}
                                </p>
                            )}
                            <p className="text-[11px] text-slate-400">
                                Kosongkan field ini jika Anda ingin
                                menonaktifkan pengiriman backup melalui email.
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-400">
                                Format backup dikirim sebagai lampiran XLSX.
                            </p>

                            <div className="flex items-center gap-2">
                                {recentlySuccessful && (
                                    <span className="text-xs font-semibold text-green-300">
                                        Email backup otomatis berhasil disimpan.
                                    </span>
                                )}
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                    {processing ? 'Menyimpan...' : 'Simpan'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </main>

                <ScadaFooterNav
                    activeMenu="settings"
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
