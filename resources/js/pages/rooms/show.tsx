import { Head, Link, router } from '@inertiajs/react';
import {
    BarChart2,
    ArrowLeft,
    Thermometer,
    Droplets,
    Map,
    Expand,
    Minimize2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArcGauge } from '@/components/scada/arc-gauge';
import { FloorPlanMap } from '@/components/scada/floor-plan-map';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';
import { statusBadgeClasses } from '@/components/scada/scada-helpers';
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


// --- Types -------------------------------------------------------------------

interface RoomShowProps {
    room: RoomData;
    chartSeriesPerSensor: SensorChartSeries[];
    roomAverageChartSeries?: ChartPoint[];
    gaugeSettings: GaugeSettings;
    timeFilter: TimeFilter;
}

interface SensorChartSeries {
    sensorId: number;
    sensorName: string;
    points: ChartPoint[];
}

interface ChartSeriesDefinition {
    key: string;
    label: string;
    color: string;
    isAverage: boolean;
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
                ? 'border border-red-500 CRITICAL_TONE.field'
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

// --- Chart Configs ------------------------------------------------------------

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

const averageLineColor = '#f8fafc';

const roomQuickRangeOptions = [
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

const maxCustomRangeDays = 30;

function formatThresholdRange(
    under: number | null | undefined,
    over: number | null | undefined,
    unit: string,
): string {
    if (
        under === null ||
        under === undefined ||
        over === null ||
        over === undefined
    ) {
        return '-';
    }

    return `${under.toFixed(2)} - ${over.toFixed(2)} ${unit}`;
}

function formatLiveMetric(
    value: number | null | undefined,
    unit: string,
): string {
    if (value === null || value === undefined) {
        return '-';
    }

    return `${value.toFixed(1)} ${unit}`;
}

// --- Main Page ----------------------------------------------------------------

export default function RoomShow({
    room,
    chartSeriesPerSensor,
    roomAverageChartSeries = [],
    gaugeSettings,
    timeFilter,
}: RoomShowProps) {
    const [now, setNow] = useState(new Date());
    const [activePanel, setActivePanel] = useState<'chart' | 'floorplan'>(
        'chart',
    );
    const [isPanelFullscreen, setIsPanelFullscreen] = useState(false);
    const [isThresholdPanelCollapsed, setIsThresholdPanelCollapsed] =
        useState(false);
    const [
        isFullscreenThresholdPanelCollapsed,
        setIsFullscreenThresholdPanelCollapsed,
    ] = useState(false);
    const [showCustomRangeDialog, setShowCustomRangeDialog] = useState(false);
    const [intervalValidationError, setIntervalValidationError] = useState<
        string | null
    >(null);
    const [startFieldErrors, setStartFieldErrors] = useState<DateTimeField[]>(
        [],
    );
    const [endFieldErrors, setEndFieldErrors] = useState<DateTimeField[]>([]);
    const [startParts, setStartParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(timeFilter.start_at),
    );
    const [endParts, setEndParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(timeFilter.end_at),
    );
    const [selectedSeriesKeys, setSelectedSeriesKeys] = useState<string[]>(
        () => [
            ...chartSeriesPerSensor.map(
                (_, sensorIndex) => `sensor_${sensorIndex + 1}`,
            ),
            'average',
        ],
    );
    const shouldAutoRefresh =
        timeFilter.mode === 'none' ||
        (timeFilter.mode === 'recent' && timeFilter.recent_minutes <= 60);

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
        if (!shouldAutoRefresh) {
            return;
        }

        const timer = setInterval(() => {
            router.reload({
                only: [
                    'room',
                    'chartSeriesPerSensor',
                    'roomAverageChartSeries',
                    'gaugeSettings',
                    'timeFilter',
                ],
            });
        }, 5_000);

        return () => clearInterval(timer);
    }, [shouldAutoRefresh]);

    useEffect(() => {
        if (!isPanelFullscreen) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setIsPanelFullscreen(false);
            }
        }

        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isPanelFullscreen]);

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

    const activeQuickRange =
        timeFilter.mode === 'recent'
            ? roomQuickRangeOptions.find(
                  (option) => option.minutes === timeFilter.recent_minutes,
              )
            : null;

    const selectedFilterOptionValue =
        timeFilter.mode === 'none'
            ? 'none'
            : timeFilter.mode === 'interval'
              ? 'custom'
              : activeQuickRange
                ? `recent:${activeQuickRange.minutes}`
                : 'recent-custom';

    const sensors = room.sensors ?? [];
    const colMiddleSensors = sensors.slice(0, 3);
    const colRightSensors = sensors.slice(3, 5);

    const hasAlarms = sensors.some(
        (sensor) => sensor.status === 'WARNING' || sensor.status === 'CRITICAL',
    );
    const alarmSensorNames = sensors
        .filter(
            (sensor) =>
                sensor.status === 'WARNING' || sensor.status === 'CRITICAL',
        )
        .map((sensor) => sensor.name)
        .join(', ');

    const sensorSeriesKeys = chartSeriesPerSensor.map(
        (_, sensorIndex) => `sensor_${sensorIndex + 1}`,
    );
    const sensorSeriesNames = chartSeriesPerSensor.map(
        (series) => series.sensorName,
    );

    const chartSeriesDefinitions: ChartSeriesDefinition[] = [
        ...sensorSeriesKeys.map((seriesKey, index) => ({
            key: seriesKey,
            label: sensorSeriesNames[index] ?? `Sensor ${index + 1}`,
            color: lineColors[index % lineColors.length],
            isAverage: false,
        })),
        {
            key: 'average',
            label: 'Average Ruangan',
            color: averageLineColor,
            isAverage: true,
        },
    ];

    const visibleSeriesDefinitions = chartSeriesDefinitions.filter((series) =>
        selectedSeriesKeys.includes(series.key),
    );

    const hasChartData =
        chartSeriesPerSensor.some((series) =>
            series.points.some(
                (point) =>
                    point.avg_temperature !== null ||
                    point.avg_humidity !== null,
            ),
        ) ||
        roomAverageChartSeries.some(
            (point) =>
                point.avg_temperature !== null || point.avg_humidity !== null,
        );

    const maxChartPoints = Math.max(
        roomAverageChartSeries.length,
        chartSeriesPerSensor.reduce(
            (maxPoints, series) => Math.max(maxPoints, series.points.length),
            0,
        ),
    );

    const chartPointIndexes = Array.from(
        { length: maxChartPoints },
        (_, index) => index,
    );

    const tempChartData = chartPointIndexes.map((pointIndex) => {
        const baseTime =
            chartSeriesPerSensor.find((series) => series.points[pointIndex])
                ?.points[pointIndex].time ??
            roomAverageChartSeries[pointIndex]?.time ??
            '-';

        const row = chartSeriesPerSensor.reduce(
            (row, series, sensorIndex) => {
                row[`sensor_${sensorIndex + 1}`] =
                    series.points[pointIndex]?.avg_temperature ?? null;

                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );

        row.average =
            roomAverageChartSeries[pointIndex]?.avg_temperature ?? null;

        return row;
    });

    const humChartData = chartPointIndexes.map((pointIndex) => {
        const baseTime =
            chartSeriesPerSensor.find((series) => series.points[pointIndex])
                ?.points[pointIndex].time ??
            roomAverageChartSeries[pointIndex]?.time ??
            '-';

        const row = chartSeriesPerSensor.reduce(
            (row, series, sensorIndex) => {
                row[`sensor_${sensorIndex + 1}`] =
                    series.points[pointIndex]?.avg_humidity ?? null;

                return row;
            },
            { time: baseTime } as Record<string, string | number | null>,
        );

        row.average = roomAverageChartSeries[pointIndex]?.avg_humidity ?? null;

        return row;
    });

    function visitRoom(query: Record<string, string | number>): void {
        router.get(`/rooms/${room.id}`, query, {
            preserveState: true,
            preserveScroll: true,
        });
    }

    function applyQuickRange(minutes: number): void {
        visitRoom({
            time_filter: 'recent',
            recent_minutes: String(minutes),
        });
    }

    function resetTimeFilter(): void {
        visitRoom({});
    }

    function openCustomRangeDialog(): void {
        if (
            timeFilter.mode === 'interval' &&
            timeFilter.start_at &&
            timeFilter.end_at
        ) {
            setStartParts(parseDateTimeParts(timeFilter.start_at));
            setEndParts(parseDateTimeParts(timeFilter.end_at));
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

        visitRoom({
            time_filter: 'interval',
            start_at: startResult.formatted,
            end_at: endResult.formatted,
        });

        setShowCustomRangeDialog(false);
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

    function toggleSeriesVisibility(
        seriesKey: string,
        isChecked: boolean,
    ): void {
        setSelectedSeriesKeys((previous) => {
            if (isChecked) {
                if (previous.includes(seriesKey)) {
                    return previous;
                }

                return [...previous, seriesKey];
            }

            if (!previous.includes(seriesKey) || previous.length === 1) {
                return previous;
            }

            return previous.filter((key) => key !== seriesKey);
        });
    }

    function renderDurationFilterControl(className = 'w-full sm:w-xs') {
        return (
            <div className={className}>
                <Select
                    value={selectedFilterOptionValue}
                    onValueChange={handleFilterOptionChange}
                >
                    <SelectTrigger className="h-8 border-slate-700 bg-slate-800/70 text-xs text-slate-100">
                        <SelectValue placeholder="Pilih Opsi Filter Waktu" />
                    </SelectTrigger>
                    <SelectContent className="z-120 border-slate-700 bg-slate-900 text-slate-100">
                        <SelectItem value="none">
                            Tampilkan Semua Data Terbaru
                        </SelectItem>
                        {roomQuickRangeOptions.map((option) => (
                            <SelectItem
                                key={option.minutes}
                                value={`recent:${option.minutes}`}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                        {timeFilter.mode === 'recent' && !activeQuickRange && (
                            <SelectItem value="recent-custom">
                                {`${timeFilter.recent_minutes} Menit Terakhir`}
                            </SelectItem>
                        )}
                        <SelectItem value="custom">
                            Pilih Rentang Waktu Kustom
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
        );
    }

    function renderSeriesFilterControls() {
        return (
            <div className="w-full rounded-lg border border-slate-700/60 bg-slate-900/30 p-2">
                <div className="flex flex-wrap items-start gap-2">
                    <p className="text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                        Seri Sensor
                    </p>
                    {renderDurationFilterControl('ml-auto w-full sm:w-xs')}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {chartSeriesDefinitions.map((series) => {
                        const isChecked = selectedSeriesKeys.includes(
                            series.key,
                        );

                        return (
                            <label
                                key={series.key}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                                    isChecked
                                        ? 'border-cyan-500/40 bg-cyan-500/10 text-slate-100'
                                        : 'border-slate-700/70 bg-slate-800/60 text-slate-400'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) =>
                                        toggleSeriesVisibility(
                                            series.key,
                                            event.target.checked,
                                        )
                                    }
                                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                    style={{
                                        backgroundColor: series.color,
                                    }}
                                />
                                <span>{series.label}</span>
                            </label>
                        );
                    })}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                    Centang seri yang ingin ditampilkan. Minimal 1 garis aktif.
                </p>
            </div>
        );
    }

    function renderThresholdInfoPanel({
        wrapperClassName = 'shrink-0 rounded-xl border border-slate-700/60 bg-slate-900/35 p-1.5 xl:p-2',
        listClassName = 'mt-1.5 max-h-28 space-y-1.5 overflow-y-auto pr-0.5 xl:max-h-36',
        isCollapsed = false,
        onToggleCollapse,
    }: {
        wrapperClassName?: string;
        listClassName?: string;
        isCollapsed?: boolean;
        onToggleCollapse?: () => void;
    }) {
        return (
            <div className={wrapperClassName}>
                <div className="flex items-center justify-between gap-1.5">
                    <p className="text-[9px] font-semibold tracking-wider text-slate-300 uppercase">
                        Alarm Threshold Per Sensor
                    </p>
                    <div className="flex items-center gap-1">
                        {onToggleCollapse && (
                            <button
                                type="button"
                                onClick={onToggleCollapse}
                                className="rounded-full border border-slate-600/60 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-slate-300 uppercase transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                            >
                                {isCollapsed ? 'Tampilkan' : 'Ringkas'}
                            </button>
                        )}
                        <span className="rounded-full border border-slate-600/60 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-slate-400 uppercase">
                            Read Only
                        </span>
                    </div>
                </div>
                <p className="mt-0.5 text-[9px] text-slate-500">
                    {isCollapsed
                        ? `Panel diringkas. ${sensors.length} sensor terdeteksi.`
                        : "Nilai '-' berarti threshold sensor belum diatur."}
                </p>

                {!isCollapsed && (
                    <div className={listClassName}>
                        {sensors.length > 0 ? (
                            sensors.map((sensor) => (
                                <div
                                    key={sensor.id}
                                    className="rounded-md border border-slate-700/60 bg-slate-900/50 p-1.5"
                                >
                                    <div className="flex items-center justify-between gap-1.5">
                                        <p className="truncate text-[10px] font-semibold text-slate-100">
                                            {sensor.name}
                                        </p>
                                        <span
                                            className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold tracking-wider uppercase ${statusBadgeClasses(sensor.status)}`}
                                        >
                                            {sensor.status}
                                        </span>
                                    </div>

                                    <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                                        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 px-1.5 py-1">
                                            <p className="text-[8px] font-semibold tracking-wider text-cyan-300 uppercase">
                                                Threshold Temp
                                            </p>
                                            <p className="mt-0.5 font-mono text-[10px] text-cyan-200">
                                                {formatThresholdRange(
                                                    sensor.under_temp,
                                                    sensor.over_temp,
                                                    'degC',
                                                )}
                                            </p>
                                            <p className="mt-0.5 text-[8px] text-slate-400">
                                                Aktual:{' '}
                                                {formatLiveMetric(
                                                    sensor.temperature,
                                                    'degC',
                                                )}
                                            </p>
                                        </div>

                                        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-1.5 py-1">
                                            <p className="text-[8px] font-semibold tracking-wider text-blue-300 uppercase">
                                                Threshold Hum
                                            </p>
                                            <p className="mt-0.5 font-mono text-[10px] text-blue-200">
                                                {formatThresholdRange(
                                                    sensor.under_hum,
                                                    sensor.over_hum,
                                                    '%RH',
                                                )}
                                            </p>
                                            <p className="mt-0.5 text-[8px] text-slate-400">
                                                Aktual:{' '}
                                                {formatLiveMetric(
                                                    sensor.humidity,
                                                    '%RH',
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2 py-2 text-center text-[10px] text-slate-500">
                                Belum ada sensor di ruangan ini.
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    function renderActivePanel(isFullscreen: boolean) {
        if (activePanel === 'floorplan') {
            return (
                <div className="min-h-0 flex-1 overflow-hidden">
                    <FloorPlanMap
                        sensors={room.sensors}
                        roomName={room.name}
                        backgroundImage={room.floor_plan_image ?? null}
                        roomWidth={room.floor_plan_width}
                        roomHeight={room.floor_plan_height}
                    />
                </div>
            );
        }

        const chartCardClass = isFullscreen
            ? 'flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 pt-3 pb-2'
            : 'flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 pt-2 pb-1';

        const activeSeriesLegend =
            visibleSeriesDefinitions.length > 0 ? (
                <div className="mb-1 flex flex-wrap items-center gap-2 rounded-md border border-slate-700/60 bg-slate-900/20 px-2 py-1.5">
                    {visibleSeriesDefinitions.map((series) => (
                        <div
                            key={series.key}
                            className="flex items-center gap-1.5 text-[10px] text-slate-300"
                        >
                            <span
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{
                                    backgroundColor: series.color,
                                }}
                            />
                            <span className="uppercase">{series.label}</span>
                        </div>
                    ))}
                </div>
            ) : null;

        return (
            <>
                <div className={chartCardClass}>
                    <div className="mb-0.5 flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                            Avg Temp
                        </span>
                    </div>
                    {activeSeriesLegend}
                    <div className="min-h-0 flex-1">
                        {hasChartData ? (
                            <ChartContainer
                                config={tempChartConfig}
                                className="h-full w-full"
                            >
                                <LineChart
                                    data={tempChartData}
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
                                        ticks={[0, 20, 40, 60, 80, 99]}
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
                                    {visibleSeriesDefinitions.map((series) => (
                                        <Line
                                            key={series.key}
                                            dataKey={series.key}
                                            name={series.label}
                                            type="linear"
                                            stroke={series.color}
                                            strokeWidth={
                                                series.isAverage ? 2.5 : 2
                                            }
                                            strokeDasharray={
                                                series.isAverage
                                                    ? '6 4'
                                                    : undefined
                                            }
                                            dot={false}
                                            activeDot={{ r: 3 }}
                                            isAnimationActive={false}
                                            connectNulls
                                        />
                                    ))}
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
                    {activeSeriesLegend}
                    <div className="min-h-0 flex-1">
                        {hasChartData ? (
                            <ChartContainer
                                config={humChartConfig}
                                className="h-full w-full"
                            >
                                <LineChart
                                    data={humChartData}
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
                                        ticks={[0, 20, 40, 60, 80, 99]}
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
                                    {visibleSeriesDefinitions.map((series) => (
                                        <Line
                                            key={series.key}
                                            dataKey={series.key}
                                            name={series.label}
                                            type="linear"
                                            stroke={series.color}
                                            strokeWidth={
                                                series.isAverage ? 2.5 : 2
                                            }
                                            strokeDasharray={
                                                series.isAverage
                                                    ? '6 4'
                                                    : undefined
                                            }
                                            dot={false}
                                            activeDot={{ r: 3 }}
                                            isAnimationActive={false}
                                            connectNulls
                                        />
                                    ))}
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
            <Head title={`${room.name} - SCADA Monitoring`} />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* -- HEADER ---------------------------------------- */}
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

                        <ScadaHeaderTitle
                            wrapperClassName="flex min-w-0 flex-1 flex-col items-center"
                            line1ClassName="truncate text-center text-sm font-bold tracking-widest text-white uppercase xl:text-base"
                            line2ClassName="truncate text-[10px] tracking-wider text-slate-400 uppercase xl:text-[11px]"
                        />

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

                {/* -- MAIN CONTENT ----------------------------------- */}
                <main className="flex min-w-0 flex-1 gap-2 overflow-hidden bg-[#151b1f] p-2 xl:gap-3 xl:p-3">
                    {/* -- LEFT COLUMN: gauges -- */}
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
                                unit="degC"
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

                    {/* -- MIDDLE COLUMN: sensor cards 1-3 -- */}
                    <div className="flex h-full w-48 shrink-0 flex-col gap-2 xl:w-56 xl:gap-3">
                        {colMiddleSensors.length > 0
                            ? colMiddleSensors.map((sensor) => (
                                  <SensorCard
                                      key={sensor.id}
                                      sensor={sensor}
                                      className="flex-1"
                                  />
                              ))
                            : Array.from({ length: 3 }).map((_, index) => (
                                  <div
                                      key={index}
                                      className="flex-1 animate-pulse rounded-xl border border-slate-700/60 bg-slate-800/50"
                                  />
                              ))}
                    </div>

                    {/* -- RIGHT AREA -- */}
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
                            {/* -- Panel toggle -- */}
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
                                <button
                                    type="button"
                                    onClick={() =>
                                        setIsPanelFullscreen((prev) => !prev)
                                    }
                                    aria-label={
                                        isPanelFullscreen
                                            ? 'Tutup fullscreen panel'
                                            : 'Buka fullscreen panel'
                                    }
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                                        isPanelFullscreen
                                            ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                                            : 'border border-slate-700/40 bg-slate-700/40 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {isPanelFullscreen ? (
                                        <Minimize2 className="h-3 w-3" />
                                    ) : (
                                        <Expand className="h-3 w-3" />
                                    )}
                                    Fullscreen
                                </button>
                            </div>

                            {activePanel === 'floorplan' &&
                                renderThresholdInfoPanel({
                                    isCollapsed: isThresholdPanelCollapsed,
                                    onToggleCollapse: () =>
                                        setIsThresholdPanelCollapsed(
                                            (prev) => !prev,
                                        ),
                                })}

                            {activePanel === 'chart' && (
                                <div className="shrink-0">
                                    {renderSeriesFilterControls()}
                                </div>
                            )}

                            {renderActivePanel(false)}
                        </div>
                    </div>
                </main>

                {isPanelFullscreen && (
                    <div className="fixed inset-0 z-90 flex flex-col bg-[#0f1316] p-3 xl:p-4">
                        <div className="mb-2 flex shrink-0 items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                            <div className="flex items-center gap-1.5">
                                {activePanel === 'chart' ? (
                                    <BarChart2 className="h-4 w-4 text-cyan-400" />
                                ) : (
                                    <Map className="h-4 w-4 text-cyan-400" />
                                )}
                                <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                                    {activePanel === 'chart'
                                        ? 'Chart Fullscreen'
                                        : `Denah ${room.name}`}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsPanelFullscreen(false)}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-700/40 bg-slate-700/30 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-slate-300 uppercase transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                            >
                                <Minimize2 className="h-3.5 w-3.5" />
                                Tutup
                            </button>
                        </div>

                        {activePanel === 'chart' && (
                            <div className="mb-2 shrink-0">
                                {renderSeriesFilterControls()}
                            </div>
                        )}

                        {activePanel === 'floorplan' &&
                            renderThresholdInfoPanel({
                                wrapperClassName:
                                    'mb-2 shrink-0 rounded-xl border border-slate-700/60 bg-slate-900/35 p-1.5 xl:p-2',
                                listClassName:
                                    'mt-1.5 max-h-32 space-y-1.5 overflow-y-auto pr-0.5 xl:max-h-40',
                                isCollapsed:
                                    isFullscreenThresholdPanelCollapsed,
                                onToggleCollapse: () =>
                                    setIsFullscreenThresholdPanelCollapsed(
                                        (prev) => !prev,
                                    ),
                            })}

                        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700/60 bg-[#151b1f] p-2 xl:p-3">
                            <div className="flex h-full min-h-0 flex-col gap-2 xl:gap-3">
                                {renderActivePanel(true)}
                            </div>
                        </div>
                    </div>
                )}

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
                                <p className="criticalAlertClasses">
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

                {/* -- FOOTER ---------------------------------------- */}
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
