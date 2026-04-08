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
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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

interface TimeFilter {
    mode: 'none' | 'interval' | 'recent';
    start_at: string | null;
    end_at: string | null;
    recent_minutes: number;
}

interface DateTimeParts {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
}

type DateTimeField = keyof DateTimeParts;

type ChartLogsIndexProps =
    | {
          mode: 'overview';
          rooms: RoomTab[];
          timeFilter: TimeFilter;
          roomChartSeries: RoomChartSeries[];
      }
    | {
          mode: 'detail';
          rooms: RoomTab[];
          timeFilter: TimeFilter;
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

const overviewQuickRangeOptions = [
    { label: '15 Menit Terakhir', minutes: 15 },
    { label: '30 Menit Terakhir', minutes: 30 },
    { label: '1 Jam Terakhir', minutes: 60 },
    { label: '3 Jam Terakhir', minutes: 180 },
    { label: '6 Jam Terakhir', minutes: 360 },
    { label: '12 Jam Terakhir', minutes: 720 },
    { label: '24 Jam Terakhir', minutes: 1440 },
    { label: '2 Hari Terakhir', minutes: 2880 },
    { label: '1 Minggu Terakhir', minutes: 10080 },
    { label: '1 Bulan Terakhir', minutes: 43200 },
];

const detailQuickRangeOptions = [
    { label: '5 Menit Terakhir', minutes: 5 },
    ...overviewQuickRangeOptions,
];

const maxCustomRangeDays = 30;

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function toDateTimeParts(date: Date): DateTimeParts {
    return {
        year: String(date.getFullYear()),
        month: pad2(date.getMonth() + 1),
        day: pad2(date.getDate()),
        hour: pad2(date.getHours()),
        minute: pad2(date.getMinutes()),
        second: pad2(date.getSeconds()),
    };
}

function parseDateTimeParts(value: string | null): DateTimeParts {
    if (!value) {
        return {
            year: '',
            month: '',
            day: '',
            hour: '',
            minute: '',
            second: '',
        };
    }

    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/,
    );

    if (!match) {
        return {
            year: '',
            month: '',
            day: '',
            hour: '',
            minute: '',
            second: '',
        };
    }

    return {
        year: match[1],
        month: match[2],
        day: match[3],
        hour: match[4],
        minute: match[5],
        second: match[6],
    };
}

function formatDateTimeParts(parts: DateTimeParts): string | null {
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);

    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        !Number.isFinite(hour) ||
        !Number.isFinite(minute) ||
        !Number.isFinite(second)
    ) {
        return null;
    }

    if (
        year < 2000 ||
        year > 2100 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
    ) {
        return null;
    }

    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function validateDateTimeParts(
    parts: DateTimeParts,
    label: string,
): {
    formatted: string | null;
    date: Date | null;
    error: string | null;
    invalidFields: DateTimeField[];
} {
    const missingFields = (Object.keys(parts) as DateTimeField[]).filter(
        (field) => parts[field].trim() === '',
    );

    if (missingFields.length > 0) {
        return {
            formatted: null,
            date: null,
            error: `Silakan lengkapi semua field ${label}.`,
            invalidFields: missingFields,
        };
    }

    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);

    const invalidFields: DateTimeField[] = [];

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        invalidFields.push('year');
    }

    if (!Number.isFinite(month) || month < 1 || month > 12) {
        invalidFields.push('month');
    }

    if (!Number.isFinite(day) || day < 1 || day > 31) {
        invalidFields.push('day');
    }

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        invalidFields.push('hour');
    }

    if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
        invalidFields.push('minute');
    }

    if (!Number.isFinite(second) || second < 0 || second > 59) {
        invalidFields.push('second');
    }

    if (invalidFields.length > 0) {
        return {
            formatted: null,
            date: null,
            error: `Format ${label} tidak valid.`,
            invalidFields,
        };
    }

    const formatted = formatDateTimeParts(parts);
    if (!formatted) {
        return {
            formatted: null,
            date: null,
            error: `Format ${label} tidak valid.`,
            invalidFields: ['year', 'month', 'day', 'hour', 'minute', 'second'],
        };
    }

    const candidateDate = new Date(year, month - 1, day, hour, minute, second);
    const isValidDate =
        candidateDate.getFullYear() === year &&
        candidateDate.getMonth() === month - 1 &&
        candidateDate.getDate() === day &&
        candidateDate.getHours() === hour &&
        candidateDate.getMinutes() === minute &&
        candidateDate.getSeconds() === second;

    if (!isValidDate) {
        return {
            formatted: null,
            date: null,
            error: `${label} tidak valid secara kalender.`,
            invalidFields: ['year', 'month', 'day'],
        };
    }

    return {
        formatted,
        date: candidateDate,
        error: null,
        invalidFields: [],
    };
}

function DateTimePartsInput({
    label,
    value,
    invalidFields = [],
    onChange,
}: {
    label: string;
    value: DateTimeParts;
    invalidFields?: DateTimeField[];
    onChange: (next: DateTimeParts) => void;
}) {
    function updateField(field: DateTimeField, nextValue: string): void {
        const sanitized = nextValue.replace(/\D/g, '');
        onChange({ ...value, [field]: sanitized });
    }

    function inputClass(field: DateTimeField): string {
        const hasError = invalidFields.includes(field);

        return [
            'min-w-0 w-full rounded-md bg-slate-900 px-2 py-1.5 text-center text-xs text-slate-100',
            hasError
                ? 'border border-red-500 ring-1 ring-red-500/50'
                : 'border border-slate-600',
        ].join(' ');
    }

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-slate-300">
                {label}
            </p>
            <p className="text-[11px] text-slate-400">
                Tanggal diisi berurutan: Tahun - Bulan - Tanggal.
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-[10px] font-semibold tracking-wide text-slate-400 sm:gap-2">
                <span className="text-center">Tahun</span>
                <span />
                <span className="text-center">Bulan</span>
                <span />
                <span className="text-center">Tanggal</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.year}
                    onChange={(event) =>
                        updateField('year', event.target.value)
                    }
                    maxLength={4}
                    placeholder="YYYY"
                    className={inputClass('year')}
                />
                <span className="text-slate-500">-</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.month}
                    onChange={(event) =>
                        updateField('month', event.target.value)
                    }
                    maxLength={2}
                    placeholder="MM"
                    className={inputClass('month')}
                />
                <span className="text-slate-500">-</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.day}
                    onChange={(event) => updateField('day', event.target.value)}
                    maxLength={2}
                    placeholder="DD"
                    className={inputClass('day')}
                />
            </div>

            <p className="text-[11px] text-slate-400">
                Waktu diisi berurutan: Jam - Menit - Detik.
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-[10px] font-semibold tracking-wide text-slate-400 sm:gap-2">
                <span className="text-center">Jam</span>
                <span />
                <span className="text-center">Menit</span>
                <span />
                <span className="text-center">Detik</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.hour}
                    onChange={(event) =>
                        updateField('hour', event.target.value)
                    }
                    maxLength={2}
                    placeholder="HH"
                    className={inputClass('hour')}
                />
                <span className="text-slate-500">:</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.minute}
                    onChange={(event) =>
                        updateField('minute', event.target.value)
                    }
                    maxLength={2}
                    placeholder="MM"
                    className={inputClass('minute')}
                />
                <span className="text-slate-500">:</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.second}
                    onChange={(event) =>
                        updateField('second', event.target.value)
                    }
                    maxLength={2}
                    placeholder="SS"
                    className={inputClass('second')}
                />
            </div>
        </div>
    );
}

function buildChartLogsHref(
    query: Record<string, string | number | undefined>,
): string {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
            params.set(key, String(value));
        }
    });

    const queryString = params.toString();

    return queryString ? `/chart-logs?${queryString}` : '/chart-logs';
}

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

                <ScadaHeaderTitle />

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
                                isAnimationActive={false}
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

    const pointIndexes = Array.from({ length: maxLen }, (_, i) => i);

    const tempData = pointIndexes.map((pi) => {
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

    const humData = pointIndexes.map((pi) => {
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

    const pointIndexes = Array.from({ length: maxLen }, (_, i) => i);

    const tempData = pointIndexes.map((pi) => {
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

    const humData = pointIndexes.map((pi) => {
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
    const [showCustomRangeDialog, setShowCustomRangeDialog] = useState(false);
    const [intervalValidationError, setIntervalValidationError] = useState<
        string | null
    >(null);
    const [startFieldErrors, setStartFieldErrors] = useState<DateTimeField[]>(
        [],
    );
    const [endFieldErrors, setEndFieldErrors] = useState<DateTimeField[]>([]);
    const [startParts, setStartParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(props.timeFilter.start_at),
    );
    const [endParts, setEndParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(props.timeFilter.end_at),
    );
    const shouldAutoRefresh =
        props.timeFilter.mode === 'none' ||
        (props.timeFilter.mode === 'recent' &&
            props.timeFilter.recent_minutes <= 60);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        if (!shouldAutoRefresh) {
            return;
        }

        const timer = setInterval(() => {
            if (props.mode === 'overview') {
                router.reload({ only: ['roomChartSeries'] });
            } else {
                router.reload({ only: ['chartSeriesPerSensor'] });
            }
        }, 60_000);
        return () => clearInterval(timer);
    }, [props.mode, shouldAutoRefresh]);

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
    const quickRangeOptions = isOverview
        ? overviewQuickRangeOptions
        : detailQuickRangeOptions;
    const activeFilterQuery = {
        ...(props.timeFilter.mode !== 'none'
            ? { time_filter: props.timeFilter.mode }
            : {}),
        ...(props.timeFilter.mode === 'interval' && props.timeFilter.start_at
            ? { start_at: props.timeFilter.start_at }
            : {}),
        ...(props.timeFilter.mode === 'interval' && props.timeFilter.end_at
            ? { end_at: props.timeFilter.end_at }
            : {}),
        ...(props.timeFilter.mode === 'recent'
            ? { recent_minutes: String(props.timeFilter.recent_minutes) }
            : {}),
    };
    const baseRoomQuery =
        props.mode === 'detail' ? { room: props.activeRoomId } : {};
    const activeQuickRange =
        props.timeFilter.mode === 'recent'
            ? quickRangeOptions.find(
                  (option) =>
                      option.minutes === props.timeFilter.recent_minutes,
              )
            : null;
    const selectedFilterOptionValue =
        props.timeFilter.mode === 'none'
            ? 'none'
            : props.timeFilter.mode === 'interval'
              ? 'custom'
              : activeQuickRange
                ? `recent:${activeQuickRange.minutes}`
                : 'recent-custom';

    const activeFilterLabel =
        props.timeFilter.mode === 'recent'
            ? `Menampilkan data ${props.timeFilter.recent_minutes} menit terakhir.`
            : props.timeFilter.mode === 'interval' &&
                props.timeFilter.start_at &&
                props.timeFilter.end_at
              ? `Menampilkan data dari ${props.timeFilter.start_at} sampai ${props.timeFilter.end_at}.`
              : 'Menampilkan data terbaru tanpa filter waktu.';

    function visitChart(
        query: Record<string, string | number | undefined>,
    ): void {
        router.get('/chart-logs', query, {
            preserveState: true,
            preserveScroll: true,
        });
    }

    function goToRoomDetail(roomId: number): void {
        visitChart({ room: roomId, ...activeFilterQuery });
    }

    function switchRoom(roomId: number): void {
        visitChart({ room: roomId, ...activeFilterQuery });
    }

    function applyQuickRange(minutes: number): void {
        visitChart({
            ...baseRoomQuery,
            time_filter: 'recent',
            recent_minutes: String(minutes),
        });
    }

    function handleFilterOptionChange(value: string): void {
        if (value === 'none') {
            resetTimeFilter();

            return;
        }

        if (value === 'custom') {
            openCustomRangeDialog();

            return;
        }

        if (value.startsWith('recent:')) {
            const minutes = Number(value.replace('recent:', ''));

            if (Number.isInteger(minutes) && minutes > 0) {
                applyQuickRange(minutes);
            }
        }
    }

    function openCustomRangeDialog(): void {
        if (
            props.timeFilter.mode === 'interval' &&
            props.timeFilter.start_at &&
            props.timeFilter.end_at
        ) {
            setStartParts(parseDateTimeParts(props.timeFilter.start_at));
            setEndParts(parseDateTimeParts(props.timeFilter.end_at));
        } else {
            const nowDate = new Date();
            const oneHourAgo = new Date(nowDate.getTime() - 60 * 60 * 1000);
            setStartParts(toDateTimeParts(oneHourAgo));
            setEndParts(toDateTimeParts(nowDate));
        }

        setIntervalValidationError(null);
        setStartFieldErrors([]);
        setEndFieldErrors([]);
        setShowCustomRangeDialog(true);
    }

    function applyCustomRange(): void {
        const startResult = validateDateTimeParts(startParts, 'Waktu mulai');
        if (startResult.error) {
            setIntervalValidationError(startResult.error);
            setStartFieldErrors(startResult.invalidFields);
            setEndFieldErrors([]);
            return;
        }

        const endResult = validateDateTimeParts(endParts, 'Waktu selesai');
        if (endResult.error) {
            setIntervalValidationError(endResult.error);
            setStartFieldErrors([]);
            setEndFieldErrors(endResult.invalidFields);
            return;
        }

        if (!startResult.date || !endResult.date) {
            setIntervalValidationError('Time interval tidak valid.');
            return;
        }

        if (endResult.date.getTime() < startResult.date.getTime()) {
            setIntervalValidationError(
                'Waktu selesai harus sama dengan atau lebih besar dari waktu mulai.',
            );
            setStartFieldErrors([
                'year',
                'month',
                'day',
                'hour',
                'minute',
                'second',
            ]);
            setEndFieldErrors([
                'year',
                'month',
                'day',
                'hour',
                'minute',
                'second',
            ]);
            return;
        }

        const maxIntervalMs = maxCustomRangeDays * 24 * 60 * 60 * 1000;
        if (
            endResult.date.getTime() - startResult.date.getTime() >
            maxIntervalMs
        ) {
            setIntervalValidationError(
                `Maksimal rentang custom adalah ${maxCustomRangeDays} hari.`,
            );
            return;
        }

        if (!startResult.formatted || !endResult.formatted) {
            setIntervalValidationError('Time interval tidak valid.');
            return;
        }

        setIntervalValidationError(null);
        setStartFieldErrors([]);
        setEndFieldErrors([]);

        visitChart({
            ...baseRoomQuery,
            time_filter: 'interval',
            start_at: startResult.formatted,
            end_at: endResult.formatted,
        });

        setShowCustomRangeDialog(false);
    }

    function resetTimeFilter(): void {
        visitChart({ ...baseRoomQuery });
    }

    return (
        <>
            <Head
                title={
                    isOverview
                        ? 'Chart Log — SCADA Monitoring'
                        : `Chart ${props.activeRoomName} — SCADA Monitoring`
                }
            />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
                <PageHeader
                    timeStr={timeStr}
                    dateStr={dateStr}
                    backHref={
                        isOverview
                            ? undefined
                            : buildChartLogsHref(activeFilterQuery)
                    }
                    title={isOverview ? 'CHART LOG' : props.activeRoomName}
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
                            {props.roomChartSeries.map((series, ri) => (
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
                                            goToRoomDetail(series.roomId)
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
                                    onClick={() => switchRoom(room.id)}
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                        room.id === props.activeRoomId
                                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                            : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                                    }`}
                                >
                                    {room.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Filter controls ── */}
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="w-full sm:w-[360px]">
                                <Select
                                    value={selectedFilterOptionValue}
                                    onValueChange={handleFilterOptionChange}
                                >
                                    <SelectTrigger className="h-8 border-slate-700 bg-slate-800/70 text-xs text-slate-100">
                                        <SelectValue placeholder="Pilih Opsi Filter Waktu" />
                                    </SelectTrigger>
                                    <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                                        <SelectItem value="none">
                                            Tampilkan Semua Data Terbaru
                                        </SelectItem>
                                        {quickRangeOptions.map((option) => (
                                            <SelectItem
                                                key={option.minutes}
                                                value={`recent:${option.minutes}`}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                        {props.timeFilter.mode === 'recent' &&
                                            !activeQuickRange && (
                                                <SelectItem value="recent-custom">
                                                    {`${props.timeFilter.recent_minutes} Menit Terakhir`}
                                                </SelectItem>
                                            )}
                                        <SelectItem value="custom">
                                            Pilih Rentang Waktu Kustom
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <span className="min-w-0 grow truncate rounded-md border border-slate-700/70 bg-slate-900/50 px-2.5 py-1 text-[11px] text-slate-300">
                                {activeFilterLabel}
                            </span>
                        </div>
                    </div>

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
                                : `Visualisasi Sensor — ${props.activeRoomName}`}
                        </span>
                    </div>

                    {/* ── Charts ── */}
                    <section className="flex-1 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 backdrop-blur-sm">
                        {isOverview ? (
                            <OverviewCharts
                                roomChartSeries={props.roomChartSeries}
                            />
                        ) : (
                            <DetailCharts
                                chartSeriesPerSensor={
                                    props.chartSeriesPerSensor
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

                <Dialog
                    open={showCustomRangeDialog}
                    onOpenChange={setShowCustomRangeDialog}
                >
                    <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Custom Time Range
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                                Isi Waktu Mulai dan Waktu Selesai secara lengkap
                                (Tahun, Bulan, Tanggal, Jam, Menit, Detik).
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <DateTimePartsInput
                                label="Waktu mulai"
                                value={startParts}
                                invalidFields={startFieldErrors}
                                onChange={(next) => {
                                    setStartParts(next);
                                    if (intervalValidationError) {
                                        setIntervalValidationError(null);
                                    }
                                    if (startFieldErrors.length > 0) {
                                        setStartFieldErrors([]);
                                    }
                                }}
                            />

                            <DateTimePartsInput
                                label="Waktu selesai"
                                value={endParts}
                                invalidFields={endFieldErrors}
                                onChange={(next) => {
                                    setEndParts(next);
                                    if (intervalValidationError) {
                                        setIntervalValidationError(null);
                                    }
                                    if (endFieldErrors.length > 0) {
                                        setEndFieldErrors([]);
                                    }
                                }}
                            />

                            {intervalValidationError && (
                                <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                    {intervalValidationError}
                                </p>
                            )}
                        </div>

                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setShowCustomRangeDialog(false)}
                                className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={applyCustomRange}
                                className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
                            >
                                Apply
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
