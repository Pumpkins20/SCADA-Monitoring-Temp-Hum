import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Thermometer,
    Droplets,
    Download,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
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

interface LogsIndexProps {
    rooms: RoomTab[];
    activeRoomId: number;
    sensors: SensorInfo[];
    logs: LogRow[];
    pagination: Pagination;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsIndex({
    rooms,
    activeRoomId,
    sensors,
    logs,
    pagination,
}: LogsIndexProps) {
    const [now, setNow] = useState(new Date());

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
            </div>
        </>
    );
}
