import { Head, Link, router } from '@inertiajs/react';
import { BarChart2, Cpu, Thermometer, Droplets } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArcGauge } from '@/components/scada/arc-gauge';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import {
    fmt,
    statusDotColor,
    statusBadgeClasses,
} from '@/components/scada/scada-helpers';
import type {
    RoomData,
    ChartPoint,
    GlobalStats,
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
    globalStats: GlobalStats;
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
    const totalCount = room.sensors.length;

    return (
        <Link
            href={`/rooms/${room.id}`}
            className={`group flex flex-col justify-center gap-1 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 backdrop-blur-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800/80 ${className}`}
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

            <div className="mt-1 flex items-end gap-0">
                <div className="flex flex-1 flex-col items-center">
                    <div className="flex items-end gap-0.5">
                        <span
                            className={`text-4xl leading-none font-bold ${isOnline ? 'text-white' : 'text-slate-600'}`}
                        >
                            {fmt(room.room_avg_temp)}
                        </span>
                        <span className="mb-1 text-xs text-slate-400">°C</span>
                    </div>
                    <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                        AVG TEMP
                    </span>
                </div>

                <div className="mx-1 h-10 w-px bg-slate-600/80" />

                <div className="flex flex-1 flex-col items-center">
                    <div className="flex items-end gap-0.5">
                        <span
                            className={`text-4xl leading-none font-bold ${isOnline ? 'text-white' : 'text-slate-600'}`}
                        >
                            {fmt(room.room_avg_hum)}
                        </span>
                        <span className="mb-1 text-xs text-slate-400">%</span>
                    </div>
                    <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                        AVG RH
                    </span>
                </div>
            </div>

            <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                    {onlineCount}/{totalCount} sensor online
                </span>
                <span className="text-[10px] text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                    Detail →
                </span>
            </div>
        </Link>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Dashboard({
    rooms,
    chartLogs = {},
    globalStats,
}: DashboardProps) {
    const [now, setNow] = useState(new Date());
    const [activeTab, setActiveTab] = useState<
        'home' | 'chart' | 'floor' | 'table' | 'alarm' | 'settings'
    >('home');

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({ only: ['rooms', 'globalStats', 'chartLogs'] });
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

    const colMiddleRooms = rooms.slice(0, 3);
    const colRightRooms = rooms.slice(3, 5);

    // Use first room's chart data for display (or merge all)
    const firstRoom = rooms[0] ?? null;
    const chartData = firstRoom ? (chartLogs[firstRoom.id] ?? []) : [];

    const hasAlarms = globalStats.active_alarms > 0;

    const alarmRoomNames = rooms
        .filter((r) => r.status === 'WARNING' || r.status === 'CRITICAL')
        .map((r) => r.name)
        .join(', ');

    const lastUpdate = globalStats.last_update
        ? new Date(globalStats.last_update).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
          })
        : '--:--';

    return (
        <>
            <Head title="SCADA Monitoring" />

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

                        <div className="flex flex-1 flex-col items-center">
                            <p className="text-base font-bold tracking-widest text-white uppercase">
                                SCADA MONITORING AC PRESISI RUANG SERVER CCTV &
                                FIDS
                            </p>
                            <p className="text-[11px] tracking-wider text-slate-400 uppercase">
                                BANDARA SOEKARNO - HATTA
                            </p>
                        </div>

                        <div className="flex w-48 shrink-0 items-center justify-end gap-3">
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
                <main className="flex flex-1 gap-3 overflow-hidden bg-[#151b1f] p-3">
                    {/* ── SETTINGS OVERLAY ── */}
                    {activeTab === 'settings' && (
                        <div className="flex flex-1 items-center justify-center">
                            <div className="flex flex-col items-center gap-6">
                                <div className="text-center">
                                    <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                                        Pengaturan Sistem
                                    </p>
                                    <p className="mt-1 text-lg font-bold tracking-wider text-white uppercase">
                                        SCADA Settings
                                    </p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-4">
                                    <Link
                                        href="/rooms"
                                        className="group flex w-52 flex-col items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/60 p-6 backdrop-blur-sm transition-all hover:border-cyan-500/50 hover:bg-slate-800/80 hover:shadow-[0_0_20px_#22d3ee20]"
                                    >
                                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 transition-colors group-hover:border-cyan-500/60 group-hover:bg-cyan-500/20">
                                            <Cpu className="h-7 w-7 text-cyan-400" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold tracking-wider text-white uppercase">
                                                Device Management
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-slate-400">
                                                Kelola Ruangan, HMI &amp; Sensor
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                                            Buka →
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── LEFT COLUMN: gauges ── */}
                    <div
                        className={`flex w-52 shrink-0 flex-col gap-3 ${activeTab === 'settings' ? 'hidden' : ''}`}
                    >
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5 self-start">
                                <Thermometer className="h-4 w-4 text-cyan-400" />
                                <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                    Avg Temperature
                                </span>
                            </div>
                            <ArcGauge
                                value={globalStats.avg_temp}
                                min={0}
                                max={40}
                                unit="°C"
                                color="#22d3ee"
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
                                min={0}
                                max={100}
                                unit="%"
                                color="#60a5fa"
                            />
                        </div>
                    </div>

                    {/* ── MIDDLE COLUMN: room cards 1-3 ── */}
                    <div
                        className={`flex h-full w-56 shrink-0 flex-col gap-3 ${activeTab === 'settings' ? 'hidden' : ''}`}
                    >
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
                    <div
                        className={`flex flex-1 flex-col gap-3 overflow-hidden ${activeTab === 'settings' ? 'hidden' : ''}`}
                    >
                        {colRightRooms.length > 0 && (
                            <div className="flex shrink-0 gap-3">
                                {colRightRooms.map((room) => (
                                    <div key={room.id} className="flex-1">
                                        <RoomCard room={room} />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1">
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

                            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1">
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
                        </div>
                    </div>
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="dashboard"
                    onDashboardClick={() => setActiveTab('home')}
                    rooms={rooms}
                    hasAlarms={hasAlarms}
                    alarmRoomNames={alarmRoomNames}
                    lastUpdate={lastUpdate}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
