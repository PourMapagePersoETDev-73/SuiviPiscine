import React, { useState } from "react";
import { Calculator, Check, X } from "lucide-react";
import { DisinfectantType, PoolCoating, PoolProfile } from "../types/pool";

interface PoolSettingsModalProps {
  pool: PoolProfile;
  onSave: (nextPool: PoolProfile) => void;
  onClose: () => void;
}

export const PoolSettingsModal: React.FC<PoolSettingsModalProps> = ({
  pool,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(pool.name);
  const [volumeM3, setVolumeM3] = useState(String(pool.volumeM3));
  const [coating, setCoating] = useState<PoolCoating>(pool.coating);
  const [disinfectant, setDisinfectant] = useState<DisinfectantType>(
    pool.disinfectant
  );
  const [temperatureC, setTemperatureC] = useState(String(pool.temperatureC));

  // Optional volume calculator helper
  const [showCalc, setShowCalc] = useState(false);
  const [lenM, setLenM] = useState("8");
  const [widM, setWidM] = useState("4");
  const [depthM, setDepthM] = useState("1.4");

  const applyCalculatedVolume = () => {
    const l = parseFloat(lenM.replace(",", ".")) || 0;
    const w = parseFloat(widM.replace(",", ".")) || 0;
    const d = parseFloat(depthM.replace(",", ".")) || 0;
    const vol = Math.max(1, Math.round(l * w * d));
    setVolumeM3(String(vol));
    setShowCalc(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...pool,
      name: name.trim() || "Ma Piscine",
      volumeM3: Math.max(1, Number(volumeM3) || 40),
      coating,
      disinfectant,
      temperatureC: Math.max(5, Math.min(42, Number(temperatureC) || 24)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Paramètres du bassin
            </h2>
            <p className="text-xs text-slate-500">
              Le volume et la température ajustent automatiquement tous vos dosages.
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nom du bassin
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Volume (m³)
                </label>
                <button
                  type="button"
                  onClick={() => setShowCalc((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
                >
                  <Calculator className="w-3 h-3" />
                  <span>Calculer</span>
                </button>
              </div>
              <input
                type="number"
                min="1"
                max="500"
                value={volumeM3}
                onChange={(e) => setVolumeM3(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 font-mono-num text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Température eau (°C)
              </label>
              <input
                type="number"
                min="5"
                max="42"
                value={temperatureC}
                onChange={(e) => setTemperatureC(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 font-mono-num text-sm"
              />
            </div>
          </div>

          {showCalc && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <p className="text-xs font-semibold text-slate-800">
                Calculateur rectangulaire (L × l × prof. moy.)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={lenM}
                  onChange={(e) => setLenM(e.target.value)}
                  placeholder="Long. (m)"
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-num"
                />
                <input
                  type="number"
                  step="0.1"
                  value={widM}
                  onChange={(e) => setWidM(e.target.value)}
                  placeholder="Larg. (m)"
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-num"
                />
                <input
                  type="number"
                  step="0.1"
                  value={depthM}
                  onChange={(e) => setDepthM(e.target.value)}
                  placeholder="Prof. (m)"
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-num"
                />
              </div>
              <button
                type="button"
                onClick={applyCalculatedVolume}
                className="w-full min-h-[36px] rounded-lg bg-slate-900 text-white text-xs font-semibold"
              >
                Appliquer ce volume
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Revêtement
              </label>
              <select
                value={coating}
                onChange={(e) => setCoating(e.target.value as PoolCoating)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="liner">Liner</option>
                <option value="coque">Coque polyester</option>
                <option value="carrelage">Carrelage / Mosaïque</option>
                <option value="beton">Béton peint</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Traitement principal
              </label>
              <select
                value={disinfectant}
                onChange={(e) =>
                  setDisinfectant(e.target.value as DisinfectantType)
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="chlore">Chlore (galets / liquide)</option>
                <option value="sel">Électrolyseur au sel</option>
              </select>
            </div>
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
