// ─── Shared Types & Helpers for SCADA Dashboard ──────────────────────────────

export type SensorStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';

export interface SensorAlarms {
    temp: boolean;
    hum: boolean;
    disconnect: boolean;
}

export interface SensorData {
    id: number;
    name: string;
    temperature: number | null;
    humidity: number | null;
    status: SensorStatus;
    alarms?: SensorAlarms;
    last_read_at: string | null;
}

export interface RoomData {
    id: number;
    name: string;
    location: string | null;
    temp_max_limit: number;
    hum_max_limit: number;
    room_avg_temp: number | null;
    room_avg_hum: number | null;
    status: SensorStatus;
    last_update: string | null;
    sensors: SensorData[];
}

export interface ChartPoint {
    time: string;
    avg_temperature: number;
    avg_humidity: number;
}

export interface GlobalStats {
    avg_temp: number | null;
    avg_hum: number | null;
    active_alarms: number;
    last_update: string | null;
}

export interface GaugeZone {
    from: number;
    to: number;
    color: string;
}

export interface GaugeMetricSettings {
    min: number;
    max: number;
    zones: GaugeZone[];
}

export interface GaugeSettings {
    temperature: GaugeMetricSettings;
    humidity: GaugeMetricSettings;
}

export interface HeaderLogos {
    left: string;
    center: string;
    right: string;
}

export const DEFAULT_HEADER_LOGOS: HeaderLogos = {
    left: '/images/logo/injourney.png',
    center: '/images/logo/westindo.png',
    right: '/images/logo/edutic.png',
};

export function fmt(value: number | string | null, decimals = 1): string {
    if (value === null || value === undefined) return '--';
    return Number(value).toFixed(decimals);
}

export function statusColor(status: string): string {
    switch (status) {
        case 'NORMAL':
            return 'text-green-400';
        case 'WARNING':
            return 'text-yellow-400';
        case 'CRITICAL':
            return 'text-red-400';
        default:
            return 'text-slate-500';
    }
}

export function statusDotColor(status: string): string {
    switch (status) {
        case 'NORMAL':
            return '#22c55e';
        case 'WARNING':
            return '#eab308';
        case 'CRITICAL':
            return '#ef4444';
        default:
            return '#475569';
    }
}

export function statusLabel(status: string): string {
    switch (status) {
        case 'NORMAL':
            return 'NORMAL';
        case 'WARNING':
            return 'WARNING';
        case 'CRITICAL':
            return 'CRITICAL';
        default:
            return 'OFFLINE';
    }
}

export function statusBadgeClasses(status: string): string {
    switch (status) {
        case 'NORMAL':
            return 'border-green-500/40 bg-green-500/15 text-green-400';
        case 'WARNING':
            return 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400';
        case 'CRITICAL':
            return 'border-red-500/40 bg-red-500/15 text-red-400';
        default:
            return 'border-slate-600/40 bg-slate-700/30 text-slate-500';
    }
}
