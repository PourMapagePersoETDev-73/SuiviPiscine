import React, { useState } from "react";
import { Download, Monitor, Smartphone, WifiOff, X } from "lucide-react";
import { useOnlineStatus, usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  variant?: "compact" | "card";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = "compact",
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === "card"
            ? "w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            : "min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
        }
      >
        <Download className="w-3.5 h-3.5 text-sky-600" />
        <span>
          {isInstallable
            ? "Installer l'app"
            : isIOS
            ? "Installer sur iPhone"
            : "Installer / Ouvrir sur PC"}
        </span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Installer Suivi Piscine (Mobile &amp; PC)
                </h2>
                <p className="text-xs text-slate-500">
                  Accédez au même bassin sur smartphone au bord de l'eau et en grand écran sur PC.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Fermer"
                className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <p>1. Ouvrez le lien partagé dans <strong>Safari</strong> (pas dans l'aperçu WhatsApp).</p>
                <p>2. Touchez le bouton <strong>Partager</strong> (carré avec flèche vers le haut).</p>
                <p>3. Choisissez <strong>Sur l'écran d'accueil</strong> puis validez.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>Android 14 / 16 (Chrome)</span>
                </div>
                <p>1. Ouvrez le lien partagé dans <strong>Google Chrome</strong>.</p>
                <p>
                  2. Touchez le menu <strong>⋮</strong> en haut à droite →{" "}
                  <strong>Ajouter à l'écran d'accueil</strong> (ou <em>Installer l'application</em>).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                  <Monitor className="w-4 h-4 text-sky-700" />
                  <span>Sur votre PC (grand écran)</span>
                </div>
                <p>
                  Ouvrez simplement l'URL publiée dans Chrome, Edge ou Firefox sur votre ordinateur et
                  connectez-vous avec le même compte Google : tous vos graphiques et historiques
                  s'affichent en grand format. Sous Chrome/Edge, vous pouvez aussi cliquer sur
                  l'icône <strong>Installer</strong> à droite de la barre d'adresse pour l'avoir en
                  application de bureau.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 md:bottom-6 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Hors ligne — Données en cache affichées</span>
    </div>
  );
};
