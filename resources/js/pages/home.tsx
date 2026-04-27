import { Head, router } from '@inertiajs/react';
import {
    Bell,
    BarChart2,
    Home,
    Settings,
    Cpu,
    Thermometer,
    Droplets,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SensorData {
    id: number;
    name: string;
    temperature: number | null;
    humidity: number | null;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
    last_read_at: string | null;
}

interface RoomData {
    id: number;
    name: string;
    location: string | null;
    temp_max_limit: number;
    hum_max_limit: number;
    room_avg_temp: number | null;
    room_avg_hum: number | null;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
    last_update: string | null;
    sensors: SensorData[];
}

interface ChartPoint {
    time: string;
    avg_temperature: number;
    avg_humidity: number;
}

interface GlobalStats {
    avg_temp: number | null;
    avg_hum: number | null;
    active_alarms: number;
    last_update: string | null;
}

interface HomeProps {
    rooms: RoomData[];
    chartLogs: Record<number, ChartPoint[]>;
    globalStats: GlobalStats;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: number | string | null, decimals = 1): string {
    if (value === null || value === undefined) return '--';
    return Number(value).toFixed(decimals);
}

function statusDotColor(status: string): string {
    switch (status) {
        case 'NORMAL':
            return '#22c55e';
        case 'WARNING':
            return '#eab308';
        case 'CRITICAL':
            return '#C97A6B';
        default:
            return '#475569';
    }
}

// ─── SVG Arc Gauge ───────────────────────────────────────────────────────────

function ArcGauge({
    value,
    min = 0,
    max = 50,
    unit = '°C',
    color = '#22d3ee',
}: {
    value: number | null;
    min?: number;
    max?: number;
    unit?: string;
    color?: string;
}) {
    const size = 160;
    const cx = size / 2;
    const cy = size / 2 + 10;
    const r = 62;
    // Sweep goes from 225° to 315° (clockwise), total 270°
    const startAngle = 225;
    const sweepAngle = 270;

    function polarToCartesian(angle: number) {
        const rad = ((angle - 90) * Math.PI) / 180;
        return {
            x: cx + r * Math.cos(rad),
            y: cy + r * Math.sin(rad),
        };
    }

    function describeArc(start: number, end: number) {
        const s = polarToCartesian(start);
        const e = polarToCartesian(end);
        const largeArc = end - start > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
    }

    const clamped = value !== null ? Math.min(Math.max(value, min), max) : min;
    const pct = (clamped - min) / (max - min);
    const valueAngle = startAngle + pct * sweepAngle;

    const bgPath = describeArc(startAngle, startAngle + sweepAngle);
    const fillPath =
        value !== null ? describeArc(startAngle, valueAngle) : null;

    // Tick marks
    const ticks = Array.from({ length: 11 }, (_, i) => {
        const angle = startAngle + (i / 10) * sweepAngle;
        const rad = ((angle - 90) * Math.PI) / 180;
        const innerR = i % 5 === 0 ? r - 12 : r - 7;
        return {
            x1: cx + r * Math.cos(rad),
            y1: cy + r * Math.sin(rad),
            x2: cx + innerR * Math.cos(rad),
            y2: cy + innerR * Math.sin(rad),
            major: i % 5 === 0,
        };
    });

    // Needle
    const needleAngle = startAngle + pct * sweepAngle;
    const needleRad = ((needleAngle - 90) * Math.PI) / 180;
    const needleLen = r - 16;
    const nx = cx + needleLen * Math.cos(needleRad);
    const ny = cy + needleLen * Math.sin(needleRad);

    return (
        <svg
            viewBox={`0 0 ${size} ${size + 10}`}
            className="w-full max-w-[160px]"
        >
            {/* Background arc */}
            <path
                d={bgPath}
                fill="none"
                stroke="#1e3a5f"
                strokeWidth="8"
                strokeLinecap="round"
            />
            {/* Value arc */}
            {fillPath && (
                <path
                    d={fillPath}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                />
            )}
            {/* Ticks */}
            {ticks.map((t, i) => (
                <line
                    key={i}
                    x1={t.x1}
                    y1={t.y1}
                    x2={t.x2}
                    y2={t.y2}
                    stroke={t.major ? '#94a3b8' : '#334155'}
                    strokeWidth={t.major ? 1.5 : 1}
                />
            ))}
            {/* Needle */}
            {value !== null && (
                <>
                    <line
                        x1={cx}
                        y1={cy}
                        x2={nx}
                        y2={ny}
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                    />
                    <circle cx={cx} cy={cy} r="4" fill={color} />
                </>
            )}
            {/* Center value */}
            <text
                x={cx}
                y={cy + 22}
                textAnchor="middle"
                fontSize="22"
                fontWeight="bold"
                fill="white"
                fontFamily="sans-serif"
            >
                {value !== null ? clamped.toFixed(1) : '--'}
            </text>
            <text
                x={cx}
                y={cy + 37}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
                fontFamily="sans-serif"
            >
                {unit}
            </text>
        </svg>
    );
}

// ─── Mini SVG Line Chart ──────────────────────────────────────────────────────

function MiniLineChart({
    data,
    valueKey,
    color = '#22d3ee',
    minY = 0,
}: {
    data: ChartPoint[];
    valueKey: 'avg_temperature' | 'avg_humidity';
    color?: string;
    minY?: number;
}) {
    const W = 280;
    const H = 80;
    const padX = 28;
    const padY = 10;

    const values = data.map((d) => d[valueKey]);
    const maxVal = Math.max(...values, minY + 10);
    const minVal = Math.min(...values, minY);

    const range = maxVal - minVal || 1;

    function toX(i: number) {
        return padX + (i / Math.max(data.length - 1, 1)) * (W - padX * 2);
    }

    function toY(v: number) {
        return padY + (1 - (v - minVal) / range) * (H - padY * 2);
    }

    const points = data
        .map((d, i) => `${toX(i)},${toY(d[valueKey])}`)
        .join(' ');

    // Y-axis labels
    const yLabels = [minVal, (minVal + maxVal) / 2, maxVal].map((v) =>
        Math.round(v),
    );

    // X-axis: show first, middle, last time labels
    const xLabels =
        data.length > 0
            ? [
                  data[0],
                  data[Math.floor(data.length / 2)],
                  data[data.length - 1],
              ].filter(Boolean)
            : [];

    return (
        <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-full w-full">
            {/* Grid lines */}
            {[0, 0.5, 1].map((pct, i) => {
                const y = padY + pct * (H - padY * 2);
                return (
                    <line
                        key={i}
                        x1={padX}
                        y1={y}
                        x2={W - padX}
                        y2={y}
                        stroke="#1e3a5f"
                        strokeWidth="1"
                        strokeDasharray="3,3"
                    />
                );
            })}
            {/* Y axis labels */}
            {yLabels.reverse().map((v, i) => (
                <text
                    key={i}
                    x={padX - 4}
                    y={padY + i * ((H - padY * 2) / 2) + 4}
                    textAnchor="end"
                    fontSize="8"
                    fill="#475569"
                    fontFamily="sans-serif"
                >
                    {v}
                </text>
            ))}
            {/* Data line */}
            {data.length > 1 && (
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                />
            )}
            {/* Last point dot */}
            {data.length > 0 && (
                <circle
                    cx={toX(data.length - 1)}
                    cy={toY(data[data.length - 1][valueKey])}
                    r="2.5"
                    fill={color}
                />
            )}
            {/* X axis labels */}
            {xLabels.map((d, i) => (
                <text
                    key={i}
                    x={
                        i === 0
                            ? padX
                            : i === xLabels.length - 1
                              ? W - padX
                              : W / 2
                    }
                    y={H + 12}
                    textAnchor={
                        i === 0
                            ? 'start'
                            : i === xLabels.length - 1
                              ? 'end'
                              : 'middle'
                    }
                    fontSize="8"
                    fill="#475569"
                    fontFamily="sans-serif"
                >
                    {d.time}
                </text>
            ))}
        </svg>
    );
}

// ─── Sensor Card ─────────────────────────────────────────────────────────────

function SensorCard({
    sensor,
    className = '',
}: {
    sensor: SensorData;
    className?: string;
}) {
    const isOnline = sensor.status !== 'OFFLINE';

    return (
        <div
            className={`flex flex-col justify-center gap-1 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 backdrop-blur-sm ${className}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                        {sensor.name}
                    </span>
                </div>
                
            </div>

            <div className="mt-1 grid min-w-0 grid-cols-2 gap-1.5">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-col items-center">
                        <div className="flex min-w-0 items-end justify-center gap-1">
                            <span
                                className={`max-w-full truncate text-2xl leading-none font-bold tabular-nums sm:text-3xl xl:text-4xl ${isOnline ? 'text-white' : 'text-slate-600'}`}
                            >
                                {fmt(sensor.temperature)}
                            </span>
                            <span className="mb-0.5 shrink-0 text-[10px] text-slate-400 xl:text-xs">
                                °C
                            </span>
                        </div>
                        <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                            TEMP
                        </span>
                    </div>
                </div>

                <div className="min-w-0 border-l border-slate-600/80 pl-2">
                    <div className="flex min-w-0 flex-col items-center">
                        <div className="flex min-w-0 items-end justify-center gap-1">
                            <span
                                className={`max-w-full truncate text-2xl leading-none font-bold tabular-nums sm:text-3xl xl:text-4xl ${isOnline ? 'text-white' : 'text-slate-600'}`}
                            >
                                {fmt(sensor.humidity)}
                            </span>
                            <span className="mb-0.5 shrink-0 text-[10px] text-slate-400 xl:text-xs">
                                %
                            </span>
                        </div>
                        <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                            RH
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage({ rooms, chartLogs, globalStats }: HomeProps) {
    const [now, setNow] = useState(new Date());
    const [activeTab, setActiveTab] = useState<
        'home' | 'chart' | 'floor' | 'table' | 'alarm' | 'settings'
    >('home');

    // Tick clock every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Auto-refresh data every 5 seconds
    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({ only: ['rooms', 'chartLogs', 'globalStats'] });
        }, 5_000);
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

    // Use the first room for the main display
    const room = rooms[0] ?? null;
    const sensors = room?.sensors ?? [];
    const chartData = room ? (chartLogs[room.id] ?? []) : [];

    // Split sensors: first 3 in middle column, rest (4,5) in top-right
    const colMiddleSensors = sensors.slice(0, 3);
    const colRightSensors = sensors.slice(3, 5);

    const hasAlarms = globalStats.active_alarms > 0;

    const totalActiveAlarms = globalStats.active_alarms;

    const lastUpdate = room?.last_update
        ? new Date(room.last_update).toLocaleTimeString('id-ID', {
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
                    <ScadaHeaderLogos />

                    {/* Info row */}
                    <div className="flex items-center px-5 pb-2">
                        {/* Room name */}
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Thermometer className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    {room?.name ?? 'LOADING…'}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {room?.location ?? ''}
                                </p>
                            </div>
                        </div>

                        {/* Center title */}
                        <ScadaHeaderTitle />

                        {/* Time / Date */}
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
                    {/* ── LEFT COLUMN: gauges ── */}
                    <div className="flex w-44 shrink-0 flex-col gap-3">
                        {/* AVG Temperature */}
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5 self-start">
                                <Thermometer className="h-4 w-4 text-cyan-400" />
                                <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                    Avg Temperature
                                </span>
                            </div>
                            <ArcGauge
                                value={room?.room_avg_temp ?? null}
                                min={0}
                                max={40}
                                unit="°C"
                                color="#22d3ee"
                            />
                        </div>

                        {/* AVG Humidity */}
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5 self-start">
                                <Droplets className="h-4 w-4 text-blue-400" />
                                <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                    Avg Humidity
                                </span>
                            </div>
                            <ArcGauge
                                value={room?.room_avg_hum ?? null}
                                min={0}
                                max={100}
                                unit="%"
                                color="#60a5fa"
                            />
                        </div>
                    </div>

                    {/* ── MIDDLE COLUMN: sensor cards 1-3 ── */}
                    <div className="flex h-full w-56 shrink-0 flex-col gap-3">
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
                    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                        {/* Top: sensor cards 4-5 */}
                        {colRightSensors.length > 0 && (
                            <div className="flex shrink-0 gap-3">
                                {colRightSensors.map((sensor) => (
                                    <div key={sensor.id} className="flex-1">
                                        <SensorCard sensor={sensor} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Bottom: charts */}
                        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                            {/* AVG TEMP chart */}
                            <div className="flex flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
                                <div className="mb-1 flex items-center gap-1.5">
                                    <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
                                    <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Avg Temp
                                    </span>
                                </div>
                                <div className="flex flex-1 items-center">
                                    {chartData.length > 0 ? (
                                        <MiniLineChart
                                            data={chartData}
                                            valueKey="avg_temperature"
                                            color="#22d3ee"
                                            minY={0}
                                        />
                                    ) : (
                                        <div className="flex flex-1 items-center justify-center text-xs text-slate-600">
                                            No data
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* AVG HUM chart */}
                            <div className="flex flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
                                <div className="mb-1 flex items-center gap-1.5">
                                    <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
                                    <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Avg Hum
                                    </span>
                                </div>
                                <div className="flex flex-1 items-center">
                                    {chartData.length > 0 ? (
                                        <MiniLineChart
                                            data={chartData}
                                            valueKey="avg_humidity"
                                            color="#60a5fa"
                                            minY={0}
                                        />
                                    ) : (
                                        <div className="flex flex-1 items-center justify-center text-xs text-slate-600">
                                            No data
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <footer className="flex shrink-0 items-center border-t border-slate-700/50 bg-[#0f1316] px-4 py-2">
                    {/* Alarm info */}
                    <div className="flex w-56 shrink-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                            <Bell
                                className={`h-4 w-4 ${hasAlarms ? 'animate-pulse text-destructive' : 'text-slate-500'}`}
                            />
                            <span
                                className={`text-xs font-semibold ${hasAlarms ? 'text-destructive' : 'text-slate-500'}`}
                            >
                                TOTAL ALARM AKTIF :{' '}
                                {hasAlarms ? totalActiveAlarms : 0}
                            </span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                            LAST UPDATE : {lastUpdate} | {dateStr}
                        </span>
                    </div>

                    {/* Nav buttons */}
                    <div className="flex flex-1 items-center justify-center gap-3">
                        {(
                            [
                                { key: 'home', Icon: Home, label: 'Home' },
                                {
                                    key: 'chart',
                                    Icon: BarChart2,
                                    label: 'Chart',
                                },
                                { key: 'alarm', Icon: Bell, label: 'Alarm' },
                                {
                                    key: 'settings',
                                    Icon: Settings,
                                    label: 'Settings',
                                },
                            ] as const
                        ).map(({ key, Icon, label }) => (
                            <button
                                key={key}
                                type="button"
                                title={label}
                                onClick={() => setActiveTab(key)}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                                    activeTab === key
                                        ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                                        : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                                }`}
                            >
                                <Icon className="h-5 w-5" />
                            </button>
                        ))}
                    </div>

                    {/* Sensor status dots */}
                    <div className="flex w-56 shrink-0 items-center justify-end gap-2">
                        {sensors.map((sensor, i) => (
                            <div
                                key={sensor.id}
                                className="flex flex-col items-center gap-0.5"
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12">
                                    <circle
                                        cx="6"
                                        cy="6"
                                        r="5"
                                        fill={statusDotColor(sensor.status)}
                                        style={{
                                            filter:
                                                sensor.status !== 'OFFLINE'
                                                    ? `drop-shadow(0 0 3px ${statusDotColor(sensor.status)})`
                                                    : 'none',
                                        }}
                                    />
                                </svg>
                                <span className="text-[9px] text-slate-500">
                                    {i + 1}
                                </span>
                            </div>
                        ))}
                    </div>
                </footer>
            </div>
        </>
    );
}
