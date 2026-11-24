import React, { useState } from "react";
import { Check, Copy, Smartphone, Users, X } from "lucide-react";
import { SharedPoolRecord } from "../types/pool";
import { PWAInstallButton } from "./PWAInstallButton";

interface SharePoolModalProps {
  pool: SharedPoolRecord;
  onJoinAnotherPool: (code: string) => Promise<void>;
  onClose: () => void;
}

export const SharePoolModal: React.FC<SharePoolModalProps> = ({
  pool,
  onJoinAnotherPool,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?pool=${pool.id}`;

  const copyText = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "link") {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2500);
      } else {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2500);
      }
    } catch {
      // Clipboard blocked in some embedded contexts
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await onJoinAnotherPool(joinInput);
      setJoinInput("");
      onClose();
    } catch (err: unknown) {
      setJoinError(
        err instanceof Error ? err.message : "Impossible de rejoindre ce bassin."
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Partager le bassin (famille &amp; amis)
            </h2>
            <p className="text-xs text-slate-500">
              Toutes les mesures et ajouts de galets sont synchronisés en temps réel (Android &amp; iPhone).
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

        {/* Connected count */}
        <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-sky-700 shrink-0" />
            <span className="text-xs font-semibold text-slate-900">
              Membres connectés à « {pool.name} » ({pool.volumeM3} m³)
            </span>
          </div>
          <span className="font-mono-num text-sm font-bold text-sky-800">
            {pool.memberIds.length} / 10
          </span>
        </div>

        {/* Direct Invite Link */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            1. Envoyez ce lien à votre famille ou vos amis (WhatsApp, SMS, mail)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={() => copyText(shareUrl, "link")}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? "Copié" : "Copier"}</span>
            </button>
          </div>
        </div>

        {/* Pool Code */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Ou donnez simplement ce code bassin
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={pool.id}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm font-bold text-slate-900"
            />
            <button
              type="button"
              onClick={() => copyText(pool.id, "code")}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? "Copié" : "Code"}</span>
            </button>
          </div>
        </div>

        {/* Install on smartphone & PC tip */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Smartphone className="w-4 h-4 text-slate-700" />
            <span>Installer sur iPhone, Android 14 / 16 et PC</span>
          </div>
          <p>
            • <strong>iPhone (Safari)</strong> : bouton Partager → <em>Sur l'écran d'accueil</em>.
          </p>
          <p>
            • <strong>Android 14 / 16 (Chrome)</strong> : menu ⋮ → <em>Ajouter à l'écran d'accueil</em>.
          </p>
          <p>
            • <strong>PC (grand écran)</strong> : ouvrez simplement le même lien ci-dessus dans Chrome,
            Edge ou Firefox et connectez-vous avec votre compte Google.
          </p>
          <div className="pt-1">
            <PWAInstallButton variant="card" />
          </div>
          <p className="pt-0.5 text-slate-500">
            Jusqu'à 10 comptes Google peuvent partager ce même bassin. Chaque capteur photo étant
            différent, utilisez « Étalonner blanc » (et le point noir si fort soleil) sur chaque
            photo, ou la saisie manuelle.
          </p>
        </div>

        {/* Join a different pool */}
        <form onSubmit={handleJoinSubmit} className="pt-3 border-t border-slate-100 space-y-2.5">
          <label className="block text-xs font-semibold text-slate-700">
            Rejoindre un autre bassin avec un code ou lien
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Collez le code ou le lien..."
              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
            <button
              type="submit"
              disabled={joining || !joinInput.trim()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
            >
              {joining ? "Connexion..." : "Rejoindre"}
            </button>
          </div>
          {joinError && <p className="text-xs text-red-700">{joinError}</p>}
        </form>
      </div>
    </div>
  );
};
