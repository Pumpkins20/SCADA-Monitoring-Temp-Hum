import { Head, Link, router } from '@inertiajs/react';
import { BarChart2, ArrowLeft, Thermometer, Droplets, Map } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArcGauge } from '@/components/scada/arc-gauge';
import { FloorPlanMap } from '@/components/scada/floor-plan-map';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import type {
    RoomData,
    ChartPoint,
    GaugeSettings,
    GaugeMetricSettings,
} from '@/components/scada/scada-helpers';
import { SensorCard } from '@/components/scada/sensor-card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomShowProps {
    room: RoomData;
    chartLogs: ChartPoint[];
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomShow({
    room,
    chartLogs,
    gaugeSettings,
}: RoomShowProps) {
    const [now, setNow] = useState(new Date());
    const [activePanel, setActivePanel] = useState<'chart' | 'floorplan'>(
        'chart',
    );

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
            router.reload({ only: ['room', 'chartLogs', 'gaugeSettings'] });
        }, 30_000);
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

    const sensors = room.sensors ?? [];
    const colMiddleSensors = sensors.slice(0, 3);
    const colRightSensors = sensors.slice(3, 5);

    const hasAlarms = sensors.some(
        (s) => s.status === 'WARNING' || s.status === 'CRITICAL',
    );
    const alarmSensorNames = sensors
        .filter((s) => s.status === 'WARNING' || s.status === 'CRITICAL')
        .map((s) => s.name)
        .join(', ');

    return (
        <>
            <Head title={`${room.name} — SCADA Monitoring`} />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center gap-2 px-3 pb-2 xl:px-5">
                        <div className="flex w-36 shrink-0 items-center gap-2 xl:w-48">
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <Thermometer className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    {room.name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {room.location ?? ''}
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
                                value={room.room_avg_temp}
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
                                value={room.room_avg_hum}
                                min={normalizedGaugeSettings.humidity.min}
                                max={normalizedGaugeSettings.humidity.max}
                                unit="%"
                                color="#60a5fa"
                                zones={normalizedGaugeSettings.humidity.zones}
                            />
                        </div>

                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
                            <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                Cross-check Avg HMI
                            </p>
                            <div className="mt-1 font-mono text-xs">
                                <p className="text-cyan-300">
                                    Temp: {room.hmi_avg_temp ?? '-'} degC
                                </p>
                                <p className="text-blue-300">
                                    Hum: {room.hmi_avg_hum ?? '-'} %RH
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── MIDDLE COLUMN: sensor cards 1-3 ── */}
                    <div className="flex h-full w-48 shrink-0 flex-col gap-2 xl:w-56 xl:gap-3">
                        {colMiddleSensors.length > 0
                            ? colMiddleSensors.map((sensor) => (
                                  <SensorCard
                                      key={sensor.id}
                                      sensor={sensor}
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
                        {colRightSensors.length > 0 && (
                            <div className="grid shrink-0 grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
                                {colRightSensors.map((sensor) => (
                                    <div key={sensor.id} className="min-w-0">
                                        <SensorCard sensor={sensor} />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                            {/* ── Panel toggle ── */}
                            <div className="flex shrink-0 items-center gap-1.5 self-end">
                                <button
                                    type="button"
                                    onClick={() => setActivePanel('chart')}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                                        activePanel === 'chart'
                                            ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-400'
                                            : 'border border-slate-700/40 bg-slate-700/40 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <BarChart2 className="h-3 w-3" />
                                    Chart
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActivePanel('floorplan')}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                                        activePanel === 'floorplan'
                                            ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-400'
                                            : 'border border-slate-700/40 bg-slate-700/40 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <Map className="h-3 w-3" />
                                    Denah
                                </button>
                            </div>

                            {/* ── Floor plan panel ── */}
                            {activePanel === 'floorplan' && (
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <FloorPlanMap
                                        sensors={room.sensors}
                                        roomName={room.name}
                                    />
                                </div>
                            )}

                            {/* ── Chart panels ── */}
                            {activePanel === 'chart' && (
                                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1">
                                    <div className="mb-0.5 flex items-center gap-1.5">
                                        <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
                                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                            Avg Temp
                                        </span>
                                    </div>
                                    <div className="min-h-0 flex-1">
                                        {chartLogs.length > 0 ? (
                                            <ChartContainer
                                                config={tempChartConfig}
                                                className="h-full w-full"
                                            >
                                                <LineChart
                                                    data={chartLogs}
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
                            )}
                            {activePanel === 'chart' && (
                                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1">
                                    <div className="mb-0.5 flex items-center gap-1.5">
                                        <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
                                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                            Avg Hum
                                        </span>
                                    </div>
                                    <div className="min-h-0 flex-1">
                                        {chartLogs.length > 0 ? (
                                            <ChartContainer
                                                config={humChartConfig}
                                                className="h-full w-full"
                                            >
                                                <LineChart
                                                    data={chartLogs}
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
                            )}
                        </div>
                    </div>
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="dashboard"
                    hasAlarms={hasAlarms}
                    alarmRoomNames={alarmSensorNames}
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
