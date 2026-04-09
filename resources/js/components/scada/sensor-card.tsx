import { Cpu } from 'lucide-react';
import { fmt } from '@/components/scada/scada-helpers';
import type { SensorData } from '@/components/scada/scada-helpers';

// ─── Sensor Card (SCADA Industrial Style) ────────────────────────────────────

export function SensorCard({
    sensor,
    className = '',
}: {
    sensor: SensorData;
    className?: string;
}) {
    const isOnline = sensor.status !== 'OFFLINE';

    return (
        <div
            className={`flex min-w-0 flex-col justify-center gap-1 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 backdrop-blur-sm ${className}`}
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

            <div className="mt-1 flex min-h-5 items-center gap-1">
                {sensor.alarms?.temp && (
                    <span className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-red-300 uppercase">
                        ALARM TEMP
                    </span>
                )}
                {sensor.alarms?.hum && (
                    <span className="rounded border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-blue-300 uppercase">
                        ALARM HUM
                    </span>
                )}
                {sensor.alarms?.disconnect && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-300 uppercase">
                        DISCONNECT
                    </span>
                )}
            </div>
        </div>
    );
}
