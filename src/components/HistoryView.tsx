import React, { useState } from "react";
import { Camera, Droplets, Edit3, Trash2 } from "lucide-react";
import { PARAMETER_META } from "../data/poolCatalog";
import {
  ParameterKey,
  TreatmentLogEntry,
  WaterMeasurement,
} from "../types/pool";

interface HistoryViewProps {
  measurements: WaterMeasurement[];
  treatments: TreatmentLogEntry[];
  onDeleteMeasurement: (id: string) => void;
  onDeleteTreatment: (id: string) => void;
}

type TimelineFilter = "tous" | "analyses" | "traitements";
type RangeFilter = "7j" | "30j" | "saison" | "tout";
type SingleChartKey = ParameterKey | "temperature";

function formatUnitLabel(amount: number, unit: string): string {
  if (unit === "galets") return amount <= 1 ? "galet" : "galets";
  if (unit === "pastilles") return amount <= 1 ? "pastille" : "pastilles";
  return unit;
}

function cleanTreatmentReason(t: TreatmentLogEntry): string {
  const raw = (t.reason || "").trim();
  if (!raw) return "";
  // Avoid repeating "1 galet de chlore lent..." when product name & quantity are already displayed
  if (
    t.category === "chlore_lent" &&
    /^\d+\s*galets?\s+de\s+chlore\s+lent\s+ajout[ée]s?\s*/i.test(raw)
  ) {
    const rest = raw
      .replace(/^\d+\s*galets?\s+de\s+chlore\s+lent\s+ajout[ée]s?\s*/i, "")
      .trim();
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "Dans le skimmer";
  }
  return raw;
}

function getSeasonWindow(referenceDate: Date = new Date()) {
  const month = referenceDate.getMonth(); // 0 = Jan, 4 = May, 9 = Oct
  const year =
    month < 4 ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear();
  const start = new Date(year, 4, 1, 0, 0, 0, 0); // 1er mai
  const end = new Date(year, 9, 31, 23, 59, 59, 999); // 31 octobre
  return { year, startMs: start.getTime(), endMs: end.getTime() };
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  measurements,
  treatments,
  onDeleteMeasurement,
  onDeleteTreatment,
}) => {
  const [selectedParam, setSelectedParam] =
    useState<SingleChartKey>("freeChlorine");
  const [rangeMode, setRangeMode] = useState<RangeFilter>("30j");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("tous");
  const [showPh, setShowPh] = useState(true);
  const [showChlorine, setShowChlorine] = useState(true);
  const [showTemp, setShowTemp] = useState(true);
  const [hoveredDualIdx, setHoveredDualIdx] = useState<number | null>(null);
  const [hoveredTreatmentId, setHoveredTreatmentId] = useState<string | null>(
    null
  );
  const [hoveredSingleIdx, setHoveredSingleIdx] = useState<number | null>(null);

  const nowMs = Date.now();
  const season = getSeasonWindow(new Date(nowMs));

  const isInRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (rangeMode === "7j") return t >= nowMs - 7 * 86400000;
    if (rangeMode === "30j") return t >= nowMs - 30 * 86400000;
    if (rangeMode === "saison") {
      return t >= season.startMs && t <= season.endMs;
    }
    return true;
  };

  // Combined pH, Free Chlorine & Temperature points (sorted oldest -> newest)
  const dualPoints = measurements
    .filter((m) => isInRange(m.timestamp))
    .slice()
    .reverse()
    .filter(
      (m) =>
        m.values.ph !== undefined ||
        m.values.freeChlorine !== undefined ||
        m.temperature !== undefined
    );

  const recentTreatments = treatments
    .filter((t) => isInRange(t.timestamp))
    .slice()
    .reverse();

  // Compute time domain
  const allTimestampsMs = [
    ...dualPoints.map((m) => new Date(m.timestamp).getTime()),
    ...recentTreatments.map((t) => new Date(t.timestamp).getTime()),
  ];

  const minTimeMs =
    rangeMode === "saison"
      ? season.startMs
      : allTimestampsMs.length > 0
      ? Math.min(...allTimestampsMs)
      : nowMs - 7 * 86400000;
  const maxTimeMs =
    rangeMode === "saison"
      ? season.endMs
      : allTimestampsMs.length > 0
      ? Math.max(...allTimestampsMs)
      : nowMs;
  const timeSpanMs = Math.max(86400000, maxTimeMs - minTimeMs);

  // Combined Chart geometry (wide viewBox for crisp PC & mobile rendering)
  const w = 980;
  const hDual = 300;
  const padL = 52;
  const padR = 76;
  const padT = 24;
  const padB = 48;
  const innerW = w - padL - padR;
  const innerH = hDual - padT - padB;

  const xForTime = (iso: string) => {
    const t = new Date(iso).getTime();
    return padL + ((t - minTimeMs) / timeSpanMs) * innerW;
  };

  // pH range 6.2 - 8.4 (left axis)
  const phMin = 6.2;
  const phMax = 8.4;
  const yForPh = (ph: number) => {
    const c = Math.max(phMin, Math.min(phMax, ph));
    return padT + innerH - ((c - phMin) / (phMax - phMin)) * innerH;
  };

  // Free Chlorine range 0 - 5 mg/L (auto-expands if > 5)
  const clValues = dualPoints
    .map((p) => p.values.freeChlorine)
    .filter((v): v is number => v !== undefined);
  const clMin = 0;
  const clMax = Math.max(4, ...(clValues.length ? clValues : [3]));
  const yForCl = (cl: number) => {
    const c = Math.max(clMin, Math.min(clMax, cl));
    return padT + innerH - ((c - clMin) / (clMax - clMin)) * innerH;
  };

  // Temp range 14 - 34 °C (expands automatically if outside)
  const tempValues = dualPoints
    .map((p) => p.temperature)
    .filter((v): v is number => v !== undefined);
  const tempMin = Math.min(14, ...(tempValues.length ? tempValues : [18])) - 1;
  const tempMax = Math.max(32, ...(tempValues.length ? tempValues : [28])) + 1;
  const yForTemp = (temp: number) => {
    const c = Math.max(tempMin, Math.min(tempMax, temp));
    return padT + innerH - ((c - tempMin) / (tempMax - tempMin)) * innerH;
  };

  const phPoints = dualPoints.filter((p) => p.values.ph !== undefined);
  const clPoints = dualPoints.filter((p) => p.values.freeChlorine !== undefined);
  const tempPoints = dualPoints.filter((p) => p.temperature !== undefined);

  const phPath = phPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xForTime(p.timestamp).toFixed(1)} ${yForPh(
          p.values.ph as number
        ).toFixed(1)}`
    )
    .join(" ");

  const clPath = clPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xForTime(p.timestamp).toFixed(1)} ${yForCl(
          p.values.freeChlorine as number
        ).toFixed(1)}`
    )
    .join(" ");

  const tempPath = tempPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xForTime(p.timestamp).toFixed(1)} ${yForTemp(
          p.temperature as number
        ).toFixed(1)}`
    )
    .join(" ");

  const phIdealTop = yForPh(7.4);
  const phIdealBottom = yForPh(7.0);

  // Season monthly X-axis ticks (1er Mai -> 31 Octobre)
  const seasonMonthTicks = [
    { label: "Mai", month: 4 },
    { label: "Juin", month: 5 },
    { label: "Juil.", month: 6 },
    { label: "Août", month: 7 },
    { label: "Sept.", month: 8 },
    { label: "Oct.", month: 9 },
  ].map((m) => ({
    label: m.label,
    x:
      padL +
      ((new Date(season.year, m.month, 1).getTime() - minTimeMs) / timeSpanMs) *
        innerW,
  }));

  // Single-parameter chart setup
  const isTempSingle = selectedParam === "temperature";
  const singleMeta = !isTempSingle ? PARAMETER_META[selectedParam] : null;
  const singlePoints = measurements
    .filter(
      (m) =>
        isInRange(m.timestamp) &&
        (isTempSingle
          ? m.temperature !== undefined
          : m.values[selectedParam] !== undefined)
    )
    .slice()
    .reverse()
    .map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      date: new Date(m.timestamp),
      value: isTempSingle
        ? (m.temperature as number)
        : (m.values[selectedParam] as number),
      source: m.source,
    }));

  const hSingle = 230;
  const sPadL = 48;
  const sPadR = 24;
  const sPadT = 20;
  const sPadB = 34;
  const sInnerW = w - sPadL - sPadR;
  const sInnerH = hSingle - sPadT - sPadB;

  const sMin = isTempSingle ? tempMin : singleMeta!.min;
  const sMax = isTempSingle ? tempMax : singleMeta!.max;
  const yForSingle = (val: number) => {
    const c = Math.max(sMin, Math.min(sMax, val));
    return sPadT + sInnerH - ((c - sMin) / (sMax - sMin)) * sInnerH;
  };
  const xForSingleTime = (iso: string) => {
    const t = new Date(iso).getTime();
    return sPadL + ((t - minTimeMs) / timeSpanMs) * sInnerW;
  };

  const singlePath = singlePoints
    .map(
      (pt, idx) =>
        `${idx === 0 ? "M" : "L"} ${xForSingleTime(pt.timestamp).toFixed(
          1
        )} ${yForSingle(pt.value).toFixed(1)}`
    )
    .join(" ");

  // Unified timeline
  type TimelineItem =
    | { kind: "analyse"; timestamp: string; data: WaterMeasurement }
    | { kind: "traitement"; timestamp: string; data: TreatmentLogEntry };

  const timelineItems: TimelineItem[] = [
    ...(timelineFilter !== "traitements"
      ? measurements.map((m) => ({
          kind: "analyse" as const,
          timestamp: m.timestamp,
          data: m,
        }))
      : []),
    ...(timelineFilter !== "analyses"
      ? treatments.map((t) => ({
          kind: "traitement" as const,
          timestamp: t.timestamp,
          data: t,
        }))
      : []),
  ].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const shortTreatmentTag = (t: TreatmentLogEntry) => {
    if (t.category === "chlore_lent") {
      return `${t.amount} ${formatUnitLabel(t.amount, t.unit)}`;
    }
    if (t.category === "ph_moins") return "pH Moins";
    if (t.category === "ph_plus") return "pH Plus";
    if (t.category === "chlore_choc") return "Choc";
    if (t.category === "desalgine") return "Désalgine";
    return `${t.amount} ${formatUnitLabel(t.amount, t.unit)}`;
  };

  const inspectedTreatment = recentTreatments.find(
    (t) => t.id === hoveredTreatmentId
  );

  return (
    <div className="space-y-6">
      {/* Primary Combined Chart: pH, Free Chlorine & Water Temperature + Product Additions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Suivi pH, chlore libre, température et apports
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {rangeMode === "saison"
                ? `Période de saison : du 1er mai au 31 octobre ${season.year}.`
                : "Visualisez l'évolution du pH, du chlore libre (mg/L) et de la température (°C) avec vos apports produits."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start shrink-0">
            {(
              [
                { id: "7j", label: "7 j" },
                { id: "30j", label: "30 j" },
                { id: "saison", label: "Saison (Mai–Oct.)" },
                { id: "tout", label: "Tout" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setRangeMode(opt.id);
                  setHoveredDualIdx(null);
                  setHoveredTreatmentId(null);
                  setHoveredSingleIdx(null);
                }}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  rangeMode === opt.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Legend (toggle curves on/off) */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => setShowPh((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 transition-opacity ${
              showPh
                ? "border-sky-200 bg-sky-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-400 opacity-60"
            }`}
          >
            <span className="w-3 h-0.5 bg-sky-600 inline-block" />
            <span className="font-semibold">pH</span>
            <span className="text-slate-500">(7.0–7.4)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChlorine((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 transition-opacity ${
              showChlorine
                ? "border-violet-200 bg-violet-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-400 opacity-60"
            }`}
          >
            <span className="w-3 h-0.5 bg-violet-600 inline-block" />
            <span className="font-semibold">Chlore libre</span>
            <span className="text-slate-500">(mg/L)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTemp((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 transition-opacity ${
              showTemp
                ? "border-amber-200 bg-amber-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-400 opacity-60"
            }`}
          >
            <span className="w-3 h-0.5 bg-amber-600 inline-block" />
            <span className="font-semibold">Température</span>
            <span className="text-slate-500">(°C)</span>
          </button>

          <div className="flex items-center gap-2 px-2 py-1 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
            <span className="font-medium">Apports (galets, pH-, désalgine)</span>
          </div>
        </div>

        {dualPoints.length === 0 ? (
          <div className="h-52 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 px-4 text-center">
            <span>
              {rangeMode === "saison"
                ? `Aucune analyse enregistrée entre le 1er mai et le 31 octobre ${season.year}.`
                : "Aucune mesure de pH, chlore ou température sur cette période."}
            </span>
            {rangeMode === "saison" && measurements.length > 0 && (
              <button
                type="button"
                onClick={() => setRangeMode("30j")}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Voir les 30 derniers jours
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${w} ${hDual}`}
                className="w-full min-w-[540px] h-auto select-none"
                role="img"
                aria-label="Courbe combinée pH, chlore libre, température de l'eau et ajouts de produits"
              >
                {/* Ideal pH band 7.0 - 7.4 */}
                {showPh && (
                  <rect
                    x={padL}
                    y={phIdealTop}
                    width={innerW}
                    height={Math.max(4, phIdealBottom - phIdealTop)}
                    fill="#DCFCE7"
                    opacity={0.65}
                  />
                )}

                {/* Left pH Axis Grid */}
                {[6.4, 6.8, 7.2, 7.6, 8.0, 8.4].map((phTick) => {
                  const y = yForPh(phTick);
                  return (
                    <g key={phTick}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={w - padR}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth={1}
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-sky-700 text-[11px] font-mono"
                      >
                        {phTick.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Right Axis: Temperature (°C) & Free Chlorine (mg/L) */}
                {[0, 0.33, 0.66, 1].map((ratio, idx) => {
                  const tVal = tempMin + (tempMax - tempMin) * ratio;
                  const clVal = clMin + (clMax - clMin) * ratio;
                  const y = padT + innerH - ratio * innerH;
                  return (
                    <g key={idx}>
                      {showTemp && (
                        <text
                          x={w - padR + 8}
                          y={y + 4}
                          textAnchor="start"
                          className="fill-amber-700 text-[11px] font-mono"
                        >
                          {Math.round(tVal)}°C
                        </text>
                      )}
                      {showChlorine && (
                        <text
                          x={w - 6}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-violet-700 text-[11px] font-mono"
                        >
                          {clVal.toFixed(1)}mg
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Season May–October month labels when in Saison mode */}
                {rangeMode === "saison" &&
                  seasonMonthTicks.map((mt) => (
                    <g key={mt.label}>
                      <line
                        x1={mt.x}
                        y1={padT}
                        x2={mt.x}
                        y2={hDual - padB}
                        stroke="#F1F5F9"
                        strokeWidth={1}
                      />
                      <text
                        x={mt.x + 12}
                        y={hDual - 8}
                        textAnchor="start"
                        className="fill-slate-500 text-[11px] font-medium"
                      >
                        {mt.label}
                      </text>
                    </g>
                  ))}

                {/* Vertical Product Event Markers */}
                {recentTreatments.map((tr) => {
                  const x = xForTime(tr.timestamp);
                  const isSelected = hoveredTreatmentId === tr.id;
                  const tagText = shortTreatmentTag(tr);
                  const tagWidth = Math.max(52, tagText.length * 6.5 + 14);
                  return (
                    <g
                      key={tr.id}
                      onMouseEnter={() => {
                        setHoveredTreatmentId(tr.id);
                        setHoveredDualIdx(null);
                      }}
                      onClick={() => {
                        setHoveredTreatmentId(tr.id);
                        setHoveredDualIdx(null);
                      }}
                      className="cursor-pointer"
                    >
                      <line
                        x1={x}
                        y1={padT}
                        x2={x}
                        y2={hDual - padB}
                        stroke={isSelected ? "#059669" : "#10B981"}
                        strokeWidth={isSelected ? 2 : 1.25}
                        strokeDasharray="4 3"
                      />
                      <rect
                        x={x - tagWidth / 2}
                        y={hDual - padB + 4}
                        width={tagWidth}
                        height={19}
                        rx={5}
                        fill={isSelected ? "#047857" : "#ECFDF5"}
                        stroke="#10B981"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={hDual - padB + 17}
                        textAnchor="middle"
                        className={`text-[10px] font-semibold ${
                          isSelected ? "fill-white" : "fill-emerald-800"
                        }`}
                      >
                        {tagText}
                      </text>
                    </g>
                  );
                })}

                {/* Temperature Line */}
                {showTemp && tempPoints.length > 1 && (
                  <path
                    d={tempPath}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    strokeLinecap="round"
                  />
                )}

                {/* Free Chlorine Line */}
                {showChlorine && clPoints.length > 1 && (
                  <path
                    d={clPath}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {/* pH Line */}
                {showPh && phPoints.length > 1 && (
                  <path
                    d={phPath}
                    fill="none"
                    stroke="#0284C7"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {/* Temperature Points */}
                {showTemp &&
                  tempPoints.map((pt) => {
                    const x = xForTime(pt.timestamp);
                    const y = yForTemp(pt.temperature as number);
                    return (
                      <circle
                        key={`t-${pt.id}`}
                        cx={x}
                        cy={y}
                        r={4}
                        fill="#D97706"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                    );
                  })}

                {/* Free Chlorine Points */}
                {showChlorine &&
                  clPoints.map((pt) => {
                    const x = xForTime(pt.timestamp);
                    const y = yForCl(pt.values.freeChlorine as number);
                    return (
                      <circle
                        key={`cl-${pt.id}`}
                        cx={x}
                        cy={y}
                        r={4.2}
                        fill="#7C3AED"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                    );
                  })}

                {/* Interactive Hit Targets + pH Points */}
                {dualPoints.map((pt, idx) => {
                  const x = xForTime(pt.timestamp);
                  const y =
                    showPh && pt.values.ph !== undefined
                      ? yForPh(pt.values.ph)
                      : showChlorine && pt.values.freeChlorine !== undefined
                      ? yForCl(pt.values.freeChlorine)
                      : yForTemp(pt.temperature ?? 24);
                  const isActive = hoveredDualIdx === idx;
                  return (
                    <g
                      key={`d-${pt.id}`}
                      onMouseEnter={() => {
                        setHoveredDualIdx(idx);
                        setHoveredTreatmentId(null);
                      }}
                      onClick={() => {
                        setHoveredDualIdx(idx);
                        setHoveredTreatmentId(null);
                      }}
                      className="cursor-pointer"
                    >
                      <circle cx={x} cy={y} r={16} fill="transparent" />
                      {showPh && pt.values.ph !== undefined && (
                        <circle
                          cx={x}
                          cy={yForPh(pt.values.ph)}
                          r={isActive ? 6.5 : 4.5}
                          fill="#0284C7"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      )}
                      {rangeMode !== "saison" && (
                        <text
                          x={x}
                          y={hDual - 6}
                          textAnchor="middle"
                          className="fill-slate-500 text-[10px]"
                        >
                          {new Intl.DateTimeFormat("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                          }).format(new Date(pt.timestamp))}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Interactive readout bar for combined chart */}
            {hoveredDualIdx !== null && dualPoints[hoveredDualIdx] && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span>
                  {formatDate(dualPoints[hoveredDualIdx].timestamp)} ·{" "}
                  {dualPoints[hoveredDualIdx].source === "camera"
                    ? "Bandelette caméra"
                    : "Saisie manuelle"}
                </span>
                <div className="flex flex-wrap items-center gap-4 font-mono-num font-bold text-slate-900">
                  {dualPoints[hoveredDualIdx].values.ph !== undefined && (
                    <span className="text-sky-700">
                      pH : {dualPoints[hoveredDualIdx].values.ph}
                    </span>
                  )}
                  {dualPoints[hoveredDualIdx].values.freeChlorine !==
                    undefined && (
                    <span className="text-violet-700">
                      Chlore libre :{" "}
                      {dualPoints[hoveredDualIdx].values.freeChlorine} mg/L
                    </span>
                  )}
                  {dualPoints[hoveredDualIdx].temperature !== undefined && (
                    <span className="text-amber-700">
                      Eau : {dualPoints[hoveredDualIdx].temperature} °C
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Clear inspected treatment readout (no "+1 — 1" confusion) */}
            {inspectedTreatment && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                <span>
                  <strong>{inspectedTreatment.productName}</strong> ·{" "}
                  {formatDate(inspectedTreatment.timestamp)}
                </span>
                <span className="font-semibold">
                  Ajout :{" "}
                  <span className="font-mono-num font-bold">
                    {inspectedTreatment.amount}{" "}
                    {formatUnitLabel(
                      inspectedTreatment.amount,
                      inspectedTreatment.unit
                    )}
                  </span>
                  {cleanTreatmentReason(inspectedTreatment)
                    ? ` · ${cleanTreatmentReason(inspectedTreatment)}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detailed Parameter Curve (Chlore libre, pH, Température, TAC, Stabilisant, TH) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Courbe détaillée par paramètre
          </h2>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(
              [
                "freeChlorine",
                "ph",
                "temperature",
                "alkalinity",
                "stabilizer",
                "totalHardness",
              ] as SingleChartKey[]
            ).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedParam(key);
                  setHoveredSingleIdx(null);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedParam === key
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {key === "temperature"
                  ? "Température °C"
                  : PARAMETER_META[key].shortLabel}
              </button>
            ))}
          </div>
        </div>

        {singlePoints.length === 0 ? (
          <div className="h-44 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
            Aucune mesure enregistrée sur cette période.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${w} ${hSingle}`}
                className="w-full min-w-[500px] h-auto select-none"
                role="img"
                aria-label="Courbe détaillée par paramètre"
              >
                {!isTempSingle && singleMeta && (
                  <rect
                    x={sPadL}
                    y={yForSingle(singleMeta.idealMax)}
                    width={sInnerW}
                    height={Math.max(
                      4,
                      yForSingle(singleMeta.idealMin) -
                        yForSingle(singleMeta.idealMax)
                    )}
                    fill="#DCFCE7"
                    opacity={0.65}
                  />
                )}

                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const val = sMin + (sMax - sMin) * t;
                  const y = yForSingle(val);
                  return (
                    <g key={t}>
                      <line
                        x1={sPadL}
                        y1={y}
                        x2={w - sPadR}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth={1}
                      />
                      <text
                        x={sPadL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-500 text-[11px] font-mono"
                      >
                        {Number.isInteger(val) ? val : val.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Product treatment lines */}
                {recentTreatments.map((tr) => {
                  const x = xForSingleTime(tr.timestamp);
                  return (
                    <line
                      key={`sl-${tr.id}`}
                      x1={x}
                      y1={sPadT}
                      x2={x}
                      y2={hSingle - sPadB}
                      stroke="#10B981"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {singlePoints.length > 1 && (
                  <path
                    d={singlePath}
                    fill="none"
                    stroke={isTempSingle ? "#D97706" : "#0284C7"}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {singlePoints.map((pt, idx) => {
                  const x = xForSingleTime(pt.timestamp);
                  const y = yForSingle(pt.value);
                  const isActive = hoveredSingleIdx === idx;
                  return (
                    <g
                      key={pt.id}
                      onMouseEnter={() => setHoveredSingleIdx(idx)}
                      onClick={() => setHoveredSingleIdx(idx)}
                      className="cursor-pointer"
                    >
                      <circle cx={x} cy={y} r={14} fill="transparent" />
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive ? 6 : 4.5}
                        fill={isTempSingle ? "#D97706" : "#0284C7"}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {hoveredSingleIdx !== null && singlePoints[hoveredSingleIdx] && (
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span>
                  {formatDate(singlePoints[hoveredSingleIdx].timestamp)}
                </span>
                <span className="font-mono-num font-bold text-slate-900">
                  {singlePoints[hoveredSingleIdx].value}{" "}
                  {isTempSingle ? "°C" : singleMeta?.unit}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Combined Timeline Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Journal des analyses et produits ajoutés
          </h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
            {(
              [
                { id: "tous", label: "Tout" },
                { id: "analyses", label: "Analyses" },
                { id: "traitements", label: "Produits ajoutés" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimelineFilter(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  timelineFilter === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Aucune entrée enregistrée pour ce filtre.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {timelineItems.map((item) => {
              if (item.kind === "analyse") {
                const m = item.data;
                return (
                  <div
                    key={m.id}
                    className="py-4 flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 mt-0.5">
                        {m.source === "camera" ? (
                          <Camera className="w-4 h-4" />
                        ) : (
                          <Edit3 className="w-4 h-4" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-900 text-sm">
                            {m.source === "camera"
                              ? "Analyse bandelette caméra"
                              : "Analyse manuelle"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(m.timestamp)}</span>
                          {m.authorName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>par {m.authorName}</span>
                            </>
                          )}
                          {m.temperature !== undefined && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num font-semibold text-amber-700">
                                {m.temperature} °C
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono-num text-slate-700">
                          {Object.entries(m.values).map(([k, val]) => {
                            const pm = PARAMETER_META[k as ParameterKey];
                            if (!pm || val === undefined) return null;
                            return (
                              <span key={k}>
                                {pm.shortLabel}:{" "}
                                <strong className="text-slate-900">{val}</strong>{" "}
                                {pm.unit !== "pH" ? pm.unit : ""}
                              </span>
                            );
                          })}
                        </div>
                        {m.notes && (
                          <p className="text-xs text-slate-500">{m.notes}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="Supprimer cette analyse"
                      onClick={() => onDeleteMeasurement(m.id)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              }

              const t = item.data;
              const reasonClean = cleanTreatmentReason(t);
              return (
                <div
                  key={t.id}
                  className="py-4 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Droplets className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-900 text-sm">
                          {t.productName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num font-semibold text-emerald-700">
                          Ajout : {t.amount} {formatUnitLabel(t.amount, t.unit)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(t.timestamp)}</span>
                        {t.authorName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>par {t.authorName}</span>
                          </>
                        )}
                      </div>
                      {reasonClean && (
                        <p className="text-xs text-slate-600">{reasonClean}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Supprimer ce traitement"
                    onClick={() => onDeleteTreatment(t.id)}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
