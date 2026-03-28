import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Cpu,
    Plus,
    Thermometer,
    Droplets,
    Trash2,
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomItem {
    id: number;
    name: string;
    location: string | null;
    temp_max_limit: number;
    hum_max_limit: number;
    hmis_count: number;
    sensors_count: number;
    created_at: string | null;
}

interface RoomsIndexProps {
    rooms: RoomItem[];
}

interface PreviewSensor {
    id: number;
    name: string;
    unit_id: number | null;
    modbus_address_temp: number | null;
    modbus_address_hum: number | null;
    temperature: number | null;
    humidity: number | null;
    calibrate_temp: number | null;
    calibrate_hum: number | null;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | null;
    readable: {
        has_latest_data: boolean;
        temperature: boolean;
        humidity: boolean;
        calibrate_temp: boolean;
        calibrate_hum: boolean;
    };
}

type DialogPhase = 'form' | 'waiting' | 'preview';
type TestStatus = 'idle' | 'loading' | 'success' | 'failed';

function ConnectHmiPreviewDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [phase, setPhase] = useState<DialogPhase>('form');
    const [formData, setFormData] = useState({
        ip_address: '',
        port: '502',
    });
    const [createErrors, setCreateErrors] = useState<
        Partial<Record<'ip_address' | 'port', string>>
    >({});
    const [phaseError, setPhaseError] = useState('');
    const [previewData, setPreviewData] = useState<PreviewSensor[]>([]);
    const [sensorNames, setSensorNames] = useState<Record<number, string>>({});
    const [previewRoomName, setPreviewRoomName] = useState<string | null>(null);
    const [previewRoomDetail, setPreviewRoomDetail] = useState<string | null>(
        null,
    );
    const [previewHmiAvg, setPreviewHmiAvg] = useState<{
        temp: number | null;
        hum: number | null;
    }>({
        temp: null,
        hum: null,
    });
    const [hmiId, setHmiId] = useState<number | null>(null);
    const [processing, setProcessing] = useState(false);
    const [waitElapsed, setWaitElapsed] = useState(0);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [hasPassedConnectionTest, setHasPassedConnectionTest] =
        useState(false);
    const pollingRef = useRef<number | null>(null);
    const PREVIEW_TIMEOUT = 30;

    function clearPolling(): void {
        if (pollingRef.current !== null) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }

    function resetState(): void {
        clearPolling();
        setPhase('form');
        setFormData({
            ip_address: '',
            port: '502',
        });
        setCreateErrors({});
        setPhaseError('');
        setPreviewData([]);
        setSensorNames({});
        setPreviewRoomName(null);
        setPreviewRoomDetail(null);
        setPreviewHmiAvg({ temp: null, hum: null });
        setHmiId(null);
        setProcessing(false);
        setWaitElapsed(0);
        setTestStatus('idle');
        setTestMessage('');
        setHasPassedConnectionTest(false);
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
                    room_name: string | null;
                    room_detail: string | null;
                    hmi_avg: {
                        temp: number | null;
                        hum: number | null;
                    };
                    sensors: PreviewSensor[];
                };

                setPreviewRoomName(json.room_name ?? null);
                setPreviewRoomDetail(json.room_detail ?? null);
                setPreviewHmiAvg({
                    temp: json.hmi_avg?.temp ?? null,
                    hum: json.hmi_avg?.hum ?? null,
                });

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

    async function submitCreateAndPreview(e: React.FormEvent): Promise<void> {
        e.preventDefault();

        if (!hasPassedConnectionTest) {
            setPhaseError(
                'Lakukan Test Connect terlebih dahulu sebelum lanjut preview.',
            );

            return;
        }

        setProcessing(true);
        setCreateErrors({});
        setPhaseError('');

        try {
            const payload = {
                ip_address: formData.ip_address,
                port: parseInt(formData.port, 10),
            };

            const res = await fetch('/hmis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (res.status === 422) {
                const json = (await res.json()) as {
                    errors?: Record<string, string[]>;
                };
                const nextErrors: Partial<Record<'ip_address' | 'port', string>> = {};

                Object.entries(json.errors ?? {}).forEach(([key, messages]) => {
                    if (key === 'ip_address' || key === 'port') {
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

            const json = (await res.json()) as { hmi_id: number };
            setHmiId(json.hmi_id);
            await startPollingPreview(json.hmi_id);
        } catch {
            setPhaseError('Gagal menghubungi server saat menyimpan HMI preview.');
        } finally {
            setProcessing(false);
        }
    }

    async function handleTestConnect(): Promise<void> {
        setTestStatus('loading');
        setTestMessage('Menguji koneksi...');
        setHasPassedConnectionTest(false);
        setPhaseError('');

        try {
            const res = await fetch('/hmis/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    ip_address: formData.ip_address,
                    port: parseInt(formData.port, 10),
                }),
            });

            if (res.status === 422) {
                const json = (await res.json()) as {
                    errors?: Record<string, string[]>;
                };

                const nextErrors: Partial<Record<'ip_address' | 'port', string>> = {
                    ...createErrors,
                };

                if (json.errors?.ip_address?.[0]) {
                    nextErrors.ip_address = json.errors.ip_address[0];
                }

                if (json.errors?.port?.[0]) {
                    nextErrors.port = json.errors.port[0];
                }

                setCreateErrors(nextErrors);
                setTestStatus('failed');
                setTestMessage('Validasi gagal. Periksa IP dan port.');

                return;
            }

            if (!res.ok) {
                setTestStatus('failed');
                setTestMessage('Gagal menguji koneksi.');

                return;
            }

            const json = (await res.json()) as {
                success: boolean;
                message?: string;
            };

            if (json.success) {
                setTestStatus('success');
                setTestMessage(json.message ?? 'Koneksi berhasil.');
                setHasPassedConnectionTest(true);

                return;
            }

            setTestStatus('failed');
            setTestMessage(
                json.message ?? 'Tidak dapat terhubung ke perangkat HMI.',
            );
        } catch {
            setTestStatus('failed');
            setTestMessage('Gagal menghubungi server saat test koneksi.');
        }
    }

    async function handleConfirm(): Promise<void> {
        if (!hmiId) {
            return;
        }

        setProcessing(true);
        setPhaseError('');

        try {
            const res = await fetch(`/hmis/${hmiId}/confirm`, {
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

            resetState();
            onOpenChange(false);
            router.reload({ only: ['rooms'] });
        } catch {
            setPhaseError('Gagal menghubungi server saat aktivasi HMI.');
        } finally {
            setProcessing(false);
        }
    }

    async function handleCancel(): Promise<void> {
        clearPolling();

        if (hmiId) {
            await cancelPreviewRequest(hmiId);
        }

        resetState();
        onOpenChange(false);
        router.reload({ only: ['rooms'] });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    resetState();
                }
                onOpenChange(v);
            }}
        >
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Connect HMI Preview</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Masukkan IP dan port HMI. Nama ruangan, device, dan sensor akan mengikuti data polling HMI
                        setelah preview dikonfirmasi.
                    </DialogDescription>
                </DialogHeader>

                {phaseError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        {phaseError}
                    </div>
                )}

                {phase === 'form' && (
                    <form onSubmit={submitCreateAndPreview} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Alamat IP
                                </Label>
                                <Input
                                    value={formData.ip_address}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            ip_address: e.target.value,
                                        }))
                                    }
                                    placeholder="192.168.1.10"
                                    className="border-slate-600 bg-slate-800/80 text-white"
                                />
                                {createErrors.ip_address && (
                                    <span className="text-xs text-red-400">{createErrors.ip_address}</span>
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
                                    value={formData.port}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            port: e.target.value,
                                        }))
                                    }
                                    className="border-slate-600 bg-slate-800/80 text-white"
                                />
                                {createErrors.port && (
                                    <span className="text-xs text-red-400">{createErrors.port}</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2">
                            <div className="text-xs">
                                <p className="font-semibold tracking-wider text-slate-300 uppercase">
                                    Step 1: Test Connect
                                </p>
                                {testStatus !== 'idle' && (
                                    <p
                                        className={`mt-1 ${
                                            testStatus === 'success'
                                                ? 'text-emerald-400'
                                                : testStatus === 'failed'
                                                  ? 'text-red-400'
                                                  : 'text-slate-400'
                                        }`}
                                    >
                                        {testMessage}
                                    </p>
                                )}
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleTestConnect}
                                disabled={
                                    testStatus === 'loading' ||
                                    !formData.ip_address ||
                                    !formData.port
                                }
                                className="border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80"
                            >
                                {testStatus === 'loading'
                                    ? 'Testing...'
                                    : 'Test Connect'}
                            </Button>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing || !hasPassedConnectionTest}
                                className="bg-cyan-600 text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {processing ? 'Memproses...' : 'Connect & Preview'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}

                {phase === 'waiting' && (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-white">Menunggu data dari HMI...</p>
                            <p className="text-xs text-slate-400">
                                Poller sedang membaca register. Maksimal {PREVIEW_TIMEOUT} detik.
                            </p>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
                            <div
                                className="h-full bg-cyan-500 transition-all duration-1000"
                                style={{ width: `${(waitElapsed / PREVIEW_TIMEOUT) * 100}%` }}
                            />
                        </div>
                        <Button type="button" variant="ghost" onClick={handleCancel} className="text-slate-400">
                            Batalkan
                        </Button>
                    </div>
                )}

                {phase === 'preview' && (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                                <p className="text-[10px] tracking-wider text-slate-500 uppercase">
                                    Room dari HMI
                                </p>
                                <p className="font-semibold text-white">
                                    {previewRoomName ?? '-'}
                                </p>
                                <p className="text-slate-400">
                                    {previewRoomDetail ?? '-'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                                <p className="text-[10px] tracking-wider text-slate-500 uppercase">
                                    HMI Avg (Cross-check)
                                </p>
                                <p className="font-mono text-cyan-300">
                                    Temp: {previewHmiAvg.temp ?? '-'} degC
                                </p>
                                <p className="font-mono text-blue-300">
                                    Hum: {previewHmiAvg.hum ?? '-'} %RH
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                            Data berhasil dibaca dari HMI
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {previewData.map((sensor) => (
                                <div key={sensor.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
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
                                        <span className="font-mono text-cyan-300">{sensor.temperature ?? '-'} degC</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Hum</span>
                                        <span className="font-mono text-blue-300">{sensor.humidity ?? '-'} %RH</span>
                                    </div>
                                    <div className="mt-1 rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-[10px]">
                                        <p className="mb-0.5 text-slate-500 uppercase">Kalibrasi (HMI)</p>
                                        <p className="font-mono text-slate-300">
                                            Temp: {sensor.calibrate_temp ?? '-'} | Hum: {sensor.calibrate_hum ?? '-'}
                                        </p>
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
                                    <div className="mt-2 rounded border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-[10px]">
                                        <p className="mb-1 text-slate-500 uppercase">Debug Poller</p>
                                        <p className="font-mono text-slate-300">
                                            Unit: {sensor.unit_id ?? '-'} | T-Addr: {sensor.modbus_address_temp ?? '-'} | H-Addr:{' '}
                                            {sensor.modbus_address_hum ?? '-'}
                                        </p>
                                        <p className="mt-0.5 text-slate-400">
                                            Data: {sensor.readable.has_latest_data ? 'ADA' : 'BELUM'} | T:{' '}
                                            {sensor.readable.temperature ? 'OK' : 'NO'} | H:{' '}
                                            {sensor.readable.humidity ? 'OK' : 'NO'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={handleCancel} className="text-slate-400">
                                Batalkan
                            </Button>
                            <Button type="button" onClick={handleConfirm} disabled={processing} className="bg-cyan-600 text-white hover:bg-cyan-500">
                                {processing ? 'Mengaktifkan...' : 'Aktifkan HMI'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function DeleteRoomDialog({
    open,
    onOpenChange,
    room,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    room: RoomItem | null;
}) {
    const [deleting, setDeleting] = useState(false);

    function handleDelete(): void {
        if (!room) {
            return;
        }

        setDeleting(true);
        router.delete(`/rooms/${room.id}`, {
            onSuccess: () => {
                setDeleting(false);
                onOpenChange(false);
            },
            onError: () => {
                setDeleting(false);
            },
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-white">Hapus Ruangan</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Apakah Anda yakin ingin menghapus{' '}
                        <strong className="text-white">{room?.name ?? 'ruangan ini'}</strong>?
                        Semua koneksi dan data terkait ruangan ini bisa ikut terhapus.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleting || !room}
                        onClick={handleDelete}
                    >
                        {deleting ? 'Menghapus...' : 'Hapus Ruangan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomsIndex({ rooms }: RoomsIndexProps) {
    const [showAddConnection, setShowAddConnection] = useState(false);
    const [showDeleteRoomDialog, setShowDeleteRoomDialog] = useState(false);
    const [roomToDelete, setRoomToDelete] = useState<RoomItem | null>(null);

    const connectedRooms = rooms.filter((room) => room.hmis_count > 0);

    return (
        <>
            <Head title="Connecting Devices — SCADA Monitoring" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <PasswordSessionFloating className="top-[92px]" />

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
                            <Cpu className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    CONNECTING DEVICES
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {connectedRooms.length} Ruangan Terhubung
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
                <main className="flex flex-1 flex-col gap-3 overflow-auto bg-[#151b1f] p-4">
                    {/* ── Action Bar ── */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-5 w-5 text-cyan-400" />
                            <span className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
                                Daftar Connecting
                            </span>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setShowAddConnection(true)}
                            className="bg-cyan-600 text-white shadow-[0_0_12px_#22d3ee40] hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" />
                            Tambah Koneksi HMI
                        </Button>
                    </div>

                    {/* ── Table ── */}
                    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 backdrop-blur-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-700/60 hover:bg-transparent">
                                    <TableHead className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        Nama
                                    </TableHead>
                                    <TableHead className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        Lokasi
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        <span className="flex items-center justify-center gap-1">
                                            <Thermometer className="h-3 w-3 text-cyan-400" />
                                            Batas Suhu
                                        </span>
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        <span className="flex items-center justify-center gap-1">
                                            <Droplets className="h-3 w-3 text-blue-400" />
                                            Batas RH
                                        </span>
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        HMI
                                    </TableHead>
                                    <TableHead className="text-center text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        Sensor
                                    </TableHead>
                                    <TableHead className="text-right text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                        Aksi
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {connectedRooms.length === 0 ? (
                                    <TableRow className="border-slate-700/60 hover:bg-transparent">
                                        <TableCell
                                            colSpan={7}
                                            className="py-12 text-center text-slate-500"
                                        >
                                            Belum ada koneksi HMI yang aktif.
                                            Klik "Tambah Koneksi HMI" untuk
                                            memulai flow connect preview.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    connectedRooms.map((room) => (
                                        <TableRow
                                            key={room.id}
                                            className="border-slate-700/60 transition-colors hover:bg-slate-700/30"
                                        >
                                            <TableCell className="font-semibold text-white">
                                                <Link
                                                    href={`/rooms/${room.id}`}
                                                    className="transition-colors hover:text-cyan-400"
                                                >
                                                    {room.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-slate-400">
                                                {room.location ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-center text-cyan-300 tabular-nums">
                                                {room.temp_max_limit}°C
                                            </TableCell>
                                            <TableCell className="text-center text-blue-300 tabular-nums">
                                                {room.hum_max_limit}%
                                            </TableCell>
                                            <TableCell className="text-center text-slate-300 tabular-nums">
                                                {room.hmis_count}
                                            </TableCell>
                                            <TableCell className="text-center text-slate-300 tabular-nums">
                                                {room.sensors_count}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        className="h-7 bg-cyan-600 px-2.5 text-[10px] tracking-wider text-white uppercase hover:bg-cyan-500"
                                                    >
                                                        <Link
                                                            href={`/rooms/${room.id}/devices`}
                                                            title="Kelola Device HMI"
                                                        >
                                                            <Cpu className="h-3.5 w-3.5" />
                                                            Kelola Device HMI
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        className="h-7 px-2.5 text-[10px] tracking-wider uppercase"
                                                        onClick={() => {
                                                            setRoomToDelete(room);
                                                            setShowDeleteRoomDialog(true);
                                                        }}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Hapus Room
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </main>

                {/* ── FOOTER ──────────────────────────────────────── */}
                <ScadaFooterNav activeMenu="settings" />
            </div>

            <ConnectHmiPreviewDialog
                open={showAddConnection}
                onOpenChange={setShowAddConnection}
            />

            <DeleteRoomDialog
                open={showDeleteRoomDialog}
                onOpenChange={(open) => {
                    setShowDeleteRoomDialog(open);
                    if (!open) {
                        setRoomToDelete(null);
                    }
                }}
                room={roomToDelete}
            />
        </>
    );
}
