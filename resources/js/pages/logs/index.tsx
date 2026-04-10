import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    ClipboardList,
    Thermometer,
    Droplets,
    Download,
    RotateCcw,
    Send,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { ScadaHeaderTitle } from '@/components/scada/scada-header-title';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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

interface Pagination {
    currentPage: number;
    lastPage: number;
    total: number;
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

interface LogsIndexProps {
    rooms: RoomTab[];
    activeRoomId: number;
    sensors: SensorInfo[];
    logs: LogRow[];
    pagination: Pagination;
    timeFilter: TimeFilter;
    flashSuccess: string | null;
    flashError: string | null;
    exportRecipientEmail: string | null;
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
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
    function updateField(field: keyof DateTimeParts, nextValue: string): void {
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsIndex({
    rooms,
    activeRoomId,
    sensors,
    logs,
    pagination,
    timeFilter,
    flashSuccess,
    flashError,
    exportRecipientEmail,
}: LogsIndexProps) {
    const [now, setNow] = useState(new Date());
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [showIntervalDialog, setShowIntervalDialog] = useState(false);
    const [showRecentDialog, setShowRecentDialog] = useState(false);
    const [intervalValidationError, setIntervalValidationError] = useState<
        string | null
    >(null);
    const [startFieldErrors, setStartFieldErrors] = useState<DateTimeField[]>(
        [],
    );
    const [endFieldErrors, setEndFieldErrors] = useState<DateTimeField[]>([]);
    const [recentValidationError, setRecentValidationError] = useState<
        string | null
    >(null);
    const [recentFieldError, setRecentFieldError] = useState(false);
    const [startParts, setStartParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(timeFilter.start_at),
    );
    const [endParts, setEndParts] = useState<DateTimeParts>(() =>
        parseDateTimeParts(timeFilter.end_at),
    );
    const [recentMinutesInput, setRecentMinutesInput] = useState<string>(
        String(timeFilter.recent_minutes || 5),
    );

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({ only: ['logs', 'pagination'] });
        }, 60_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!flashSuccess) {
            return;
        }

        setSuccessMessage(flashSuccess);
        setShowSuccessDialog(true);
    }, [flashSuccess]);

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

    const activeFilterQuery = {
        time_filter: timeFilter.mode !== 'none' ? timeFilter.mode : undefined,
        start_at:
            timeFilter.mode === 'interval'
                ? (timeFilter.start_at ?? undefined)
                : undefined,
        end_at:
            timeFilter.mode === 'interval'
                ? (timeFilter.end_at ?? undefined)
                : undefined,
        recent_minutes:
            timeFilter.mode === 'recent'
                ? String(timeFilter.recent_minutes)
                : undefined,
    };

    const exportQuery = new URLSearchParams({
        room: String(activeRoomId),
        ...(activeFilterQuery.time_filter
            ? { time_filter: activeFilterQuery.time_filter }
            : {}),
        ...(activeFilterQuery.start_at
            ? { start_at: activeFilterQuery.start_at }
            : {}),
        ...(activeFilterQuery.end_at
            ? { end_at: activeFilterQuery.end_at }
            : {}),
        ...(activeFilterQuery.recent_minutes
            ? { recent_minutes: activeFilterQuery.recent_minutes }
            : {}),
    });

    function navigatePage(page: number) {
        router.get(
            '/logs',
            { room: activeRoomId, page, ...activeFilterQuery },
            { preserveState: true, preserveScroll: true },
        );
    }

    function switchRoom(roomId: number) {
        router.get(
            '/logs',
            { room: roomId, ...activeFilterQuery },
            { preserveState: false },
        );
    }

    function openIntervalDialog(): void {
        setStartParts(parseDateTimeParts(timeFilter.start_at));
        setEndParts(parseDateTimeParts(timeFilter.end_at));
        setIntervalValidationError(null);
        setStartFieldErrors([]);
        setEndFieldErrors([]);
        setShowIntervalDialog(true);
    }

    function openRecentDialog(): void {
        setRecentMinutesInput(String(timeFilter.recent_minutes || 5));
        setRecentValidationError(null);
        setRecentFieldError(false);
        setShowRecentDialog(true);
    }

    function applyTimeInterval(): void {
        const startResult = validateDateTimeParts(startParts, 'Start time');
        if (startResult.error) {
            setIntervalValidationError(startResult.error);
            setStartFieldErrors(startResult.invalidFields);
            setEndFieldErrors([]);
            return;
        }

        const endResult = validateDateTimeParts(endParts, 'End time');
        if (endResult.error) {
            setIntervalValidationError(endResult.error);
            setStartFieldErrors([]);
            setEndFieldErrors(endResult.invalidFields);
            return;
        }

        if (!startResult.date || !endResult.date) {
            setIntervalValidationError('Time interval tidak valid.');
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

        if (endResult.date.getTime() < startResult.date.getTime()) {
            setIntervalValidationError(
                'End time harus sama dengan atau lebih besar dari Start time.',
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

        const startAt = startResult.formatted;
        const endAt = endResult.formatted;

        if (!startAt || !endAt) {
            setIntervalValidationError('Time interval tidak valid.');
            return;
        }

        setIntervalValidationError(null);
        setStartFieldErrors([]);
        setEndFieldErrors([]);

        router.get(
            '/logs',
            {
                room: activeRoomId,
                page: 1,
                time_filter: 'interval',
                start_at: startAt,
                end_at: endAt,
            },
            { preserveState: true, preserveScroll: true },
        );

        setShowIntervalDialog(false);
    }

    function applyTimeSet(): void {
        const trimmedValue = recentMinutesInput.trim();

        if (trimmedValue === '') {
            setRecentValidationError(
                'Silakan isi Recent interval terlebih dahulu.',
            );
            setRecentFieldError(true);
            return;
        }

        const recentMinutes = Number(trimmedValue);
        if (!Number.isInteger(recentMinutes)) {
            setRecentValidationError(
                'Recent interval harus berupa angka bulat.',
            );
            setRecentFieldError(true);
            return;
        }

        if (recentMinutes < 1 || recentMinutes > 1440) {
            setRecentValidationError(
                'Recent interval harus di antara 1 sampai 1440 menit.',
            );
            setRecentFieldError(true);
            return;
        }

        setRecentValidationError(null);
        setRecentFieldError(false);

        router.get(
            '/logs',
            {
                room: activeRoomId,
                page: 1,
                time_filter: 'recent',
                recent_minutes: String(recentMinutes),
            },
            { preserveState: true, preserveScroll: true },
        );

        setShowRecentDialog(false);
    }

    function resetTimeFilter(): void {
        router.get(
            '/logs',
            {
                room: activeRoomId,
                page: 1,
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    function sendExportToEmail(): void {
        if (!exportRecipientEmail) {
            return;
        }

        setIsSendingEmail(true);

        router.post(
            '/logs/export/email',
            {
                room: activeRoomId,
                page: pagination.currentPage,
                ...(activeFilterQuery.time_filter
                    ? { time_filter: activeFilterQuery.time_filter }
                    : {}),
                ...(activeFilterQuery.start_at
                    ? { start_at: activeFilterQuery.start_at }
                    : {}),
                ...(activeFilterQuery.end_at
                    ? { end_at: activeFilterQuery.end_at }
                    : {}),
                ...(activeFilterQuery.recent_minutes
                    ? { recent_minutes: activeFilterQuery.recent_minutes }
                    : {}),
            },
            {
                preserveScroll: true,
                onFinish: () => setIsSendingEmail(false),
            },
        );
    }

    return (
        <>
            <Head title="Log Sensor — SCADA Monitoring" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────── */}
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

                        <ScadaHeaderTitle />

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
                    {/* ── Room Tabs + Actions + Pagination ── */}
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

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={openIntervalDialog}
                                className="rounded-md bg-slate-800/70 p-1.5 text-slate-300 transition-colors hover:bg-slate-700/70 hover:text-white"
                                title="Time Interval"
                            >
                                <CalendarDays className="h-4 w-4" />
                            </button>

                            <button
                                type="button"
                                onClick={openRecentDialog}
                                className="rounded-md bg-slate-800/70 p-1.5 text-slate-300 transition-colors hover:bg-slate-700/70 hover:text-white"
                                title="Time Set"
                            >
                                <Clock3 className="h-4 w-4" />
                            </button>

                            <button
                                type="button"
                                onClick={resetTimeFilter}
                                className="rounded-md bg-slate-800/70 p-1.5 text-slate-300 transition-colors hover:bg-slate-700/70 hover:text-white"
                                title="Reset Time Filter"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </button>

                            <a
                                href={`/logs/export?${exportQuery.toString()}`}
                                download={`Log_Sensor_Ruangan_${activeRoomId}.xlsx`}
                                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase transition-colors hover:bg-emerald-600/40 hover:text-emerald-300"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Download Excel
                            </a>

                            <button
                                type="button"
                                onClick={sendExportToEmail}
                                disabled={
                                    !exportRecipientEmail || isSendingEmail
                                }
                                title={
                                    exportRecipientEmail
                                        ? `Kirim ke ${exportRecipientEmail}`
                                        : 'Email recipient belum diatur'
                                }
                                className="flex items-center gap-1.5 rounded-lg bg-cyan-600/20 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-cyan-400 uppercase transition-colors hover:bg-cyan-600/40 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Send className="h-3.5 w-3.5" />
                                {isSendingEmail ? 'Mengirim...' : 'Kirim Email'}
                            </button>

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

                    {flashError && (
                        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                            {flashError}
                        </div>
                    )}

                    {/* ── Table ── */}
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
                                                        {row[`temp_${i + 1}`] ??
                                                            '—'}
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
                                                        {row[`hum_${i + 1}`] ??
                                                            '—'}
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
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="logs"
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />

                <Dialog
                    open={showIntervalDialog}
                    onOpenChange={setShowIntervalDialog}
                >
                    <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Time Interval
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                                Set waktu awal dan akhir log yang ingin
                                ditampilkan.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <DateTimePartsInput
                                label="Start time"
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
                                label="End time"
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
                                onClick={() => setShowIntervalDialog(false)}
                                className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={applyTimeInterval}
                                className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
                            >
                                Confirm
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={showRecentDialog}
                    onOpenChange={setShowRecentDialog}
                >
                    <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Time set
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                                Tampilkan data berdasarkan rentang menit
                                terbaru.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-slate-300">
                                Recent interval
                            </p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={1440}
                                    value={recentMinutesInput}
                                    onChange={(event) => {
                                        setRecentMinutesInput(
                                            event.target.value,
                                        );
                                        if (recentValidationError) {
                                            setRecentValidationError(null);
                                        }
                                        if (recentFieldError) {
                                            setRecentFieldError(false);
                                        }
                                    }}
                                    className={`w-24 rounded-md bg-slate-900 px-2 py-1.5 text-center text-sm text-slate-100 ${recentFieldError ? 'border border-red-500 ring-1 ring-red-500/50' : 'border border-slate-600'}`}
                                />
                                <span className="text-sm text-slate-400">
                                    minute
                                </span>
                            </div>

                            {recentValidationError && (
                                <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                    {recentValidationError}
                                </p>
                            )}
                        </div>

                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setShowRecentDialog(false)}
                                className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={applyTimeSet}
                                className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
                            >
                                Confirm
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={showSuccessDialog}
                    onOpenChange={setShowSuccessDialog}
                >
                    <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle className="text-emerald-400">
                                Berhasil
                            </DialogTitle>
                            <DialogDescription className="text-slate-300">
                                {successMessage}
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setShowSuccessDialog(false)}
                                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                            >
                                OK
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
