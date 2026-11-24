import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Droplets,
  Edit3,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  TrendingUp,
  Users,
} from "lucide-react";
import { PARAMETER_META } from "../data/poolCatalog";
import {
  DosageRecommendation,
  ParameterKey,
  PoolProfile,
  ProductCategory,
  TreatmentLogEntry,
  WaterMeasurement,
  WaterVisualState,
} from "../types/pool";
import {
  computeDosagePlan,
  evaluateParameterStatus,
  getChlorineActivityPercent,
  getRecommendedFiltration,
} from "../utils/chemistry";
import { GaugeSegment, ParameterArcGauge } from "./ParameterArcGauge";

const GAUGE_CONFIG: Record<
  ParameterKey,
  { min: number; max: number; segments: GaugeSegment[] }
> = {
  freeChlorine: {
    min: 0,
    max: 5,
    segments: [
      { from: 0, to: 0.5, color: "#EF4444" },
      { from: 0.5, to: 1.0, color: "#F59E0B" },
      { from: 1.0, to: 3.0, color: "#10B981" },
      { from: 3.0, to: 4.0, color: "#F59E0B" },
      { from: 4.0, to: 5.0, color: "#EF4444" },
    ],
  },
  totalChlorine: {
    min: 0,
    max: 5,
    segments: [
      { from: 0, to: 0.5, color: "#EF4444" },
      { from: 0.5, to: 1.0, color: "#F59E0B" },
      { from: 1.0, to: 3.0, color: "#10B981" },
      { from: 3.0, to: 5.0, color: "#EF4444" },
    ],
  },
  ph: {
    min: 6.2,
    max: 8.4,
    segments: [
      { from: 6.2, to: 6.8, color: "#EF4444" },
      { from: 6.8, to: 7.0, color: "#F59E0B" },
      { from: 7.0, to: 7.4, color: "#10B981" },
      { from: 7.4, to: 7.8, color: "#F59E0B" },
      { from: 7.8, to: 8.4, color: "#EF4444" },
    ],
  },
  alkalinity: {
    min: 0,
    max: 220,
    segments: [
      { from: 0, to: 50, color: "#EF4444" },
      { from: 50, to: 80, color: "#F59E0B" },
      { from: 80, to: 120, color: "#10B981" },
      { from: 120, to: 180, color: "#F59E0B" },
      { from: 180, to: 220, color: "#EF4444" },
    ],
  },
  totalHardness: {
    min: 0,
    max: 500,
    segments: [
      { from: 0, to: 100, color: "#F59E0B" },
      { from: 100, to: 300, color: "#10B981" },
      { from: 300, to: 500, color: "#EF4444" },
    ],
  },
  stabilizer: {
    min: 0,
    max: 150,
    segments: [
      { from: 0, to: 30, color: "#F59E0B" },
      { from: 30, to: 50, color: "#10B981" },
      { from: 50, to: 100, color: "#34D399" },
      { from: 100, to: 150, color: "#EF4444" },
    ],
  },
};

const TEMP_GAUGE_SEGMENTS: GaugeSegment[] = [
  { from: 12, to: 20, color: "#38BDF8" },
  { from: 20, to: 28, color: "#10B981" },
  { from: 28, to: 35, color: "#F59E0B" },
];

interface DashboardViewProps {
  pool: PoolProfile;
  measurements: WaterMeasurement[];
  treatments: TreatmentLogEntry[];
  memberCount?: number;
  onOpenScanner: () => void;
  onOpenManualEntry: () => void;
  onOpenPoolSettings: () => void;
  onOpenSharePool?: () => void;
  onOpenHistory: () => void;
  onUpdateVisualState: (state: WaterVisualState) => void;
  onApplyRecommendation: (rec: DosageRecommendation, appliedAmount?: number) => void;
  onQuickDoseProduct: (
    category: ProductCategory,
    defaultAmount: number,
    unit: string,
    reason: string
  ) => void;
}

const POOL_BANNER_IMAGE = "./src/assets/images/pool_daylight_header_1795288678228.jpg";

export const DashboardView: React.FC<DashboardViewProps> = ({
  pool,
  measurements,
  treatments,
  memberCount,
  onOpenScanner,
  onOpenManualEntry,
  onOpenPoolSettings,
  onOpenSharePool,
  onOpenHistory,
  onUpdateVisualState,
  onApplyRecommendation,
  onQuickDoseProduct,
}) => {
  const latest = measurements[0];
  const previous = measurements[1];
  const recommendations = computeDosagePlan(pool, latest);

  const [customDoses, setCustomDoses] = useState<Record<string, string>>({});

  useEffect(() => {
    setCustomDoses({});
  }, [latest?.id, pool.volumeM3, pool.visualState]);

  const displayKeys: ParameterKey[] = [
    "freeChlorine",
    "ph",
    "alkalinity",
    "stabilizer",
  ];

  const lastDateLabel = latest
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(latest.timestamp))
    : "Aucune analyse";

  const latestTemp = latest?.temperature ?? pool.temperatureC;
  const filtrationAdvice = getRecommendedFiltration(latestTemp);
  const prevTemp = previous?.temperature;
  const tempDelta =
    prevTemp !== undefined ? Number((latestTemp - prevTemp).toFixed(1)) : null;

  const phVal = latest?.values.ph;
  const chlorineEfficiency =
    phVal !== undefined ? getChlorineActivityPercent(phVal) : null;

  const lastSlowChlorine = treatments.find((t) => t.category === "chlore_lent");
  const lastSlowChlorineLabel = lastSlowChlorine
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(new Date(lastSlowChlorine.timestamp))
    : "Aucun";

  const criticalCount = recommendations.filter((r) => r.status === "critique").length;
  const attentionCount = recommendations.filter((r) => r.status === "attention").length;

  return (
    <div className="space-y-6">
      {/* Top 2-Column Pool Hero + Equilibrium Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Pool Visual Card */}
        <div className="hero-pool-card lg:col-span-7 relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 min-h-[240px] flex flex-col justify-between">
          <img
            src={POOL_BANNER_IMAGE}
            alt="Vue de la piscine"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/45 to-slate-950/25" />

          <div className="relative z-10 p-5 sm:p-6 flex items-start justify-between gap-4">
            <div className="text-white/90 text-xs font-medium flex flex-wrap items-center gap-2">
              <span className="font-mono-num">{pool.volumeM3} m³</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{pool.coating}</span>
              <span aria-hidden="true">·</span>
              <span>
                {pool.disinfectant === "sel" ? "Électrolyse sel" : "Chlore"}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{latestTemp} °C</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenSharePool && (
                <button
                  type="button"
                  onClick={onOpenSharePool}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Partager{memberCount ? ` (${memberCount})` : ""}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenPoolSettings}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Bassin</span>
              </button>
            </div>
          </div>

          <div className="relative z-10 p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {pool.name}
              </h1>
              <p className="text-xs text-slate-200 mt-1">
                Dernier relevé : {lastDateLabel}
                {latest
                  ? ` · ${latest.source === "camera" ? "AquaChek caméra" : "Saisie manuelle"}${
                      latest.authorName ? ` · par ${latest.authorName}` : ""
                    }`
                  : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenScanner}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4" />
                <span>Scanner AquaChek</span>
              </button>

              <button
                type="button"
                onClick={onOpenManualEntry}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Edit3 className="w-4 h-4" />
                <span>Saisie manuelle / °C</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Water Clarity & Quick Product Log */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Diagnostic de l'eau
              </h2>
              {criticalCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{criticalCount} action urgente</span>
                </span>
              ) : attentionCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Droplets className="w-3.5 h-3.5" />
                  <span>{attentionCount} ajustement{attentionCount > 1 ? "s" : ""}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Équilibre optimal</span>
                </span>
              )}
            </div>

            {chlorineEfficiency !== null && phVal !== undefined && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    Efficacité du chlore à pH{" "}
                    <span className="font-mono-num font-semibold text-slate-900">
                      {phVal.toFixed(1)}
                    </span>
                  </span>
                  <span className="font-mono-num text-sm font-bold text-slate-900">
                    {chlorineEfficiency} %
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-200/70">
                  <span className="text-xs text-slate-600">
                    Filtration conseillée ({latestTemp} °C)
                  </span>
                  <span
                    className={`font-mono-num text-xs font-bold ${
                      filtrationAdvice.isContinuous ? "text-amber-700" : "text-slate-900"
                    }`}
                  >
                    {filtrationAdvice.shortLabel}
                  </span>
                </div>
              </div>
            )}

            {/* Quick 1-Tap Product Actions (especially 1 galet de chlore lent!) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  Ajout rapide au bassin
                </span>
                <span>Dernier galet : {lastSlowChlorineLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onQuickDoseProduct(
                      "chlore_lent",
                      1,
                      "galets",
                      "Placé dans le skimmer"
                    )
                  }
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>1 galet chlore lent</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQuickDoseProduct(
                      "desalgine",
                      0.2,
                      "L",
                      "Dose hebdomadaire de Désalgine (200 mL)"
                    )
                  }
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>200 mL Désalgine</span>
                </button>
              </div>
            </div>
          </div>

          {/* Aspect visuel de l'eau selector */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="block text-xs font-medium text-slate-700">
              Aspect visuel actuel du bassin
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  { id: "limpide", label: "Limpide" },
                  { id: "trouble", label: "Trouble" },
                  { id: "verte", label: "Verte" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateVisualState(opt.id)}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    pool.visualState === opt.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Cards Grid (4 chemical + Water Temperature) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            Paramètres AquaChek et température
          </h2>
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline whitespace-nowrap"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Courbes pH, chlore &amp; °C</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5">
          {displayKeys.map((key) => {
            const meta = PARAMETER_META[key];
            const val = latest?.values[key];
            const prevVal = previous?.values[key];
            const { status, label } = evaluateParameterStatus(key, val);
            const gaugeCfg = GAUGE_CONFIG[key];

            const statusBarClass =
              status === "optimal"
                ? "bg-emerald-600 text-white"
                : status === "critique"
                ? "bg-red-600 text-white"
                : "bg-amber-500 text-white";

            const delta =
              val !== undefined && prevVal !== undefined
                ? Number((val - prevVal).toFixed(2))
                : null;

            return (
              <div
                key={key}
                className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {meta.shortLabel}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span className="font-mono-num text-[11px] text-slate-500 shrink-0">
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>

                <ParameterArcGauge
                  value={val}
                  min={gaugeCfg.min}
                  max={gaugeCfg.max}
                  unit={meta.unit}
                  segments={gaugeCfg.segments}
                />

                <div className="space-y-1.5 text-center">
                  <div
                    className={`w-full py-1 px-2 rounded-lg text-[11px] font-bold tracking-tight ${statusBarClass}`}
                  >
                    {label}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-num">
                    {key === "stabilizer"
                      ? "Idéal 30–50 · OK ≤ 100"
                      : `Cible ${meta.idealMin}–${meta.idealMax}`}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Water Temperature & Filtration Card */}
          <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                <span>Eau &amp; Filtration</span>
              </span>
              {tempDelta !== null && tempDelta !== 0 && (
                <span className="font-mono-num text-[11px] text-slate-500">
                  {tempDelta > 0 ? `+${tempDelta}` : tempDelta}°
                </span>
              )}
            </div>

            <ParameterArcGauge
              value={latestTemp}
              min={12}
              max={35}
              unit="°C"
              segments={TEMP_GAUGE_SEGMENTS}
            />

            <div className="space-y-1.5 text-center">
              <div
                className={`w-full py-1 px-2 rounded-lg text-[11px] font-bold tracking-tight ${
                  filtrationAdvice.isContinuous
                    ? "bg-amber-500 text-white"
                    : "bg-sky-600 text-white"
                }`}
              >
                Filtration : {filtrationAdvice.shortLabel}
              </div>
              <div className="text-[11px] text-slate-500">
                {latestTemp >= 28
                  ? "Eau chaude (continu)"
                  : latestTemp >= 22
                  ? "Baignade idéale"
                  : "Eau fraîche"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step-by-Step Dosage Prescription */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Ordonnance de traitement ({pool.volumeM3} m³)
          </h2>
          <span className="text-xs text-slate-500">
            Ordre recommandé : TAC → pH → Désinfectant → Anti-algues
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Aucun correctif chimique urgent
              </h3>
              <p className="text-sm text-slate-600 mt-0.5">
                L'eau est équilibrée. Pensez simplement à vérifier les galets de chlore lent et le
                lavage du filtre chaque semaine.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.map((rec) => {
              const isCritical = rec.status === "critique";
              const rawInput =
                customDoses[rec.id] !== undefined
                  ? customDoses[rec.id]
                  : String(rec.recommendedAmount);
              const parsedInput = parseFloat(rawInput.replace(",", "."));
              const isValidAmount =
                !Number.isNaN(parsedInput) && parsedInput > 0;

              return (
                <div
                  key={rec.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold text-slate-900">
                        {rec.title}
                      </h3>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          isCritical ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        {isCritical ? "Prioritaire" : "Recommandation"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 font-mono-num">
                      <span>Actuel : {rec.currentValueText}</span>
                      <span aria-hidden="true">→</span>
                      <span>Cible : {rec.targetValueText}</span>
                    </div>

                    <p className="text-sm font-semibold text-sky-700">
                      Recommandation : {rec.actionSummary}
                    </p>

                    <p className="text-sm text-slate-600 leading-relaxed">
                      {rec.explanation}
                    </p>

                    {rec.safetyNote && (
                      <p className="text-xs text-slate-500 pt-1">
                        Conseil : {rec.safetyNote}
                      </p>
                    )}
                  </div>

                  {rec.category !== "autre" && (
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <label
                            htmlFor={`dose-${rec.id}`}
                            className="block text-[11px] font-medium text-slate-600 mb-1"
                          >
                            Dose appliquée (modifiable)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              id={`dose-${rec.id}`}
                              type="number"
                              step="any"
                              min="0.01"
                              value={rawInput}
                              onChange={(e) =>
                                setCustomDoses((prev) => ({
                                  ...prev,
                                  [rec.id]: e.target.value,
                                }))
                              }
                              className="w-24 min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono-num text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <span className="text-xs font-semibold text-slate-600">
                              {rec.recommendedUnit}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!isValidAmount}
                        onClick={() => onApplyRecommendation(rec, parsedInput)}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                      >
                        <span>J'ai appliqué ce dosage</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
