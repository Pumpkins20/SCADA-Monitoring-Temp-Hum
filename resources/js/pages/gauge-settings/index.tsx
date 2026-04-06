import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import type {
    GaugeMetricSettings,
    GaugeSettings,
} from '@/components/scada/scada-helpers';
import { Button } from '@/components/ui/button';

interface GaugeSettingsFormData {
    temp_min: number;
    temp_max: number;
    temp_green_from: number;
    temp_green_to: number;
    temp_yellow_from: number;
    temp_yellow_to: number;
    temp_red_from: number;
    temp_red_to: number;
    hum_min: number;
    hum_max: number;
    hum_green_from: number;
    hum_green_to: number;
    hum_yellow_from: number;
    hum_yellow_to: number;
    hum_red_from: number;
    hum_red_to: number;
}

interface GaugeSettingsPageProps {
    gaugeSettings: GaugeSettings;
}

const defaultGaugeSettings: GaugeSettings = {
    temperature: {
        min: 0,
        max: 80,
        zones: [
            { from: 0, to: 36, color: '#22c55e' },
            { from: 36, to: 56, color: '#facc15' },
            { from: 56, to: 80, color: '#ef4444' },
        ],
    },
    humidity: {
        min: 0,
        max: 100,
        zones: [
            { from: 0, to: 60, color: '#22c55e' },
            { from: 60, to: 80, color: '#f59e0b' },
            { from: 80, to: 100, color: '#ef4444' },
        ],
    },
};

function normalizeMetricSetting(
    setting: GaugeMetricSettings | undefined,
    fallback: GaugeMetricSettings,
): GaugeMetricSettings {
    if (!setting || setting.zones.length < 3) {
        return fallback;
    }

    return {
        min: Number(setting.min ?? fallback.min),
        max: Number(setting.max ?? fallback.max),
        zones: [
            {
                from: Number(setting.zones[0]?.from ?? fallback.zones[0].from),
                to: Number(setting.zones[0]?.to ?? fallback.zones[0].to),
                color: setting.zones[0]?.color ?? fallback.zones[0].color,
            },
            {
                from: Number(setting.zones[1]?.from ?? fallback.zones[1].from),
                to: Number(setting.zones[1]?.to ?? fallback.zones[1].to),
                color: setting.zones[1]?.color ?? fallback.zones[1].color,
            },
            {
                from: Number(setting.zones[2]?.from ?? fallback.zones[2].from),
                to: Number(setting.zones[2]?.to ?? fallback.zones[2].to),
                color: setting.zones[2]?.color ?? fallback.zones[2].color,
            },
        ],
    };
}

function toGaugeFormData(settings: GaugeSettings): GaugeSettingsFormData {
    return {
        temp_min: settings.temperature.min,
        temp_max: settings.temperature.max,
        temp_green_from: settings.temperature.zones[0]?.from ?? 0,
        temp_green_to: settings.temperature.zones[0]?.to ?? 36,
        temp_yellow_from: settings.temperature.zones[1]?.from ?? 36,
        temp_yellow_to: settings.temperature.zones[1]?.to ?? 56,
        temp_red_from: settings.temperature.zones[2]?.from ?? 56,
        temp_red_to: settings.temperature.zones[2]?.to ?? 80,
        hum_min: settings.humidity.min,
        hum_max: settings.humidity.max,
        hum_green_from: settings.humidity.zones[0]?.from ?? 0,
        hum_green_to: settings.humidity.zones[0]?.to ?? 60,
        hum_yellow_from: settings.humidity.zones[1]?.from ?? 60,
        hum_yellow_to: settings.humidity.zones[1]?.to ?? 80,
        hum_red_from: settings.humidity.zones[2]?.from ?? 80,
        hum_red_to: settings.humidity.zones[2]?.to ?? 100,
    };
}

export default function GaugeSettingsPage({
    gaugeSettings,
}: GaugeSettingsPageProps) {
    const [now, setNow] = useState(new Date());

    const normalizedGaugeSettings: GaugeSettings = useMemo(
        () => ({
            temperature: normalizeMetricSetting(
                gaugeSettings?.temperature,
                defaultGaugeSettings.temperature,
            ),
            humidity: normalizeMetricSetting(
                gaugeSettings?.humidity,
                defaultGaugeSettings.humidity,
            ),
        }),
        [gaugeSettings],
    );

    const { data, setData, put, processing, errors } =
        useForm<GaugeSettingsFormData>(
            toGaugeFormData(normalizedGaugeSettings),
        );

    useEffect(() => {
        setData(toGaugeFormData(normalizedGaugeSettings));
    }, [normalizedGaugeSettings, setData]);

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

    function saveGaugeSettings(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        put('/gauge-settings', {
            preserveScroll: true,
        });
    }

    return (
        <>
            <Head title="Setting Indikator Gauge" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
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
                            <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    SETTING
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Gauge Indicator
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
                    <form
                        onSubmit={saveGaugeSettings}
                        className="w-full max-w-5xl space-y-5 rounded-2xl border border-slate-700/60 bg-slate-800/45 p-5"
                    >
                        <div>
                            <p className="text-lg font-bold tracking-wider text-white uppercase">
                                Setting Indikator Gauge
                            </p>
                            <p className="text-xs text-slate-400">
                                Atur range indikator warna untuk Temperature dan
                                Humidity. Rentang harus berkesinambungan tanpa
                                jeda.
                            </p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold tracking-wider text-cyan-300 uppercase">
                                    Temperature
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Min
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_min}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_min',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Max
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_max}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_max',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Green From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_green_from}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_green_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-green-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-green-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Green To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_green_to}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_green_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-green-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-green-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Yellow From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_yellow_from}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_yellow_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-yellow-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-yellow-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Yellow To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_yellow_to}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_yellow_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-yellow-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-yellow-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Red From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_red_from}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_red_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-red-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-red-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Red To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.temp_red_to}
                                            onChange={(event) =>
                                                setData(
                                                    'temp_red_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-red-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-red-400 focus:outline-none"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                                <p className="text-xs font-semibold tracking-wider text-blue-300 uppercase">
                                    Humidity
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Min
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_min}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_min',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Max
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_max}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_max',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Green From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_green_from}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_green_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-green-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-green-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Green To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_green_to}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_green_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-green-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-green-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Yellow From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_yellow_from}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_yellow_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-yellow-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-yellow-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Yellow To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_yellow_to}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_yellow_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-yellow-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-yellow-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Red From
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_red_from}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_red_from',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-red-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-red-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="space-y-1 text-[11px] text-slate-300">
                                        Red To
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={data.hum_red_to}
                                            onChange={(event) =>
                                                setData(
                                                    'hum_red_to',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-md border border-red-500/40 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-red-400 focus:outline-none"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {Object.values(errors).length > 0 && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                {Object.values(errors)[0]}
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-700"
                                asChild
                            >
                                <Link href="/settings-general">Kembali</Link>
                            </Button>
                            <Button
                                type="submit"
                                className="bg-cyan-600 text-white hover:bg-cyan-500"
                                disabled={processing}
                            >
                                {processing ? 'Menyimpan...' : 'Simpan Setting'}
                            </Button>
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
