import { Head, Link, useForm, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Cpu,
    Plus,
    Pencil,
    Trash2,
    Thermometer,
    Droplets,
    DoorOpen,
} from 'lucide-react';
import { useState } from 'react';
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

// ─── Room Form Dialog ────────────────────────────────────────────────────────

function RoomFormDialog({
    open,
    onOpenChange,
    room,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    room?: RoomItem;
}) {
    const isEdit = !!room;

    const { data, setData, post, put, processing, errors, reset } = useForm({
        name: room?.name ?? '',
        location: room?.location ?? '',
        temp_max_limit: room?.temp_max_limit?.toString() ?? '25.00',
        hum_max_limit: room?.hum_max_limit?.toString() ?? '60.00',
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const options = {
            onSuccess: () => {
                reset();
                onOpenChange(false);
            },
        };

        if (isEdit) {
            put(`/rooms/${room.id}`, options);
        } else {
            post('/rooms', options);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {isEdit ? 'Edit Ruangan' : 'Tambah Ruangan'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {isEdit
                            ? 'Ubah detail ruangan yang sudah ada.'
                            : 'Isi detail ruangan baru yang akan ditambahkan.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label
                            htmlFor="name"
                            className="text-xs font-semibold tracking-wider text-slate-300 uppercase"
                        >
                            Nama Ruangan
                        </Label>
                        <Input
                            id="name"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            placeholder="RUANG CCTV"
                            className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                        />
                        {errors.name && (
                            <span className="text-xs text-red-400">
                                {errors.name}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label
                            htmlFor="location"
                            className="text-xs font-semibold tracking-wider text-slate-300 uppercase"
                        >
                            Lokasi{' '}
                            <span className="font-normal text-slate-500">
                                (opsional)
                            </span>
                        </Label>
                        <Input
                            id="location"
                            value={data.location}
                            onChange={(e) =>
                                setData('location', e.target.value)
                            }
                            placeholder="LT.2"
                            className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                        />
                        {errors.location && (
                            <span className="text-xs text-red-400">
                                {errors.location}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label
                                htmlFor="temp_max_limit"
                                className="text-xs font-semibold tracking-wider text-slate-300 uppercase"
                            >
                                <span className="flex items-center gap-1">
                                    <Thermometer className="h-3 w-3 text-cyan-400" />
                                    Batas Suhu (°C)
                                </span>
                            </Label>
                            <Input
                                id="temp_max_limit"
                                type="number"
                                step="0.01"
                                min="0"
                                max="99.99"
                                value={data.temp_max_limit}
                                onChange={(e) =>
                                    setData('temp_max_limit', e.target.value)
                                }
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                            />
                            {errors.temp_max_limit && (
                                <span className="text-xs text-red-400">
                                    {errors.temp_max_limit}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label
                                htmlFor="hum_max_limit"
                                className="text-xs font-semibold tracking-wider text-slate-300 uppercase"
                            >
                                <span className="flex items-center gap-1">
                                    <Droplets className="h-3 w-3 text-blue-400" />
                                    Batas RH (%)
                                </span>
                            </Label>
                            <Input
                                id="hum_max_limit"
                                type="number"
                                step="0.01"
                                min="0"
                                max="99.99"
                                value={data.hum_max_limit}
                                onChange={(e) =>
                                    setData('hum_max_limit', e.target.value)
                                }
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/30"
                            />
                            {errors.hum_max_limit && (
                                <span className="text-xs text-red-400">
                                    {errors.hum_max_limit}
                                </span>
                            )}
                        </div>
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
                            disabled={processing}
                            className="bg-cyan-600 text-white hover:bg-cyan-500"
                        >
                            {processing
                                ? 'Menyimpan...'
                                : isEdit
                                  ? 'Simpan Perubahan'
                                  : 'Tambah Ruangan'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Delete Confirmation Dialog ──────────────────────────────────────────────

function DeleteRoomDialog({
    open,
    onOpenChange,
    room,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    room: RoomItem;
}) {
    const [deleting, setDeleting] = useState(false);

    function handleDelete() {
        setDeleting(true);
        router.delete(`/rooms/${room.id}`, {
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
                        Hapus Ruangan
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Apakah Anda yakin ingin menghapus ruangan{' '}
                        <strong className="text-white">{room.name}</strong>?
                        Semua HMI, sensor, dan data historis terkait akan ikut
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
                        {deleting ? 'Menghapus...' : 'Hapus Ruangan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomsIndex({ rooms }: RoomsIndexProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [editRoom, setEditRoom] = useState<RoomItem | null>(null);
    const [deleteRoom, setDeleteRoom] = useState<RoomItem | null>(null);

    return (
        <>
            <Head title="Kelola Ruangan — SCADA Monitoring" />

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
                            <DoorOpen className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    KELOLA RUANGAN
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {rooms.length} Ruangan
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
                            <DoorOpen className="h-5 w-5 text-cyan-400" />
                            <span className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
                                Daftar Ruangan
                            </span>
                        </div>
                        <Button
                            onClick={() => setShowCreate(true)}
                            className="bg-cyan-600 text-white shadow-[0_0_12px_#22d3ee40] hover:bg-cyan-500"
                        >
                            <Plus className="h-4 w-4" />
                            Tambah Ruangan
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
                                {rooms.length === 0 ? (
                                    <TableRow className="border-slate-700/60 hover:bg-transparent">
                                        <TableCell
                                            colSpan={7}
                                            className="py-12 text-center text-slate-500"
                                        >
                                            Belum ada ruangan. Klik "Tambah
                                            Ruangan" untuk memulai.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rooms.map((room) => (
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
                                                            title="Kelola Device"
                                                        >
                                                            <Cpu className="h-3.5 w-3.5" />
                                                            Kelola Device
                                                        </Link>
                                                    </Button>
                                                    <button
                                                        type="button"
                                                        title="Edit"
                                                        onClick={() =>
                                                            setEditRoom(room)
                                                        }
                                                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-600/60 hover:text-cyan-400"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Hapus"
                                                        onClick={() =>
                                                            setDeleteRoom(room)
                                                        }
                                                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
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

            {/* ── Dialogs ──────────────────────────────────────── */}
            <RoomFormDialog open={showCreate} onOpenChange={setShowCreate} />

            {editRoom && (
                <RoomFormDialog
                    open={!!editRoom}
                    onOpenChange={(open) => !open && setEditRoom(null)}
                    room={editRoom}
                />
            )}

            {deleteRoom && (
                <DeleteRoomDialog
                    open={!!deleteRoom}
                    onOpenChange={(open) => !open && setDeleteRoom(null)}
                    room={deleteRoom}
                />
            )}
        </>
    );
}
