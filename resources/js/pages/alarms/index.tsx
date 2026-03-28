import { Head, Link, router } from '@inertiajs/react';
import {
    AlarmClock,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Download,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface RoomTab {
    id: number;
    name: string;
}

interface AlarmRow {
    id: number;
    alarm_time: string;
    current_value: string;
    alarm_text: string;
    alarm_type: string;
    variable_name: string;
    confirmed_time: string;
    room_name: string;
    room_detail: string;
}

interface Pagination {
    currentPage: number;
    lastPage: number;
    total: number;
}

interface Filters {
    tab: 'realtime' | 'history' | 'no-confirmed' | 'been-confirmed';
    room: number | null;
    start_date: string | null;
    end_date: string | null;
}

interface TabInfo {
    isViewOnly: boolean;
    confirmedAvailableFromHmi: boolean;
}

interface AlarmIndexProps {
    rooms: RoomTab[];
    rows: AlarmRow[];
    pagination: Pagination;
    filters: Filters;
    tabInfo: TabInfo;
}

const TAB_OPTIONS: Array<{ key: Filters['tab']; label: string }> = [
    { key: 'realtime', label: 'Real time alarm' },
    { key: 'history', label: 'History alarm' },
    { key: 'no-confirmed', label: 'No confirmed alarm' },
    { key: 'been-confirmed', label: 'Been confirmed alarm' },
];

export default function AlarmIndex({
    rooms,
    rows,
    pagination,
    filters,
    tabInfo,
}: AlarmIndexProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({ only: ['rows', 'pagination'] });
        }, 30_000);

        return () => clearInterval(timer);
    }, []);

    const [startDateInput, setStartDateInput] = useState(filters.start_date ?? '');
    const [endDateInput, setEndDateInput] = useState(filters.end_date ?? '');

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

    const queryBase = useMemo(
        () => ({
            tab: filters.tab,
            room: filters.room ?? undefined,
            start_date: startDateInput || undefined,
            end_date: endDateInput || undefined,
        }),
        [filters.tab, filters.room, startDateInput, endDateInput],
    );

    function switchTab(tab: Filters['tab']): void {
        router.get(
            '/alarms',
            {
                ...queryBase,
                tab,
                page: 1,
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    function switchRoom(roomId: number | null): void {
        router.get(
            '/alarms',
            {
                ...queryBase,
                room: roomId ?? undefined,
                page: 1,
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    function applyDateFilter(): void {
        router.get(
            '/alarms',
            {
                ...queryBase,
                page: 1,
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    function navigatePage(page: number): void {
        router.get(
            '/alarms',
            {
                ...queryBase,
                page,
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    const exportQuery = new URLSearchParams({
        tab: filters.tab,
        ...(filters.room ? { room: String(filters.room) } : {}),
        ...(startDateInput ? { start_date: startDateInput } : {}),
        ...(endDateInput ? { end_date: endDateInput } : {}),
    });

    const activeAlarmRoomNames =
        Array.from(new Set(rows.map((row) => row.room_name).filter((name) => name !== '-'))).join(', ') ||
        '—';

    return (
        <>
            <Head title="Alarm — SCADA Monitoring" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-56 shrink-0 items-center gap-2">
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <AlarmClock className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    MENU ALARM
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    View-only dari data HMI
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

                <main className="flex flex-1 flex-col gap-3 overflow-hidden bg-[#151b1f] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {TAB_OPTIONS.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => switchTab(option.key)}
                                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                                    option.key === filters.tab
                                        ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee60]'
                                        : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => switchRoom(null)}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
                                    filters.room === null
                                        ? 'bg-cyan-500 text-white'
                                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'
                                }`}
                            >
                                Semua Ruang
                            </button>

                            {rooms.map((room) => (
                                <button
                                    key={room.id}
                                    type="button"
                                    onClick={() => switchRoom(room.id)}
                                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
                                        filters.room === room.id
                                            ? 'bg-cyan-500 text-white'
                                            : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'
                                    }`}
                                >
                                    {room.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                                    Start date
                                </label>
                                <input
                                    type="date"
                                    value={startDateInput}
                                    onChange={(event) => setStartDateInput(event.target.value)}
                                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                                    End date
                                </label>
                                <input
                                    type="date"
                                    value={endDateInput}
                                    onChange={(event) => setEndDateInput(event.target.value)}
                                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={applyDateFilter}
                                className="rounded-md bg-cyan-600 px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase text-white transition-colors hover:bg-cyan-500"
                            >
                                Apply
                            </button>

                            <a
                                href={`/alarms/export?${exportQuery.toString()}`}
                                className="flex items-center gap-1.5 rounded-md bg-emerald-600/20 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase transition-colors hover:bg-emerald-600/40 hover:text-emerald-300"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Export CSV
                            </a>
                        </div>
                    </div>

                    {filters.tab === 'been-confirmed' && !tabInfo.confirmedAvailableFromHmi && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            Data confirmed dari HMI belum tersedia. Tab ini ditampilkan sebagai empty state (view-only).
                        </div>
                    )}

                    {tabInfo.isViewOnly && (
                        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                            Data alarm bersifat view-only dari hasil baca HMI oleh poller.
                        </div>
                    )}

                    <div className="flex-1 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/50 backdrop-blur-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-700/60 hover:bg-transparent">
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Alarm time
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Current value
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Alarm text
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Alarm type
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Variable name
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                        Confirmed time
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow className="border-slate-700/60 hover:bg-transparent">
                                        <TableCell
                                            colSpan={6}
                                            className="py-14 text-center text-slate-500"
                                        >
                                            No data for the current time period
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            className="border-slate-700/60 transition-colors hover:bg-slate-700/30"
                                        >
                                            <TableCell className="text-center font-mono text-xs text-slate-200 tabular-nums">
                                                {row.alarm_time}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-xs text-slate-100 tabular-nums">
                                                {row.current_value}
                                            </TableCell>
                                            <TableCell className="text-center text-xs text-slate-100">
                                                {row.alarm_text}
                                            </TableCell>
                                            <TableCell className="text-center text-xs text-slate-300">
                                                {row.alarm_type}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-xs text-slate-300">
                                                {row.variable_name}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-xs text-slate-400">
                                                {row.confirmed_time}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={pagination.currentPage <= 1}
                            onClick={() => navigatePage(pagination.currentPage - 1)}
                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[3rem] text-center text-xs text-slate-300 tabular-nums">
                            {pagination.currentPage} / {pagination.lastPage}
                        </span>
                        <button
                            type="button"
                            disabled={pagination.currentPage >= pagination.lastPage}
                            onClick={() => navigatePage(pagination.currentPage + 1)}
                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </main>

                <ScadaFooterNav
                    activeMenu="alarms"
                    hasAlarms={rows.length > 0 && (filters.tab === 'realtime' || filters.tab === 'no-confirmed')}
                    alarmRoomNames={activeAlarmRoomNames}
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />
            </div>
        </>
    );
}
