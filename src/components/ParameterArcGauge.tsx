import React from "react";

export interface GaugeSegment {
  from: number;
  to: number;
  color: string;
}

interface ParameterArcGaugeProps {
  value: number | undefined;
  min: number;
  max: number;
  unit: string;
  segments: GaugeSegment[];
  accentColor?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const ParameterArcGauge: React.FC<ParameterArcGaugeProps> = ({
  value,
  min,
  max,
  unit,
  segments,
  accentColor = "#0f172a",
}) => {
  const cx = 80;
  const cy = 72;
  const r = 56;
  const startAngle = 158;
  const endAngle = 382; // 224 deg horseshoe arc
  const totalSweep = endAngle - startAngle;
  const span = Math.max(0.001, max - min);

  const angleForValue = (val: number) => {
    const clamped = Math.max(min, Math.min(max, val));
    return startAngle + ((clamped - min) / span) * totalSweep;
  };

  const markerAngle = value !== undefined ? angleForValue(value) : null;
  const markerPos =
    markerAngle !== null ? polarToCartesian(cx, cy, r, markerAngle) : null;
  const innerTickPos =
    markerAngle !== null ? polarToCartesian(cx, cy, r - 11, markerAngle) : null;

  return (
    <div className="relative w-full max-w-[158px] mx-auto">
      <svg
        viewBox="0 0 160 108"
        className="w-full h-auto overflow-visible select-none"
        aria-hidden="true"
      >
        {/* Subtle base track */}
        <path
          d={describeArc(cx, cy, r, startAngle, endAngle)}
          fill="none"
          stroke="#CBD5E1"
          strokeOpacity={0.45}
          strokeWidth={11}
          strokeLinecap="round"
        />

        {/* Colored range segments */}
        {segments.map((seg, idx) => {
          const a1 = angleForValue(seg.from);
          const a2 = angleForValue(seg.to);
          if (a2 <= a1) return null;
          const isFirst = idx === 0;
          const isLast = idx === segments.length - 1;
          return (
            <path
              key={`${seg.from}-${seg.to}-${idx}`}
              d={describeArc(cx, cy, r, a1, a2)}
              fill="none"
              stroke={seg.color}
              strokeWidth={11}
              strokeLinecap={isFirst || isLast ? "round" : "butt"}
            />
          );
        })}

        {/* Current value pointer */}
        {markerPos && innerTickPos && (
          <g className="text-slate-900">
            <line
              x1={innerTickPos.x}
              y1={innerTickPos.y}
              x2={markerPos.x}
              y2={markerPos.y}
              stroke={accentColor === "#0f172a" ? "currentColor" : accentColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle
              cx={markerPos.x}
              cy={markerPos.y}
              r={6.5}
              fill="#FFFFFF"
              stroke={accentColor === "#0f172a" ? "currentColor" : accentColor}
              strokeWidth={3}
            />
          </g>
        )}
      </svg>

      {/* Big centered numeric readout inside the arc */}
      <div className="absolute inset-x-0 bottom-2.5 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono-num text-[22px] sm:text-2xl font-extrabold leading-none text-slate-900">
          {value !== undefined ? value : "—"}
        </span>
        {unit && (
          <span className="text-[11px] font-medium text-slate-500 mt-1 leading-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
