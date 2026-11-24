import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Erreur inattendue dans l'application.",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Application ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.message;
      if (friendlyMsg.includes("Missing or insufficient permissions")) {
        friendlyMsg =
          "Accès refusé par les règles de sécurité. Vérifiez que votre compte est bien connecté et membre du bassin.";
      } else if (friendlyMsg.includes("Quota exceeded")) {
        friendlyMsg =
          "Quota quotidien Firestore dépassé. Le quota gratuit se réinitialise demain.";
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-slate-900">
                Une erreur est survenue
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                {friendlyMsg}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-slate-800"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recharger l'application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
