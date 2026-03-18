import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    Circle,
    Cpu,
    Lock,
    Loader2,
    Pencil,
    Plus,
    Radio,
    Thermometer,
    Trash2,
    Wifi,
    WifiOff,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PasswordSessionFloating } from '@/components/scada/password-session-floating';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
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
import { COIL_MAP, SENSOR_MAP } from '@/constants/sensor-map';

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
}

interface HmiItem {
    id: number;
    name: string;
    ip_address: string;
    port: number;
    register_function: '03' | '04';
    is_active: boolean;
    sensors: SensorItem[];
}

interface DevicesPageProps {
    room: RoomInfo;
    hmis: HmiItem[];
}

// ─── Test Connection State ────────────────────────────────────────────────────

type TestStatus = 'idle' | 'loading' | 'success' | 'failed';

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
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [hasTestedConnection, setHasTestedConnection] = useState(false);

    const { data, setData, post, put, processing, errors, reset } = useForm({
        room_id: roomId,
        name: hmi?.name ?? '',
        ip_address: hmi?.ip_address ?? '',
        port: hmi?.port?.toString() ?? '502',
        register_function: hmi?.register_function ?? '03',
        is_active: hmi?.is_active ?? true,
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const options = {
            onSuccess: () => {
                reset();
                setTestStatus('idle');
                setHasTestedConnection(false);
                onOpenChange(false);
            },
        };
        if (isEdit) {
            put(`/hmis/${hmi.id}`, options);
        } else {
            post('/hmis', options);
        }
    }

    async function handleTestConnection() {
        setTestStatus('loading');
        setTestMessage('');

        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((c) => c.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        try {
            const res = await fetch('/hmis/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': xsrfToken,
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    ip_address: data.ip_address,
                    port: parseInt(data.port),
                    ...(isEdit ? { hmi_id: hmi.id } : {}),
                }),
            });
            const json = await res.json();
            const success = json.success as boolean;
            setTestStatus(success ? 'success' : 'failed');
            setTestMessage(json.message ?? '');
            setData('is_active', success);
            setHasTestedConnection(true);
        } catch {
            setTestStatus('failed');
            setTestMessage('Gagal menghubungi server.');
            setData('is_active', false);
            setHasTestedConnection(true);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    reset();
                    setTestStatus('idle');
                    setHasTestedConnection(false);
                }
                onOpenChange(v);
            }}
        >
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {isEdit ? 'Edit HMI / RTU' : 'Tambah HMI / RTU'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {isEdit
                            ? 'Ubah konfigurasi HMI yang sudah ada.'
                            : 'Isi detail HMI / RTU Modbus TCP yang akan ditambahkan.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="flex flex-col gap-4">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            Nama HMI
                        </Label>
                        <Input
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            placeholder="HMI-01"
                            className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                        />
                        {errors.name && (
                            <span className="text-xs text-red-400">
                                {errors.name}
                            </span>
                        )}
                    </div>

                    {/* IP + Test Connection */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            Alamat IP
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                value={data.ip_address}
                                onChange={(e) => {
                                    setData('ip_address', e.target.value);
                                    setTestStatus('idle');
                                }}
                                placeholder="192.168.1.10"
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={
                                    testStatus === 'loading' ||
                                    !data.ip_address ||
                                    !data.port
                                }
                                className="shrink-0 border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700/60 hover:text-white"
                            >
                                {testStatus === 'loading' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : testStatus === 'success' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                ) : testStatus === 'failed' ? (
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                ) : (
                                    <Wifi className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1 text-xs">Test</span>
                            </Button>
                        </div>
                        {testStatus !== 'idle' && testMessage && (
                            <span
                                className={`text-xs ${testStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}
                            >
                                {testMessage}
                            </span>
                        )}
                        {errors.ip_address && (
                            <span className="text-xs text-red-400">
                                {errors.ip_address}
                            </span>
                        )}
                    </div>

                    {/* Port + Active */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                Port
                            </Label>
                            <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={data.port}
                                onChange={(e) =>
                                    setData('port', e.target.value)
                                }
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                            />
                            {errors.port && (
                                <span className="text-xs text-red-400">
                                    {errors.port}
                                </span>
                            )}
                        </div>

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
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            Function Register
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['03', '04'] as const).map((fc) => (
                                <button
                                    key={fc}
                                    type="button"
                                    onClick={() =>
                                        setData('register_function', fc)
                                    }
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
                        {errors.register_function && (
                            <span className="text-xs text-red-400">
                                {errors.register_function}
                            </span>
                        )}
                    </div>

                    <DialogFooter className="mt-2">
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
                            disabled={
                                processing || (!isEdit && !hasTestedConnection)
                            }
                            className="bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40"
                            title={
                                !isEdit && !hasTestedConnection
                                    ? 'Lakukan Test Koneksi terlebih dahulu'
                                    : undefined
                            }
                        >
                            {processing
                                ? 'Menyimpan...'
                                : isEdit
                                  ? 'Simpan Perubahan'
                                  : 'Tambah HMI'}
                        </Button>
                    </DialogFooter>
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
                        Batal
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

// ─── Sensor Form Dialog ───────────────────────────────────────────────────────

function SensorConfigInfo({
    position,
    registerFunction,
}: {
    position: number;
    registerFunction: '03' | '04';
}) {
    const regs = SENSOR_MAP[position as keyof typeof SENSOR_MAP];
    const coils = COIL_MAP[position as keyof typeof COIL_MAP];

    if (!regs || !coils) {
        return null;
    }

    const fcLabel =
        registerFunction === '03'
            ? 'FC03 - Holding Register'
            : 'FC04 - Input Register';

    return (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                <Lock className="h-3 w-3" />
                Konfigurasi Register Aktif
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-500">Posisi di HMI</span>
                <span className="font-mono text-slate-300">Device {position}</span>

                <span className="text-slate-500">Function Code</span>
                <span className="font-mono text-slate-300">{fcLabel}</span>

                <span className="text-slate-500">Reg. Suhu</span>
                <span className="font-mono text-cyan-400">{regs.temp}</span>

                <span className="text-slate-500">Reg. Hum</span>
                <span className="font-mono text-blue-400">{regs.hum}</span>

                <span className="text-slate-500">Coil Alarm Suhu</span>
                <span className="font-mono text-slate-300">
                    {coils.alarm_temp} (FC01)
                </span>

                <span className="text-slate-500">Coil Alarm Hum</span>
                <span className="font-mono text-slate-300">
                    {coils.alarm_hum} (FC01)
                </span>

                <span className="text-slate-500">Coil Koneksi</span>
                <span className="font-mono text-slate-300">
                    {coils.connection} (FC01)
                </span>
            </div>
        </div>
    );
}

function SensorFormDialog({
    open,
    onOpenChange,
    hmi,
    sensor,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    hmi: HmiItem;
    sensor: SensorItem;
}) {
    const { data, setData, put, processing, errors, reset } = useForm({
        hmi_id: hmi.id,
        name: sensor.name,
        unit_id: sensor.unit_id.toString(),
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        put(`/sensors/${sensor.id}`, {
            onSuccess: () => {
                reset();
                onOpenChange(false);
            },
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) reset();
                onOpenChange(v);
            }}
        >
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        Edit Sensor
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Ubah nama sensor dan unit id. Konfigurasi register
                        mengikuti posisi sensor di HMI.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="flex flex-col gap-4">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            Nama Sensor
                        </Label>
                        <Input
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            placeholder="SENSOR-01"
                            className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                        />
                        {errors.name && (
                            <span className="text-xs text-red-400">
                                {errors.name}
                            </span>
                        )}
                    </div>

                    {/* Slave ID */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                            Slave ID (Unit ID)
                        </Label>
                        <Input
                            type="number"
                            min={1}
                            max={247}
                            value={data.unit_id}
                            onChange={(e) => setData('unit_id', e.target.value)}
                            className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                        />
                        {errors.unit_id && (
                            <span className="text-xs text-red-400">
                                {errors.unit_id}
                            </span>
                        )}
                    </div>

                    <SensorConfigInfo
                        position={sensor.position}
                        registerFunction={hmi.register_function}
                    />

                    <DialogFooter className="mt-2">
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
                            disabled={processing}
                            className="bg-cyan-600 text-white hover:bg-cyan-500"
                        >
                            {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
                        </Button>
                    </DialogFooter>
                </form>
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
                        Batal
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
    const [editSensor, setEditSensor] = useState<SensorItem | null>(null);
    const [deleteSensor, setDeleteSensor] = useState<SensorItem | null>(null);

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
                        <TableHead className="text-right text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                            Aksi
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {hmi.sensors.length === 0 ? (
                        <TableRow className="border-slate-700/60 hover:bg-transparent">
                            <TableCell
                                colSpan={5}
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
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                title="Edit"
                                                onClick={() =>
                                                    setEditSensor({
                                                        ...sensor,
                                                        position,
                                                    })
                                                }
                                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-600/60 hover:text-cyan-400"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
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
            {editSensor && (
                <SensorFormDialog
                    open={!!editSensor}
                    onOpenChange={(v) => !v && setEditSensor(null)}
                    hmi={hmi}
                    sensor={editSensor}
                />
            )}
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
    const [showAddHmi, setShowAddHmi] = useState(false);

    return (
        <>
            <Head title={`Kelola Perangkat — ${room.name}`} />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                <PasswordSessionFloating className="top-[92px]" />

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
                                    {room.location ?? 'Kelola Perangkat'}
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
                                Kelola Ruangan
                            </Link>
                            <ChevronRight className="h-3.5 w-3.5" />
                            <span className="font-semibold text-white">
                                {room.name}
                            </span>
                        </div>
                        <Button
                            onClick={() => setShowAddHmi(true)}
                            className="bg-cyan-600 text-white shadow-[0_0_12px_#22d3ee40] hover:bg-cyan-500"
                        >
                            <Plus className="h-4 w-4" />
                            Tambah HMI / RTU
                        </Button>
                    </div>

                    {/* ── Room Info Card ── */}
                    <div className="flex items-center gap-6 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Thermometer className="h-4 w-4 text-cyan-400" />
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                                Batas Suhu
                            </span>
                            <span className="text-sm font-bold text-cyan-300">
                                {room.temp_max_limit}°C
                            </span>
                        </div>
                        <div className="h-4 w-px bg-slate-700" />
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                                Batas RH
                            </span>
                            <span className="text-sm font-bold text-blue-300">
                                {room.hum_max_limit}%
                            </span>
                        </div>
                        <div className="h-4 w-px bg-slate-700" />
                        <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-slate-400" />
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                                HMI
                            </span>
                            <span className="text-sm font-bold text-white">
                                {hmis.length}
                            </span>
                        </div>
                        <div className="h-4 w-px bg-slate-700" />
                        <div className="flex items-center gap-2">
                            <Radio className="h-4 w-4 text-slate-400" />
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                                Sensor
                            </span>
                            <span className="text-sm font-bold text-white">
                                {hmis.reduce(
                                    (acc, h) => acc + h.sensors.length,
                                    0,
                                )}
                            </span>
                        </div>
                    </div>

                    {/* ── HMI Cards ── */}
                    {hmis.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700/60 text-slate-600">
                            <div className="text-center">
                                <Cpu className="mx-auto mb-2 h-10 w-10 opacity-30" />
                                <p className="text-sm">
                                    Belum ada HMI. Klik "Tambah HMI / RTU" untuk
                                    memulai.
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
                <ScadaFooterNav activeMenu="rooms" />
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
