import { Head, Link, router } from '@inertiajs/react';
import {
    BarChart2,
    Thermometer,
    Droplets,
    Expand,
    Minimize2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArcGauge } from '@/components/scada/arc-gauge';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import {
    fmt,
    statusDotColor,
    statusBadgeClasses,
} from '@/components/scada/scada-helpers';
import type {
    RoomData,
    ChartPoint,
    GlobalStats,
    GaugeSettings,
    GaugeMetricSettings,
} from '@/components/scada/scada-helpers';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardProps {
    rooms: RoomData[];
    chartLogs?: Record<number, ChartPoint[]>;
    globalChartLogs?: ChartPoint[];
    globalStats: GlobalStats;
    gaugeSettings: GaugeSettings;
}

// ─── Chart Configs ────────────────────────────────────────────────────────────

const tempChartConfig = {
    avg_temperature: {
        label: 'Temperature',
        color: '#22d3ee',
    },
} satisfies ChartConfig;

const humChartConfig = {
    avg_humidity: {
        label: 'Humidity',
        color: '#60a5fa',
    },
} satisfies ChartConfig;

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

// ─── Room Card ───────────────────────────────────────────────────────────────

function RoomCard({
    room,
    className = '',
}: {
    room: RoomData;
    className?: string;
}) {
    const isOnline = room.status !== 'OFFLINE';
    const onlineCount = room.sensors.filter(
        (s) => s.status !== 'OFFLINE',
    ).length;
    const activeAlarmCount = room.sensors.reduce((total, sensor) => {
        if (sensor.status === 'OFFLINE') {
            return total;
        }

        return (
            total +
            Number(Boolean(sensor.alarms?.temp)) +
            Number(Boolean(sensor.alarms?.hum)) +
            Number(Boolean(sensor.alarms?.disconnect))
        );
    }, 0);
    const totalCount = room.sensors.length;

    return (
        <Link
            href={`/rooms/${room.id}`}
            className={`group flex min-w-0 flex-col justify-center gap-1 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 backdrop-blur-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800/80 ${className}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <circle
                            cx="5"
                            cy="5"
                            r="4"
                            fill={statusDotColor(room.status)}
                            style={{
                                filter:
                                    room.status !== 'OFFLINE'
                                        ? `drop-shadow(0 0 3px ${statusDotColor(room.status)})`
                                        : 'none',
                            }}
                        />
                    </svg>
                    <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                        {room.name}
                    </span>
                </div>
                <span
                    className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${statusBadgeClasses(room.status)}`}
                >
                    {room.status}
                </span>
            </div>

            {room.location && (
                <span className="text-[10px] text-slate-500">
                    {room.location}
                </span>
            )}

            <div className="mt-1 grid min-w-0 grid-cols-2 gap-1.5">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-col items-center">
                        <div className="flex min-w-0 items-end justify-center gap-1">
                            <span
                                className={`max-w-full truncate text-2xl leading-none font-bold tabular-nums sm:text-3xl xl:text-4xl ${isOnline ? 'text-white' : 'text-slate-600'}`}
                            >
                                {fmt(room.room_avg_temp)}
                            </span>
                            <span className="mb-0.5 shrink-0 text-[10px] text-slate-400 xl:text-xs">
                                °C
                            </span>
                        </div>
                        <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                            AVG TEMP
                        </span>
                    </div>
                </div>

                <div className="min-w-0 border-l border-slate-600/80 pl-2">
                    <div className="flex min-w-0 flex-col items-center">
                        <div className="flex min-w-0 items-end justify-center gap-1">
                            <span
                                className={`max-w-full truncate text-2xl leading-none font-bold tabular-nums sm:text-3xl xl:text-4xl ${isOnline ? 'text-white' : 'text-slate-600'}`}
                            >
                                {fmt(room.room_avg_hum)}
                            </span>
                            <span className="mb-0.5 shrink-0 text-[10px] text-slate-400 xl:text-xs">
                                %
                            </span>
                        </div>
                        <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                            AVG RH
                        </span>
                    </div>
                </div>
            </div>

            <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                    {onlineCount}/{totalCount} sensor online
                </span>
                {activeAlarmCount > 0 ? (
                    <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-red-300 uppercase">
                        {activeAlarmCount} alarm
                    </span>
                ) : (
                    <span className="text-[10px] text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                        Detail →
                    </span>
                )}
            </div>
        </Link>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Dashboard({
    rooms,
    globalChartLogs = [],
    globalStats,
    gaugeSettings,
}: DashboardProps) {
    const [now, setNow] = useState(new Date());
    const [isChartsFullscreen, setIsChartsFullscreen] = useState(false);

    const normalizedGaugeSettings: GaugeSettings = {
        temperature: normalizeMetricSetting(
            gaugeSettings?.temperature,
            defaultGaugeSettings.temperature,
        ),
        humidity: normalizeMetricSetting(
            gaugeSettings?.humidity,
            defaultGaugeSettings.humidity,
        ),
    };

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({
                only: [
                    'rooms',
                    'globalStats',
                    'chartLogs',
                    'globalChartLogs',
                    'gaugeSettings',
                ],
            });
        }, 5_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!isChartsFullscreen) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setIsChartsFullscreen(false);
            }
        }

        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isChartsFullscreen]);

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

    const colMiddleRooms = rooms.slice(0, 3);
    const colRightRooms = rooms.slice(3, 5);

    const chartData = globalChartLogs;

    const hasAlarms = globalStats.active_alarms > 0;

    const alarmSummaryText = `${globalStats.active_alarms} alarm`;

    const lastUpdate = globalStats.last_update
        ? new Date(globalStats.last_update).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
          })
        : '--:--';

    function renderChartPanels(isFullscreen: boolean) {
        const chartCardClass = isFullscreen
            ? 'flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 pt-3 pb-2'
            : 'flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1';

        return (
            <>
                <div className={chartCardClass}>
                    <div className="mb-0.5 flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                            Avg Temp
                        </span>
                    </div>
                    <div className="min-h-0 flex-1">
                        {chartData.length > 0 ? (
                            <ChartContainer
                                config={tempChartConfig}
                                className="h-full w-full"
                            >
                                <LineChart
                                    data={chartData}
                                    margin={{
                                        top: 4,
                                        right: 8,
                                        bottom: 0,
                                        left: -12,
                                    }}
                                >
                                    <CartesianGrid
                                        stroke="#1e3a5f"
                                        strokeDasharray="3 3"
                                    />
                                    <XAxis
                                        dataKey="time"
                                        tick={{
                                            fontSize: 9,
                                            fill: '#475569',
                                        }}
                                        tickLine={false}
                                        axisLine={{
                                            stroke: '#1e3a5f',
                                        }}
                                    />
                                    <YAxis
                                        tick={{
                                            fontSize: 9,
                                            fill: '#475569',
                                        }}
                                        tickLine={false}
                                        axisLine={{
                                            stroke: '#1e3a5f',
                                        }}
                                    />
                                    <ChartTooltip
                                        cursor={{
                                            stroke: '#334155',
                                        }}
                                        content={
                                            <ChartTooltipContent indicator="line" />
                                        }
                                    />
                                    <Line
                                        dataKey="avg_temperature"
                                        type="linear"
                                        stroke="var(--color-avg_temperature)"
                                        strokeWidth={2}
                                        dot={{
                                            r: 2,
                                            fill: '#22d3ee',
                                        }}
                                        activeDot={{
                                            r: 4,
                                            fill: '#22d3ee',
                                        }}
                                    />
                                </LineChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-600">
                                Belum ada data grafik
                            </div>
                        )}
                    </div>
                </div>

                <div className={chartCardClass}>
                    <div className="mb-0.5 flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                            Avg Hum
                        </span>
                    </div>
                    <div className="min-h-0 flex-1">
                        {chartData.length > 0 ? (
                            <ChartContainer
                                config={humChartConfig}
                                className="h-full w-full"
                            >
                                <LineChart
                                    data={chartData}
                                    margin={{
                                        top: 4,
                                        right: 8,
                                        bottom: 0,
                                        left: -12,
                                    }}
                                >
                                    <CartesianGrid
                                        stroke="#1e3a5f"
                                        strokeDasharray="3 3"
                                    />
                                    <XAxis
                                        dataKey="time"
                                        tick={{
                                            fontSize: 9,
                                            fill: '#475569',
                                        }}
                                        tickLine={false}
                                        axisLine={{
                                            stroke: '#1e3a5f',
                                        }}
                                    />
                                    <YAxis
                                        tick={{
                                            fontSize: 9,
                                            fill: '#475569',
                                        }}
                                        tickLine={false}
                                        axisLine={{
                                            stroke: '#1e3a5f',
                                        }}
                                    />
                                    <ChartTooltip
                                        cursor={{
                                            stroke: '#334155',
                                        }}
                                        content={
                                            <ChartTooltipContent indicator="line" />
                                        }
                                    />
                                    <Line
                                        dataKey="avg_humidity"
                                        type="linear"
                                        stroke="var(--color-avg_humidity)"
                                        strokeWidth={2}
                                        dot={{
                                            r: 2,
                                            fill: '#60a5fa',
                                        }}
                                        activeDot={{
                                            r: 4,
                                            fill: '#60a5fa',
                                        }}
                                    />
                                </LineChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-600">
                                Belum ada data grafik
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head title="SCADA Monitoring" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center gap-2 px-3 pb-2 xl:px-5">
                        <div className="flex w-36 shrink-0 items-center gap-2 xl:w-48">
                            <Thermometer className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    OVERVIEW
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {rooms.length} Ruangan
                                </p>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col items-center">
                            <p className="truncate text-center text-sm font-bold tracking-widest text-white uppercase xl:text-base">
                                SCADA MONITORING AC PRESISI RUANG SERVER CCTV &
                                FIDS
                            </p>
                            <p className="truncate text-[10px] tracking-wider text-slate-400 uppercase xl:text-[11px]">
                                BANDARA SOEKARNO - HATTA
                            </p>
                        </div>

                        <div className="flex w-36 shrink-0 items-center justify-end gap-3 xl:w-48">
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

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <main className="flex min-w-0 flex-1 gap-2 overflow-hidden bg-[#151b1f] p-2 xl:gap-3 xl:p-3">
                    {/* ── LEFT COLUMN: gauges ── */}
                    <div className="flex w-44 shrink-0 flex-col gap-2 xl:w-52 xl:gap-3">
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5 self-start">
                                <Thermometer className="h-4 w-4 text-cyan-400" />
                                <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                    Avg Temperature
                                </span>
                            </div>
                            <ArcGauge
                                value={globalStats.avg_temp}
                                min={normalizedGaugeSettings.temperature.min}
                                max={normalizedGaugeSettings.temperature.max}
                                unit="°C"
                                color="#22d3ee"
                                zones={
                                    normalizedGaugeSettings.temperature.zones
                                }
                            />
                        </div>

                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5 self-start">
                                <Droplets className="h-4 w-4 text-blue-400" />
                                <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                    Avg Humidity
                                </span>
                            </div>
                            <ArcGauge
                                value={globalStats.avg_hum}
                                min={normalizedGaugeSettings.humidity.min}
                                max={normalizedGaugeSettings.humidity.max}
                                unit="%"
                                color="#60a5fa"
                                zones={normalizedGaugeSettings.humidity.zones}
                            />
                        </div>
                    </div>

                    {/* ── MIDDLE COLUMN: room cards 1-3 ── */}
                    <div className="flex h-full w-48 shrink-0 flex-col gap-2 xl:w-56 xl:gap-3">
                        {colMiddleRooms.length > 0
                            ? colMiddleRooms.map((room) => (
                                  <RoomCard
                                      key={room.id}
                                      room={room}
                                      className="flex-1"
                                  />
                              ))
                            : Array.from({ length: 3 }).map((_, i) => (
                                  <div
                                      key={i}
                                      className="flex-1 animate-pulse rounded-xl border border-slate-700/60 bg-slate-800/50"
                                  />
                              ))}
                    </div>

                    {/* ── RIGHT AREA ── */}
                    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden xl:gap-3">
                        {colRightRooms.length > 0 && (
                            <div className="grid shrink-0 grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
                                {colRightRooms.map((room) => (
                                    <div key={room.id} className="min-w-0">
                                        <RoomCard room={room} />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                            <div className="flex shrink-0 items-center justify-end">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setIsChartsFullscreen((prev) => !prev)
                                    }
                                    aria-label={
                                        isChartsFullscreen
                                            ? 'Tutup fullscreen chart dashboard'
                                            : 'Buka fullscreen chart dashboard'
                                    }
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                                        isChartsFullscreen
                                            ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                                            : 'border border-slate-700/40 bg-slate-700/40 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {isChartsFullscreen ? (
                                        <Minimize2 className="h-3 w-3" />
                                    ) : (
                                        <Expand className="h-3 w-3" />
                                    )}
                                    Fullscreen
                                </button>
                            </div>

                            {renderChartPanels(false)}
                        </div>
                    </div>
                </main>

                {isChartsFullscreen && (
                    <div className="fixed inset-0 z-90 flex flex-col bg-[#0f1316] p-3 xl:p-4">
                        <div className="mb-2 flex shrink-0 items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                            <div className="flex items-center gap-1.5">
                                <BarChart2 className="h-4 w-4 text-cyan-400" />
                                <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                                    Dashboard Chart Fullscreen
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsChartsFullscreen(false)}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-700/40 bg-slate-700/30 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-slate-300 uppercase transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                            >
                                <Minimize2 className="h-3.5 w-3.5" />
                                Tutup
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700/60 bg-[#151b1f] p-2 xl:p-3">
                            <div className="flex h-full min-h-0 flex-col gap-2 xl:gap-3">
                                {renderChartPanels(true)}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="dashboard"
                    onSettingsClick={() => router.visit('/settings-general')}
                    rooms={rooms}
                    hasAlarms={hasAlarms}
                    alarmRoomNames={hasAlarms ? alarmSummaryText : ''}
                    lastUpdate={lastUpdate}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
