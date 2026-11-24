import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import {
  Activity,
  Camera,
  CheckCircle2,
  FlaskConical,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { DashboardView } from "./components/DashboardView";
import { HistoryView } from "./components/HistoryView";
import { ManualEntryModal } from "./components/ManualEntryModal";
import { PoolSettingsModal } from "./components/PoolSettingsModal";
import { ProductsView } from "./components/ProductsView";
import { OfflineIndicator, PWAInstallButton } from "./components/PWAInstallButton";
import { SharePoolModal } from "./components/SharePoolModal";
import { StripScanner } from "./components/StripScanner";
import { THEME_OPTIONS, ThemeSwitcher } from "./components/ThemeSwitcher";
import {
  DEFAULT_POOL_PROFILE,
  INITIAL_MEASUREMENTS,
  INITIAL_PRODUCTS,
  INITIAL_TREATMENTS,
} from "./data/poolCatalog";
import { auth, googleProvider } from "./lib/firebase";
import {
  addMeasurementFs,
  addProductFs,
  addTreatmentFs,
  createSharedPool,
  deleteMeasurementFs,
  deleteProductFs,
  deleteTreatmentFs,
  extractPoolCode,
  joinSharedPool,
  subscribePoolSubcollections,
  subscribeUserPools,
  syncPoolMembersToSubcollections,
  updatePoolSettingsFs,
  updateProductStockFs,
} from "./services/poolFirestore";
import {
  AppTheme,
  DosageRecommendation,
  PoolProduct,
  PoolProfile,
  ProductCategory,
  SharedPoolRecord,
  TreatmentLogEntry,
  WaterMeasurement,
  WaterVisualState,
} from "./types/pool";

type ActiveTab = "dashboard" | "scanner" | "products" | "history";

const STORAGE_KEYS = {
  pool: "limpide_pool_v3",
  measurements: "limpide_measurements_v3",
  products: "limpide_products_v3",
  treatments: "limpide_treatments_v3",
  activePoolId: "limpide_active_pool_id",
  pendingInvite: "limpide_pending_invite",
  theme: "suivi_piscine_theme",
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Auth & Cloud Sync State
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [localDemoMode, setLocalDemoMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Shared Firestore pools
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [userPools, setUserPools] = useState<SharedPoolRecord[]>([]);
  const [activePoolId, setActivePoolId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.activePoolId);
    } catch {
      return null;
    }
  });
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  // Local fallback data (for local demo mode)
  const [localPool, setLocalPool] = useState<PoolProfile>(() =>
    loadStored(STORAGE_KEYS.pool, DEFAULT_POOL_PROFILE)
  );
  const [localMeasurements, setLocalMeasurements] = useState<WaterMeasurement[]>(() =>
    loadStored(STORAGE_KEYS.measurements, INITIAL_MEASUREMENTS)
  );
  const [localProducts, setLocalProducts] = useState<PoolProduct[]>(() =>
    loadStored(STORAGE_KEYS.products, INITIAL_PRODUCTS)
  );
  const [localTreatments, setLocalTreatments] = useState<TreatmentLogEntry[]>(() =>
    loadStored(STORAGE_KEYS.treatments, INITIAL_TREATMENTS)
  );

  // Cloud-synced data for activePool
  const [cloudMeasurements, setCloudMeasurements] = useState<WaterMeasurement[]>([]);
  const [cloudProducts, setCloudProducts] = useState<PoolProduct[]>([]);
  const [cloudTreatments, setCloudTreatments] = useState<TreatmentLogEntry[]>([]);

  const [showManualModal, setShowManualModal] = useState(false);
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === "light" || saved === "gray" || saved === "dark" || saved === "blue") {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return "light";
  });

  const syncedMembersSignatureRef = useRef<string>("");

  // Sync UI theme attribute, meta theme-color, and localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const themeOpt = THEME_OPTIONS.find((t) => t.id === theme);
    if (metaTheme && themeOpt) {
      metaTheme.setAttribute("content", themeOpt.metaThemeColor);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // Ignore storage error
    }
  }, [theme]);

  // Capture ?pool= invite parameter on first load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const invite = params.get("pool");
      if (invite) {
        const clean = extractPoolCode(invite);
        if (clean) {
          localStorage.setItem(STORAGE_KEYS.pendingInvite, clean);
          setJoinCodeInput(clean);
        }
      }
    } catch {
      // Ignore URL errors
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setLocalDemoMode(false);
      }
    });
    return () => unsub();
  }, []);

  // Persist local demo state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.pool, JSON.stringify(localPool));
      localStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(localMeasurements));
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(localProducts));
      localStorage.setItem(STORAGE_KEYS.treatments, JSON.stringify(localTreatments));
    } catch {
      // Ignore storage quota errors
    }
  }, [localPool, localMeasurements, localProducts, localTreatments]);

  // Subscribe to user's shared pools when authenticated
  useEffect(() => {
    if (!user) {
      setUserPools([]);
      setPoolsLoading(false);
      return;
    }

    setPoolsLoading(true);
    const unsub = subscribeUserPools(
      user.uid,
      (pools) => {
        setUserPools(pools);
        setPoolsLoading(false);

        const pendingInvite = (() => {
          try {
            return localStorage.getItem(STORAGE_KEYS.pendingInvite);
          } catch {
            return null;
          }
        })();

        if (pendingInvite) {
          const alreadyMember = pools.find((p) => p.id === pendingInvite);
          if (alreadyMember) {
            setActivePoolId(alreadyMember.id);
            try {
              localStorage.removeItem(STORAGE_KEYS.pendingInvite);
              localStorage.setItem(STORAGE_KEYS.activePoolId, alreadyMember.id);
            } catch {
              // Ignore
            }
          } else {
            // Auto-join invited pool once signed in
            joinSharedPool(user, pendingInvite)
              .then((joinedId) => {
                setActivePoolId(joinedId);
                try {
                  localStorage.removeItem(STORAGE_KEYS.pendingInvite);
                  localStorage.setItem(STORAGE_KEYS.activePoolId, joinedId);
                } catch {
                  // Ignore
                }
                showToast("Connecté au bassin partagé !");
              })
              .catch((err) => {
                setOnboardingError(
                  err instanceof Error ? err.message : "Code bassin invalide."
                );
              });
          }
        } else if (pools.length > 0) {
          setActivePoolId((curr) => {
            if (curr && pools.some((p) => p.id === curr)) return curr;
            const nextId = pools[0].id;
            try {
              localStorage.setItem(STORAGE_KEYS.activePoolId, nextId);
            } catch {
              // Ignore
            }
            return nextId;
          });
        }
      },
      (err) => {
        setPoolsLoading(false);
        setOnboardingError(
          err instanceof Error ? err.message : "Erreur de connexion Firestore."
        );
      }
    );

    return () => unsub();
  }, [user]);

  const activeCloudPool = userPools.find((p) => p.id === activePoolId) ?? userPools[0] ?? null;

  // Subscribe to subcollections of activeCloudPool & backfill new members
  useEffect(() => {
    if (!user || !activeCloudPool) {
      setCloudMeasurements([]);
      setCloudProducts([]);
      setCloudTreatments([]);
      return;
    }

    const unsub = subscribePoolSubcollections(activeCloudPool.id, user.uid, {
      onMeasurements: setCloudMeasurements,
      onProducts: setCloudProducts,
      onTreatments: setCloudTreatments,
      onError: (err) => {
        console.error("Subcollection sync error:", err);
      },
    });

    const sig = `${activeCloudPool.id}:${activeCloudPool.memberIds.slice().sort().join(",")}`;
    if (
      activeCloudPool.memberIds.length > 1 &&
      syncedMembersSignatureRef.current !== sig
    ) {
      syncedMembersSignatureRef.current = sig;
      syncPoolMembersToSubcollections(
        activeCloudPool.id,
        user.uid,
        activeCloudPool.memberIds
      ).catch(() => {});
    }

    return () => unsub();
  }, [user, activeCloudPool?.id, activeCloudPool?.memberIds.join(",")]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connexion annulée.";
      if (msg.includes("popup-closed")) {
        setAuthError("Fenêtre de connexion fermée avant validation.");
      } else if (msg.includes("popup-blocked")) {
        setAuthError(
          "La fenêtre Google a été bloquée par le navigateur mobile (Safari / Chrome). Autorisez les fenêtres pop-up pour ce site puis réessayez."
        );
      } else {
        setAuthError(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActivePoolId(null);
    setLocalDemoMode(false);
  };

  const handleCreatePool = async () => {
    if (!user) return;
    setOnboardingBusy(true);
    setOnboardingError(null);
    try {
      const id = await createSharedPool(user, DEFAULT_POOL_PROFILE, true);
      setActivePoolId(id);
      try {
        localStorage.setItem(STORAGE_KEYS.activePoolId, id);
      } catch {
        // Ignore
      }
      setShowShareModal(true);
      showToast("Bassin partagé (48 m³) créé !");
    } catch (err: unknown) {
      setOnboardingError(
        err instanceof Error ? err.message : "Impossible de créer le bassin."
      );
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleJoinPool = async (rawCode: string) => {
    if (!user) return;
    setOnboardingBusy(true);
    setOnboardingError(null);
    try {
      const joinedId = await joinSharedPool(user, rawCode);
      setActivePoolId(joinedId);
      try {
        localStorage.setItem(STORAGE_KEYS.activePoolId, joinedId);
        localStorage.removeItem(STORAGE_KEYS.pendingInvite);
      } catch {
        // Ignore
      }
      showToast("Connecté au bassin partagé !");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Impossible de rejoindre ce bassin.";
      setOnboardingError(msg);
      throw err;
    } finally {
      setOnboardingBusy(false);
    }
  };

  // Unified current data (Cloud vs Local demo)
  const isCloudMode = Boolean(user && activeCloudPool);
  const activePool: PoolProfile = isCloudMode ? activeCloudPool! : localPool;
  const measurements = isCloudMode ? cloudMeasurements : localMeasurements;
  const products = isCloudMode ? cloudProducts : localProducts;
  const treatments = isCloudMode ? cloudTreatments : localTreatments;

  const handleSaveMeasurement = async (measurement: WaterMeasurement) => {
    if (isCloudMode && user && activeCloudPool) {
      await addMeasurementFs(
        activeCloudPool.id,
        user,
        activeCloudPool.memberIds,
        measurement
      );
    } else {
      setLocalMeasurements((prev) => [measurement, ...prev]);
      if (measurement.temperature !== undefined) {
        setLocalPool((prev) => ({
          ...prev,
          temperatureC: measurement.temperature as number,
        }));
      }
    }
    setShowManualModal(false);
    selectTab("dashboard");
    showToast(
      measurement.source === "camera"
        ? "Analyse AquaChek enregistrée et synchronisée."
        : "Relevé manuel enregistré et synchronisé."
    );
  };

  const handleQuickDoseProduct = async (
    category: ProductCategory,
    defaultAmount: number,
    unit: string,
    reason: string
  ) => {
    const matchingProduct = products.find((p) => p.category === category);
    const entry: TreatmentLogEntry = {
      id: `t-${Date.now()}`,
      timestamp: new Date().toISOString(),
      productId: matchingProduct?.id,
      productName: matchingProduct?.name || reason,
      category,
      amount: defaultAmount,
      unit: matchingProduct?.unit || unit,
      reason,
    };

    if (isCloudMode && user && activeCloudPool) {
      await addTreatmentFs(
        activeCloudPool.id,
        user,
        activeCloudPool.memberIds,
        entry,
        matchingProduct
          ? { product: matchingProduct, amountToDeduct: defaultAmount }
          : undefined
      );
    } else {
      if (matchingProduct) {
        setLocalProducts((prev) =>
          prev.map((p) =>
            p.id === matchingProduct.id
              ? {
                  ...p,
                  quantity: Math.max(0, Number((p.quantity - defaultAmount).toFixed(2))),
                }
              : p
          )
        );
      }
      setLocalTreatments((prev) => [entry, ...prev]);
    }
    showToast(`Ajout enregistré : ${reason}`);
  };

  const handleUpdateVisualState = async (visualState: WaterVisualState) => {
    if (isCloudMode && activeCloudPool) {
      await updatePoolSettingsFs(activeCloudPool.id, { visualState });
    } else {
      setLocalPool((prev) => ({ ...prev, visualState }));
    }
  };

  const handleApplyRecommendation = async (
    rec: DosageRecommendation,
    appliedAmount?: number
  ) => {
    const finalAmount =
      appliedAmount !== undefined && Number.isFinite(appliedAmount) && appliedAmount > 0
        ? Number(appliedAmount.toFixed(2))
        : rec.recommendedAmount;

    const matchingProduct = products.find((p) => p.category === rec.category);
    let deductAmt = finalAmount;

    if (matchingProduct) {
      if (rec.recommendedUnit === "g" && matchingProduct.unit === "kg") {
        deductAmt = Number((finalAmount / 1000).toFixed(2));
      } else if (rec.recommendedUnit === "mL" && matchingProduct.unit === "L") {
        deductAmt = Number((finalAmount / 1000).toFixed(2));
      }
    }

    const cleanTitle = rec.title.replace(/^\d+\.\s*/, "");
    const reasonText =
      finalAmount !== rec.recommendedAmount
        ? `${cleanTitle} · Dose saisie : ${finalAmount} ${rec.recommendedUnit} (recommandé : ${rec.recommendedAmount} ${rec.recommendedUnit})`
        : rec.actionSummary;

    const entry: TreatmentLogEntry = {
      id: `t-${Date.now()}`,
      timestamp: new Date().toISOString(),
      productId: matchingProduct?.id,
      productName: matchingProduct?.name || cleanTitle,
      category: rec.category,
      amount: finalAmount,
      unit: rec.recommendedUnit,
      reason: reasonText,
    };

    if (isCloudMode && user && activeCloudPool) {
      await addTreatmentFs(
        activeCloudPool.id,
        user,
        activeCloudPool.memberIds,
        entry,
        matchingProduct
          ? { product: matchingProduct, amountToDeduct: deductAmt }
          : undefined
      );
    } else {
      if (matchingProduct) {
        setLocalProducts((prev) =>
          prev.map((p) =>
            p.id === matchingProduct.id
              ? {
                  ...p,
                  quantity: Math.max(0, Number((p.quantity - deductAmt).toFixed(2))),
                }
              : p
          )
        );
      }
      setLocalTreatments((prev) => [entry, ...prev]);
    }
    showToast(
      finalAmount !== rec.recommendedAmount
        ? `Traitement enregistré : ${finalAmount} ${rec.recommendedUnit} (${cleanTitle})`
        : `Traitement enregistré : ${rec.actionSummary}`
    );
  };

  const handleLogTreatment = async (
    entry: TreatmentLogEntry,
    deductFromProductId?: string,
    deductAmount?: number
  ) => {
    const matchingProduct = deductFromProductId
      ? products.find((p) => p.id === deductFromProductId)
      : undefined;

    if (isCloudMode && user && activeCloudPool) {
      await addTreatmentFs(
        activeCloudPool.id,
        user,
        activeCloudPool.memberIds,
        entry,
        matchingProduct && deductAmount
          ? { product: matchingProduct, amountToDeduct: deductAmount }
          : undefined
      );
    } else {
      if (matchingProduct && deductAmount) {
        setLocalProducts((prev) =>
          prev.map((p) =>
            p.id === matchingProduct.id
              ? {
                  ...p,
                  quantity: Math.max(0, Number((p.quantity - deductAmount).toFixed(2))),
                }
              : p
          )
        );
      }
      setLocalTreatments((prev) => [entry, ...prev]);
    }
    showToast(`Dose enregistrée : ${entry.amount} ${entry.unit} de ${entry.productName}`);
  };

  const handleAddProduct = async (product: PoolProduct) => {
    if (isCloudMode && user && activeCloudPool) {
      await addProductFs(
        activeCloudPool.id,
        user,
        activeCloudPool.memberIds,
        product
      );
    } else {
      setLocalProducts((prev) => [product, ...prev]);
    }
    showToast(`${product.name} ajouté au stock.`);
  };

  const handleUpdateStock = async (productId: string, nextQuantity: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    if (isCloudMode && activeCloudPool) {
      await updateProductStockFs(activeCloudPool.id, prod, nextQuantity);
    } else {
      setLocalProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                quantity: Math.max(0, nextQuantity),
                maxQuantity: Math.max(p.maxQuantity, nextQuantity),
              }
            : p
        )
      );
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (isCloudMode && activeCloudPool) {
      await deleteProductFs(activeCloudPool.id, productId);
    } else {
      setLocalProducts((prev) => prev.filter((p) => p.id !== productId));
    }
  };

  const handleDeleteMeasurement = async (id: string) => {
    if (isCloudMode && activeCloudPool) {
      await deleteMeasurementFs(activeCloudPool.id, id);
    } else {
      setLocalMeasurements((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const handleDeleteTreatment = async (id: string) => {
    if (isCloudMode && activeCloudPool) {
      await deleteTreatmentFs(activeCloudPool.id, id);
    } else {
      setLocalTreatments((prev) => prev.filter((t) => t.id !== id));
    }
  };

  // Loading auth state
  if (!authReady || (user && poolsLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
          <span>Synchronisation de votre piscine...</span>
        </div>
      </div>
    );
  }

  // Sign-In Screen (when neither authenticated nor in local demo mode)
  if (!user && !localDemoMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
              Suivi Piscine
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Suivi partagé de votre piscine <strong>48 m³</strong> : lecture optique
              AquaChek 4-en-1, température, galets et stock synchronisés en temps réel entre
              famille et amis (Android &amp; iPhone, jusqu'à 10 comptes).
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <span>Se connecter avec Google (Synchro famille &amp; amis)</span>
            </button>

            <button
              type="button"
              onClick={() => setLocalDemoMode(true)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Continuer sans compte (mode local sur cet appareil)
            </button>

            <PWAInstallButton variant="card" />
          </div>

          {authError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {authError}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-500">Thème</span>
            <ThemeSwitcher theme={theme} onChange={setTheme} variant="bar" />
          </div>
        </div>
      </div>
    );
  }

  // Signed-in Pool Onboarding (Create 48 m3 shared pool OR Join with code/link)
  if (user && !activeCloudPool) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Configurer le bassin partagé
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Connecté en tant que {user.displayName || user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Quitter</span>
            </button>
          </div>

          {/* Option 1: Create new 48 m3 pool */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Vous êtes la 1re personne à installer l'app ?
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Crée le bassin (48 m³ par défaut) et génère le lien à partager à votre
                famille ou vos amis (jusqu'à 10 comptes sur Android et iPhone).
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreatePool}
              disabled={onboardingBusy}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Créer notre bassin partagé (48 m³)</span>
            </button>
          </div>

          {/* Option 2: Join existing pool */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (joinCodeInput.trim()) {
                handleJoinPool(joinCodeInput).catch(() => {});
              }
            }}
            className="p-4 rounded-xl border border-slate-200 space-y-3"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Rejoindre un bassin déjà créé
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Collez le lien ou le code reçu d'un autre téléphone.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="Ex. : piscine-48m3-..."
                className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <button
                type="submit"
                disabled={onboardingBusy || !joinCodeInput.trim()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
              >
                Rejoindre
              </button>
            </div>
          </form>

          {onboardingError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {onboardingError}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-500">Thème</span>
            <ThemeSwitcher theme={theme} onChange={setTheme} variant="bar" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar: Desktop 3-zone bar + Always-accessible sticky mobile 4-tab row */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-11 md:h-16 px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-4 md:gap-8">
          <a
            href="#accueil"
            onClick={(e) => {
              e.preventDefault();
              selectTab("dashboard");
            }}
            className="font-display text-base sm:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Suivi Piscine
          </a>

          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {(
              [
                { id: "dashboard", label: "Tableau de bord" },
                { id: "scanner", label: "Scanner" },
                { id: "products", label: "Produits" },
                { id: "history", label: "Historique" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? "border-sky-600 text-slate-900 font-semibold"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <ThemeSwitcher theme={theme} onChange={setTheme} variant="menu" />
            <button
              type="button"
              onClick={() => selectTab("scanner")}
              className="hidden md:inline-flex min-h-[42px] px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>Scanner AquaChek</span>
            </button>
          </div>
        </div>

        {/* Always-sticky smartphone top tabs (Tableau, Scanner, Produits, Historique) */}
        <nav
          aria-label="Navigation mobile"
          className="md:hidden grid grid-cols-4 gap-1 px-2 pb-1.5 pt-1 border-t border-slate-100"
        >
          {(
            [
              { id: "dashboard", label: "Tableau", aria: "Tableau de bord", icon: LayoutDashboard },
              { id: "scanner", label: "Scanner", aria: "Scanner bandelette", icon: Camera },
              { id: "products", label: "Produits", aria: "Produits et stock", icon: FlaskConical },
              { id: "history", label: "Historique", aria: "Historique et courbes", icon: Activity },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.aria}
                aria-current={isActive ? "page" : undefined}
                onClick={() => selectTab(tab.id)}
                className={`min-h-[44px] px-1 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.4 : 1.9} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Container (spacious widescreen layout on PC, ergonomic on mobile) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 pb-10 md:pb-12 space-y-4 sm:space-y-5">
        {!isCloudMode && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">
              Mode local actif sur cet appareil (48 m³). Connectez-vous pour synchroniser vos
              relevés entre famille et amis en temps réel.
            </span>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold whitespace-nowrap"
              >
                Activer la synchro Google
              </button>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <DashboardView
            pool={activePool}
            measurements={measurements}
            treatments={treatments}
            memberCount={activeCloudPool?.memberIds.length}
            onOpenScanner={() => selectTab("scanner")}
            onOpenManualEntry={() => setShowManualModal(true)}
            onOpenPoolSettings={() => setShowPoolModal(true)}
            onOpenSharePool={
              isCloudMode ? () => setShowShareModal(true) : undefined
            }
            onOpenHistory={() => selectTab("history")}
            onUpdateVisualState={handleUpdateVisualState}
            onApplyRecommendation={handleApplyRecommendation}
            onQuickDoseProduct={handleQuickDoseProduct}
          />
        )}

        {activeTab === "scanner" && (
          <StripScanner
            defaultTemperatureC={activePool.temperatureC}
            onSaveMeasurement={handleSaveMeasurement}
            onCancel={() => selectTab("dashboard")}
          />
        )}

        {activeTab === "products" && (
          <ProductsView
            products={products}
            onAddProduct={handleAddProduct}
            onUpdateStock={handleUpdateStock}
            onDeleteProduct={handleDeleteProduct}
            onLogTreatment={handleLogTreatment}
          />
        )}

        {activeTab === "history" && (
          <HistoryView
            measurements={measurements}
            treatments={treatments}
            onDeleteMeasurement={handleDeleteMeasurement}
            onDeleteTreatment={handleDeleteTreatment}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white py-5">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            Suivi Piscine · {activePool.name} ({activePool.volumeM3} m³)
            {isCloudMode && activeCloudPool
              ? ` · Synchronisé (${activeCloudPool.memberIds.length} compte${
                  activeCloudPool.memberIds.length > 1 ? "s" : ""
                })`
              : " · Mode local"}
          </span>
          <div className="flex items-center gap-4">
            <ThemeSwitcher theme={theme} onChange={setTheme} variant="bar" />
            <PWAInstallButton />
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-slate-500 hover:text-slate-800 underline"
              >
                Déconnexion ({user.displayName || user.email})
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showManualModal && (
        <ManualEntryModal
          pool={activePool}
          latest={measurements[0]}
          onSave={handleSaveMeasurement}
          onClose={() => setShowManualModal(false)}
        />
      )}

      {showPoolModal && (
        <PoolSettingsModal
          pool={activePool}
          onSave={async (next) => {
            if (isCloudMode && activeCloudPool) {
              await updatePoolSettingsFs(activeCloudPool.id, next);
            } else {
              setLocalPool(next);
            }
            setShowPoolModal(false);
            showToast("Paramètres du bassin mis à jour.");
          }}
          onClose={() => setShowPoolModal(false)}
        />
      )}

      {showShareModal && activeCloudPool && (
        <SharePoolModal
          pool={activeCloudPool}
          onJoinAnotherPool={handleJoinPool}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Offline Status & Confirmation Toast */}
      <OfflineIndicator />
      {toastMessage && (
        <div className="fixed bottom-4 md:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
