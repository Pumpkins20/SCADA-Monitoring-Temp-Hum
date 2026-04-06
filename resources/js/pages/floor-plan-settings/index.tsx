import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCircle2,
    ImagePlus,
    Loader2,
    Map,
    MapPin,
    Trash2,
    Upload,
    XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloorPlanMap } from '@/components/scada/floor-plan-map';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import type { SensorStatus } from '@/components/scada/scada-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorConfig {
    id: number;
    name: string;
    pos_x: number | null;
    pos_y: number | null;
}

interface RoomConfig {
    id: number;
    name: string;
    location: string | null;
    floor_plan_image: string | null;
    floor_plan_width: number;
    floor_plan_height: number;
    sensors: SensorConfig[];
}

interface FloorPlanSettingsPageProps {
    rooms: RoomConfig[];
}

interface LocalEdit {
    pos_x: string;
    pos_y: string;
}

type RowState = 'idle' | 'saving' | 'saved' | 'error';
type ActionState = 'idle' | 'saving' | 'saved' | 'error';
type SensorPatchOutcome = 'success' | 'error' | 'cancelled';

type AllEdits = Record<number, Record<number, LocalEdit>>;
type AllRowStates = Record<number, Record<number, RowState>>;
type DimEdits = Record<number, { width: string; height: string }>;
type ActionStates = Record<number, ActionState>;

interface DragSensorState {
    roomId: number;
    sensorId: number;
    sensorName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(val: number | null): string {
    return val === null || val === undefined ? '' : String(val);
}

function parseCoord(raw: string): number | null {
    const s = raw.trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 || n > 65535 ? null : n;
}

function isValidCoordInput(raw: string): boolean {
    const s = raw.trim();
    if (s === '') return true;
    const n = parseInt(s, 10);
    return !isNaN(n) && n >= 0 && n <= 65535;
}

function parseDim(raw: string, fallback: number): number {
    const n = parseInt(raw.trim(), 10);
    return isNaN(n) || n < 100 ? fallback : n;
}

// ─── ImageUploadPanel ─────────────────────────────────────────────────────────

interface ImageUploadPanelProps {
    room: RoomConfig;
    uploadFile: File | null;
    previewUrl: string | null;
    uploadState: ActionState;
    removeState: ActionState;
    dimEdit: { width: string; height: string };
    dimState: ActionState;
    onFileSelect: (file: File) => void;
    onUpload: () => void;
    onRemove: () => void;
    onDimChange: (field: 'width' | 'height', value: string) => void;
    onSaveDimensions: () => void;
}

function ImageUploadPanel({
    room,
    uploadFile,
    previewUrl,
    uploadState,
    removeState,
    dimEdit,
    dimState,
    onFileSelect,
    onUpload,
    onRemove,
    onDimChange,
    onSaveDimensions,
}: ImageUploadPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasImage = !!room.floor_plan_image;
    const hasPreview = !!previewUrl;
    const isUploading = uploadState === 'saving';
    const isUpDone = uploadState === 'saved';
    const isUpError = uploadState === 'error';
    const isRemoving = removeState === 'saving';
    const isSavingDim = dimState === 'saving';
    const isDimDone = dimState === 'saved';
    const isDimError = dimState === 'error';

    return (
        <div className="shrink-0 rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
            <div className="flex items-start gap-4">
                {/* ── Thumbnail / dropzone ── */}
                <button
                    type="button"
                    title="Klik untuk pilih file gambar"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative h-20 w-32 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-slate-600/60 bg-slate-900/70 transition-colors hover:border-cyan-500/50"
                >
                    {hasPreview ? (
                        <>
                            <img
                                src={previewUrl!}
                                alt="Floor plan preview"
                                className="h-full w-full object-cover"
                            />
                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                                <Upload className="h-5 w-5 text-white" />
                            </div>
                        </>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1">
                            <ImagePlus className="h-6 w-6 text-slate-600 transition-colors group-hover:text-cyan-500/60" />
                            <span className="text-[9px] text-slate-600 transition-colors group-hover:text-slate-500">
                                Klik upload
                            </span>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        className="sr-only"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onFileSelect(file);
                            e.target.value = '';
                        }}
                    />
                </button>

                {/* ── Controls ── */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {/* Row 1: header + status */}
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                Gambar Denah
                            </span>
                            {hasImage && !uploadFile && (
                                <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-400">
                                    ✓ Tersimpan
                                </span>
                            )}
                            {!hasImage && !uploadFile && (
                                <span className="rounded border border-slate-700/40 bg-slate-700/20 px-1.5 py-0.5 text-[9px] text-slate-600">
                                    Belum ada gambar
                                </span>
                            )}
                        </div>

                        {uploadFile && (
                            <span className="max-w-full truncate text-[10px] text-slate-400">
                                📎 {uploadFile.name}
                            </span>
                        )}

                        <span className="text-[9px] text-slate-600">
                            JPG · PNG · WebP · SVG · maks 10 MB
                        </span>
                    </div>

                    {/* Row 2: dimensions */}
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-slate-500">
                                Dimensi:
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] text-slate-600">
                                    W
                                </span>
                                <input
                                    type="number"
                                    min={100}
                                    max={65535}
                                    value={dimEdit.width}
                                    onChange={(e) =>
                                        onDimChange('width', e.target.value)
                                    }
                                    className="w-16 rounded-lg border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-center font-mono text-xs text-white transition-colors outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 sm:w-20"
                                />
                                <span className="text-[10px] text-slate-600">
                                    × H
                                </span>
                                <input
                                    type="number"
                                    min={100}
                                    max={65535}
                                    value={dimEdit.height}
                                    onChange={(e) =>
                                        onDimChange('height', e.target.value)
                                    }
                                    className="w-16 rounded-lg border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-center font-mono text-xs text-white transition-colors outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 sm:w-20"
                                />
                                <span className="text-[10px] text-slate-600">
                                    mm
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={isSavingDim}
                                onClick={onSaveDimensions}
                                className={`flex w-full max-w-40 items-center justify-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                    isDimDone
                                        ? 'border border-green-500/40 bg-green-500/15 text-green-400'
                                        : isDimError
                                          ? 'border border-red-500/40 bg-red-500/15 text-red-400'
                                          : 'border border-slate-700/40 bg-slate-700/30 text-slate-400 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400'
                                }`}
                            >
                                {isSavingDim ? (
                                    <>
                                        <Loader2 className="h-3 w-3 animate-spin" />{' '}
                                        Menyimpan
                                    </>
                                ) : isDimDone ? (
                                    <>
                                        <CheckCircle2 className="h-3 w-3" />{' '}
                                        Tersimpan
                                    </>
                                ) : isDimError ? (
                                    <>
                                        <XCircle className="h-3 w-3" /> Gagal
                                    </>
                                ) : (
                                    'Simpan Dimensi'
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Row 3: action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {/* Upload */}
                        <button
                            type="button"
                            disabled={!uploadFile || isUploading}
                            onClick={onUpload}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-semibold tracking-wider uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                isUpDone
                                    ? 'border border-green-500/40 bg-green-500/15 text-green-400'
                                    : isUpError
                                      ? 'border border-red-500/40 bg-red-500/15 text-red-400'
                                      : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                            }`}
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />{' '}
                                    Mengupload...
                                </>
                            ) : isUpDone ? (
                                <>
                                    <CheckCircle2 className="h-3 w-3" /> Upload
                                    Berhasil
                                </>
                            ) : isUpError ? (
                                <>
                                    <XCircle className="h-3 w-3" /> Upload Gagal
                                </>
                            ) : (
                                <>
                                    <Upload className="h-3 w-3" /> Upload Gambar
                                </>
                            )}
                        </button>

                        {/* Ganti */}
                        {hasImage && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-lg border border-slate-700/40 bg-slate-700/30 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"
                            >
                                Ganti
                            </button>
                        )}

                        {/* Hapus */}
                        {hasImage && (
                            <button
                                type="button"
                                disabled={isRemoving}
                                onClick={onRemove}
                                className="flex items-center gap-1 rounded-lg border border-slate-700/40 bg-slate-700/30 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isRemoving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Trash2 className="h-3 w-3" />
                                )}
                                Hapus Gambar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FloorPlanSettingsPage({
    rooms,
}: FloorPlanSettingsPageProps) {
    const [now, setNow] = useState(new Date());
    const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
        rooms[0]?.id ?? null,
    );

    // Sensor position edits: roomId → sensorId → LocalEdit
    const [allEdits, setAllEdits] = useState<AllEdits>({});
    const [allRowStates, setAllRowStates] = useState<AllRowStates>({});

    // Dimension edits per room
    const [dimEdits, setDimEdits] = useState<DimEdits>({});
    const [dimStates, setDimStates] = useState<ActionStates>({});

    // Upload state per room (file + blob preview URL + status)
    const [uploadFiles, setUploadFiles] = useState<Record<number, File>>({});
    const [uploadPreviews, setUploadPreviews] = useState<
        Record<number, string>
    >({});
    const [uploadStates, setUploadStates] = useState<ActionStates>({});
    const [removeStates, setRemoveStates] = useState<ActionStates>({});
    const [saveAllStates, setSaveAllStates] = useState<ActionStates>({});

    // Drag state: sensor row -> map placement
    const [dragSensor, setDragSensor] = useState<DragSensorState | null>(null);
    const [dragPointer, setDragPointer] = useState<{
        x: number;
        y: number;
    } | null>(null);

    // Clock tick
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Cleanup blob URLs on unmount
    const uploadPreviewsRef = useRef(uploadPreviews);
    useEffect(() => {
        uploadPreviewsRef.current = uploadPreviews;
    });
    useEffect(() => {
        return () => {
            Object.values(uploadPreviewsRef.current).forEach((url) =>
                URL.revokeObjectURL(url),
            );
        };
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

    // Derived selected room
    const selectedRoom = useMemo(
        () => rooms.find((r) => r.id === selectedRoomId) ?? null,
        [rooms, selectedRoomId],
    );

    useEffect(() => {
        if (dragSensor === null) {
            return;
        }

        function handlePointerMove(event: PointerEvent): void {
            setDragPointer({ x: event.clientX, y: event.clientY });
        }

        window.addEventListener('pointermove', handlePointerMove);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
        };
    }, [dragSensor]);

    // ── State readers (stable functions, read from current state) ────────────

    const getEdit = useCallback(
        (roomId: number, sensor: SensorConfig): LocalEdit => {
            return (
                allEdits[roomId]?.[sensor.id] ?? {
                    pos_x: toStr(sensor.pos_x),
                    pos_y: toStr(sensor.pos_y),
                }
            );
        },
        [allEdits],
    );

    function getRowState(roomId: number, sensorId: number): RowState {
        return allRowStates[roomId]?.[sensorId] ?? 'idle';
    }

    function getDimEdit(room: RoomConfig): { width: string; height: string } {
        return (
            dimEdits[room.id] ?? {
                width: String(room.floor_plan_width),
                height: String(room.floor_plan_height),
            }
        );
    }

    const getSensorDraft = useCallback(
        (
            roomId: number,
            sensor: SensorConfig,
        ): {
            edit: LocalEdit;
            x: number | null;
            y: number | null;
            isValid: boolean;
            isChanged: boolean;
        } => {
            const edit = getEdit(roomId, sensor);
            const x = parseCoord(edit.pos_x);
            const y = parseCoord(edit.pos_y);
            const isValid =
                isValidCoordInput(edit.pos_x) && isValidCoordInput(edit.pos_y);
            const isChanged = x !== sensor.pos_x || y !== sensor.pos_y;

            return { edit, x, y, isValid, isChanged };
        },
        [getEdit],
    );

    // The background image shown in FloorPlanMap:
    // - if user selected a new file → use blob preview URL
    // - otherwise → use saved image URL from server
    function getActiveImage(room: RoomConfig): string | null {
        return uploadPreviews[room.id] ?? room.floor_plan_image;
    }

    // Active dimensions for FloorPlanMap (uses local edit or server value)
    function getActiveDim(room: RoomConfig): { width: number; height: number } {
        const edit = getDimEdit(room);
        return {
            width: parseDim(edit.width, room.floor_plan_width),
            height: parseDim(edit.height, room.floor_plan_height),
        };
    }

    // ── sensorsForMap (live preview with local position overrides) ────────────

    const sensorsForMap = useMemo(() => {
        if (!selectedRoom) return [];
        return selectedRoom.sensors.map((s) => {
            const edit = allEdits[selectedRoom.id]?.[s.id];
            const px = edit ? parseCoord(edit.pos_x) : s.pos_x;
            const py = edit ? parseCoord(edit.pos_y) : s.pos_y;
            return {
                id: s.id,
                name: s.name,
                temperature: null,
                humidity: null,
                status: 'NORMAL' as SensorStatus,
                last_read_at: null,
                pos_x: px,
                pos_y: py,
            };
        });
    }, [selectedRoom, allEdits]);

    const unsavedByRoom = useMemo(() => {
        const result: Record<number, { count: number; hasInvalid: boolean }> =
            {};

        rooms.forEach((room) => {
            let count = 0;
            let hasInvalid = false;

            room.sensors.forEach((sensor) => {
                const draft = getSensorDraft(room.id, sensor);
                if (!draft.isChanged) {
                    return;
                }

                count += 1;
                if (!draft.isValid) {
                    hasInvalid = true;
                }
            });

            result[room.id] = { count, hasInvalid };
        });

        return result;
    }, [getSensorDraft, rooms]);

    const handleSelectRoom = useCallback((roomId: number): void => {
        setSelectedRoomId(roomId);
        setDragSensor(null);
        setDragPointer(null);
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleEdit = useCallback(
        (
            roomId: number,
            sensorId: number,
            sensor: SensorConfig,
            field: 'pos_x' | 'pos_y',
            value: string,
        ) => {
            setAllEdits((prev) => {
                const prevRoom = prev[roomId] ?? {};
                const prevSensor = prevRoom[sensorId] ?? {
                    pos_x: toStr(sensor.pos_x),
                    pos_y: toStr(sensor.pos_y),
                };
                return {
                    ...prev,
                    [roomId]: {
                        ...prevRoom,
                        [sensorId]: { ...prevSensor, [field]: value },
                    },
                };
            });
            setAllRowStates((prev) => ({
                ...prev,
                [roomId]: { ...(prev[roomId] ?? {}), [sensorId]: 'idle' },
            }));
        },
        [],
    );

    const handleClear = useCallback((roomId: number, sensor: SensorConfig) => {
        setAllEdits((prev) => ({
            ...prev,
            [roomId]: {
                ...(prev[roomId] ?? {}),
                [sensor.id]: { pos_x: '', pos_y: '' },
            },
        }));
        setAllRowStates((prev) => ({
            ...prev,
            [roomId]: { ...(prev[roomId] ?? {}), [sensor.id]: 'idle' },
        }));
    }, []);

    function handleDragStart(
        event: React.PointerEvent<HTMLButtonElement>,
        room: RoomConfig,
        sensor: SensorConfig,
    ): void {
        event.preventDefault();

        setDragSensor({
            roomId: room.id,
            sensorId: sensor.id,
            sensorName: sensor.name,
        });
        setDragPointer({ x: event.clientX, y: event.clientY });
    }

    function handleMapPlaceSensor(
        sensorId: number,
        x: number,
        y: number,
    ): void {
        if (!selectedRoom) {
            return;
        }

        const sensor = selectedRoom.sensors.find(
            (item) => item.id === sensorId,
        );
        if (!sensor) {
            return;
        }

        setAllEdits((prev) => {
            const prevRoom = prev[selectedRoom.id] ?? {};
            const prevSensor = prevRoom[sensor.id] ?? {
                pos_x: toStr(sensor.pos_x),
                pos_y: toStr(sensor.pos_y),
            };

            return {
                ...prev,
                [selectedRoom.id]: {
                    ...prevRoom,
                    [sensor.id]: {
                        ...prevSensor,
                        pos_x: String(x),
                        pos_y: String(y),
                    },
                },
            };
        });

        setAllRowStates((prev) => ({
            ...prev,
            [selectedRoom.id]: {
                ...(prev[selectedRoom.id] ?? {}),
                [sensor.id]: 'idle',
            },
        }));
    }

    function handleDragEnd(): void {
        setDragSensor(null);
        setDragPointer(null);
    }

    function patchSensorPosition(
        sensorId: number,
        posX: number | null,
        posY: number | null,
    ): Promise<SensorPatchOutcome> {
        return new Promise((resolve) => {
            let outcome: SensorPatchOutcome = 'cancelled';

            router.patch(
                `/floor-plan-settings/sensors/${sensorId}`,
                { pos_x: posX, pos_y: posY },
                {
                    preserveState: true,
                    preserveScroll: true,
                    onSuccess: () => {
                        outcome = 'success';
                    },
                    onError: () => {
                        outcome = 'error';
                    },
                    onFinish: () => {
                        resolve(outcome);
                    },
                },
            );
        });
    }

    async function handleSavePosition(
        roomId: number,
        sensor: SensorConfig,
        edit: LocalEdit,
    ): Promise<void> {
        setAllRowStates((prev) => ({
            ...prev,
            [roomId]: { ...(prev[roomId] ?? {}), [sensor.id]: 'saving' },
        }));

        const outcome = await patchSensorPosition(
            sensor.id,
            parseCoord(edit.pos_x),
            parseCoord(edit.pos_y),
        );

        if (outcome === 'success') {
            setAllRowStates((prev) => ({
                ...prev,
                [roomId]: {
                    ...(prev[roomId] ?? {}),
                    [sensor.id]: 'saved',
                },
            }));

            setTimeout(() => {
                setAllRowStates((prev) => ({
                    ...prev,
                    [roomId]: {
                        ...(prev[roomId] ?? {}),
                        [sensor.id]: 'idle',
                    },
                }));
            }, 2500);

            return;
        }

        setAllRowStates((prev) => ({
            ...prev,
            [roomId]: {
                ...(prev[roomId] ?? {}),
                [sensor.id]: outcome === 'error' ? 'error' : 'idle',
            },
        }));
    }

    async function handleSaveAllPositions(room: RoomConfig): Promise<void> {
        const roomUnsaved = unsavedByRoom[room.id];
        if (!roomUnsaved || roomUnsaved.count === 0 || roomUnsaved.hasInvalid) {
            return;
        }

        setSaveAllStates((prev) => ({ ...prev, [room.id]: 'saving' }));

        const changedSensors = room.sensors.filter(
            (sensor) => getSensorDraft(room.id, sensor).isChanged,
        );

        if (changedSensors.length === 0) {
            setSaveAllStates((prev) => ({ ...prev, [room.id]: 'idle' }));
            return;
        }

        let failed = false;

        for (const sensor of changedSensors) {
            const draft = getSensorDraft(room.id, sensor);

            setAllRowStates((prev) => ({
                ...prev,
                [room.id]: {
                    ...(prev[room.id] ?? {}),
                    [sensor.id]: 'saving',
                },
            }));

            const outcome = await patchSensorPosition(
                sensor.id,
                draft.x,
                draft.y,
            );

            if (outcome === 'success') {
                setAllRowStates((prev) => ({
                    ...prev,
                    [room.id]: {
                        ...(prev[room.id] ?? {}),
                        [sensor.id]: 'saved',
                    },
                }));

                setTimeout(() => {
                    setAllRowStates((prev) => ({
                        ...prev,
                        [room.id]: {
                            ...(prev[room.id] ?? {}),
                            [sensor.id]: 'idle',
                        },
                    }));
                }, 2500);

                continue;
            }

            failed = true;

            setAllRowStates((prev) => ({
                ...prev,
                [room.id]: {
                    ...(prev[room.id] ?? {}),
                    [sensor.id]: outcome === 'error' ? 'error' : 'idle',
                },
            }));
        }

        setSaveAllStates((prev) => ({
            ...prev,
            [room.id]: failed ? 'error' : 'saved',
        }));

        setTimeout(() => {
            setSaveAllStates((prev) => ({ ...prev, [room.id]: 'idle' }));
        }, 2500);
    }

    function handleFileSelect(roomId: number, file: File) {
        // Revoke previous blob URL if any
        if (uploadPreviews[roomId]) {
            URL.revokeObjectURL(uploadPreviews[roomId]);
        }
        const blobUrl = URL.createObjectURL(file);
        setUploadFiles((prev) => ({ ...prev, [roomId]: file }));
        setUploadPreviews((prev) => ({ ...prev, [roomId]: blobUrl }));
        setUploadStates((prev) => ({ ...prev, [roomId]: 'idle' }));
    }

    function handleUpload(room: RoomConfig) {
        const file = uploadFiles[room.id];
        if (!file) return;

        const dim = getDimEdit(room);

        setUploadStates((prev) => ({ ...prev, [room.id]: 'saving' }));

        router.post(
            `/floor-plan-settings/${room.id}/image`,
            {
                image: file,
                floor_plan_width: parseDim(dim.width, room.floor_plan_width),
                floor_plan_height: parseDim(dim.height, room.floor_plan_height),
            },
            {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: () => {
                    // Revoke blob URL; page will reload with new server URL
                    const blobUrl = uploadPreviews[room.id];
                    if (blobUrl) URL.revokeObjectURL(blobUrl);

                    setUploadFiles((prev) => {
                        const n = { ...prev };
                        delete n[room.id];
                        return n;
                    });
                    setUploadPreviews((prev) => {
                        const n = { ...prev };
                        delete n[room.id];
                        return n;
                    });
                    setUploadStates((prev) => ({
                        ...prev,
                        [room.id]: 'saved',
                    }));

                    setTimeout(() => {
                        setUploadStates((prev) => ({
                            ...prev,
                            [room.id]: 'idle',
                        }));
                    }, 2500);
                },
                onError: () => {
                    setUploadStates((prev) => ({
                        ...prev,
                        [room.id]: 'error',
                    }));
                },
            },
        );
    }

    function handleRemoveImage(room: RoomConfig) {
        setRemoveStates((prev) => ({ ...prev, [room.id]: 'saving' }));

        router.delete(`/floor-plan-settings/${room.id}/image`, {
            preserveScroll: true,
            onSuccess: () => {
                setRemoveStates((prev) => ({ ...prev, [room.id]: 'idle' }));
            },
            onError: () => {
                setRemoveStates((prev) => ({ ...prev, [room.id]: 'error' }));
            },
        });
    }

    function handleSaveDimensions(room: RoomConfig) {
        const dim = getDimEdit(room);

        setDimStates((prev) => ({ ...prev, [room.id]: 'saving' }));

        router.patch(
            `/floor-plan-settings/${room.id}/dimensions`,
            {
                floor_plan_width: parseDim(dim.width, room.floor_plan_width),
                floor_plan_height: parseDim(dim.height, room.floor_plan_height),
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setDimStates((prev) => ({ ...prev, [room.id]: 'saved' }));
                    setTimeout(() => {
                        setDimStates((prev) => ({
                            ...prev,
                            [room.id]: 'idle',
                        }));
                    }, 2500);
                },
                onError: () => {
                    setDimStates((prev) => ({ ...prev, [room.id]: 'error' }));
                },
            },
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <Head title="Konfigurasi Denah Sensor" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] font-sans text-white">
                {/* ── HEADER ──────────────────────────────────────────── */}
                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center px-5 pb-2">
                        <div className="flex w-48 shrink-0 items-center gap-2">
                            <Link
                                href="/settings-general"
                                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-slate-700/60"
                            >
                                <ArrowLeft className="h-4 w-4 text-slate-400" />
                            </Link>
                            <Map className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider text-white uppercase">
                                    DENAH SENSOR
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    Konfigurasi Posisi Titik Sensor
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col items-center">
                            <p className="text-base font-bold tracking-widest text-white uppercase">
                                SCADA MONITORING AC PRESISI RUANG SERVER CCTV
                                &amp; FIDS
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

                {/* ── MAIN ────────────────────────────────────────────── */}
                <main className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
                    {/* ── LEFT: Room selector ── */}
                    <aside className="flex w-52 shrink-0 flex-col gap-2 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-1">
                            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                            <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                                Pilih Ruangan
                            </span>
                        </div>

                        <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
                            {rooms.length === 0 ? (
                                <p className="px-2 text-xs text-slate-600">
                                    Belum ada ruangan.
                                </p>
                            ) : (
                                rooms.map((room) => {
                                    const isActive = room.id === selectedRoomId;
                                    const placed = room.sensors.filter(
                                        (s) =>
                                            s.pos_x !== null &&
                                            s.pos_y !== null,
                                    ).length;
                                    const total = room.sensors.length;
                                    const hasImage = !!room.floor_plan_image;
                                    const roomUnsaved =
                                        unsavedByRoom[room.id]?.count ?? 0;

                                    return (
                                        <button
                                            key={room.id}
                                            type="button"
                                            onClick={() =>
                                                handleSelectRoom(room.id)
                                            }
                                            className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                                                isActive
                                                    ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_12px_#22d3ee18]'
                                                    : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600/60 hover:bg-slate-800/80'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <p
                                                    className={`text-xs font-bold tracking-wider uppercase ${isActive ? 'text-cyan-300' : 'text-slate-300'}`}
                                                >
                                                    {room.name}
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    {roomUnsaved > 0 && (
                                                        <span className="shrink-0 rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.5 text-[8px] font-semibold text-amber-300 uppercase">
                                                            Unsaved{' '}
                                                            {roomUnsaved}
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase ${
                                                            hasImage
                                                                ? 'bg-cyan-500/20 text-cyan-400'
                                                                : 'bg-slate-700/40 text-slate-600'
                                                        }`}
                                                    >
                                                        {hasImage
                                                            ? 'IMG ✓'
                                                            : 'No IMG'}
                                                    </span>
                                                </div>
                                            </div>

                                            {room.location && (
                                                <p className="text-[10px] text-slate-500">
                                                    {room.location}
                                                </p>
                                            )}

                                            {/* Sensor progress bar */}
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                                                    <div
                                                        className="h-full rounded-full bg-cyan-500/70 transition-all duration-500"
                                                        style={{
                                                            width:
                                                                total === 0
                                                                    ? '0%'
                                                                    : `${(placed / total) * 100}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[9px] text-slate-500 tabular-nums">
                                                    {placed}/{total}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Coordinate system info */}
                        <div className="mt-auto shrink-0 rounded-xl border border-slate-700/40 bg-slate-900/60 p-2.5">
                            <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
                                Sistem Koordinat
                            </p>
                            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                {(
                                    [
                                        { label: 'Satuan', val: 'mm' },
                                        {
                                            label: 'Asal (0,0)',
                                            val: 'Sudut kiri atas',
                                        },
                                        { label: 'X →', val: 'Kanan' },
                                        { label: 'Y ↓', val: 'Bawah' },
                                        { label: 'Maks', val: '65.535' },
                                    ] as const
                                ).map(({ label, val }) => (
                                    <div key={label} className="contents">
                                        <span className="text-[9px] text-slate-600">
                                            {label}
                                        </span>
                                        <span className="text-[9px] text-slate-400">
                                            {val}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* ── RIGHT: Preview + editor ── */}
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                        {selectedRoom === null ? (
                            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/40 text-sm text-slate-600">
                                Pilih ruangan untuk mulai konfigurasi denah.
                            </div>
                        ) : (
                            <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[minmax(0,1fr)_480px]">
                                <div className="flex min-h-0 flex-col gap-2">
                                    {/* ── Floor Plan Preview ── */}
                                    <div className="min-h-[300px] flex-1 overflow-hidden xl:min-h-0">
                                        <FloorPlanMap
                                            sensors={sensorsForMap}
                                            roomName={selectedRoom.name}
                                            draggingSensorId={
                                                dragSensor?.sensorId ?? null
                                            }
                                            dragPointer={dragPointer}
                                            onPlaceSensor={handleMapPlaceSensor}
                                            onDragEnd={handleDragEnd}
                                            backgroundImage={getActiveImage(
                                                selectedRoom,
                                            )}
                                            roomWidth={
                                                getActiveDim(selectedRoom).width
                                            }
                                            roomHeight={
                                                getActiveDim(selectedRoom)
                                                    .height
                                            }
                                        />
                                    </div>

                                    <div className="shrink-0 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-[10px] tracking-wide text-cyan-300/90">
                                        Drag sensor dari tabel ke area denah
                                        untuk isi koordinat. Posisi hasil drag
                                        belum tersimpan sampai tombol{' '}
                                        <span className="font-semibold text-cyan-200 uppercase">
                                            Simpan
                                        </span>{' '}
                                        ditekan.
                                    </div>
                                </div>

                                <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                                    {/* ── Image Upload Panel ── */}
                                    <ImageUploadPanel
                                        room={selectedRoom}
                                        uploadFile={
                                            uploadFiles[selectedRoom.id] ?? null
                                        }
                                        previewUrl={getActiveImage(
                                            selectedRoom,
                                        )}
                                        uploadState={
                                            uploadStates[selectedRoom.id] ??
                                            'idle'
                                        }
                                        removeState={
                                            removeStates[selectedRoom.id] ??
                                            'idle'
                                        }
                                        dimEdit={getDimEdit(selectedRoom)}
                                        dimState={
                                            dimStates[selectedRoom.id] ?? 'idle'
                                        }
                                        onFileSelect={(file) =>
                                            handleFileSelect(
                                                selectedRoom.id,
                                                file,
                                            )
                                        }
                                        onUpload={() =>
                                            handleUpload(selectedRoom)
                                        }
                                        onRemove={() =>
                                            handleRemoveImage(selectedRoom)
                                        }
                                        onDimChange={(field, value) =>
                                            setDimEdits((prev) => ({
                                                ...prev,
                                                [selectedRoom.id]: {
                                                    ...getDimEdit(selectedRoom),
                                                    [field]: value,
                                                },
                                            }))
                                        }
                                        onSaveDimensions={() =>
                                            handleSaveDimensions(selectedRoom)
                                        }
                                    />

                                    {/* ── Sensor Coordinate Editor ── */}
                                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50">
                                        {/* Header */}
                                        <div className="flex shrink-0 items-center gap-2 border-b border-slate-700/50 px-4 py-2">
                                            {(() => {
                                                const roomUnsaved =
                                                    unsavedByRoom[
                                                        selectedRoom.id
                                                    ] ?? {
                                                        count: 0,
                                                        hasInvalid: false,
                                                    };
                                                const saveAllState =
                                                    saveAllStates[
                                                        selectedRoom.id
                                                    ] ?? 'idle';
                                                const isSaveAllBusy =
                                                    saveAllState === 'saving';

                                                return (
                                                    <>
                                                        <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                                                        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                                                            Koordinat Sensor —{' '}
                                                            {selectedRoom.name}
                                                        </span>
                                                        {roomUnsaved.count >
                                                            0 && (
                                                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                                                                {
                                                                    roomUnsaved.count
                                                                }{' '}
                                                                belum disimpan
                                                            </span>
                                                        )}
                                                        {roomUnsaved.hasInvalid && (
                                                            <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-300">
                                                                Perbaiki input
                                                                invalid
                                                            </span>
                                                        )}
                                                        <span className="ml-auto rounded border border-slate-700/40 bg-slate-900/50 px-1.5 py-0.5 text-[9px] text-slate-500">
                                                            {
                                                                sensorsForMap.filter(
                                                                    (s) =>
                                                                        s.pos_x !==
                                                                            null &&
                                                                        s.pos_y !==
                                                                            null,
                                                                ).length
                                                            }{' '}
                                                            /{' '}
                                                            {
                                                                selectedRoom
                                                                    .sensors
                                                                    .length
                                                            }{' '}
                                                            terpetakan
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                roomUnsaved.count ===
                                                                    0 ||
                                                                roomUnsaved.hasInvalid ||
                                                                isSaveAllBusy
                                                            }
                                                            onClick={() =>
                                                                void handleSaveAllPositions(
                                                                    selectedRoom,
                                                                )
                                                            }
                                                            className={`ml-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                                                saveAllState ===
                                                                'saved'
                                                                    ? 'border border-green-500/40 bg-green-500/15 text-green-400'
                                                                    : saveAllState ===
                                                                        'error'
                                                                      ? 'border border-red-500/40 bg-red-500/15 text-red-400'
                                                                      : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                                                            }`}
                                                        >
                                                            {isSaveAllBusy ? (
                                                                <>
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                    Menyimpan
                                                                </>
                                                            ) : saveAllState ===
                                                              'saved' ? (
                                                                <>
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    Tersimpan
                                                                </>
                                                            ) : saveAllState ===
                                                              'error' ? (
                                                                <>
                                                                    <XCircle className="h-3 w-3" />
                                                                    Gagal
                                                                </>
                                                            ) : (
                                                                'Simpan Semua'
                                                            )}
                                                        </button>
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {/* Table */}
                                        <div className="min-h-0 overflow-y-auto">
                                            {selectedRoom.sensors.length ===
                                            0 ? (
                                                <p className="p-4 text-xs text-slate-600">
                                                    Tidak ada sensor di ruangan
                                                    ini.
                                                </p>
                                            ) : (
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b border-slate-700/30">
                                                            <th className="px-4 py-1.5 text-left text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                                                                Sensor
                                                            </th>
                                                            <th className="px-2 py-1.5 text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                                                                X (mm)
                                                            </th>
                                                            <th className="px-2 py-1.5 text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                                                                Y (mm)
                                                            </th>
                                                            <th className="px-4 py-1.5 text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                                                                Aksi
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {selectedRoom.sensors.map(
                                                            (sensor, idx) => {
                                                                const edit =
                                                                    getEdit(
                                                                        selectedRoom.id,
                                                                        sensor,
                                                                    );
                                                                const rowState =
                                                                    getRowState(
                                                                        selectedRoom.id,
                                                                        sensor.id,
                                                                    );
                                                                const isSaving =
                                                                    rowState ===
                                                                    'saving';
                                                                const isSaved =
                                                                    rowState ===
                                                                    'saved';
                                                                const isError =
                                                                    rowState ===
                                                                    'error';
                                                                const validX =
                                                                    isValidCoordInput(
                                                                        edit.pos_x,
                                                                    );
                                                                const validY =
                                                                    isValidCoordInput(
                                                                        edit.pos_y,
                                                                    );
                                                                const canSave =
                                                                    validX &&
                                                                    validY &&
                                                                    !isSaving;
                                                                const canClear =
                                                                    edit.pos_x !==
                                                                        '' ||
                                                                    edit.pos_y !==
                                                                        '';

                                                                return (
                                                                    <tr
                                                                        key={
                                                                            sensor.id
                                                                        }
                                                                        className={`border-b border-slate-700/20 transition-colors ${
                                                                            idx %
                                                                                2 ===
                                                                            0
                                                                                ? 'bg-transparent'
                                                                                : 'bg-slate-900/30'
                                                                        } ${isSaved ? 'bg-green-500/5' : isError ? 'bg-red-500/5' : ''}`}
                                                                    >
                                                                        <td className="px-4 py-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <span
                                                                                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                                                                                        edit.pos_x !==
                                                                                            '' &&
                                                                                        edit.pos_y !==
                                                                                            ''
                                                                                            ? 'bg-cyan-400'
                                                                                            : 'bg-slate-600'
                                                                                    }`}
                                                                                />
                                                                                <span className="font-medium text-slate-200">
                                                                                    {
                                                                                        sensor.name
                                                                                    }
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        isSaving
                                                                                    }
                                                                                    onPointerDown={(
                                                                                        event,
                                                                                    ) =>
                                                                                        handleDragStart(
                                                                                            event,
                                                                                            selectedRoom,
                                                                                            sensor,
                                                                                        )
                                                                                    }
                                                                                    className={`ml-auto rounded-lg border px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                                                        dragSensor?.sensorId ===
                                                                                            sensor.id &&
                                                                                        dragSensor?.roomId ===
                                                                                            selectedRoom.id
                                                                                            ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-200'
                                                                                            : 'border-slate-700/50 bg-slate-800/70 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300'
                                                                                    }`}
                                                                                >
                                                                                    Drag
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-2 py-1.5">
                                                                            <input
                                                                                type="number"
                                                                                min={
                                                                                    0
                                                                                }
                                                                                max={
                                                                                    65535
                                                                                }
                                                                                placeholder="—"
                                                                                value={
                                                                                    edit.pos_x
                                                                                }
                                                                                disabled={
                                                                                    isSaving
                                                                                }
                                                                                onChange={(
                                                                                    e,
                                                                                ) =>
                                                                                    handleEdit(
                                                                                        selectedRoom.id,
                                                                                        sensor.id,
                                                                                        sensor,
                                                                                        'pos_x',
                                                                                        e
                                                                                            .target
                                                                                            .value,
                                                                                    )
                                                                                }
                                                                                className={`w-24 rounded-lg border bg-slate-900/70 px-2 py-1 text-center font-mono text-xs text-white transition-colors outline-none placeholder:text-slate-600 focus:ring-1 disabled:opacity-40 ${
                                                                                    !validX
                                                                                        ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                                                                                        : 'border-slate-700/60 focus:border-cyan-500/60 focus:ring-cyan-500/20'
                                                                                }`}
                                                                            />
                                                                        </td>
                                                                        <td className="px-2 py-1.5">
                                                                            <input
                                                                                type="number"
                                                                                min={
                                                                                    0
                                                                                }
                                                                                max={
                                                                                    65535
                                                                                }
                                                                                placeholder="—"
                                                                                value={
                                                                                    edit.pos_y
                                                                                }
                                                                                disabled={
                                                                                    isSaving
                                                                                }
                                                                                onChange={(
                                                                                    e,
                                                                                ) =>
                                                                                    handleEdit(
                                                                                        selectedRoom.id,
                                                                                        sensor.id,
                                                                                        sensor,
                                                                                        'pos_y',
                                                                                        e
                                                                                            .target
                                                                                            .value,
                                                                                    )
                                                                                }
                                                                                className={`w-24 rounded-lg border bg-slate-900/70 px-2 py-1 text-center font-mono text-xs text-white transition-colors outline-none placeholder:text-slate-600 focus:ring-1 disabled:opacity-40 ${
                                                                                    !validY
                                                                                        ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                                                                                        : 'border-slate-700/60 focus:border-cyan-500/60 focus:ring-cyan-500/20'
                                                                                }`}
                                                                            />
                                                                        </td>
                                                                        <td className="px-4 py-1.5">
                                                                            <div className="flex items-center justify-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        !canSave
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleSavePosition(
                                                                                            selectedRoom.id,
                                                                                            sensor,
                                                                                            edit,
                                                                                        )
                                                                                    }
                                                                                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                                                                        isSaved
                                                                                            ? 'border border-green-500/40 bg-green-500/15 text-green-400'
                                                                                            : isError
                                                                                              ? 'border border-red-500/40 bg-red-500/15 text-red-400'
                                                                                              : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                                                                                    }`}
                                                                                >
                                                                                    {isSaving ? (
                                                                                        <>
                                                                                            <Loader2 className="h-3 w-3 animate-spin" />{' '}
                                                                                            Menyimpan
                                                                                        </>
                                                                                    ) : isSaved ? (
                                                                                        <>
                                                                                            <CheckCircle2 className="h-3 w-3" />{' '}
                                                                                            Tersimpan
                                                                                        </>
                                                                                    ) : isError ? (
                                                                                        <>
                                                                                            <XCircle className="h-3 w-3" />{' '}
                                                                                            Gagal
                                                                                        </>
                                                                                    ) : (
                                                                                        'Simpan'
                                                                                    )}
                                                                                </button>

                                                                                <button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        isSaving ||
                                                                                        !canClear
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleClear(
                                                                                            selectedRoom.id,
                                                                                            sensor,
                                                                                        )
                                                                                    }
                                                                                    className="rounded-lg border border-slate-700/40 bg-slate-700/30 px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                                                                                >
                                                                                    Hapus
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            },
                                                        )}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* ── FOOTER ──────────────────────────────────────────── */}
                <ScadaFooterNav
                    activeMenu="settings"
                    lastUpdate={timeStr}
                    dateStr={dateStr}
                />

                {dragSensor && dragPointer && (
                    <div
                        className="pointer-events-none fixed z-60 rounded-lg border border-cyan-300/60 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold tracking-wider text-cyan-100 uppercase shadow-[0_0_20px_#22d3ee2e]"
                        style={{
                            left: dragPointer.x,
                            top: dragPointer.y,
                            transform: 'translate(-50%, -130%)',
                        }}
                    >
                        {dragSensor.sensorName}
                    </div>
                )}
            </div>
        </>
    );
}
