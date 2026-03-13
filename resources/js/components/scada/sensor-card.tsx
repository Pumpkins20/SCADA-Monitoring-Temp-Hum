import { Cpu } from 'lucide-react';
import { fmt  } from '@/components/scada/scada-helpers';
import type {SensorData} from '@/components/scada/scada-helpers';

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
            className={`flex flex-col justify-center gap-1 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 backdrop-blur-sm ${className}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                        {sensor.name}
                    </span>
                </div>
                <span className="text-xs text-cyan-400 opacity-80">((·))</span>
            </div>

            <div className="mt-1 flex items-end gap-0">
                <div className="flex flex-1 flex-col items-center">
                    <div className="flex items-end gap-0.5">
                        <span
                            className={`text-4xl leading-none font-bold ${isOnline ? 'text-white' : 'text-slate-600'}`}
                        >
                            {fmt(sensor.temperature)}
                        </span>
                        <span className="mb-1 text-xs text-slate-400">°C</span>
                    </div>
                    <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                        TEMP
                    </span>
                </div>

                <div className="mx-1 h-10 w-px bg-slate-600/80" />

                <div className="flex flex-1 flex-col items-center">
                    <div className="flex items-end gap-0.5">
                        <span
                            className={`text-4xl leading-none font-bold ${isOnline ? 'text-white' : 'text-slate-600'}`}
                        >
                            {fmt(sensor.humidity)}
                        </span>
                        <span className="mb-1 text-xs text-slate-400">%</span>
                    </div>
                    <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
                        RH
                    </span>
                </div>
            </div>
        </div>
    );
}
