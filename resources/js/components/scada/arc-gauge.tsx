// ─── SVG Arc Gauge (SCADA Industrial Style) ──────────────────────────────────

export function ArcGauge({
    value,
    min = 0,
    max = 50,
    unit = '°C',
    color = '#22d3ee',
    tickCount = 10,
    zones,
}: {
    value: number | null;
    min?: number;
    max?: number;
    unit?: string;
    color?: string;
    tickCount?: number;
    zones?: Array<{
        from: number;
        to: number;
        color: string;
    }>;
}) {
    const size = 200;
    const cx = size / 2;
    const cy = size / 2 + 8;
    const rOuter = 82;
    const rInner = 72;
    const startAngle = 225;
    const sweepAngle = 270;
    const gaugeId = `gauge-${unit.replace(/[^a-z]/gi, '')}`;

    function toRad(angle: number) {
        return ((angle - 90) * Math.PI) / 180;
    }

    function polar(angle: number, radius: number) {
        const rad = toRad(angle);
        return {
            x: cx + radius * Math.cos(rad),
            y: cy + radius * Math.sin(rad),
        };
    }

    function arcPath(start: number, end: number, radius: number) {
        const s = polar(start, radius);
        const e = polar(end, radius);
        const large = end - start > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
    }

    const clamped = value !== null ? Math.min(Math.max(value, min), max) : min;
    const pct = (clamped - min) / (max - min);
    const valueAngle = startAngle + pct * sweepAngle;

    const zoneSegments = (zones ?? []).filter((zone) => zone.to > zone.from);
    const hasZoneSegments = zoneSegments.length > 0;
    const activeZone =
        value !== null
            ? zoneSegments.find(
                  (zone) => clamped >= zone.from && clamped <= zone.to,
              )
            : null;
    const needleColor = activeZone?.color ?? color;
    const gaugeAccentColor = color;

    // Arc paths
    const bgOuter = arcPath(startAngle, startAngle + sweepAngle, rOuter);
    const bgInner = arcPath(startAngle, startAngle + sweepAngle, rInner);
    const fillOuter =
        value !== null && !hasZoneSegments
            ? arcPath(startAngle, valueAngle, rOuter)
            : null;
    const fillInner =
        value !== null && !hasZoneSegments
            ? arcPath(startAngle, valueAngle, rInner)
            : null;

    // Generate ticks — 5 minor ticks per major division
    const totalMinorTicks = tickCount * 5;
    const ticks = Array.from({ length: totalMinorTicks + 1 }, (_, i) => {
        const angle = startAngle + (i / totalMinorTicks) * sweepAngle;
        const isMajor = i % 5 === 0;
        const outerR = rOuter + 2;
        const innerR = isMajor ? rOuter - 10 : rOuter - 5;
        const rad = toRad(angle);
        return {
            x1: cx + outerR * Math.cos(rad),
            y1: cy + outerR * Math.sin(rad),
            x2: cx + innerR * Math.cos(rad),
            y2: cy + innerR * Math.sin(rad),
            isMajor,
            angle,
            value: isMajor ? min + (i / totalMinorTicks) * (max - min) : null,
        };
    });

    // Needle geometry — tapered triangle
    const needleAngle = startAngle + pct * sweepAngle;
    const needleRad = toRad(needleAngle);
    const needleLen = rInner - 6;
    const needleTip = {
        x: cx + needleLen * Math.cos(needleRad),
        y: cy + needleLen * Math.sin(needleRad),
    };
    const perpRad = needleRad + Math.PI / 2;
    const halfBase = 3;
    const baseLeft = {
        x: cx + halfBase * Math.cos(perpRad),
        y: cy + halfBase * Math.sin(perpRad),
    };
    const baseRight = {
        x: cx - halfBase * Math.cos(perpRad),
        y: cy - halfBase * Math.sin(perpRad),
    };

    return (
        <svg
            viewBox={`0 0 ${size} ${size + 10}`}
            className="w-full max-w-[200px]"
        >
            <defs>
                <linearGradient
                    id={`${gaugeId}-grad`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                >
                    <stop
                        offset="0%"
                        stopColor={gaugeAccentColor}
                        stopOpacity="0.6"
                    />
                    <stop
                        offset="100%"
                        stopColor={gaugeAccentColor}
                        stopOpacity="1"
                    />
                </linearGradient>
                <filter id={`${gaugeId}-glow`}>
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id={`${gaugeId}-glow-lg`}>
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Decorative outer ring */}
            <circle
                cx={cx}
                cy={cy}
                r={rOuter + 8}
                fill="none"
                stroke="#1e293b"
                strokeWidth="1"
            />

            {/* Background arcs (dark tracks) */}
            <path
                d={bgOuter}
                fill="none"
                stroke="#0f2035"
                strokeWidth="4"
                strokeLinecap="round"
            />
            <path
                d={bgInner}
                fill="none"
                stroke="#0f2035"
                strokeWidth="4"
                strokeLinecap="round"
            />

            {/* Static colored zones */}
            {zoneSegments.map((zone, index) => {
                const zoneFrom = Math.max(min, Math.min(max, zone.from));
                const zoneTo = Math.max(min, Math.min(max, zone.to));
                const start =
                    startAngle + ((zoneFrom - min) / (max - min)) * sweepAngle;
                const end =
                    startAngle + ((zoneTo - min) / (max - min)) * sweepAngle;

                return (
                    <path
                        key={`${zone.from}-${zone.to}-${index}`}
                        d={arcPath(start, end, rInner)}
                        fill="none"
                        stroke={zone.color}
                        strokeWidth="7"
                        strokeLinecap="round"
                        opacity="0.55"
                    />
                );
            })}

            {/* Filled outer arc — glow ring */}
            {fillOuter && (
                <path
                    d={fillOuter}
                    fill="none"
                    stroke={gaugeAccentColor}
                    strokeWidth="4"
                    strokeLinecap="round"
                    opacity="0.35"
                    filter={`url(#${gaugeId}-glow-lg)`}
                />
            )}

            {/* Filled inner arc — solid value */}
            {fillInner && (
                <path
                    d={fillInner}
                    fill="none"
                    stroke={`url(#${gaugeId}-grad)`}
                    strokeWidth="6"
                    strokeLinecap="round"
                    filter={`url(#${gaugeId}-glow)`}
                />
            )}

            {/* Tick marks */}
            {ticks.map((t, i) => (
                <line
                    key={i}
                    x1={t.x1}
                    y1={t.y1}
                    x2={t.x2}
                    y2={t.y2}
                    stroke={t.isMajor ? '#94a3b8' : '#334155'}
                    strokeWidth={t.isMajor ? 1.5 : 0.7}
                />
            ))}

            {/* Numbered labels around the arc */}
            {ticks
                .filter((t) => t.isMajor && t.value !== null)
                .map((t, i) => {
                    const labelR = rOuter + 14;
                    const rad = toRad(t.angle);
                    const lx = cx + labelR * Math.cos(rad);
                    const ly = cy + labelR * Math.sin(rad);
                    return (
                        <text
                            key={i}
                            x={lx}
                            y={ly}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="8"
                            fill="#64748b"
                            fontFamily="sans-serif"
                        >
                            {Math.round(t.value!)}
                        </text>
                    );
                })}

            {/* Inner dark circle bezel */}
            <circle
                cx={cx}
                cy={cy}
                r={rInner - 14}
                fill="#0c1825"
                stroke="#1e3a5f"
                strokeWidth="1"
            />

            {/* Needle */}
            {value !== null && (
                <>
                    <polygon
                        points={`${needleTip.x},${needleTip.y} ${baseLeft.x},${baseLeft.y} ${baseRight.x},${baseRight.y}`}
                        fill={needleColor}
                        filter={`url(#${gaugeId}-glow)`}
                    />
                    {/* Center hub */}
                    <circle
                        cx={cx}
                        cy={cy}
                        r="7"
                        fill="#1e293b"
                        stroke={gaugeAccentColor}
                        strokeWidth="1.5"
                    />
                    <circle cx={cx} cy={cy} r="3" fill={gaugeAccentColor} />
                </>
            )}

            {/* Value text */}
            <text
                x={cx}
                y={cy + 32}
                textAnchor="middle"
                fontSize="28"
                fontWeight="bold"
                fill="white"
                fontFamily="sans-serif"
                style={{ textShadow: `0 0 8px ${gaugeAccentColor}40` }}
            >
                {value !== null ? clamped.toFixed(1) : '--'}
            </text>
            <text
                x={cx}
                y={cy + 46}
                textAnchor="middle"
                fontSize="11"
                fill="#94a3b8"
                fontFamily="sans-serif"
            >
                {unit}
            </text>
        </svg>
    );
}
