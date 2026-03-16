import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    BarChart2,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Thermometer,
    Droplets,
    Download,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomTab {
    id: number;
    name: string;
}

interface SensorInfo {
    id: number;
    name: string;
}

interface LogRow {
    time: string;
    [key: string]: string | number | null;
}

interface SensorChartPoint {
    time: string;
    avg_temperature: number | null;
    avg_humidity: number | null;
}

interface SensorChartSeries {
    sensorId: number;
    sensorName: string;
    points: SensorChartPoint[];
}

type LogViewTab = 'table' | 'chart';

interface Pagination {
    currentPage: number;
    lastPage: number;
    total: number;
}

interface LogsIndexProps {
    rooms: RoomTab[];
    activeRoomId: number;
    sensors: SensorInfo[];
    chartSeriesPerSensor: SensorChartSeries[];
    logs: LogRow[];
    pagination: Pagination;
}

const sensorChartConfig = {
    avg_temperature: {
        label: 'Temperature',
        color: '#22d3ee',
    },
    avg_humidity: {
        label: 'Humidity',
        color: '#60a5fa',
    },
} satisfies ChartConfig;

const sensorLineColors = [
    '#ef4444',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#6366f1',
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsIndex({
    rooms,
    activeRoomId,
    sensors,
    chartSeriesPerSensor,
    logs,
    pagination,
}: LogsIndexProps) {
    const [now, setNow] = useState(new Date());
    const [activeTab, setActiveTab] = useState<LogViewTab>('table');

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({
                only: ['logs', 'pagination', 'chartSeriesPerSensor'],
            });
        }, 60_000);
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

    const sensorCount = sensors.length;

    const hasChartData = chartSeriesPerSensor.some((series) =>
        series.points.some(
            (point) =>
                point.avg_temperature !== null || point.avg_humidity !== null,
        ),
    );

    const maxPointCount = chartSeriesPerSensor.reduce(
        (max, series) => Math.max(max, series.points.length),
        0,
    );

    const sampledPointIndexes = Array.from(
        { length: maxPointCount },
        (_, pointIndex) => pointIndex,
    ).filter((pointIndex) => pointIndex % 2 === 0);

    const temperatureChartData = sampledPointIndexes.map((pointIndex) => {
        const basePoint = chartSeriesPerSensor.find(
            (series) => series.points[pointIndex] !== undefined,
        )?.points[pointIndex];

        return chartSeriesPerSensor.reduce(
            (row, series, sensorIndex) => {
                row[`sensor_${sensorIndex + 1}`] =
                    series.points[pointIndex]?.avg_temperature ?? null;

                return row;
            },
            { time: basePoint?.time ?? '-' } as Record<
                string,
                string | number | null
            >,
        );
    });

    const humidityChartData = sampledPointIndexes.map((pointIndex) => {
        const basePoint = chartSeriesPerSensor.find(
            (series) => series.points[pointIndex] !== undefined,
        )?.points[pointIndex];

        return chartSeriesPerSensor.reduce(
            (row, series, sensorIndex) => {
                row[`sensor_${sensorIndex + 1}`] =
                    series.points[pointIndex]?.avg_humidity ?? null;

                return row;
            },
            { time: basePoint?.time ?? '-' } as Record<
                string,
                string | number | null
            >,
        );
    });

    function navigatePage(page: number) {
        router.get(
            '/logs',
            { room: activeRoomId, page },
            { preserveState: true, preserveScroll: true },
        );
    }

    function switchRoom(roomId: number) {
        router.get('/logs', { room: roomId }, { preserveState: false });
    }

    return (
        <>
            <Head title="Log Sensor — SCADA Monitoring" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <div className="flex items-center justify-between px-5 pt-2 pb-1">
                        <img
                            src="/images/logo/injourney.png"
                            alt="InJourney Airports"
                            className="h-8 object-contain"
                        />
                        <img
                            src="/images/logo/westindo.png"
                            alt="Westindo"
                            className="h-8 object-contain"
                        />
                        <img
                            src="/images/logo/edutic.png"
                            alt="Edutic.id"
                            className="h-8 object-contain"
                        />
                    </div>

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <ClipboardList className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    LOG SENSOR
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Data per Menit
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

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <main className="flex flex-1 flex-col gap-3 overflow-hidden bg-[#151b1f] p-4">
                    {/* ── Room Tabs + Pagination ── */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            {rooms.map((room) => (
                                <button
                                    key={room.id}
                                    type="button"
                                    onClick={() => switchRoom(room.id)}
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                        room.id === activeRoomId
                                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                            : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                                    }`}
                                >
                                    {room.name}
                                </button>
                            ))}
                        </div>

                        {/* Actions & Pagination */}
                        <div className="flex items-center gap-3">
                            <a
                                href={`/logs/export?room=${activeRoomId}`}
                                download={`Log_Sensor_Ruangan_${activeRoomId}.xlsx`}
                                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase transition-colors hover:bg-emerald-600/40 hover:text-emerald-300"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Export Excel
                            </a>

                            <div className="h-5 w-px bg-slate-700/60" />

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={pagination.currentPage <= 1}
                                    onClick={() =>
                                        navigatePage(pagination.currentPage - 1)
                                    }
                                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="min-w-[3rem] text-center text-xs text-slate-300 tabular-nums">
                                    {pagination.currentPage} /{' '}
                                    {pagination.lastPage}
                                </span>
                                <button
                                    type="button"
                                    disabled={
                                        pagination.currentPage >=
                                        pagination.lastPage
                                    }
                                    onClick={() =>
                                        navigatePage(pagination.currentPage + 1)
                                    }
                                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('table')}
                            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                activeTab === 'table'
                                    ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                            }`}
                        >
                            Log Tabel
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('chart')}
                            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                activeTab === 'chart'
                                    ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                            }`}
                        >
                            Log Chart
                        </button>
                    </div>

                    {activeTab === 'chart' ? (
                        <section className="flex-1 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="mb-3 flex items-center gap-1.5">
                                <BarChart2 className="h-4 w-4 text-cyan-400" />
                                <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Visualisasi Log Sensor
                                </span>
                            </div>

                            {chartSeriesPerSensor.length === 0 ? (
                                <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                                    Belum ada sensor di ruangan ini.
                                </div>
                            ) : !hasChartData ? (
                                <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
                                    Belum ada data log grafik untuk ruangan ini.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                                        <p className="mb-2 text-[11px] font-semibold tracking-wider text-cyan-300 uppercase">
                                            Temperature (5 Sensor)
                                        </p>
                                        <div className="h-60">
                                            <ChartContainer
                                                config={sensorChartConfig}
                                                className="h-full w-full"
                                            >
                                                <LineChart
                                                    data={temperatureChartData}
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
                                                        domain={[0, 99]}
                                                        ticks={[
                                                            0, 20, 40, 60, 80,
                                                            99,
                                                        ]}
                                                        allowDecimals={false}
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
                                                            <ChartTooltipContent
                                                                indicator="line"
                                                                hideIndicator
                                                            />
                                                        }
                                                    />
                                                    {chartSeriesPerSensor.map(
                                                        (
                                                            series,
                                                            sensorIndex,
                                                        ) => (
                                                            <Line
                                                                key={`temp_line_${series.sensorId}`}
                                                                dataKey={`sensor_${sensorIndex + 1}`}
                                                                name={
                                                                    series.sensorName
                                                                }
                                                                type="linear"
                                                                stroke={
                                                                    sensorLineColors[
                                                                        sensorIndex %
                                                                            sensorLineColors.length
                                                                    ]
                                                                }
                                                                strokeWidth={2}
                                                                dot={false}
                                                                activeDot={{
                                                                    r: 3,
                                                                }}
                                                            />
                                                        ),
                                                    )}
                                                </LineChart>
                                            </ChartContainer>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-700/60 bg-slate-900/20 px-3 py-2">
                                            {chartSeriesPerSensor.map(
                                                (series, sensorIndex) => (
                                                    <div
                                                        key={`temp_legend_${series.sensorId}`}
                                                        className="flex items-center gap-1.5 text-[11px] text-slate-300"
                                                    >
                                                        <span
                                                            className="h-2.5 w-2.5 rounded-sm"
                                                            style={{
                                                                backgroundColor:
                                                                    sensorLineColors[
                                                                        sensorIndex %
                                                                            sensorLineColors.length
                                                                    ],
                                                            }}
                                                        />
                                                        <span className="uppercase">
                                                            {series.sensorName}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                                        <p className="mb-2 text-[11px] font-semibold tracking-wider text-blue-300 uppercase">
                                            Humidity (5 Sensor)
                                        </p>
                                        <div className="h-60">
                                            <ChartContainer
                                                config={sensorChartConfig}
                                                className="h-full w-full"
                                            >
                                                <LineChart
                                                    data={humidityChartData}
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
                                                        domain={[0, 99]}
                                                        ticks={[
                                                            0, 20, 40, 60, 80,
                                                            99,
                                                        ]}
                                                        allowDecimals={false}
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
                                                            <ChartTooltipContent
                                                                indicator="line"
                                                                hideIndicator
                                                            />
                                                        }
                                                    />
                                                    {chartSeriesPerSensor.map(
                                                        (
                                                            series,
                                                            sensorIndex,
                                                        ) => (
                                                            <Line
                                                                key={`hum_line_${series.sensorId}`}
                                                                dataKey={`sensor_${sensorIndex + 1}`}
                                                                name={
                                                                    series.sensorName
                                                                }
                                                                type="linear"
                                                                stroke={
                                                                    sensorLineColors[
                                                                        sensorIndex %
                                                                            sensorLineColors.length
                                                                    ]
                                                                }
                                                                strokeWidth={2}
                                                                dot={false}
                                                                activeDot={{
                                                                    r: 3,
                                                                }}
                                                            />
                                                        ),
                                                    )}
                                                </LineChart>
                                            </ChartContainer>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-700/60 bg-slate-900/20 px-3 py-2">
                                            {chartSeriesPerSensor.map(
                                                (series, sensorIndex) => (
                                                    <div
                                                        key={`hum_legend_${series.sensorId}`}
                                                        className="flex items-center gap-1.5 text-[11px] text-slate-300"
                                                    >
                                                        <span
                                                            className="h-2.5 w-2.5 rounded-sm"
                                                            style={{
                                                                backgroundColor:
                                                                    sensorLineColors[
                                                                        sensorIndex %
                                                                            sensorLineColors.length
                                                                    ],
                                                            }}
                                                        />
                                                        <span className="uppercase">
                                                            {series.sensorName}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>
                    ) : (
                        <div className="flex-1 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/50 backdrop-blur-sm">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-700/60 hover:bg-transparent">
                                        <TableHead className="sticky left-0 z-10 bg-slate-800/95 text-[11px] font-semibold tracking-wider text-slate-400 uppercase backdrop-blur-sm">
                                            Time
                                        </TableHead>
                                        {sensors.map((_, i) => (
                                            <TableHead
                                                key={`temp_h_${i}`}
                                                className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase"
                                            >
                                                <span className="flex items-center justify-center gap-1">
                                                    <Thermometer className="h-3 w-3 text-cyan-400" />
                                                    Temp_{i + 1}
                                                </span>
                                            </TableHead>
                                        ))}
                                        {sensors.map((_, i) => (
                                            <TableHead
                                                key={`hum_h_${i}`}
                                                className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase"
                                            >
                                                <span className="flex items-center justify-center gap-1">
                                                    <Droplets className="h-3 w-3 text-blue-400" />
                                                    Hum_{i + 1}
                                                </span>
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-center text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">
                                            Avg_Temp
                                        </TableHead>
                                        <TableHead className="text-center text-[11px] font-semibold tracking-wider text-blue-400 uppercase">
                                            Avg_Hum
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow className="border-slate-700/60 hover:bg-transparent">
                                            <TableCell
                                                colSpan={2 + sensorCount * 2}
                                                className="py-16 text-center text-slate-500"
                                            >
                                                Belum ada data log untuk ruangan
                                                ini.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((row, idx) => (
                                            <TableRow
                                                key={idx}
                                                className="border-slate-700/60 transition-colors hover:bg-slate-700/30"
                                            >
                                                <TableCell className="sticky left-0 z-10 bg-slate-800/95 font-mono text-xs text-slate-300 tabular-nums backdrop-blur-sm">
                                                    {row.time}
                                                </TableCell>
                                                {Array.from(
                                                    { length: sensorCount },
                                                    (_, i) => (
                                                        <TableCell
                                                            key={`temp_${i}`}
                                                            className="text-center text-cyan-300 tabular-nums"
                                                        >
                                                            {row[
                                                                `temp_${i + 1}`
                                                            ] ?? '—'}
                                                        </TableCell>
                                                    ),
                                                )}
                                                {Array.from(
                                                    { length: sensorCount },
                                                    (_, i) => (
                                                        <TableCell
                                                            key={`hum_${i}`}
                                                            className="text-center text-blue-300 tabular-nums"
                                                        >
                                                            {row[
                                                                `hum_${i + 1}`
                                                            ] ?? '—'}
                                                        </TableCell>
                                                    ),
                                                )}
                                                <TableCell className="text-center font-semibold text-cyan-400 tabular-nums">
                                                    {row.avg_temp ?? '—'}
                                                </TableCell>
                                                <TableCell className="text-center font-semibold text-blue-400 tabular-nums">
                                                    {row.avg_hum ?? '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="logs"
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
