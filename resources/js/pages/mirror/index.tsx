import { Head } from '@inertiajs/react';
import {
    Edit,
    ExternalLink,
    Expand,
    Loader2,
    Monitor,
    Plus,
    PlugZap,
    RefreshCw,
    RotateCcw,
    Save,
    Trash2,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScadaFooterNav } from '@/components/scada/scada-footer-nav';
import { ScadaHeaderLogos } from '@/components/scada/scada-header-logos';
import { Badge } from '@/components/ui/badge';
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

type PanelStatus =
    | 'connecting'
    | 'loading'
    | 'mirrored'
    | 'blocked'
    | 'unreachable'
    | 'invalid';

type MirrorProtocol = 'http' | 'https';
type MirrorViewMode = 'fit' | 'fill' | 'native';

interface MirrorPanel {
    id: number;
    label: string;
    ipAddress: string;
    port: string;
    protocol: MirrorProtocol;
    src: string;
    status: PanelStatus;
    message: string;
    lastCheckedAt: string | null;
    autoReconnect: boolean;
    refreshSeed: number;
    viewMode: MirrorViewMode;
    sourceWidth: number;
    sourceHeight: number;
    zoomPercent: number;
}

type MirrorPresetPanel = Pick<
    MirrorPanel,
    'label' | 'ipAddress' | 'port' | 'protocol' | 'autoReconnect'
> &
    Partial<
        Pick<
            MirrorPanel,
            'viewMode' | 'sourceWidth' | 'sourceHeight' | 'zoomPercent'
        >
    >;

interface ScreenSourceFormState {
    label: string;
    ipAddress: string;
    port: string;
    protocol: MirrorProtocol;
    autoReconnect: boolean;
}

type NoticeTone = 'success' | 'error';

interface MirrorNotice {
    id: number;
    tone: NoticeTone;
    message: string;
}

const PRESET_KEY = 'mirror.dynamic.layout.v1';
const RUNTIME_LAYOUT_KEY = 'mirror.dynamic.runtime.v1';
const BLOCK_TIMEOUT_MS = 8000;
const RECONNECT_INTERVAL_MS = 15000;
const NOTICE_TIMEOUT_MS = 2600;
const DEFAULT_SOURCE_WIDTH = 800;
const DEFAULT_SOURCE_HEIGHT = 480;
const DEFAULT_ZOOM_PERCENT = 100;
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 250;
const RESOLUTION_PRESETS = [
    { label: '800x480', width: 800, height: 480 },
    { label: '1024x600', width: 1024, height: 600 },
    { label: '1280x720', width: 1280, height: 720 },
    { label: '1366x768', width: 1366, height: 768 },
    { label: '1920x1080', width: 1920, height: 1080 },
] as const;

const PERSISTENT_IFRAME_STASH_ID = 'mirror-iframe-stash';
const persistentMirrorIframes = new Map<number, HTMLIFrameElement>();

function ensureIframeStashHost(): HTMLDivElement | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const existingHost = document.getElementById(PERSISTENT_IFRAME_STASH_ID);

    if (existingHost instanceof HTMLDivElement) {
        return existingHost;
    }

    const host = document.createElement('div');
    host.id = PERSISTENT_IFRAME_STASH_ID;
    host.style.position = 'fixed';
    host.style.left = '-9999px';
    host.style.top = '-9999px';
    host.style.width = '1px';
    host.style.height = '1px';
    host.style.overflow = 'hidden';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);

    return host;
}

function getOrCreatePersistentIframe(
    panelId: number,
): HTMLIFrameElement | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const existingFrame = persistentMirrorIframes.get(panelId);

    if (existingFrame) {
        return existingFrame;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'h-full w-full border-0';
    persistentMirrorIframes.set(panelId, iframe);

    return iframe;
}

function removePersistentIframe(panelId: number): void {
    const iframe = persistentMirrorIframes.get(panelId);

    if (!iframe) {
        return;
    }

    iframe.remove();
    persistentMirrorIframes.delete(panelId);
}

function clearPersistentIframes(): void {
    Array.from(persistentMirrorIframes.keys()).forEach((panelId) => {
        removePersistentIframe(panelId);
    });
}

function prunePersistentIframes(panelIds: number[]): void {
    const activePanelIds = new Set(panelIds);

    Array.from(persistentMirrorIframes.keys()).forEach((panelId) => {
        if (!activePanelIds.has(panelId)) {
            removePersistentIframe(panelId);
        }
    });
}

function serializePanelsForStorage(panels: MirrorPanel[]): MirrorPresetPanel[] {
    return panels.map((panel) => ({
        label: panel.label,
        ipAddress: panel.ipAddress,
        port: panel.port,
        protocol: panel.protocol,
        autoReconnect: panel.autoReconnect,
        viewMode: panel.viewMode,
        sourceWidth: panel.sourceWidth,
        sourceHeight: panel.sourceHeight,
        zoomPercent: panel.zoomPercent,
    }));
}

interface PersistentMirrorFrameProps {
    panel: MirrorPanel;
    onPanelLoad: (panelId: number) => void;
    onPanelError: (panelId: number) => void;
}

function PersistentMirrorFrame({
    panel,
    onPanelLoad,
    onPanelError,
}: PersistentMirrorFrameProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const mountElement = mountRef.current;

        if (!mountElement) {
            return;
        }

        const iframe = getOrCreatePersistentIframe(panel.id);

        if (!iframe) {
            return;
        }

        const handleLoad = (): void => {
            onPanelLoad(panel.id);
        };

        const handleError = (): void => {
            onPanelError(panel.id);
        };

        iframe.className = 'h-full w-full border-0';
        iframe.title = `Mirror ${panel.label}`;
        iframe.addEventListener('load', handleLoad);
        iframe.addEventListener('error', handleError);

        const refreshSeed = String(panel.refreshSeed);
        const shouldReloadFrame =
            iframe.dataset.baseSrc !== panel.src ||
            iframe.dataset.refreshSeed !== refreshSeed;

        if (shouldReloadFrame) {
            iframe.dataset.baseSrc = panel.src;
            iframe.dataset.refreshSeed = refreshSeed;
            iframe.src = panel.src;
        }

        if (iframe.parentElement !== mountElement) {
            mountElement.replaceChildren();
            mountElement.appendChild(iframe);
        }

        return () => {
            iframe.removeEventListener('load', handleLoad);
            iframe.removeEventListener('error', handleError);

            const stashHost = ensureIframeStashHost();

            if (stashHost && iframe.parentElement !== stashHost) {
                stashHost.appendChild(iframe);
            }
        };
    }, [
        panel.id,
        panel.label,
        panel.refreshSeed,
        panel.src,
        onPanelError,
        onPanelLoad,
    ]);

    return <div ref={mountRef} className="h-full w-full" />;
}

function clampZoom(value: number): number {
    return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, value));
}

function normalizePositiveInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
}

function normalizeViewMode(value: unknown): MirrorViewMode {
    return value === 'fill' || value === 'native' ? value : 'fit';
}

function readXsrfToken(): string {
    return decodeURIComponent(
        document.cookie
            .split('; ')
            .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );
}

function nowTimeLabel(): string {
    return new Date().toLocaleTimeString();
}

function getStatusDotClass(status: PanelStatus): string {
    if (status === 'mirrored') {
        return 'bg-emerald-400 shadow-[0_0_8px_#34d39988]';
    }

    if (status === 'connecting' || status === 'loading') {
        return 'bg-cyan-400 shadow-[0_0_8px_#22d3ee88]';
    }

    if (
        status === 'blocked' ||
        status === 'unreachable' ||
        status === 'invalid'
    ) {
        return 'bg-red-400 shadow-[0_0_8px_#f8717188]';
    }

    return 'bg-slate-500';
}

function formatStatusLabel(status: PanelStatus): string {
    if (status === 'connecting') {
        return 'CONNECTING';
    }

    if (status === 'loading') {
        return 'LOADING';
    }

    if (status === 'mirrored') {
        return 'MIRRORED';
    }

    if (status === 'blocked') {
        return 'BLOCKED';
    }

    if (status === 'unreachable') {
        return 'UNREACHABLE';
    }

    return 'INVALID';
}

function buildMirrorUrl(
    protocol: MirrorProtocol,
    ipAddress: string,
    port: string,
): string {
    return `${protocol}://${ipAddress}:${port}`;
}

function defaultSourceForm(label = ''): ScreenSourceFormState {
    return {
        label,
        ipAddress: '',
        port: '',
        protocol: 'http',
        autoReconnect: true,
    };
}

export default function MirrorIndex() {
    const [panels, setPanels] = useState<MirrorPanel[]>([]);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [addForm, setAddForm] = useState<ScreenSourceFormState>(() =>
        defaultSourceForm('Screen 1'),
    );
    const [addError, setAddError] = useState('');
    const [addProcessing, setAddProcessing] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editPanelId, setEditPanelId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<ScreenSourceFormState>(() =>
        defaultSourceForm(),
    );
    const [editError, setEditError] = useState('');
    const [editProcessing, setEditProcessing] = useState(false);
    const [notices, setNotices] = useState<MirrorNotice[]>([]);
    const [isLayoutHydrated, setIsLayoutHydrated] = useState(false);
    const [, forceViewportRecalc] = useState(0);

    const blockTimeoutRef = useRef<Record<number, number | null>>({});
    const panelRefs = useRef<Record<number, HTMLElement | null>>({});
    const frameShellRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const frameViewportRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const nextPanelIdRef = useRef(1);
    const panelsRef = useRef<MirrorPanel[]>(panels);
    const nextNoticeIdRef = useRef(1);

    const pushNotice = useCallback(
        (tone: NoticeTone, message: string): void => {
            const noticeId = nextNoticeIdRef.current;
            nextNoticeIdRef.current += 1;

            setNotices((current) => [
                ...current,
                {
                    id: noticeId,
                    tone,
                    message,
                },
            ]);

            window.setTimeout(() => {
                setNotices((current) =>
                    current.filter((notice) => notice.id !== noticeId),
                );
            }, NOTICE_TIMEOUT_MS);
        },
        [],
    );

    const dismissNotice = useCallback((noticeId: number): void => {
        setNotices((current) =>
            current.filter((notice) => notice.id !== noticeId),
        );
    }, []);

    useEffect(() => {
        panelsRef.current = panels;
    }, [panels]);

    useEffect(() => {
        function handleResize(): void {
            forceViewportRecalc((current) => current + 1);
        }

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            forceViewportRecalc((current) => current + 1);
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [panels.length]);

    useEffect(() => {
        const rawRuntimeLayout =
            window.localStorage.getItem(RUNTIME_LAYOUT_KEY);
        const rawPresetLayout = window.localStorage.getItem(PRESET_KEY);
        const rawLayout = rawRuntimeLayout ?? rawPresetLayout;

        if (!rawLayout) {
            setIsLayoutHydrated(true);
            return;
        }

        try {
            const presetPanels = JSON.parse(rawLayout) as MirrorPresetPanel[];

            if (!Array.isArray(presetPanels) || presetPanels.length === 0) {
                setIsLayoutHydrated(true);
                return;
            }

            const hydratedPanels = presetPanels.map((panel, index) => {
                const id = index + 1;

                return {
                    id,
                    label: panel.label || `Screen ${id}`,
                    ipAddress: panel.ipAddress,
                    port: panel.port,
                    protocol: panel.protocol,
                    src: buildMirrorUrl(
                        panel.protocol,
                        panel.ipAddress,
                        panel.port,
                    ),
                    status: 'loading' as const,
                    message:
                        'Konfigurasi preset dimuat. Menunggu iframe render...',
                    lastCheckedAt: nowTimeLabel(),
                    autoReconnect: panel.autoReconnect,
                    refreshSeed: 0,
                    viewMode: normalizeViewMode(panel.viewMode),
                    sourceWidth: normalizePositiveInt(
                        panel.sourceWidth,
                        DEFAULT_SOURCE_WIDTH,
                    ),
                    sourceHeight: normalizePositiveInt(
                        panel.sourceHeight,
                        DEFAULT_SOURCE_HEIGHT,
                    ),
                    zoomPercent: clampZoom(
                        normalizePositiveInt(
                            panel.zoomPercent,
                            DEFAULT_ZOOM_PERCENT,
                        ),
                    ),
                };
            });

            nextPanelIdRef.current = hydratedPanels.length + 1;
            prunePersistentIframes(hydratedPanels.map((panel) => panel.id));
            setPanels(hydratedPanels);
            setAddForm(defaultSourceForm(`Screen ${nextPanelIdRef.current}`));
        } catch {
            // Ignore malformed preset data.
        } finally {
            setIsLayoutHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (!isLayoutHydrated) {
            return;
        }

        const payload = serializePanelsForStorage(panels);
        window.localStorage.setItem(
            RUNTIME_LAYOUT_KEY,
            JSON.stringify(payload),
        );
    }, [isLayoutHydrated, panels]);

    useEffect(() => {
        const timeoutMap = blockTimeoutRef.current;

        return () => {
            Object.values(timeoutMap).forEach((timeoutId) => {
                if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                }
            });
        };
    }, []);

    const updatePanel = useCallback(
        (
            panelId: number,
            updater: (panel: MirrorPanel) => MirrorPanel,
        ): void => {
            setPanels((previousPanels) =>
                previousPanels.map((panel) =>
                    panel.id === panelId ? updater(panel) : panel,
                ),
            );
        },
        [],
    );

    const clearBlockTimer = useCallback((panelId: number): void => {
        const timeoutId = blockTimeoutRef.current[panelId];

        if (timeoutId !== null && timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
            blockTimeoutRef.current[panelId] = null;
        }
    }, []);

    const armBlockedTimer = useCallback(
        (panelId: number): void => {
            clearBlockTimer(panelId);

            blockTimeoutRef.current[panelId] = window.setTimeout(() => {
                updatePanel(panelId, (current) =>
                    current.status === 'loading'
                        ? {
                              ...current,
                              status: 'blocked',
                              message:
                                  'Iframe diblokir perangkat/policy browser. Gunakan Open External.',
                          }
                        : current,
                );
            }, BLOCK_TIMEOUT_MS);
        },
        [clearBlockTimer, updatePanel],
    );

    const probePanel = useCallback(
        async (panelId: number, reloadIframe: boolean): Promise<void> => {
            const panel = panelsRef.current.find((item) => item.id === panelId);

            if (!panel) {
                return;
            }

            const isHealthCheckOnly =
                !reloadIframe && panel.status === 'mirrored';

            if (!isHealthCheckOnly) {
                updatePanel(panelId, (current) => ({
                    ...current,
                    status: 'connecting',
                    message: 'Mengecek koneksi target mirror...',
                }));
            }

            try {
                const response = await fetch('/mirror/test-connection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-XSRF-TOKEN': readXsrfToken(),
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        ip_address: panel.ipAddress,
                        port: Number.parseInt(panel.port, 10),
                        protocol: panel.protocol,
                    }),
                });

                if (response.status === 422) {
                    const payload = (await response.json()) as {
                        errors?: Record<string, string[]>;
                    };

                    const nextMessage =
                        payload.errors?.ip_address?.[0] ??
                        payload.errors?.port?.[0] ??
                        payload.errors?.protocol?.[0] ??
                        'Input mirror tidak valid.';

                    updatePanel(panelId, (current) => ({
                        ...current,
                        status: 'invalid',
                        message: nextMessage,
                        lastCheckedAt: nowTimeLabel(),
                    }));

                    return;
                }

                const payload = (await response.json()) as {
                    reachable: boolean;
                    latency_ms: number;
                    message: string;
                };

                if (!response.ok || !payload.reachable) {
                    updatePanel(panelId, (current) => ({
                        ...current,
                        status: 'unreachable',
                        message: payload.message,
                        lastCheckedAt: nowTimeLabel(),
                    }));

                    return;
                }

                if (reloadIframe) {
                    armBlockedTimer(panelId);

                    updatePanel(panelId, (current) => ({
                        ...current,
                        status: 'loading',
                        message: `Target reachable (${payload.latency_ms} ms). Mencoba render iframe...`,
                        lastCheckedAt: nowTimeLabel(),
                        refreshSeed: current.refreshSeed + 1,
                        src: buildMirrorUrl(
                            current.protocol,
                            current.ipAddress,
                            current.port,
                        ),
                    }));

                    return;
                }

                clearBlockTimer(panelId);

                updatePanel(panelId, (current) => ({
                    ...current,
                    status: 'mirrored',
                    message: `Koneksi normal (${payload.latency_ms} ms).`,
                    lastCheckedAt: nowTimeLabel(),
                }));
            } catch {
                updatePanel(panelId, (current) => ({
                    ...current,
                    status: 'unreachable',
                    message:
                        'Gagal menghubungi server saat cek koneksi mirror.',
                    lastCheckedAt: nowTimeLabel(),
                }));
            }
        },
        [armBlockedTimer, clearBlockTimer, updatePanel],
    );

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            panelsRef.current
                .filter((panel) => panel.autoReconnect)
                .forEach((panel) => {
                    void probePanel(panel.id, false);
                });
        }, RECONNECT_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [probePanel]);

    function savePreset(): void {
        const payload = serializePanelsForStorage(panels);

        window.localStorage.setItem(PRESET_KEY, JSON.stringify(payload));
        pushNotice(
            'success',
            `Preset berhasil disimpan (${payload.length} screen).`,
        );
    }

    function loadPreset(): void {
        const rawPreset = window.localStorage.getItem(PRESET_KEY);

        if (!rawPreset) {
            pushNotice(
                'error',
                'Preset belum tersedia. Simpan preset terlebih dahulu.',
            );
            return;
        }

        try {
            const presetPanels = JSON.parse(rawPreset) as MirrorPresetPanel[];

            if (!Array.isArray(presetPanels) || presetPanels.length === 0) {
                pushNotice('error', 'Preset kosong atau tidak valid.');
                return;
            }

            const hydratedPanels = presetPanels.map((panel, index) => {
                const id = index + 1;

                return {
                    id,
                    label: panel.label || `Screen ${id}`,
                    ipAddress: panel.ipAddress,
                    port: panel.port,
                    protocol: panel.protocol,
                    src: buildMirrorUrl(
                        panel.protocol,
                        panel.ipAddress,
                        panel.port,
                    ),
                    status: 'loading' as const,
                    message: 'Preset dimuat. Menunggu iframe render...',
                    lastCheckedAt: nowTimeLabel(),
                    autoReconnect: panel.autoReconnect,
                    refreshSeed: 0,
                    viewMode: normalizeViewMode(panel.viewMode),
                    sourceWidth: normalizePositiveInt(
                        panel.sourceWidth,
                        DEFAULT_SOURCE_WIDTH,
                    ),
                    sourceHeight: normalizePositiveInt(
                        panel.sourceHeight,
                        DEFAULT_SOURCE_HEIGHT,
                    ),
                    zoomPercent: clampZoom(
                        normalizePositiveInt(
                            panel.zoomPercent,
                            DEFAULT_ZOOM_PERCENT,
                        ),
                    ),
                };
            });

            nextPanelIdRef.current = hydratedPanels.length + 1;
            prunePersistentIframes(hydratedPanels.map((panel) => panel.id));
            setPanels(hydratedPanels);
            setAddForm(defaultSourceForm(`Screen ${nextPanelIdRef.current}`));
            pushNotice(
                'success',
                `Preset dimuat (${hydratedPanels.length} screen).`,
            );
        } catch {
            pushNotice(
                'error',
                'Preset gagal dimuat. Format data tidak valid.',
            );
            // Ignore malformed preset data.
        }
    }

    function resetLayout(): void {
        setPanels([]);
        clearPersistentIframes();
        nextPanelIdRef.current = 1;
        setAddForm(defaultSourceForm('Screen 1'));
        pushNotice('success', 'Layout mirror berhasil direset.');
    }

    function removePanel(panelId: number): void {
        clearBlockTimer(panelId);
        removePersistentIframe(panelId);

        const removedPanel = panelsRef.current.find(
            (panel) => panel.id === panelId,
        );

        setPanels((previousPanels) =>
            previousPanels.filter((panel) => panel.id !== panelId),
        );

        pushNotice(
            'success',
            `${removedPanel?.label ?? 'Screen'} berhasil dihapus.`,
        );
    }

    async function openFullscreen(panelId: number): Promise<void> {
        const container = panelRefs.current[panelId];

        if (!container?.requestFullscreen) {
            return;
        }

        await container.requestFullscreen();
    }

    function computeViewportSize(
        panel: MirrorPanel,
    ): { width: number; height: number } | null {
        const shell = frameShellRefs.current[panel.id];

        if (!shell) {
            return null;
        }

        const shellWidth = Math.max(1, shell.clientWidth);
        const shellHeight = Math.max(1, shell.clientHeight);
        const sourceWidth = Math.max(1, panel.sourceWidth);
        const sourceHeight = Math.max(1, panel.sourceHeight);

        const sourceRatio = sourceWidth / sourceHeight;
        const shellRatio = shellWidth / shellHeight;

        if (shellRatio > sourceRatio) {
            const height = shellHeight;
            const width = Math.round(height * sourceRatio);

            return { width, height };
        }

        const width = shellWidth;
        const height = Math.round(width / sourceRatio);

        return { width, height };
    }

    function computePanelScale(panel: MirrorPanel): number {
        const viewport = frameViewportRefs.current[panel.id];
        const sourceWidth = Math.max(1, panel.sourceWidth);
        const sourceHeight = Math.max(1, panel.sourceHeight);
        const zoomScale = clampZoom(panel.zoomPercent) / 100;

        if (!viewport) {
            return zoomScale;
        }

        const viewportWidth = Math.max(1, viewport.clientWidth);
        const viewportHeight = Math.max(1, viewport.clientHeight);
        const fitScale = Math.min(
            viewportWidth / sourceWidth,
            viewportHeight / sourceHeight,
        );
        const fillScale = Math.max(
            viewportWidth / sourceWidth,
            viewportHeight / sourceHeight,
        );

        const baseScale =
            panel.viewMode === 'fill'
                ? fillScale
                : panel.viewMode === 'native'
                  ? 1
                  : fitScale;

        return Math.max(0.1, baseScale * zoomScale);
    }

    function updatePanelViewMode(panelId: number, mode: MirrorViewMode): void {
        updatePanel(panelId, (current) => ({
            ...current,
            viewMode: mode,
        }));
    }

    function updatePanelZoom(panelId: number, zoomPercent: number): void {
        updatePanel(panelId, (current) => ({
            ...current,
            zoomPercent: clampZoom(zoomPercent),
        }));
    }

    function updatePanelSourceSize(
        panelId: number,
        field: 'sourceWidth' | 'sourceHeight',
        value: string,
    ): void {
        const parsed = normalizePositiveInt(
            value,
            field === 'sourceWidth'
                ? DEFAULT_SOURCE_WIDTH
                : DEFAULT_SOURCE_HEIGHT,
        );

        updatePanel(panelId, (current) => ({
            ...current,
            [field]: parsed,
        }));
    }

    function applyResolutionPreset(panelId: number, presetValue: string): void {
        if (presetValue === 'custom') {
            return;
        }

        const [widthRaw, heightRaw] = presetValue.split('x');
        const width = normalizePositiveInt(widthRaw, DEFAULT_SOURCE_WIDTH);
        const height = normalizePositiveInt(heightRaw, DEFAULT_SOURCE_HEIGHT);

        updatePanel(panelId, (current) => ({
            ...current,
            sourceWidth: width,
            sourceHeight: height,
        }));
    }

    function openExternal(url: string): void {
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function openEditSourceDialog(panel: MirrorPanel): void {
        setEditPanelId(panel.id);
        setEditError('');
        setEditForm({
            label: panel.label,
            ipAddress: panel.ipAddress,
            port: panel.port,
            protocol: panel.protocol,
            autoReconnect: panel.autoReconnect,
        });
        setIsEditDialogOpen(true);
    }

    const handlePanelFrameLoad = useCallback(
        (panelId: number): void => {
            clearBlockTimer(panelId);

            updatePanel(panelId, (current) => ({
                ...current,
                status: 'mirrored',
                message: 'Mirroring aktif.',
            }));
        },
        [clearBlockTimer, updatePanel],
    );

    const handlePanelFrameError = useCallback(
        (panelId: number): void => {
            clearBlockTimer(panelId);

            updatePanel(panelId, (current) => ({
                ...current,
                status: 'unreachable',
                message: 'Gagal memuat iframe target.',
            }));
        },
        [clearBlockTimer, updatePanel],
    );

    async function handleAddScreen(): Promise<void> {
        setAddProcessing(true);
        setAddError('');

        try {
            const response = await fetch('/mirror/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': readXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    ip_address: addForm.ipAddress,
                    port: Number.parseInt(addForm.port, 10),
                    protocol: addForm.protocol,
                }),
            });

            if (response.status === 422) {
                const payload = (await response.json()) as {
                    errors?: Record<string, string[]>;
                };

                setAddError(
                    payload.errors?.ip_address?.[0] ??
                        payload.errors?.port?.[0] ??
                        payload.errors?.protocol?.[0] ??
                        'Input screen mirror tidak valid.',
                );

                return;
            }

            const payload = (await response.json()) as {
                reachable: boolean;
                latency_ms: number;
                message: string;
            };

            if (!response.ok || !payload.reachable) {
                setAddError(payload.message);
                return;
            }

            const newPanelId = nextPanelIdRef.current;
            nextPanelIdRef.current += 1;

            const defaultLabel = `Screen ${newPanelId}`;
            const label = addForm.label.trim() || defaultLabel;
            const src = buildMirrorUrl(
                addForm.protocol,
                addForm.ipAddress,
                addForm.port,
            );

            setPanels((previousPanels) => [
                ...previousPanels,
                {
                    id: newPanelId,
                    label,
                    ipAddress: addForm.ipAddress,
                    port: addForm.port,
                    protocol: addForm.protocol,
                    src,
                    status: 'loading',
                    message: `Target reachable (${payload.latency_ms} ms). Mencoba render iframe...`,
                    lastCheckedAt: nowTimeLabel(),
                    autoReconnect: addForm.autoReconnect,
                    refreshSeed: 0,
                    viewMode: 'fit',
                    sourceWidth: DEFAULT_SOURCE_WIDTH,
                    sourceHeight: DEFAULT_SOURCE_HEIGHT,
                    zoomPercent: DEFAULT_ZOOM_PERCENT,
                },
            ]);

            armBlockedTimer(newPanelId);

            pushNotice('success', `${label} berhasil ditambahkan.`);

            setIsAddDialogOpen(false);
            setAddForm(defaultSourceForm(`Screen ${nextPanelIdRef.current}`));
        } catch {
            setAddError('Gagal menghubungi server saat menambahkan screen.');
            pushNotice(
                'error',
                'Gagal menambahkan screen. Periksa koneksi target.',
            );
        } finally {
            setAddProcessing(false);
        }
    }

    async function handleEditSource(): Promise<void> {
        if (editPanelId === null) {
            return;
        }

        setEditProcessing(true);
        setEditError('');

        try {
            const response = await fetch('/mirror/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': readXsrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    ip_address: editForm.ipAddress,
                    port: Number.parseInt(editForm.port, 10),
                    protocol: editForm.protocol,
                }),
            });

            if (response.status === 422) {
                const payload = (await response.json()) as {
                    errors?: Record<string, string[]>;
                };

                setEditError(
                    payload.errors?.ip_address?.[0] ??
                        payload.errors?.port?.[0] ??
                        payload.errors?.protocol?.[0] ??
                        'Input source tidak valid.',
                );

                return;
            }

            const payload = (await response.json()) as {
                reachable: boolean;
                latency_ms: number;
                message: string;
            };

            if (!response.ok || !payload.reachable) {
                setEditError(payload.message);
                return;
            }

            armBlockedTimer(editPanelId);

            updatePanel(editPanelId, (current) => ({
                ...current,
                label: editForm.label.trim() || current.label,
                ipAddress: editForm.ipAddress,
                port: editForm.port,
                protocol: editForm.protocol,
                autoReconnect: editForm.autoReconnect,
                src: buildMirrorUrl(
                    editForm.protocol,
                    editForm.ipAddress,
                    editForm.port,
                ),
                status: 'loading',
                message: `Source diperbarui (${payload.latency_ms} ms). Mencoba render iframe...`,
                lastCheckedAt: nowTimeLabel(),
                refreshSeed: current.refreshSeed + 1,
            }));

            pushNotice('success', 'Source screen berhasil diperbarui.');

            setIsEditDialogOpen(false);
            setEditPanelId(null);
        } catch {
            setEditError('Gagal menghubungi server saat update source.');
            pushNotice('error', 'Gagal memperbarui source screen.');
        } finally {
            setEditProcessing(false);
        }
    }

    const sessionStartedAt = useMemo(() => new Date().toLocaleString(), []);

    return (
        <>
            <Head title="Mirror Wall" />

            <div className="flex h-screen flex-col overflow-hidden bg-[#151b1f] text-white">
                <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2">
                    {notices.map((notice) => (
                        <div
                            key={notice.id}
                            className={`pointer-events-auto relative rounded-lg border px-3 py-2 pr-8 text-xs shadow-lg backdrop-blur-sm ${
                                notice.tone === 'success'
                                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                                    : 'border-red-400/50 bg-red-500/20 text-red-100'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => dismissNotice(notice.id)}
                                className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded text-current/80 transition-colors hover:bg-white/10 hover:text-white"
                                aria-label="Close notification"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                            {notice.message}
                        </div>
                    ))}
                </div>

                <header className="flex shrink-0 flex-col border-b border-slate-700/50 bg-[#0f1316]">
                    <ScadaHeaderLogos />

                    <div className="flex items-center justify-between gap-3 px-4 pb-2">
                        <div className="flex items-center gap-2">
                            <Monitor className="h-5 w-5 text-cyan-400" />
                            <div>
                                <p className="text-sm font-bold tracking-wider uppercase">
                                    Mirror Wall
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    Tambah screen dulu, lalu mirror aktif
                                    setelah koneksi sukses.
                                </p>
                            </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400">
                            <p>ACTIVE SCREENS: {panels.length}</p>
                            <p>SESSION START: {sessionStartedAt}</p>
                        </div>
                    </div>
                </header>

                <main className="flex flex-1 flex-col gap-3 overflow-auto p-3">
                    <div className="sticky top-0 z-20 rounded-xl border border-slate-700/60 bg-slate-900 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold">
                                    Screen Manager
                                </p>
                                <p className="text-xs text-slate-400">
                                    Layout 2 screen per baris agar tampilan
                                    lebih luas. Fullscreen tetap tersedia per
                                    screen.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setAddError('');
                                        setIsAddDialogOpen(true);
                                    }}
                                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                    <Plus className="h-4 w-4" />
                                    Add Screen
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={savePreset}
                                    className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                >
                                    <Save className="h-4 w-4" />
                                    Save Preset
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={loadPreset}
                                    className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                >
                                    <PlugZap className="h-4 w-4" />
                                    Load Preset
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={resetLayout}
                                    className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Reset
                                </Button>
                            </div>
                        </div>
                    </div>

                    {panels.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700/60 bg-slate-900/20 text-center">
                            <div className="max-w-md px-4">
                                <Monitor className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                                <p className="text-sm text-slate-300">
                                    Belum ada screen mirroring aktif.
                                </p>
                                <p className="text-xs text-slate-500">
                                    Klik tombol Add Screen, input IP/port di
                                    modal, lalu screen akan muncul setelah
                                    koneksi berhasil.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {panels.map((panel) => {
                                const computedScale = computePanelScale(panel);
                                const effectiveScalePercent = Math.round(
                                    computedScale * 100,
                                );
                                const selectedPreset = RESOLUTION_PRESETS.some(
                                    (preset) =>
                                        preset.width === panel.sourceWidth &&
                                        preset.height === panel.sourceHeight,
                                )
                                    ? `${panel.sourceWidth}x${panel.sourceHeight}`
                                    : 'custom';
                                const viewportSize = computeViewportSize(panel);
                                const viewportStyle = viewportSize
                                    ? {
                                          width: `${viewportSize.width}px`,
                                          height: `${viewportSize.height}px`,
                                      }
                                    : {
                                          width: '100%',
                                          aspectRatio: `${Math.max(panel.sourceWidth, 1)} / ${Math.max(panel.sourceHeight, 1)}`,
                                      };

                                return (
                                    <article
                                        key={panel.id}
                                        ref={(element) => {
                                            panelRefs.current[panel.id] =
                                                element;
                                        }}
                                        className="flex min-h-[460px] flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-3"
                                    >
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                                                    {panel.label}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span
                                                        className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(panel.status)}`}
                                                    />
                                                    <Badge
                                                        variant="outline"
                                                        className="border-slate-600 text-[10px] text-slate-300"
                                                    >
                                                        {formatStatusLabel(
                                                            panel.status,
                                                        )}
                                                    </Badge>
                                                    <span className="text-[11px] text-slate-400">
                                                        {panel.protocol}://
                                                        {panel.ipAddress}:
                                                        {panel.port}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updatePanel(
                                                        panel.id,
                                                        (current) => ({
                                                            ...current,
                                                            autoReconnect:
                                                                !current.autoReconnect,
                                                        }),
                                                    );
                                                }}
                                                title="Toggle auto reconnect"
                                                className={`rounded-md p-1.5 transition-colors ${
                                                    panel.autoReconnect
                                                        ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                                                        : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/70 hover:text-white'
                                                }`}
                                            >
                                                {panel.autoReconnect ? (
                                                    <Wifi className="h-4 w-4" />
                                                ) : (
                                                    <WifiOff className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>

                                        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                                            <span className="truncate">
                                                {panel.message}
                                            </span>
                                            <span>
                                                {panel.lastCheckedAt ??
                                                    '--:--:--'}
                                            </span>
                                        </div>

                                        <div
                                            ref={(element) => {
                                                frameShellRefs.current[
                                                    panel.id
                                                ] = element;
                                            }}
                                            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
                                        >
                                            <div
                                                ref={(element) => {
                                                    frameViewportRefs.current[
                                                        panel.id
                                                    ] = element;
                                                }}
                                                className="relative overflow-hidden rounded-md border border-slate-700/40 bg-slate-950"
                                                style={viewportStyle}
                                            >
                                                <div
                                                    className="absolute top-1/2 left-1/2"
                                                    style={{
                                                        width: `${panel.sourceWidth}px`,
                                                        height: `${panel.sourceHeight}px`,
                                                        transform: `translate(-50%, -50%) scale(${computedScale})`,
                                                        transformOrigin:
                                                            'center center',
                                                    }}
                                                >
                                                    <PersistentMirrorFrame
                                                        panel={panel}
                                                        onPanelLoad={
                                                            handlePanelFrameLoad
                                                        }
                                                        onPanelError={
                                                            handlePanelFrameError
                                                        }
                                                    />
                                                </div>
                                            </div>

                                            {(panel.status === 'blocked' ||
                                                panel.status ===
                                                    'unreachable') && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 p-3 text-center">
                                                    <p className="text-xs text-red-300">
                                                        {panel.message}
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        onClick={() =>
                                                            openExternal(
                                                                panel.src,
                                                            )
                                                        }
                                                        className="h-8 bg-cyan-600 text-xs text-white hover:bg-cyan-500"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        Open External
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/60 p-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Label className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                                    View
                                                </Label>
                                                <select
                                                    value={panel.viewMode}
                                                    onChange={(event) =>
                                                        updatePanelViewMode(
                                                            panel.id,
                                                            event.target
                                                                .value as MirrorViewMode,
                                                        )
                                                    }
                                                    className="h-7 rounded-md border border-slate-600 bg-slate-800/80 px-2 text-[11px] text-white"
                                                >
                                                    <option value="fit">
                                                        Fit
                                                    </option>
                                                    <option value="fill">
                                                        Fill
                                                    </option>
                                                    <option value="native">
                                                        Native
                                                    </option>
                                                </select>

                                                <Label className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                                    Preset
                                                </Label>
                                                <select
                                                    value={selectedPreset}
                                                    onChange={(event) =>
                                                        applyResolutionPreset(
                                                            panel.id,
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-7 rounded-md border border-slate-600 bg-slate-800/80 px-2 text-[11px] text-white"
                                                >
                                                    <option value="custom">
                                                        Custom
                                                    </option>
                                                    {RESOLUTION_PRESETS.map(
                                                        (preset) => (
                                                            <option
                                                                key={
                                                                    preset.label
                                                                }
                                                                value={`${preset.width}x${preset.height}`}
                                                            >
                                                                {preset.label}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>

                                                <span className="ml-auto rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                                                    Output{' '}
                                                    {effectiveScalePercent}%
                                                </span>
                                            </div>

                                            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={panel.sourceWidth}
                                                    onChange={(event) =>
                                                        updatePanelSourceSize(
                                                            panel.id,
                                                            'sourceWidth',
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-8 border-slate-600 bg-slate-800/80 text-[11px] text-white"
                                                />
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={panel.sourceHeight}
                                                    onChange={(event) =>
                                                        updatePanelSourceSize(
                                                            panel.id,
                                                            'sourceHeight',
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-8 border-slate-600 bg-slate-800/80 text-[11px] text-white"
                                                />
                                                <div className="flex items-center rounded-md border border-slate-600 bg-slate-800/70 px-2 text-[11px] text-slate-300">
                                                    Zoom {panel.zoomPercent}%
                                                </div>
                                            </div>

                                            <input
                                                type="range"
                                                min={MIN_ZOOM_PERCENT}
                                                max={MAX_ZOOM_PERCENT}
                                                step={5}
                                                value={panel.zoomPercent}
                                                onChange={(event) =>
                                                    updatePanelZoom(
                                                        panel.id,
                                                        Number.parseInt(
                                                            event.target.value,
                                                            10,
                                                        ),
                                                    )
                                                }
                                                className="mt-2 w-full accent-cyan-500"
                                            />
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    openEditSourceDialog(panel)
                                                }
                                                className="h-8 border-slate-600 bg-slate-900/70 text-xs text-slate-200 hover:bg-slate-700"
                                            >
                                                <Edit className="h-3.5 w-3.5" />
                                                Edit Source
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    void probePanel(
                                                        panel.id,
                                                        true,
                                                    )
                                                }
                                                className="h-8 border-slate-600 bg-slate-900/70 text-xs text-slate-200 hover:bg-slate-700"
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" />
                                                Refresh
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    void openFullscreen(
                                                        panel.id,
                                                    )
                                                }
                                                className="h-8 border-slate-600 bg-slate-900/70 text-xs text-slate-200 hover:bg-slate-700"
                                            >
                                                <Expand className="h-3.5 w-3.5" />
                                                Fullscreen
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    openExternal(panel.src)
                                                }
                                                className="h-8 border-slate-600 bg-slate-900/70 text-xs text-slate-200 hover:bg-slate-700"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                External
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    removePanel(panel.id)
                                                }
                                                className="h-8 border-red-500/40 bg-red-500/10 text-xs text-red-200 hover:bg-red-500/20"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Remove
                                            </Button>
                                        </div>
                                    </article>
                                );
                            })}
                        </section>
                    )}
                </main>

                <ScadaFooterNav activeMenu="mirror" />
            </div>

            <Dialog
                open={isAddDialogOpen}
                onOpenChange={(open) => {
                    setIsAddDialogOpen(open);

                    if (!open) {
                        setAddError('');
                    }
                }}
            >
                <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            Add Mirror Screen
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Input IP target. Screen akan ditambahkan setelah
                            koneksi berhasil.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                Label Screen
                            </Label>
                            <Input
                                value={addForm.label}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setAddForm((current) => ({
                                        ...current,
                                        label: value,
                                    }));
                                }}
                                placeholder={`Screen ${nextPanelIdRef.current}`}
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                            />
                        </div>

                        <div className="grid grid-cols-[100px_1fr] gap-2">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Protocol
                                </Label>
                                <select
                                    value={addForm.protocol}
                                    onChange={(event) => {
                                        const value = event.target
                                            .value as MirrorProtocol;
                                        setAddForm((current) => ({
                                            ...current,
                                            protocol: value,
                                        }));
                                    }}
                                    className="h-10 rounded-md border border-slate-600 bg-slate-800/80 px-3 text-sm text-white"
                                >
                                    <option value="http">http</option>
                                    <option value="https">https</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    IP Address
                                </Label>
                                <Input
                                    value={addForm.ipAddress}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setAddForm((current) => ({
                                            ...current,
                                            ipAddress: value,
                                        }));
                                    }}
                                    placeholder="192.168.1.10"
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Port
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={addForm.port}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setAddForm((current) => ({
                                            ...current,
                                            port: value,
                                        }));
                                    }}
                                    placeholder="80"
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setAddForm((current) => ({
                                        ...current,
                                        autoReconnect: !current.autoReconnect,
                                    }));
                                }}
                                className={`mt-auto flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                                    addForm.autoReconnect
                                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                                        : 'border-slate-600 bg-slate-700/70 text-slate-400'
                                }`}
                                title="Auto reconnect"
                            >
                                {addForm.autoReconnect ? (
                                    <Wifi className="h-4 w-4" />
                                ) : (
                                    <WifiOff className="h-4 w-4" />
                                )}
                            </button>
                        </div>

                        {addError && (
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                {addError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsAddDialogOpen(false)}
                            className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleAddScreen()}
                            disabled={addProcessing}
                            className="bg-cyan-600 text-white hover:bg-cyan-500"
                        >
                            {addProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            {addProcessing ? 'Connecting...' : 'Connect & Add'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);

                    if (!open) {
                        setEditError('');
                        setEditPanelId(null);
                    }
                }}
            >
                <DialogContent className="border-slate-700 bg-[#1a2027] text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            Edit Source Screen
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Ubah source IP/port untuk screen ini. Screen akan
                            reload setelah koneksi sukses.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                Label Screen
                            </Label>
                            <Input
                                value={editForm.label}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setEditForm((current) => ({
                                        ...current,
                                        label: value,
                                    }));
                                }}
                                className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                            />
                        </div>

                        <div className="grid grid-cols-[100px_1fr] gap-2">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Protocol
                                </Label>
                                <select
                                    value={editForm.protocol}
                                    onChange={(event) => {
                                        const value = event.target
                                            .value as MirrorProtocol;
                                        setEditForm((current) => ({
                                            ...current,
                                            protocol: value,
                                        }));
                                    }}
                                    className="h-10 rounded-md border border-slate-600 bg-slate-800/80 px-3 text-sm text-white"
                                >
                                    <option value="http">http</option>
                                    <option value="https">https</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    IP Address
                                </Label>
                                <Input
                                    value={editForm.ipAddress}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setEditForm((current) => ({
                                            ...current,
                                            ipAddress: value,
                                        }));
                                    }}
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                                    Port
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={editForm.port}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setEditForm((current) => ({
                                            ...current,
                                            port: value,
                                        }));
                                    }}
                                    className="border-slate-600 bg-slate-800/80 text-white placeholder:text-slate-500"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setEditForm((current) => ({
                                        ...current,
                                        autoReconnect: !current.autoReconnect,
                                    }));
                                }}
                                className={`mt-auto flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                                    editForm.autoReconnect
                                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                                        : 'border-slate-600 bg-slate-700/70 text-slate-400'
                                }`}
                                title="Auto reconnect"
                            >
                                {editForm.autoReconnect ? (
                                    <Wifi className="h-4 w-4" />
                                ) : (
                                    <WifiOff className="h-4 w-4" />
                                )}
                            </button>
                        </div>

                        {editError && (
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                {editError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsEditDialogOpen(false)}
                            className="text-slate-400 hover:bg-slate-700/60 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleEditSource()}
                            disabled={editProcessing}
                            className="bg-cyan-600 text-white hover:bg-cyan-500"
                        >
                            {editProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Edit className="h-4 w-4" />
                            )}
                            {editProcessing ? 'Updating...' : 'Update Source'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
