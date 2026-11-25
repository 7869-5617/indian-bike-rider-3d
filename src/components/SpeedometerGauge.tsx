import React, { useMemo } from 'react';
import { Flame } from 'lucide-react';

export interface SpeedometerGaugeProps {
  speedKmh: number;
  maxSpeedKmh: number;
  gear: number;
  bikeName: string;
  hasNitro?: boolean;
  nitroLevel?: number;
  nitroActive?: boolean;
  compact?: boolean;
}

const MIN_ANGLE_DEG = -135;
const MAX_ANGLE_DEG = 135;
const SWEEP_DEG = MAX_ANGLE_DEG - MIN_ANGLE_DEG; // 270 deg

function getMajorTickValues(maxSpeedKmh: number): number[] {
  if (maxSpeedKmh <= 150) {
    return [0, 25, 50, 75, 100, 125, maxSpeedKmh];
  }
  if (maxSpeedKmh <= 180) {
    return [0, 30, 60, 90, 120, 150, maxSpeedKmh];
  }
  return [0, 50, 100, 150, 200, 250, maxSpeedKmh];
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  // 0 deg = 12 o'clock (top), positive clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const start = polarToCartesian(cx, cy, radius, endAngleDeg);
  const end = polarToCartesian(cx, cy, radius, startAngleDeg);
  const largeArcFlag = endAngleDeg - startAngleDeg <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const SpeedometerGauge: React.FC<SpeedometerGaugeProps> = ({
  speedKmh,
  maxSpeedKmh,
  gear,
  bikeName,
  hasNitro = false,
  nitroLevel = 0,
  nitroActive = false,
  compact = false,
}) => {
  const safeMax = Math.max(maxSpeedKmh, 1);
  const clampedSpeed = Math.min(Math.max(speedKmh, 0), safeMax);
  const speedRatio = clampedSpeed / safeMax;
  const needleAngleDeg = MIN_ANGLE_DEG + speedRatio * SWEEP_DEG;
  const isRedline = speedRatio >= 0.82;

  const majorValues = useMemo(() => getMajorTickValues(safeMax), [safeMax]);

  const minorTicks = useMemo(() => {
    const ticks: Array<{ angle: number; isRedline: boolean }> = [];
    const totalMinor = compact ? 18 : 28;
    for (let i = 0; i <= totalMinor; i++) {
      const frac = i / totalMinor;
      ticks.push({
        angle: MIN_ANGLE_DEG + frac * SWEEP_DEG,
        isRedline: frac >= 0.8,
      });
    }
    return ticks;
  }, [compact]);

  // SVG coordinate space (fixed 200x200 viewBox for crisp scaling at any size)
  const cx = 100;
  const cy = 100;
  const arcRadius = 82;

  const fullTrackPath = useMemo(
    () => describeArc(cx, cy, arcRadius, MIN_ANGLE_DEG, MAX_ANGLE_DEG),
    []
  );
  const redlineTrackPath = useMemo(
    () => describeArc(cx, cy, arcRadius, MIN_ANGLE_DEG + SWEEP_DEG * 0.8, MAX_ANGLE_DEG),
    []
  );
  const arcCircumference = 2 * Math.PI * arcRadius * (SWEEP_DEG / 360);
  const activeDashOffset = arcCircumference * (1 - speedRatio);

  if (compact) {
    return (
      <div
        className="flex flex-col items-center gap-1"
        aria-label={`Speed ${clampedSpeed} kilometers per hour, gear ${gear}`}
      >
        <div className="relative w-[88px] h-[88px] rounded-full bg-zinc-950/92 border border-white/15 shadow-xl">
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            {/* Outer subtle bezel ring */}
            <circle
              cx={cx}
              cy={cy}
              r={94}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="2"
            />

            {/* Background 270-degree track */}
            <path
              d={fullTrackPath}
              fill="none"
              stroke="#27272a"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Redline zone indicator */}
            <path
              d={redlineTrackPath}
              fill="none"
              stroke="rgba(239,68,68,0.38)"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Active speed sweep arc */}
            <path
              d={fullTrackPath}
              fill="none"
              stroke={nitroActive ? '#38bdf8' : isRedline ? '#f59e0b' : '#ef4444'}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={arcCircumference}
              strokeDashoffset={activeDashOffset}
            />

            {/* Minor tick marks */}
            {minorTicks.map((t, idx) => {
              const inner = polarToCartesian(cx, cy, 66, t.angle);
              const outer = polarToCartesian(cx, cy, 73, t.angle);
              return (
                <line
                  key={idx}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={t.isRedline ? '#ef4444' : '#71717a'}
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* CSS Transform Rotating Needle */}
          <div
            data-testid="speedometer-needle-mobile"
            className="absolute inset-0 pointer-events-none transition-transform duration-75 ease-out motion-reduce:transition-none"
            style={{ transform: `rotate(${needleAngleDeg.toFixed(1)}deg)` }}
          >
            <div
              className={`absolute left-1/2 bottom-1/2 -translate-x-1/2 w-[3px] h-[27px] rounded-t-full origin-bottom shadow-[0_0_8px_rgba(239,68,68,0.8)] ${
                nitroActive ? 'bg-cyan-300' : 'bg-red-500'
              }`}
            />
          </div>

          {/* Center Pivot Hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-zinc-200 border-2 border-zinc-900 shadow" />

          {/* Digital Inset Readout at Bottom Cutout */}
          <div className="absolute inset-x-0 bottom-2 flex flex-col items-center leading-none pointer-events-none">
            <span
              data-testid="hud-speed-value-mobile"
              className="font-display text-[15px] font-bold text-white tabular-nums"
            >
              {clampedSpeed}
            </span>
            <span className="text-[7.5px] font-bold tracking-wider text-red-400 mt-0.5">
              KM/H · G{gear}
            </span>
          </div>
        </div>

        {hasNitro && (
          <div className="w-16 h-1 bg-zinc-900 border border-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-[width] duration-75 ${
                nitroActive ? 'bg-cyan-300' : 'bg-sky-500'
              }`}
              style={{ width: `${nitroLevel}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-2.5"
      aria-label={`${bikeName} speedometer: ${clampedSpeed} kilometers per hour, gear ${gear}`}
    >
      {/* Circular Gauge Cluster */}
      <div className="relative w-[212px] h-[212px] rounded-full bg-zinc-950/92 border border-white/15 shadow-2xl">
        {/* Subtle inner metallic ring */}
        <div
          className="absolute inset-1.5 rounded-full border border-white/5 pointer-events-none"
          aria-hidden="true"
        />

        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="speedArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#dc2626" />
              <stop offset="65%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* Background 270-degree arc track */}
          <path
            d={fullTrackPath}
            fill="none"
            stroke="#1f2937"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Redline danger zone arc */}
          <path
            d={redlineTrackPath}
            fill="none"
            stroke="rgba(239, 68, 68, 0.35)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Active swept speed arc */}
          <path
            d={fullTrackPath}
            fill="none"
            stroke={nitroActive ? '#38bdf8' : 'url(#speedArcGrad)'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={arcCircumference}
            strokeDashoffset={activeDashOffset}
          />

          {/* Minor tick marks */}
          {minorTicks.map((t, idx) => {
            const inner = polarToCartesian(cx, cy, 70, t.angle);
            const outer = polarToCartesian(cx, cy, 75, t.angle);
            return (
              <line
                key={`minor-${idx}`}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={t.isRedline ? 'rgba(248, 113, 113, 0.7)' : 'rgba(161, 161, 170, 0.5)'}
                strokeWidth="1.4"
              />
            );
          })}

          {/* Major tick marks + scale numerals aligned to actual speed cap */}
          {majorValues.map((val, idx) => {
            const frac = val / safeMax;
            const angle = MIN_ANGLE_DEG + frac * SWEEP_DEG;
            const inner = polarToCartesian(cx, cy, 67, angle);
            const outer = polarToCartesian(cx, cy, 76, angle);
            const labelPos = polarToCartesian(cx, cy, 55, angle);
            const isCapTick = idx === majorValues.length - 1;
            return (
              <g key={`major-${val}`}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={isCapTick ? '#ef4444' : '#f4f4f5'}
                  strokeWidth={isCapTick ? '2.5' : '2'}
                  strokeLinecap="round"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isCapTick ? '#fca5a5' : '#a1a1aa'}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="Chakra Petch, system-ui, sans-serif"
                >
                  {val}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Bike Model Label Centered in Upper Inner Dial (Clear of Top Tick Numeral) */}
        <div className="absolute inset-x-0 top-[68px] text-center px-10 pointer-events-none">
          <div className="text-[8.5px] font-bold tracking-widest text-zinc-400 truncate">
            {bikeName.toUpperCase()}
          </div>
        </div>

        {/* CSS Transform Rotating Needle */}
        <div
          data-testid="speedometer-needle"
          className="absolute inset-0 pointer-events-none transition-transform duration-75 ease-out motion-reduce:transition-none"
          style={{ transform: `rotate(${needleAngleDeg.toFixed(1)}deg)` }}
        >
          {/* Tapered pointer blade */}
          <div
            className={`absolute left-1/2 bottom-1/2 -translate-x-1/2 w-[3.5px] h-[68px] rounded-t-full origin-bottom ${
              nitroActive
                ? 'bg-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.9)]'
                : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
            }`}
          />
          {/* Short tail counterweight */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 w-[4px] h-[14px] rounded-b-full bg-zinc-400" />
        </div>

        {/* Machined Center Hub */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-800 border-2 border-zinc-300 shadow-md flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
        </div>

        {/* Bottom Digital Telemetry Cutout */}
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center pointer-events-none">
          <div className="flex items-baseline gap-1">
            <span
              data-testid="hud-speed-value"
              className="font-display text-3xl font-bold text-white tabular-nums leading-none"
            >
              {clampedSpeed}
            </span>
            <span className="font-display text-[10px] font-bold text-red-400">KM/H</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-zinc-400 mt-0.5 tabular-nums">
            <span className="text-red-400 font-bold">GEAR {gear}</span>
            <span aria-hidden="true">·</span>
            <span>CAP {safeMax}</span>
          </div>
        </div>
      </div>

      {/* Optional Nitro Boost Bar for Ninja ZX-10R */}
      {hasNitro && (
        <div className="w-[212px] bg-zinc-950/92 border border-white/10 rounded-xl px-3.5 py-2 shadow-xl">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-wider mb-1">
            <span className="inline-flex items-center gap-1 text-sky-400">
              <Flame className="w-3 h-3" />
              NITRO (N / F)
            </span>
            <span className="font-display text-sky-300 tabular-nums">{nitroLevel}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-[width] duration-75 ${
                nitroActive ? 'bg-cyan-300' : 'bg-sky-500'
              }`}
              style={{ width: `${nitroLevel}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
