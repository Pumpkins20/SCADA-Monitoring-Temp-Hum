import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ImageUp, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';

export default function SettingsGeneralPage() {
    const [now, setNow] = useState(new Date());

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

    return (
        <>
            <Head title="Settings General" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    SETTINGS
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    General Configuration
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col items-center">
                            <p className="text-base font-bold tracking-widest text-white uppercase">
                                SCADA MONITORING AC PRESISI RUANG SERVER CCTV &
                                FIDS
                            </p>
                            <p className="text-[11px] tracking-wider text-slate-400 uppercase">
                                BANDARA SOEKARNO - HATTA
                            </p>
                        </div>

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
                    <div className="w-full max-w-4xl rounded-2xl border border-slate-700/60 bg-slate-800/45 p-5">
                        <p className="text-lg font-bold tracking-wider text-white uppercase">
                            Settings General
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Pilih menu setting yang ingin Anda konfigurasi.
                        </p>

                        <div className="mt-5 flex flex-wrap gap-4">
                            <Link
                                href="/gauge-settings"
                                className="group flex w-56 flex-col items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/60 p-6 backdrop-blur-sm transition-all hover:border-cyan-500/50 hover:bg-slate-800/80 hover:shadow-[0_0_20px_#22d3ee20]"
                            >
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 transition-colors group-hover:border-cyan-500/60 group-hover:bg-cyan-500/20">
                                    <SlidersHorizontal className="h-7 w-7 text-cyan-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold tracking-wider text-white uppercase">
                                        Gauge Setting
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        Atur indikator warna gauge Temperature &
                                        Humidity
                                    </p>
                                </div>
                                <span className="text-[10px] text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                                    Buka →
                                </span>
                            </Link>

                            <Link
                                href="/logo-settings"
                                className="group flex w-56 flex-col items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/60 p-6 backdrop-blur-sm transition-all hover:border-cyan-500/50 hover:bg-slate-800/80 hover:shadow-[0_0_20px_#22d3ee20]"
                            >
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 transition-colors group-hover:border-cyan-500/60 group-hover:bg-cyan-500/20">
                                    <ImageUp className="h-7 w-7 text-cyan-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold tracking-wider text-white uppercase">
                                        Logo Header
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        Ganti logo kiri dan tengah pada header
                                        dashboard
                                    </p>
                                </div>
                                <span className="text-[10px] text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                                    Buka →
                                </span>
                            </Link>
                        </div>
                    </div>
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
