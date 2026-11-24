import React, { useState } from "react";
import { Check, Thermometer, X } from "lucide-react";
import { PARAMETER_META } from "../data/poolCatalog";
import { ParameterKey, PoolProfile, WaterMeasurement } from "../types/pool";

interface ManualEntryModalProps {
  pool: PoolProfile;
  latest?: WaterMeasurement;
  onSave: (measurement: WaterMeasurement) => void;
  onClose: () => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  pool,
  latest,
  onSave,
  onClose,
}) => {
  const keys: ParameterKey[] = [
    "freeChlorine",
    "ph",
    "alkalinity",
    "stabilizer",
    "totalHardness",
  ];

  const [temperature, setTemperature] = useState<string>(
    String(latest?.temperature ?? pool.temperatureC)
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const k of keys) {
      const prev = latest?.values[k];
      initial[k] = prev !== undefined ? String(prev) : "";
    }
    return initial;
  });
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Partial<Record<ParameterKey, number>> = {};
    for (const k of keys) {
      const num = parseFloat((values[k] || "").replace(",", "."));
      if (!Number.isNaN(num)) {
        parsed[k] = num;
      }
    }
    const parsedTemp = parseFloat(temperature.replace(",", "."));
    const hasTemp = !Number.isNaN(parsedTemp);
    if (Object.keys(parsed).length === 0 && !hasTemp) return;

    onSave({
      id: `m-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: "manuel",
      temperature: hasTemp ? Number(parsedTemp.toFixed(1)) : undefined,
      values: parsed,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Saisie manuelle (AquaChek & °C)
            </h2>
            <p className="text-xs text-slate-500">
              Enregistrez vos valeurs chimiques et la température de l'eau.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="manual-temperature"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1"
              >
                <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                <span>Température de l'eau (°C)</span>
              </label>
              <input
                id="manual-temperature"
                type="number"
                step="0.5"
                min="5"
                max="42"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="Ex. : 26.0"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/40 font-mono-num text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {keys.map((k) => {
              const meta = PARAMETER_META[k];
              return (
                <div key={k}>
                  <label
                    htmlFor={`manual-${k}`}
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    {meta.label} ({meta.unit})
                  </label>
                  <input
                    id={`manual-${k}`}
                    type="number"
                    step={meta.step}
                    min={meta.min}
                    max={meta.max}
                    value={values[k] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    placeholder={`Cible ${meta.idealMin}–${meta.idealMax}`}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 font-mono-num text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="manual-notes"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Notes (optionnel)
            </label>
            <input
              id="manual-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. : Mis 1 galet de chlore lent hier soir"
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
