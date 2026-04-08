import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    ChevronRight,
    Circle,
    Cpu,
    Pencil,
    // Plus,
    Radio,
    Trash2,
    WifiOff,
    Wifi,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PasswordSessionFloating } from '@/components/scada/password-session-floating';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { SENSOR_MAP } from '@/constants/sensor-map';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomInfo {
    id: number;
    name: string;
    location: string | null;
    temp_max_limit: number;
    hum_max_limit: number;
}

interface SensorItem {
    id: number;
    name: string;
    unit_id: number;
    position: number;
    calibrate_temp: number | null;
    calibrate_hum: number | null;
    over_temp: number | null;
    under_temp: number | null;
    over_hum: number | null;
    under_hum: number | null;
}

interface HmiItem {
    id: number;
    name: string;
    ip_address: string;
    port: number;
    register_function: '03' | '04';
    is_active: boolean;
    is_preview?: boolean;
    sensors: SensorItem[];
}

interface DevicesPageProps {
    room: RoomInfo;
    hmis: HmiItem[];
}

interface PreviewSensor {
    id: number;
    name: string;
    temperature: number | null;
    humidity: number | null;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | null;
    alarm_temp: boolean | null;
    alarm_hum: boolean | null;
}

type DialogPhase = 'form' | 'waiting' | 'preview';

// ─── HMI Form Dialog ─────────────────────────────────────────────────────────

function HmiFormDialog({
    open,
    onOpenChange,
    roomId,
    hmi,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roomId: number;
    hmi?: HmiItem;
}) {
    const isEdit = !!hmi;
    const [phase, setPhase] = useState<DialogPhase>('form');
    const [hmiId, setHmiId] = useState<number | null>(null);
    const [previewData, setPreviewData] = useState<PreviewSensor[]>([]);
    const [sensorNames, setSensorNames] = useState<Record<number, string>>({});
    const [waitElapsed, setWaitElapsed] = useState(0);
    const [phaseError, setPhaseError] = useState('');
    const [createProcessing, setCreateProcessing] = useState(false);
    const [createErrors, setCreateErrors] = useState<
        Partial<Record<'name' | 'ip_address' | 'port' | 'register_function', string>>
    >({});
    const pollingRef = useRef<number | null>(null);
    const PREVIEW_TIMEOUT = 30;

    const { data, setData, put, processing, errors, reset } = useForm({
        room_id: roomId,
        name: hmi?.name ?? '',
        ip_address: hmi?.ip_address ?? '',
        port: hmi?.port?.toString() ?? '502',
        register_function: hmi?.register_function ?? '03',
        is_active: hmi?.is_active ?? true,
    });

    function clearPolling() {
        if (pollingRef.current !== null) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }

    function resetDialogState() {
        clearPolling();
        setPhase('form');
        setHmiId(null);
        setPreviewData([]);
        setSensorNames({});
        setWaitElapsed(0);
        setPhaseError('');
        setCreateProcessing(false);
        setCreateErrors({});
    }

    useEffect(() => {
        return () => clearPolling();
    }, []);

    function getXsrfToken(): string {
        return decodeURIComponent(
            document.cookie
                .split('; ')
                .find((c) => c.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );
    }

    async function cancelPreviewRequest(previewHmiId: number): Promise<void> {
        await fetch(`/hmis/${previewHmiId}/cancel-preview`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-XSRF-TOKEN': getXsrfToken(),
                Accept: 'application/json',
            },
        });
    }

    async function startPollingPreview(newHmiId: number): Promise<void> {
        setPhase('waiting');
        setWaitElapsed(0);
        setPhaseError('');

        const startedAt = Date.now();

        pollingRef.current = window.setInterval(async () => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setWaitElapsed(Math.min(elapsed, PREVIEW_TIMEOUT));

            if (elapsed >= PREVIEW_TIMEOUT) {
                clearPolling();
                await cancelPreviewRequest(newHmiId);
                setPhase('form');
                setHmiId(null);
                setPhaseError(
                    'Timeout: data preview belum tersedia. Periksa koneksi HMI atau status poller.',
                );
                return;
            }

            try {
                const res = await fetch(`/hmis/${newHmiId}/preview-data`, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                });

                if (!res.ok) {
                    return;
                }

                const json = (await res.json()) as {
                    ready: boolean;
                    sensors: PreviewSensor[];
                };

                if (json.ready) {
                    clearPolling();
                    setPreviewData(json.sensors);

                    const names: Record<number, string> = {};
                    json.sensors.forEach((sensor) => {
                        names[sensor.id] = sensor.name;
                    });

                    setSensorNames(names);
                    setPhase('preview');
                }
            } catch {
                // Ignore transient polling errors and wait next tick.
            }
        }, 2000);
    }

    async function submitCreateAndPreview(): Promise<void> {
        setCreateProcessing(true);
        setCreateErrors({});
        setPhaseError('');

        try {
            const res = await fetch('/hmis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    room_id: data.room_id,
                    name: data.name,
                    ip_address: data.ip_address,
                    port: parseInt(data.port, 10),
                    register_function: data.register_function,
                }),
            });

            if (res.status === 422) {
                const json = (await res.json()) as {
                    errors?: Record<string, string[]>;
                };

                const nextErrors: Partial<
                    Record<'name' | 'ip_address' | 'port' | 'register_function', string>
                > = {};

                Object.entries(json.errors ?? {}).forEach(([key, messages]) => {
                    if (
                        key === 'name' ||
                        key === 'ip_address' ||
                        key === 'port' ||
                        key === 'register_function'
                    ) {
                        nextErrors[key] = messages[0] ?? 'Input tidak valid.';
                    }
                });

                setCreateErrors(nextErrors);
                return;
            }

            if (!res.ok) {
                setPhaseError('Gagal menyimpan HMI preview. Coba lagi.');
                return;
            }

            const json = (await res.json()) as { hmi_id: number; message: string };
            setHmiId(json.hmi_id);
            await startPollingPreview(json.hmi_id);
        } catch {
            setPhaseError('Gagal menghubungi server saat menyimpan HMI preview.');
        } finally {
            setCreateProcessing(false);
        }
    }

    async function handleConfirm(previewHmiId: number): Promise<void> {
        setCreateProcessing(true);
        setPhaseError('');

        try {
            const res = await fetch(`/hmis/${previewHmiId}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({ sensor_names: sensorNames }),
            });

            if (!res.ok) {
                setPhaseError('Gagal mengaktifkan HMI. Coba lagi.');
                return;
            }

            reset();
            resetDialogState();
            onOpenChange(false);
            router.reload({ only: ['hmis'] });
        } catch {
            setPhaseError('Gagal menghubungi server saat aktivasi HMI.');
        } finally {
            setCreateProcessing(false);
        }
    }

    async function handleCancel(previewHmiId: number | null): Promise<void> {
        clearPolling();

        if (previewHmiId) {
            await cancelPreviewRequest(previewHmiId);
        }

        reset();
        resetDialogState();
        onOpenChange(false);
        router.reload({ only: ['hmis'] });
    }

    async function submitCreateFlow(e: React.FormEvent): Promise<void> {
        e.preventDefault();

        if (isEdit) {
            const options = {
                onSuccess: () => {
                    reset();
                    resetDialogState();
                    onOpenChange(false);
                },
            };

            put(`/hmis/${hmi.id}`, options);
            return;
        }

        await submitCreateAndPreview();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    reset();
                    resetDialogState();
                }
                onOpenChange(v);
            }}
        >
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {isEdit ? 'Edit HMI / RTU' : 'Connect HMI Preview'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {isEdit
                            ? 'Ubah konfigurasi HMI yang sudah ada.'
                            : 'Isi konfigurasi HMI, tunggu preview data, lalu konfirmasi aktivasi.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submitCreateFlow} className="flex flex-col gap-4">
                    {phaseError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                            {phaseError}
                        </div>
                    )}

                    {phase === 'form' && (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Nama HMI
                                </Label>
                                <Input
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    placeholder="HMI-01"
                                    disabled={isEdit}   
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                                />
                                {(createErrors.name ?? errors.name) && (
                                    <span className="text-xs text-red-400">
                                        {createErrors.name ?? errors.name}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                        IP Address
                                    </Label>
                                    <Input
                                        value={data.ip_address}
                                        onChange={(e) =>
                                            setData('ip_address', e.target.value)
                                        }
                                        placeholder="192.168.1.10"
                                        className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                                    />
                                    {(createErrors.ip_address ?? errors.ip_address) && (
                                        <span className="text-xs text-red-400">
                                            {createErrors.ip_address ?? errors.ip_address}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                        Port
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={65535}
                                        value={data.port}
                                        onChange={(e) => setData('port', e.target.value)}
                                        className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                                    />
                                    {(createErrors.port ?? errors.port) && (
                                        <span className="text-xs text-red-400">
                                            {createErrors.port ?? errors.port}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                        Function Register
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['03', '04'] as const).map((fc) => (
                                            <button
                                                key={fc}
                                                type="button"
                                                onClick={() => setData('register_function', fc)}
                                                className={`flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ${
                                                    data.register_function === fc
                                                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                                        : 'border-slate-600 bg-slate-800/80 text-slate-400'
                                                }`}
                                            >
                                                {fc === '03'
                                                    ? '03: Holding Register'
                                                    : '04: Input Register'}
                                            </button>
                                        ))}
                                    </div>
                                    {(createErrors.register_function ?? errors.register_function) && (
                                        <span className="text-xs text-red-400">
                                            {createErrors.register_function ??
                                                errors.register_function}
                                        </span>
                                    )}
                                </div>

                                {isEdit && (
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                            Status
                                        </Label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setData('is_active', !data.is_active)
                                            }
                                            className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
                                                data.is_active
                                                    ? 'border-green-500/40 bg-green-500/10 text-green-400'
                                                    : 'border-slate-600 bg-slate-800/80 text-slate-400'
                                            }`}
                                        >
                                            {data.is_active ? (
                                                <Wifi className="h-4 w-4" />
                                            ) : (
                                                <WifiOff className="h-4 w-4" />
                                            )}
                                            {data.is_active ? 'Aktif' : 'Non-aktif'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="mt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => onOpenChange(false)}
                                    className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || createProcessing}
                                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                    {processing || createProcessing
                                        ? 'Memproses...'
                                        : isEdit
                                          ? 'Simpan Perubahan'
                                          : 'Connect & Preview'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}

                    {phase === 'waiting' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-white">
                                    Menunggu data dari HMI...
                                </p>
                                <p className="text-xs text-slate-400">
                                    Poller sedang membaca register. Maksimal {PREVIEW_TIMEOUT} detik.
                                </p>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
                                <div
                                    className="h-full bg-cyan-500 transition-all duration-1000"
                                    style={{
                                        width: `${(waitElapsed / PREVIEW_TIMEOUT) * 100}%`,
                                    }}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleCancel(hmiId)}
                                className="text-slate-400"
                            >
                                Batalkan
                            </Button>
                        </div>
                    )}

                    {phase === 'preview' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                                <span className="text-xs text-green-400">
                                    Data berhasil dibaca dari HMI
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {previewData.map((sensor) => (
                                    <div
                                        key={sensor.id}
                                        className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3"
                                    >
                                        <Input
                                            value={sensorNames[sensor.id] ?? sensor.name}
                                            onChange={(e) =>
                                                setSensorNames((prev) => ({
                                                    ...prev,
                                                    [sensor.id]: e.target.value,
                                                }))
                                            }
                                            className="mb-2 h-7 border-slate-600 bg-slate-800 text-xs text-white"
                                        />
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Suhu</span>
                                            <span className="font-mono text-cyan-300">
                                                {sensor.temperature ?? '-'} degC
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Hum</span>
                                            <span className="font-mono text-blue-300">
                                                {sensor.humidity ?? '-'} %RH
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Status</span>
                                            <span
                                                className={`font-mono text-xs font-semibold ${
                                                    sensor.status === 'NORMAL'
                                                        ? 'text-green-400'
                                                        : sensor.status === 'WARNING'
                                                          ? 'text-amber-400'
                                                          : sensor.status === 'CRITICAL'
                                                            ? 'text-red-400'
                                                            : 'text-slate-500'
                                                }`}
                                            >
                                                {sensor.status ?? 'OFFLINE'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleCancel(hmiId)}
                                    className="text-slate-400"
                                >
                                    Batalkan
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => hmiId && handleConfirm(hmiId)}
                                    disabled={createProcessing || !hmiId}
                                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                    {createProcessing
                                        ? 'Mengaktifkan...'
                                        : 'Aktifkan HMI'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Delete HMI Dialog ────────────────────────────────────────────────────────

function DeleteHmiDialog({
    open,
    onOpenChange,
    hmi,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    hmi: HmiItem;
}) {
    const [deleting, setDeleting] = useState(false);

    function handleDelete() {
        setDeleting(true);
        router.delete(`/hmis/${hmi.id}`, {
            onSuccess: () => {
                onOpenChange(false);
                setDeleting(false);
            },
            onError: () => setDeleting(false),
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-white">Hapus HMI</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Apakah Anda yakin ingin menghapus{' '}
                        <strong className="text-white">{hmi.name}</strong>?
                        Semua sensor dan data historis terkait akan ikut
                        terhapus.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleting}
                        onClick={handleDelete}
                    >
                        {deleting ? 'Menghapus...' : 'Hapus HMI'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}



// ─── Delete Sensor Dialog ─────────────────────────────────────────────────────

function DeleteSensorDialog({
    open,
    onOpenChange,
    sensor,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sensor: SensorItem;
}) {
    const [deleting, setDeleting] = useState(false);

    function handleDelete() {
        setDeleting(true);
        router.delete(`/sensors/${sensor.id}`, {
            onSuccess: () => {
                onOpenChange(false);
                setDeleting(false);
            },
            onError: () => setDeleting(false),
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        Hapus Sensor
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Apakah Anda yakin ingin menghapus sensor{' '}
                        <strong className="text-white">{sensor.name}</strong>?
                        Data historis terkait akan ikut terhapus.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleting}
                        onClick={handleDelete}
                    >
                        {deleting ? 'Menghapus...' : 'Hapus Sensor'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── HMI Card ────────────────────────────────────────────────────────────────

function HmiCard({ hmi, roomId }: { hmi: HmiItem; roomId: number }) {
    const [showEditHmi, setShowEditHmi] = useState(false);
    const [showDeleteHmi, setShowDeleteHmi] = useState(false);
    const [deleteSensor, setDeleteSensor] = useState<SensorItem | null>(null);

    function formatValue(value: number | null): string {
        return value === null ? '-' : value.toFixed(2);
    }

    function formatIdealRange(under: number | null, over: number | null): string {
        if (under === null || over === null) {
            return '-';
        }

        return `${under.toFixed(2)} - ${over.toFixed(2)}`;
    }

    return (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 backdrop-blur-sm">
            {/* HMI Header */}
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
                <div className="flex items-center gap-3">
                    <Cpu className="h-4 w-4 text-cyan-400" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                                {hmi.name}
                            </span>
                            <span className="rounded-full border border-slate-600/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300 uppercase">
                                FC{hmi.register_function}
                            </span>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    hmi.is_active
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-slate-600/40 text-slate-500'
                                }`}
                            >
                                {hmi.is_active ? 'AKTIF' : 'NON-AKTIF'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Radio className="h-3 w-3" />
                            <span>
                                {hmi.ip_address}:{hmi.port}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span>{hmi.sensors.length} sensor</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        title="Edit HMI"
                        onClick={() => setShowEditHmi(true)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-600/60 hover:text-cyan-400"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Hapus HMI"
                        onClick={() => setShowDeleteHmi(true)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Sensor Table */}
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-700/60 hover:bg-transparent">
                        <TableHead className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Nama Sensor
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Slave ID
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Reg. Suhu
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Reg. Hum
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Cal. Temp
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Cal. Hum
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Ideal Value Temp
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Ideal Value Hum
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Aksi
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {hmi.sensors.length === 0 ? (
                        <TableRow className="border-slate-700/60 hover:bg-transparent">
                            <TableCell
                                colSpan={9}
                                className="py-6 text-center text-xs text-slate-600"
                            >
                                Belum ada sensor pada HMI ini.
                            </TableCell>
                        </TableRow>
                    ) : (
                        hmi.sensors.map((sensor, index) => {
                            const position = index + 1;
                            const regs =
                                SENSOR_MAP[position as keyof typeof SENSOR_MAP];

                            return (
                                <TableRow
                                    key={sensor.id}
                                    className="border-slate-700/60 transition-colors hover:bg-slate-700/20"
                                >
                                    <TableCell className="text-sm font-medium text-white">
                                        <div className="flex items-center gap-1.5">
                                            <Circle className="h-2 w-2 fill-cyan-400 text-cyan-400" />
                                            {sensor.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center text-slate-300 tabular-nums">
                                        {sensor.unit_id}
                                    </TableCell>
                                    <TableCell className="text-center text-cyan-300 tabular-nums">
                                        {regs?.temp ?? '-'}
                                    </TableCell>
                                    <TableCell className="text-center text-blue-300 tabular-nums">
                                        {regs?.hum ?? '-'}
                                    </TableCell>
                                    <TableCell className="text-center text-emerald-300 tabular-nums">
                                        {formatValue(sensor.calibrate_temp)}
                                    </TableCell>
                                    <TableCell className="text-center text-lime-300 tabular-nums">
                                        {formatValue(sensor.calibrate_hum)}
                                    </TableCell>
                                    <TableCell className="text-center text-amber-300 tabular-nums">
                                        {formatIdealRange(sensor.under_temp, sensor.over_temp)}
                                    </TableCell>
                                    <TableCell className="text-center text-orange-300 tabular-nums">
                                        {formatIdealRange(sensor.under_hum, sensor.over_hum)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                title="Hapus"
                                                onClick={() =>
                                                    setDeleteSensor(sensor)
                                                }
                                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>

            {/* Dialogs */}
            <HmiFormDialog
                open={showEditHmi}
                onOpenChange={setShowEditHmi}
                roomId={roomId}
                hmi={hmi}
            />
            <DeleteHmiDialog
                open={showDeleteHmi}
                onOpenChange={setShowDeleteHmi}
                hmi={hmi}
            />
            {deleteSensor && (
                <DeleteSensorDialog
                    open={!!deleteSensor}
                    onOpenChange={(v) => !v && setDeleteSensor(null)}
                    sensor={deleteSensor}
                />
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomDevices({ room, hmis }: DevicesPageProps) {
    const [showAddHmi, setShowAddHmi] = useState(() => {
        const params = new URLSearchParams(window.location.search);

        return params.get('openAddHmi') === '1';
    });

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const shouldOpen = params.get('openAddHmi') === '1';

        if (!shouldOpen) {
            return;
        }

        params.delete('openAddHmi');

        const nextQuery = params.toString();
        const nextUrl = nextQuery
            ? `${window.location.pathname}?${nextQuery}`
            : window.location.pathname;

        window.history.replaceState({}, '', nextUrl);
    }, []);

    return (
        <>
            <Head title={`Connecting Devices — ${room.name}`} />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <PasswordSessionFloating className="top-[92px]" />

                {/* ── HEADER ──────────────────────────────────────── */}
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Link
                                href="/rooms"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <Cpu className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    {room.name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {room.location ?? 'Connecting Devices'}
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

                        <div className="w-48 shrink-0" />
                    </div>
                </header>

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <main className="flex flex-1 flex-col gap-4 overflow-auto bg-[#151b1f] p-4">
                    {/* ── Breadcrumb & Action Bar ── */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Link
                                href="/rooms"
                                className="transition-colors hover:text-cyan-400"
                            >
                                Connecting Devices
                            </Link>
                            <ChevronRight className="h-3.5 w-3.5" />
                            <span className="font-semibold text-white">
                                {room.name}
                            </span>
                        </div>
                        {/* <Button
                            onClick={() => setShowAddHmi(true)}
                            className="bg-cyan-600 text-white shadow-[0_0_12px_#22d3ee40] hover:bg-cyan-500"
                        >
                            <Plus className="h-4 w-4" />
                            Tambah Koneksi HMI
                        </Button> */}
                    </div>


                    {/* ── HMI Cards ── */}
                    {hmis.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700/60 text-slate-600">
                            <div className="text-center">
                                <Cpu className="mx-auto mb-2 h-10 w-10 opacity-30" />
                                <p className="text-sm">
                                    Belum ada koneksi HMI. Klik "Tambah Koneksi
                                    HMI" untuk memulai.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {hmis.map((hmi) => (
                                <HmiCard
                                    key={hmi.id}
                                    hmi={hmi}
                                    roomId={room.id}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav activeMenu="settings" />
            </div>

            {/* Add HMI Dialog */}
            <HmiFormDialog
                open={showAddHmi}
                onOpenChange={setShowAddHmi}
                roomId={room.id}
            />
        </>
    );
}
