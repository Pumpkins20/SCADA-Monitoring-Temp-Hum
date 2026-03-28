import { Link, router } from '@inertiajs/react';
import {
    BarChart2,
    Bell,
    ClipboardList,
    Home,
    LogOut,
    Monitor,
    SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { statusDotColor } from '@/components/scada/scada-helpers';
import type { RoomData } from '@/components/scada/scada-helpers';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ScadaFooterNavProps {
    activeMenu: 'dashboard' | 'logs' | 'chart-logs' | 'alarms' | 'mirror' | 'settings';
    onDashboardClick?: () => void;
    onSettingsClick?: () => void;
    rooms?: RoomData[];
    hasAlarms?: boolean;
    alarmRoomNames?: string;
    lastUpdate?: string;
    dateStr?: string;
}

export function ScadaFooterNav({
    activeMenu,
    onDashboardClick,
    onSettingsClick,
    rooms = [],
    hasAlarms = false,
    alarmRoomNames = '',
    lastUpdate = '--:--',
    dateStr = '--',
}: ScadaFooterNavProps) {
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

    const isDashboardActive = activeMenu === 'dashboard';
    const isLogsActive = activeMenu === 'logs';
    const isChartLogsActive = activeMenu === 'chart-logs';
    const isAlarmsActive = activeMenu === 'alarms';
    const isMirrorActive = activeMenu === 'mirror';
    const isSettingsActive = activeMenu === 'settings';

    function confirmLogout(): void {
        setIsLogoutDialogOpen(false);
        router.post('/logout');
    }

    return (
        <>
            <footer className="flex shrink-0 items-center border-t border-slate-700/50 bg-[#0f1316] px-4 py-2">
                <div className="flex w-56 shrink-0 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <Bell
                            className={`h-4 w-4 ${hasAlarms ? 'animate-pulse text-red-400' : 'text-slate-500'}`}
                        />
                        <span
                            className={`text-xs font-semibold ${hasAlarms ? 'text-red-400' : 'text-slate-500'}`}
                        >
                            ALARM AKTIF : {hasAlarms ? alarmRoomNames : '—'}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                        LAST UPDATE : {lastUpdate} | {dateStr}
                    </span>
                </div>

                <div className="flex flex-1 items-center justify-center gap-3">
                {onDashboardClick ? (
                    <button
                        type="button"
                        title="Dashboard"
                        onClick={onDashboardClick}
                        className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                            isDashboardActive
                                ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                        }`}
                    >
                        <Home className="h-4 w-4" />
                        <span className="text-[9px] leading-none">Home</span>
                    </button>
                ) : (
                    <Link
                        href="/dashboard"
                        title="Dashboard"
                        className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                            isDashboardActive
                                ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                        }`}
                    >
                        <Home className="h-4 w-4" />
                        <span className="text-[9px] leading-none">Home</span>
                    </Link>
                )}

                <Link
                    href="/logs"
                    title="Log Sensor"
                    className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                        isLogsActive
                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                            : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                    }`}
                >
                    <ClipboardList className="h-4 w-4" />
                    <span className="text-[9px] leading-none">Logs</span>
                </Link>

                <Link
                    href="/chart-logs"
                    title="Chart Log"
                    className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                        isChartLogsActive
                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                            : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                    }`}
                >
                    <BarChart2 className="h-4 w-4" />
                    <span className="text-[9px] leading-none">Chart</span>
                </Link>

                <Link
                    href="/alarms"
                    title="Alarm"
                    className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                        isAlarmsActive
                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                            : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                    }`}
                >
                    <Bell className="h-4 w-4" />
                    <span className="text-[9px] leading-none">Alarm</span>
                </Link>

                <Link
                    href="/mirror"
                    title="Mirror"
                    className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                        isMirrorActive
                            ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                            : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                    }`}
                >
                    <Monitor className="h-4 w-4" />
                    <span className="text-[9px] leading-none">Mirror</span>
                </Link>

                {onSettingsClick ? (
                    <button
                        type="button"
                        title="Setting"
                        onClick={onSettingsClick}
                        className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                            isSettingsActive
                                ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                        }`}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        <span className="text-[9px] leading-none">Setting</span>
                    </button>
                ) : (
                    <Link
                        href="/settings-general"
                        title="Setting"
                        className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                            isSettingsActive
                                ? 'bg-cyan-500 text-white shadow-[0_0_10px_#22d3ee80]'
                                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60 hover:text-white'
                        }`}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        <span className="text-[9px] leading-none">Setting</span>
                    </Link>
                )}

                <div className="mx-1 h-6 w-px bg-slate-600/80" />

                    <button
                        type="button"
                        title="Logout"
                        onClick={() => setIsLogoutDialogOpen(true)}
                        className="flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-700/60 text-slate-400 transition-colors hover:bg-red-500/80 hover:text-white"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-[9px] leading-none">Logout</span>
                    </button>
                </div>

                <div className="flex w-56 shrink-0 items-center justify-end gap-2">
                    {rooms.map((room, i) => (
                        <div
                            key={room.id}
                            className="flex flex-col items-center gap-0.5"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <circle
                                    cx="6"
                                    cy="6"
                                    r="5"
                                    fill={statusDotColor(room.status)}
                                    style={{
                                        filter:
                                            room.status !== 'OFFLINE'
                                                ? `drop-shadow(0 0 3px ${statusDotColor(room.status)})`
                                                : 'none',
                                    }}
                                />
                            </svg>
                            <span className="text-[9px] text-slate-500">
                                R{i + 1}
                            </span>
                        </div>
                    ))}
                </div>
            </footer>

            <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
                <DialogContent className="border-slate-700 bg-[#151b1f] text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold tracking-wide text-white uppercase">
                            Konfirmasi Logout
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-300">
                            Anda akan keluar dari sistem SCADA Monitoring. Lanjutkan logout sekarang?
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="gap-2 sm:justify-end">
                        <button
                            type="button"
                            onClick={() => setIsLogoutDialogOpen(false)}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800/70 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={confirmLogout}
                            className="inline-flex h-9 items-center justify-center rounded-md bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-400"
                        >
                            Ya, Logout
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
