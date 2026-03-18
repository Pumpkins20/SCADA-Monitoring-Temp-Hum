import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    BarChart2,
    ChevronRight,
    Droplets,
    Thermometer,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomTab {
    id: number;
    name: string;
}

interface ChartPoint {
    time: string;
    avg_temperature: number | null;
    avg_humidity: number | null;
}

interface RoomChartSeries {
    roomId: number;
    roomName: string;
    points: ChartPoint[];
}

interface SensorInfo {
    id: number;
    name: string;
}

interface SensorChartSeries {
    sensorId: number;
    sensorName: string;
    points: ChartPoint[];
}

type ChartLogsIndexProps =
    | {
          mode: 'overview';
          rooms: RoomTab[];
          roomChartSeries: RoomChartSeries[];
      }
    | {
          mode: 'detail';
          rooms: RoomTab[];
          activeRoomId: number;
          activeRoomName: string;
          sensors: SensorInfo[];
          chartSeriesPerSensor: SensorChartSeries[];
      };

// ─── Constants ────────────────────────────────────────────────────────────────

const lineColors = [
    '#ef4444',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#6366f1',
    '#f97316',
    '#a855f7',
    '#ec4899',
];

const chartConfig = {
    avg_temperature: { label: 'Temperature', color: '#22d3ee' },
    avg_humidity: { label: 'Humidity', color: '#60a5fa' },
} satisfies ChartConfig;

// ─── Shared: Page Header ──────────────────────────────────────────────────────

function PageHeader({
    timeStr,
    dateStr,
    backHref,
    title,
    subtitle,
}: {
    timeStr: string;
    dateStr: string;
    backHref?: string;
    title: string;
    subtitle: string;
}) {
    return (
        <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
            <ScadaHeaderLogos />

            <div className="flex items-center px-5 pb-2">
                <div className="flex w-48 shrink-0 items-center gap-2">
                    {backHref && (
                        <Link
                            href={backHref}
                            className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                        >
                            <ArrowLeft className="h-4 w-4 text-slate-400" />
                        </Link>
                    )}
                    <BarChart2 className="h-5 w-5 text-cyan-400" />
                    <div>
                        <p className="text-sm font-bold tracking-wider text-white uppercase">
                            {title}
                        </p>
                        <p className="text-[10px] text-slate-400">{subtitle}</p>
                    </div>
                </div>

                <div className="flex flex-1 flex-col items-center">
                    <p className="text-base font-bold tracking-widest text-white uppercase">
                        SCADA MONITORING AC PRESISI RUANG SERVER CCTV & FIDS
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
                        <p className="text-[10px] text-slate-400">{dateStr}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}

// ─── Shared: Chart Panel ──────────────────────────────────────────────────────

function ChartPanel({
    label,
    labelColor,
    data,
    seriesKeys,
    seriesNames,
}: {
    label: string;
    labelColor: string;
    data: Record<string, string | number | null>[];
    seriesKeys: string[];
    seriesNames: string[];
}) {
    return (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
            <p
                className="mb-2 text-[11px] font-semibold tracking-wider uppercase"
                style={{ color: labelColor }}
            >
                {label}
            </p>
            <div className="h-60">
                <ChartContainer config={chartConfig} className="h-full w-full">
                    <LineChart
                        data={data}
                        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
                    >
                        <CartesianGrid stroke="#1e3a5f" strokeDasharray="3 3" />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 9, fill: '#475569' }}
                            tickLine={false}
                            axisLine={{ stroke: '#1e3a5f' }}
                        />
                        <YAxis
                            domain={[0, 99]}
                            ticks={[0, 20, 40, 60, 80, 99]}
                            allowDecimals={false}
                            tick={{ fontSize: 9, fill: '#475569' }}
                            tickLine={false}
                            axisLine={{ stroke: '#1e3a5f' }}
                        />
                        <ChartTooltip
                            cursor={{ stroke: '#334155' }}
                            content={
                                <ChartTooltipContent
                                    indicator="line"
                                    hideIndicator
                                />
                            }
                        />
                        {seriesKeys.map((key, idx) => (
                            <Line
                                key={key}
                                dataKey={key}
                                name={seriesNames[idx]}
                                type="linear"
                                stroke={lineColors[idx % lineColors.length]}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 3 }}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ChartContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-700/60 bg-slate-900/20 px-3 py-2">
                {seriesNames.map((name, idx) => (
                    <div
                        key={name}
                        className="flex items-center gap-1.5 text-[11px] text-slate-300"
                    >
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{
                                backgroundColor:
                                    lineColors[idx % lineColors.length],
                            }}
                        />
                        <span className="uppercase">{name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewCharts({
    roomChartSeries,
}: {
    roomChartSeries: RoomChartSeries[];
}) {
    const hasData = roomChartSeries.some((s) =>
        s.points.some(
            (p) => p.avg_temperature !== null || p.avg_humidity !== null,
        ),
    );

    const maxLen = roomChartSeries.reduce(
        (m, s) => Math.max(m, s.points.length),
        0,
    );

    const sampledIndexes = Array.from({ length: maxLen }, (_, i) => i).filter(
        (i) => i % 2 === 0,
    );

    const tempData = sampledIndexes.map((pi) => {
        const baseTime =
            roomChartSeries.find((s) => s.points[pi])?.points[pi].time ?? '-';
        return roomChartSeries.reduce(
            (row, series, ri) => {
                row[`room_${ri + 1}`] =
                    series.points[pi]?.avg_temperature ?? null;
                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );
    });

    const humData = sampledIndexes.map((pi) => {
        const baseTime =
            roomChartSeries.find((s) => s.points[pi])?.points[pi].time ?? '-';
        return roomChartSeries.reduce(
            (row, series, ri) => {
                row[`room_${ri + 1}`] = series.points[pi]?.avg_humidity ?? null;
                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );
    });

    const seriesKeys = roomChartSeries.map((_, ri) => `room_${ri + 1}`);
    const seriesNames = roomChartSeries.map((s) => s.roomName);

    if (roomChartSeries.length === 0) {
        return (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada ruangan yang terdaftar.
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada data log grafik.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <ChartPanel
                label="Temperature — Rata-rata per Ruangan"
                labelColor="#67e8f9"
                data={tempData}
                seriesKeys={seriesKeys}
                seriesNames={seriesNames}
            />
            <ChartPanel
                label="Humidity — Rata-rata per Ruangan"
                labelColor="#93c5fd"
                data={humData}
                seriesKeys={seriesKeys}
                seriesNames={seriesNames}
            />
        </div>
    );
}

// ─── Detail Section ───────────────────────────────────────────────────────────

function DetailCharts({
    chartSeriesPerSensor,
}: {
    chartSeriesPerSensor: SensorChartSeries[];
}) {
    const hasData = chartSeriesPerSensor.some((s) =>
        s.points.some(
            (p) => p.avg_temperature !== null || p.avg_humidity !== null,
        ),
    );

    const maxLen = chartSeriesPerSensor.reduce(
        (m, s) => Math.max(m, s.points.length),
        0,
    );

    const sampledIndexes = Array.from({ length: maxLen }, (_, i) => i).filter(
        (i) => i % 2 === 0,
    );

    const tempData = sampledIndexes.map((pi) => {
        const baseTime =
            chartSeriesPerSensor.find((s) => s.points[pi])?.points[pi].time ??
            '-';
        return chartSeriesPerSensor.reduce(
            (row, series, si) => {
                row[`sensor_${si + 1}`] =
                    series.points[pi]?.avg_temperature ?? null;
                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );
    });

    const humData = sampledIndexes.map((pi) => {
        const baseTime =
            chartSeriesPerSensor.find((s) => s.points[pi])?.points[pi].time ??
            '-';
        return chartSeriesPerSensor.reduce(
            (row, series, si) => {
                row[`sensor_${si + 1}`] =
                    series.points[pi]?.avg_humidity ?? null;
                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );
    });

    const seriesKeys = chartSeriesPerSensor.map((_, si) => `sensor_${si + 1}`);
    const seriesNames = chartSeriesPerSensor.map((s) => s.sensorName);

    if (chartSeriesPerSensor.length === 0) {
        return (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada sensor di ruangan ini.
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada data log grafik untuk ruangan ini.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <ChartPanel
                label="Temperature — Per Sensor"
                labelColor="#67e8f9"
                data={tempData}
                seriesKeys={seriesKeys}
                seriesNames={seriesNames}
            />
            <ChartPanel
                label="Humidity — Per Sensor"
                labelColor="#93c5fd"
                data={humData}
                seriesKeys={seriesKeys}
                seriesNames={seriesNames}
            />
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChartLogsIndex(props: ChartLogsIndexProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        const timer = setInterval(() => {
            if (props.mode === 'overview') {
                router.reload({ only: ['roomChartSeries'] });
            } else {
                router.reload({ only: ['chartSeriesPerSensor'] });
            }
        }, 60_000);
        return () => clearInterval(timer);
    }, [props.mode]);

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

    const isOverview = props.mode === 'overview';

    return (
        <>
            <Head
                title={
                    isOverview
                        ? 'Chart Log — SCADA Monitoring'
                        : `Chart ${(props as { activeRoomName: string }).activeRoomName} — SCADA Monitoring`
                }
            />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
                <PageHeader
                    timeStr={timeStr}
                    dateStr={dateStr}
                    backHref={isOverview ? undefined : '/chart-logs'}
                    title={
                        isOverview
                            ? 'CHART LOG'
                            : (props as { activeRoomName: string })
                                  .activeRoomName
                    }
                    subtitle={
                        isOverview
                            ? 'Rata-rata per Ruangan'
                            : 'Detail per Sensor'
                    }
                />

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <main className="flex flex-1 flex-col gap-3 overflow-hidden bg-[#151b1f] p-4">
                    {/* ── Overview: legend + detail buttons ── */}
                    {isOverview && (
                        <div className="flex flex-wrap items-center gap-2">
                            {(
                                props as { roomChartSeries: RoomChartSeries[] }
                            ).roomChartSeries.map((series, ri) => (
                                <div
                                    key={series.roomId}
                                    className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5"
                                >
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                        style={{
                                            backgroundColor:
                                                lineColors[
                                                    ri % lineColors.length
                                                ],
                                        }}
                                    />
                                    <span className="text-[11px] font-semibold tracking-wider text-slate-200 uppercase">
                                        {series.roomName}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.get('/chart-logs', {
                                                room: series.roomId,
                                            })
                                        }
                                        className="flex items-center gap-0.5 rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 uppercase transition-colors hover:bg-cyan-500/25 hover:text-cyan-300"
                                    >
                                        Detail
                                        <ChevronRight className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Detail: room selector buttons ── */}
                    {!isOverview && (
                        <div className="flex items-center gap-2">
                            {props.rooms.map((room) => (
                                <button
                                    key={room.id}
                                    type="button"
                                    onClick={() =>
                                        router.get('/chart-logs', {
                                            room: room.id,
                                        })
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                        room.id ===
                                        (
                                            props as {
                                                activeRoomId: number;
                                            }
                                        ).activeRoomId
                                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                            : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                                    }`}
                                >
                                    {room.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Chart heading ── */}
                    <div className="flex items-center gap-1.5">
                        {isOverview ? (
                            <Thermometer className="h-4 w-4 text-cyan-400" />
                        ) : (
                            <Droplets className="h-4 w-4 text-cyan-400" />
                        )}
                        <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            {isOverview
                                ? 'Visualisasi Rata-rata Suhu & Kelembapan per Ruangan'
                                : `Visualisasi Sensor — ${(props as { activeRoomName: string }).activeRoomName}`}
                        </span>
                    </div>

                    {/* ── Charts ── */}
                    <section className="flex-1 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                        {isOverview ? (
                            <OverviewCharts
                                roomChartSeries={
                                    (
                                        props as {
                                            roomChartSeries: RoomChartSeries[];
                                        }
                                    ).roomChartSeries
                                }
                            />
                        ) : (
                            <DetailCharts
                                chartSeriesPerSensor={
                                    (
                                        props as {
                                            chartSeriesPerSensor: SensorChartSeries[];
                                        }
                                    ).chartSeriesPerSensor
                                }
                            />
                        )}
                    </section>
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="chart-logs"
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
