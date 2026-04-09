import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, ImageUp, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PasswordSessionFloating } from '@/components/scada/password-session-floating';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';
import {
    DEFAULT_HEADER_LOGOS,
    DEFAULT_HEADER_TITLE,
} from '@/components/scada/scada-helpers';
import type {
    HeaderLogos,
    HeaderTitle,
} from '@/components/scada/scada-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LogoSettingsFormData {
    logo_left: File | null;
    logo_center: File | null;
    header_title_line_1: string;
    header_title_line_2: string;
}

export default function LogoSettingsPage() {
    const [now, setNow] = useState(new Date());
    const [leftPreview, setLeftPreview] = useState<string | null>(null);
    const [centerPreview, setCenterPreview] = useState<string | null>(null);
    const pageProps = usePage<{
        headerLogos?: HeaderLogos;
        headerTitle?: HeaderTitle;
    }>().props;
    const headerLogos = pageProps.headerLogos ?? DEFAULT_HEADER_LOGOS;
    const headerTitle = pageProps.headerTitle ?? DEFAULT_HEADER_TITLE;

    const { data, setData, post, processing, errors, recentlySuccessful } =
        useForm<LogoSettingsFormData>({
            logo_left: null,
            logo_center: null,
            header_title_line_1: headerTitle.line1,
            header_title_line_2: headerTitle.line2,
        });

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        return () => {
            if (leftPreview) {
                URL.revokeObjectURL(leftPreview);
            }

            if (centerPreview) {
                URL.revokeObjectURL(centerPreview);
            }
        };
    }, [leftPreview, centerPreview]);

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

    function onLogoLeftChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;

        if (leftPreview) {
            URL.revokeObjectURL(leftPreview);
        }

        setLeftPreview(file ? URL.createObjectURL(file) : null);
        setData('logo_left', file);
    }

    function onLogoCenterChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;

        if (centerPreview) {
            URL.revokeObjectURL(centerPreview);
        }

        setCenterPreview(file ? URL.createObjectURL(file) : null);
        setData('logo_center', file);
    }

    function saveLogos(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        post('/logo-settings', {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                setData((current) => ({
                    ...current,
                    logo_left: null,
                    logo_center: null,
                }));
                setLeftPreview(null);
                setCenterPreview(null);
            },
        });
    }

    return (
        <>
            <Head title="Setting Header Dashboard" />

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
                            <ImageUp className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    SETTINGS
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Header Dashboard
                                </p>
                            </div>
                        </div>

                        <ScadaHeaderTitle
                            title={{
                                line1:
                                    data.header_title_line_1.trim() ||
                                    DEFAULT_HEADER_TITLE.line1,
                                line2:
                                    data.header_title_line_2.trim() ||
                                    DEFAULT_HEADER_TITLE.line2,
                            }}
                        />

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
                        onSubmit={saveLogos}
                        className="w-full max-w-5xl space-y-5 rounded-2xl border border-slate-700/60 bg-slate-800/45 p-5"
                    >
                        <div>
                            <p className="text-lg font-bold tracking-wider text-white uppercase">
                                Setting Header Dashboard
                            </p>
                            <p className="text-xs text-slate-400">
                                Ubah judul header serta logo kiri dan tengah.
                                Logo kanan tetap fixed.
                            </p>
                        </div>

                        <div className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Judul Header Baris 1
                                </Label>
                                <Input
                                    value={data.header_title_line_1}
                                    onChange={(event) =>
                                        setData(
                                            'header_title_line_1',
                                            event.target.value,
                                        )
                                    }
                                    maxLength={160}
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                    placeholder={DEFAULT_HEADER_TITLE.line1}
                                />
                                {errors.header_title_line_1 && (
                                    <p className="text-[11px] text-red-300">
                                        {errors.header_title_line_1}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Judul Header Baris 2
                                </Label>
                                <Input
                                    value={data.header_title_line_2}
                                    onChange={(event) =>
                                        setData(
                                            'header_title_line_2',
                                            event.target.value,
                                        )
                                    }
                                    maxLength={120}
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                    placeholder={DEFAULT_HEADER_TITLE.line2}
                                />
                                {errors.header_title_line_2 && (
                                    <p className="text-[11px] text-red-300">
                                        {errors.header_title_line_2}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold tracking-wider text-cyan-300 uppercase">
                                    Logo Kiri
                                </p>
                                <div className="flex h-28 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 p-2">
                                    <img
                                        src={leftPreview ?? headerLogos.left}
                                        alt="Logo kiri"
                                        className="max-h-full w-full object-contain"
                                    />
                                </div>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={onLogoLeftChange}
                                    className="w-full cursor-pointer rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-cyan-600 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white"
                                />
                                {errors.logo_left && (
                                    <p className="text-[11px] text-red-300">
                                        {errors.logo_left}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold tracking-wider text-cyan-300 uppercase">
                                    Logo Tengah
                                </p>
                                <div className="flex h-28 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 p-2">
                                    <img
                                        src={
                                            centerPreview ?? headerLogos.center
                                        }
                                        alt="Logo tengah"
                                        className="max-h-full w-full object-contain"
                                    />
                                </div>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={onLogoCenterChange}
                                    className="w-full cursor-pointer rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-cyan-600 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white"
                                />
                                {errors.logo_center && (
                                    <p className="text-[11px] text-red-300">
                                        {errors.logo_center}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Logo Kanan
                                </p>
                                <div className="flex h-28 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 p-2">
                                    <img
                                        src={headerLogos.right}
                                        alt="Logo kanan"
                                        className="max-h-full w-full object-contain"
                                    />
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                    <Lock className="h-3.5 w-3.5" />
                                    Fixed (tidak bisa diubah)
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-400">
                                Format file: JPG, PNG, WEBP. Maksimal 2 MB.
                            </p>

                            <div className="flex items-center gap-2">
                                {recentlySuccessful && (
                                    <span className="text-xs font-semibold text-green-300">
                                        Pengaturan header berhasil diperbarui.
                                    </span>
                                )}
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                    {processing
                                        ? 'Menyimpan...'
                                        : 'Simpan Pengaturan Header'}
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
