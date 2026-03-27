import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt } from '@/components/scada/scada-helpers';
import type {
    SensorData,
    SensorStatus,
} from '@/components/scada/scada-helpers';

// ─── SVG Coordinate Constants (room space: 0 – roomWidth/Height) ─────────────
const CORE_R = 100; // core dot radius
const PING_MAX_R = 320; // animated ring max radius
const LABEL_FONT = 135; // sensor name font size
const SUB_FONT = 105; // temp/hum sub-label font size
const LABEL_GAP = 185; // gap between dot centre and label baseline

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dotColor(status: SensorStatus): string {
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

/** Ping animation duration in seconds */
function pingDur(status: SensorStatus): number {
    switch (status) {
        case 'NORMAL':
            return 2;
        case 'WARNING':
            return 1.2;
        case 'CRITICAL':
            return 0.65;
        default:
            return 0;
    }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FloorPlanMapProps {
    sensors: SensorData[];
    roomWidth?: number; // mm — default 9000
    roomHeight?: number; // mm — default 9000
    roomName?: string;
    backgroundImage?: string | null; // URL to floor plan image
    draggingSensorId?: number | null;
    dragPointer?: { x: number; y: number } | null;
    onPlaceSensor?: (sensorId: number, x: number, y: number) => void;
    onDragEnd?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FloorPlanMap({
    sensors,
    roomWidth = 9000,
    roomHeight = 9000,
    roomName,
    backgroundImage,
    draggingSensorId = null,
    dragPointer = null,
    onPlaceSensor,
    onDragEnd,
}: FloorPlanMapProps) {
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [dropPreview, setDropPreview] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const placed = sensors.filter((s) => s.pos_x !== null && s.pos_y !== null);
    const unmapped = sensors.length - placed.length;
    const hasImage = !!backgroundImage;

    const clientToRoomCoord = useCallback(
        (clientX: number, clientY: number): { x: number; y: number } | null => {
            const svg = svgRef.current;
            if (!svg) return null;

            const rect = svg.getBoundingClientRect();
            const insideRect =
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top &&
                clientY <= rect.bottom;
            if (!insideRect) return null;

            const ctm = svg.getScreenCTM();
            if (!ctm) return null;

            const point = svg.createSVGPoint();
            point.x = clientX;
            point.y = clientY;

            const local = point.matrixTransform(ctm.inverse());
            const x = Math.round(Math.max(0, Math.min(roomWidth, local.x)));
            const y = Math.round(Math.max(0, Math.min(roomHeight, local.y)));

            return { x, y };
        },
        [roomHeight, roomWidth],
    );

    useEffect(() => {
        let active = true;

        queueMicrotask(() => {
            if (!active) {
                return;
            }

            if (draggingSensorId === null || dragPointer === null) {
                setDropPreview(null);
                return;
            }

            const coord = clientToRoomCoord(dragPointer.x, dragPointer.y);
            setDropPreview(coord);
        });

        return () => {
            active = false;
        };
    }, [clientToRoomCoord, dragPointer, draggingSensorId]);

    useEffect(() => {
        if (draggingSensorId === null) return;
        const activeSensorId = draggingSensorId;

        function handlePointerUp(event: PointerEvent): void {
            const coord = clientToRoomCoord(event.clientX, event.clientY);

            if (coord && onPlaceSensor) {
                onPlaceSensor(activeSensorId, coord.x, coord.y);
            }

            setDropPreview(null);
            if (onDragEnd) {
                onDragEnd();
            }
        }

        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        return () => {
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [clientToRoomCoord, draggingSensorId, onDragEnd, onPlaceSensor]);

    return (
        <div className="flex h-full flex-col gap-2">
            {/* ── SVG Canvas ──────────────────────────────────────────── */}
            <div
                className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-[#060c12] transition-colors ${
                    draggingSensorId !== null
                        ? 'border-cyan-500/60'
                        : 'border-slate-700/60'
                }`}
            >
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${roomWidth} ${roomHeight}`}
                    className="h-full w-full"
                    style={{ display: 'block' }}
                >
                    <defs>
                        {/* ── Grid patterns (used when no image) ── */}
                        <pattern
                            id="fp-minor"
                            width="500"
                            height="500"
                            patternUnits="userSpaceOnUse"
                        >
                            <path
                                d="M 500 0 L 0 0 0 500"
                                fill="none"
                                stroke="#0b1a2b"
                                strokeWidth="2"
                            />
                        </pattern>
                        <pattern
                            id="fp-major"
                            width="1000"
                            height="1000"
                            patternUnits="userSpaceOnUse"
                        >
                            <rect
                                width="1000"
                                height="1000"
                                fill="url(#fp-minor)"
                            />
                            <path
                                d="M 1000 0 L 0 0 0 1000"
                                fill="none"
                                stroke="#0f2236"
                                strokeWidth="3.5"
                            />
                        </pattern>

                        {/* ── Glow filters per status ── */}
                        {(['normal', 'warning', 'critical'] as const).map(
                            (s) => (
                                <filter
                                    key={s}
                                    id={`fp-glow-${s}`}
                                    x="-150%"
                                    y="-150%"
                                    width="400%"
                                    height="400%"
                                >
                                    <feGaussianBlur
                                        stdDeviation="28"
                                        result="blur"
                                    />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            ),
                        )}
                        <filter
                            id="fp-glow-offline"
                            x="-50%"
                            y="-50%"
                            width="200%"
                            height="200%"
                        >
                            <feGaussianBlur stdDeviation="10" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {hasImage ? (
                        /* ── IMAGE MODE ──────────────────────────────────── */
                        <>
                            {/* Dark canvas base */}
                            <rect
                                x="0"
                                y="0"
                                width={roomWidth}
                                height={roomHeight}
                                fill="#0a0f14"
                            />

                            {/* Floor plan image — fills entire coordinate space */}
                            <image
                                href={backgroundImage!}
                                x="0"
                                y="0"
                                width={roomWidth}
                                height={roomHeight}
                                preserveAspectRatio="xMidYMid meet"
                            />

                            {/* Subtle dark vignette overlay so dots pop */}
                            <rect
                                x="0"
                                y="0"
                                width={roomWidth}
                                height={roomHeight}
                                fill="#000000"
                                fillOpacity="0.22"
                                style={{ pointerEvents: 'none' }}
                            />
                        </>
                    ) : (
                        /* ── GRID MODE (no image) ────────────────────────── */
                        <>
                            {/* Background grid */}
                            <rect
                                x="0"
                                y="0"
                                width={roomWidth}
                                height={roomHeight}
                                fill="url(#fp-major)"
                            />

                            {/* Room outline — outer glow ring */}
                            <rect
                                x="55"
                                y="55"
                                width={roomWidth - 110}
                                height={roomHeight - 110}
                                rx="80"
                                fill="none"
                                stroke="#22d3ee"
                                strokeWidth="28"
                                strokeOpacity="0.08"
                            />
                            {/* Room outline — inner crisp border */}
                            <rect
                                x="55"
                                y="55"
                                width={roomWidth - 110}
                                height={roomHeight - 110}
                                rx="80"
                                fill="none"
                                stroke="#1a3a5c"
                                strokeWidth="8"
                            />

                            {/* Room name watermark */}
                            {roomName && (
                                <text
                                    x={roomWidth / 2}
                                    y={roomHeight / 2}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="420"
                                    fontWeight="bold"
                                    fill="#ffffff"
                                    fillOpacity="0.022"
                                    fontFamily="monospace"
                                    letterSpacing="25"
                                    style={{
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}
                                >
                                    {roomName.toUpperCase()}
                                </text>
                            )}

                            {/* Dimension labels */}
                            <text
                                x={roomWidth / 2}
                                y={roomHeight - 70}
                                textAnchor="middle"
                                fontSize="75"
                                fill="#172e48"
                                fontFamily="sans-serif"
                                style={{
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                }}
                            >
                                {(roomWidth / 1000).toFixed(0)} m
                            </text>
                            <text
                                x={75}
                                y={roomHeight / 2}
                                textAnchor="middle"
                                fontSize="75"
                                fill="#172e48"
                                fontFamily="sans-serif"
                                transform={`rotate(-90, 75, ${roomHeight / 2})`}
                                style={{
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                }}
                            >
                                {(roomHeight / 1000).toFixed(0)} m
                            </text>

                            {/* Empty state */}
                            {placed.length === 0 && (
                                <g style={{ pointerEvents: 'none' }}>
                                    <text
                                        x={roomWidth / 2}
                                        y={roomHeight / 2 - 280}
                                        textAnchor="middle"
                                        fontSize="280"
                                        fontWeight="bold"
                                        fill="#0f2236"
                                        fontFamily="sans-serif"
                                    >
                                        DENAH KOSONG
                                    </text>
                                    <text
                                        x={roomWidth / 2}
                                        y={roomHeight / 2 + 80}
                                        textAnchor="middle"
                                        fontSize="160"
                                        fill="#0a1c2e"
                                        fontFamily="sans-serif"
                                    >
                                        Atur koordinat X &amp; Y sensor di
                                        halaman Device Settings
                                    </text>
                                </g>
                            )}
                        </>
                    )}

                    {/* ── Sensor dots — always rendered on top ─────────────── */}
                    {placed.map((sensor) => {
                        const x = sensor.pos_x!;
                        const y = sensor.pos_y!;
                        const col = dotColor(sensor.status);
                        const dur = pingDur(sensor.status);
                        const isOffline = sensor.status === 'OFFLINE';
                        const isHovered = hoveredId === sensor.id;

                        // Label above dot, unless sensor is too close to top edge
                        const labelBelow = y < roomHeight * 0.16;
                        const labelBaseY = labelBelow
                            ? y + LABEL_GAP + LABEL_FONT
                            : y - LABEL_GAP;

                        // Tooltip box dimensions & smart positioning
                        const TIP_W = 1380;
                        const TIP_H = sensor.last_read_at ? 590 : 490;
                        const tipX =
                            x > roomWidth * 0.64 ? x - TIP_W - 60 : x + 200;
                        const tipY = Math.max(
                            80,
                            Math.min(roomHeight - TIP_H - 80, y - TIP_H / 2),
                        );

                        return (
                            <g
                                key={sensor.id}
                                onMouseEnter={() => setHoveredId(sensor.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Invisible hit-area */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={PING_MAX_R + 20}
                                    fill="transparent"
                                />

                                {/* ── Animated ping rings (online only) ── */}
                                {!isOffline && (
                                    <>
                                        <circle
                                            cx={x}
                                            cy={y}
                                            r={CORE_R}
                                            fill={col}
                                            opacity="0"
                                        >
                                            <animate
                                                attributeName="r"
                                                from={`${CORE_R}`}
                                                to={`${PING_MAX_R}`}
                                                dur={`${dur}s`}
                                                repeatCount="indefinite"
                                            />
                                            <animate
                                                attributeName="opacity"
                                                from="0.65"
                                                to="0"
                                                dur={`${dur}s`}
                                                repeatCount="indefinite"
                                            />
                                        </circle>
                                        {(sensor.status === 'WARNING' ||
                                            sensor.status === 'CRITICAL') && (
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r={CORE_R}
                                                fill={col}
                                                opacity="0"
                                            >
                                                <animate
                                                    attributeName="r"
                                                    from={`${CORE_R}`}
                                                    to={`${PING_MAX_R}`}
                                                    dur={`${dur}s`}
                                                    repeatCount="indefinite"
                                                    begin={`${dur * 0.5}s`}
                                                />
                                                <animate
                                                    attributeName="opacity"
                                                    from="0.5"
                                                    to="0"
                                                    dur={`${dur}s`}
                                                    repeatCount="indefinite"
                                                    begin={`${dur * 0.5}s`}
                                                />
                                            </circle>
                                        )}
                                    </>
                                )}

                                {/* ── Glow halo ── */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={CORE_R + 35}
                                    fill={col}
                                    opacity={
                                        isOffline
                                            ? 0.06
                                            : isHovered
                                              ? 0.38
                                              : 0.22
                                    }
                                    filter={`url(#fp-glow-${sensor.status.toLowerCase()})`}
                                />

                                {/* ── Core dot ── */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={isHovered ? CORE_R * 1.22 : CORE_R}
                                    fill={col}
                                    opacity={isOffline ? 0.4 : 1}
                                    filter={
                                        isOffline
                                            ? 'url(#fp-glow-offline)'
                                            : `url(#fp-glow-${sensor.status.toLowerCase()})`
                                    }
                                />

                                {/* ── White centre pip ── */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={CORE_R * 0.36}
                                    fill="white"
                                    opacity={isOffline ? 0.18 : 0.88}
                                    style={{ pointerEvents: 'none' }}
                                />

                                {/* ── Sensor name label ── */}
                                <text
                                    x={x}
                                    y={labelBaseY}
                                    textAnchor="middle"
                                    fontSize={LABEL_FONT}
                                    fontWeight="700"
                                    fill={isOffline ? '#475569' : 'white'}
                                    fontFamily="sans-serif"
                                    style={{
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}
                                >
                                    {sensor.name}
                                </text>

                                {/* ── Temp / Humidity sub-label ── */}
                                <text
                                    x={x}
                                    y={labelBaseY + LABEL_FONT + 25}
                                    textAnchor="middle"
                                    fontSize={SUB_FONT}
                                    fontWeight="600"
                                    fill={isOffline ? '#2d3f52' : col}
                                    fontFamily="monospace"
                                    style={{
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}
                                >
                                    {isOffline
                                        ? '─── OFFLINE ───'
                                        : `${fmt(sensor.temperature)}°C  ·  ${fmt(sensor.humidity)}%`}
                                </text>

                                {/* ── Hover tooltip ── */}
                                {isHovered && (
                                    <g style={{ pointerEvents: 'none' }}>
                                        {/* Box shadow */}
                                        <rect
                                            x={tipX + 12}
                                            y={tipY + 12}
                                            width={TIP_W}
                                            height={TIP_H}
                                            rx="52"
                                            fill="#000000"
                                            fillOpacity="0.4"
                                        />
                                        {/* Box body */}
                                        <rect
                                            x={tipX}
                                            y={tipY}
                                            width={TIP_W}
                                            height={TIP_H}
                                            rx="50"
                                            fill="#060c12"
                                            fillOpacity="0.97"
                                            stroke={col}
                                            strokeWidth="12"
                                        />
                                        {/* Top accent bar */}
                                        <rect
                                            x={tipX + 50}
                                            y={tipY}
                                            width={TIP_W - 100}
                                            height="14"
                                            fill={col}
                                            fillOpacity="0.75"
                                        />
                                        {/* Status dot */}
                                        <circle
                                            cx={tipX + 85}
                                            cy={tipY + 112}
                                            r="30"
                                            fill={col}
                                        >
                                            {!isOffline && (
                                                <>
                                                    <animate
                                                        attributeName="r"
                                                        from="30"
                                                        to="50"
                                                        dur="1.5s"
                                                        repeatCount="indefinite"
                                                    />
                                                    <animate
                                                        attributeName="opacity"
                                                        from="0.8"
                                                        to="0"
                                                        dur="1.5s"
                                                        repeatCount="indefinite"
                                                    />
                                                </>
                                            )}
                                        </circle>
                                        <circle
                                            cx={tipX + 85}
                                            cy={tipY + 112}
                                            r="28"
                                            fill={col}
                                        />
                                        {/* Name */}
                                        <text
                                            x={tipX + 140}
                                            y={tipY + 126}
                                            fontSize="105"
                                            fontWeight="bold"
                                            fill="white"
                                            fontFamily="sans-serif"
                                            dominantBaseline="middle"
                                        >
                                            {sensor.name}
                                        </text>
                                        {/* Status */}
                                        <text
                                            x={tipX + 85}
                                            y={tipY + 240}
                                            fontSize="80"
                                            fontWeight="600"
                                            fill={col}
                                            fontFamily="sans-serif"
                                        >
                                            {sensor.status}
                                        </text>
                                        {/* Divider */}
                                        <line
                                            x1={tipX + 60}
                                            y1={tipY + 295}
                                            x2={tipX + TIP_W - 60}
                                            y2={tipY + 295}
                                            stroke={col}
                                            strokeOpacity="0.2"
                                            strokeWidth="5"
                                        />
                                        {/* Temperature */}
                                        <text
                                            x={tipX + 85}
                                            y={tipY + 400}
                                            fontSize="100"
                                            fontWeight="700"
                                            fill="#22d3ee"
                                            fontFamily="monospace"
                                        >
                                            {fmt(sensor.temperature)} °C
                                        </text>
                                        {/* Humidity */}
                                        <text
                                            x={tipX + 760}
                                            y={tipY + 400}
                                            fontSize="100"
                                            fontWeight="700"
                                            fill="#60a5fa"
                                            fontFamily="monospace"
                                        >
                                            {fmt(sensor.humidity)} %RH
                                        </text>
                                        {/* Labels */}
                                        <text
                                            x={tipX + 85}
                                            y={tipY + 475}
                                            fontSize="65"
                                            fill="#1e3a5f"
                                            fontFamily="sans-serif"
                                        >
                                            TEMPERATURE
                                        </text>
                                        <text
                                            x={tipX + 760}
                                            y={tipY + 475}
                                            fontSize="65"
                                            fill="#1e3a5f"
                                            fontFamily="sans-serif"
                                        >
                                            HUMIDITY
                                        </text>
                                        {/* Last read */}
                                        {sensor.last_read_at && (
                                            <text
                                                x={tipX + 85}
                                                y={tipY + TIP_H - 60}
                                                fontSize="60"
                                                fill="#172e48"
                                                fontFamily="sans-serif"
                                            >
                                                LAST READ: {sensor.last_read_at}
                                            </text>
                                        )}
                                    </g>
                                )}
                            </g>
                        );
                    })}

                    {/* ── Drop preview while dragging from sensor list ───── */}
                    {draggingSensorId !== null && dropPreview && (
                        <g style={{ pointerEvents: 'none' }}>
                            <circle
                                cx={dropPreview.x}
                                cy={dropPreview.y}
                                r={220}
                                fill="#22d3ee"
                                fillOpacity="0.1"
                                stroke="#22d3ee"
                                strokeWidth="14"
                                strokeOpacity="0.75"
                                strokeDasharray="30 18"
                            />
                            <line
                                x1={dropPreview.x - 140}
                                y1={dropPreview.y}
                                x2={dropPreview.x + 140}
                                y2={dropPreview.y}
                                stroke="#22d3ee"
                                strokeWidth="10"
                                strokeOpacity="0.85"
                            />
                            <line
                                x1={dropPreview.x}
                                y1={dropPreview.y - 140}
                                x2={dropPreview.x}
                                y2={dropPreview.y + 140}
                                stroke="#22d3ee"
                                strokeWidth="10"
                                strokeOpacity="0.85"
                            />
                        </g>
                    )}
                </svg>
            </div>

            {/* ── Footer: legend + stats ───────────────────────────────── */}
            <div className="flex shrink-0 items-center justify-between px-1">
                {/* Status legend */}
                <div className="flex items-center gap-5">
                    {(
                        [
                            {
                                status: 'NORMAL' as SensorStatus,
                                label: 'Normal',
                                color: '#22c55e',
                                pulse: true,
                            },
                            {
                                status: 'WARNING' as SensorStatus,
                                label: 'Warning',
                                color: '#eab308',
                                pulse: true,
                            },
                            {
                                status: 'CRITICAL' as SensorStatus,
                                label: 'Critical',
                                color: '#ef4444',
                                pulse: true,
                            },
                            {
                                status: 'OFFLINE' as SensorStatus,
                                label: 'Offline',
                                color: '#475569',
                                pulse: false,
                            },
                        ] as const
                    ).map(({ status, label, color, pulse }) => (
                        <div key={status} className="flex items-center gap-1.5">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                className="shrink-0"
                            >
                                {pulse && (
                                    <circle
                                        cx="8"
                                        cy="8"
                                        r="4"
                                        fill={color}
                                        opacity="0"
                                    >
                                        <animate
                                            attributeName="r"
                                            from="4"
                                            to="8"
                                            dur={
                                                status === 'NORMAL'
                                                    ? '2s'
                                                    : status === 'WARNING'
                                                      ? '1.2s'
                                                      : '0.65s'
                                            }
                                            repeatCount="indefinite"
                                        />
                                        <animate
                                            attributeName="opacity"
                                            from="0.7"
                                            to="0"
                                            dur={
                                                status === 'NORMAL'
                                                    ? '2s'
                                                    : status === 'WARNING'
                                                      ? '1.2s'
                                                      : '0.65s'
                                            }
                                            repeatCount="indefinite"
                                        />
                                    </circle>
                                )}
                                <circle
                                    cx="8"
                                    cy="8"
                                    r="5"
                                    fill={color}
                                    opacity={pulse ? 1 : 0.45}
                                    style={{
                                        filter: pulse
                                            ? `drop-shadow(0 0 3px ${color})`
                                            : 'none',
                                    }}
                                />
                            </svg>
                            <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Right side: warnings + count */}
                <div className="flex items-center gap-3">
                    {unmapped > 0 && (
                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400/80">
                            {unmapped} sensor belum dikonfigurasi posisi
                        </span>
                    )}
                    <span className="text-[10px] text-slate-600">
                        {placed.length}/{sensors.length} sensor terpetakan
                    </span>
                </div>
            </div>
        </div>
    );
}
