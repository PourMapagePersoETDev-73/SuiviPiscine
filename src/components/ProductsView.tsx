import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  PackagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { PRODUCT_CATEGORY_LABELS } from "../data/poolCatalog";
import { PoolProduct, ProductCategory, TreatmentLogEntry } from "../types/pool";

interface ProductsViewProps {
  products: PoolProduct[];
  onAddProduct: (product: PoolProduct) => void;
  onUpdateStock: (productId: string, nextQuantity: number) => void;
  onDeleteProduct: (productId: string) => void;
  onLogTreatment: (entry: TreatmentLogEntry, deductFromProductId?: string, deductAmount?: number) => void;
}

type CategoryFilter = "tous" | "desinfection" | "equilibre" | "algues_clarte";

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onAddProduct,
  onUpdateStock,
  onDeleteProduct,
  onLogTreatment,
}) => {
  const [filter, setFilter] = useState<CategoryFilter>("tous");
  const [showAddForm, setShowAddForm] = useState(false);

  // Add product form state
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newCategory, setNewCategory] = useState<ProductCategory>("chlore_lent");
  const [newQty, setNewQty] = useState("5");
  const [newUnit, setNewUnit] = useState<PoolProduct["unit"]>("kg");
  const [newGuide, setNewGuide] = useState("");

  // Quick dose modal/drawer inline state
  const [dosingProductId, setDosingProductId] = useState<string | null>(null);
  const [doseAmount, setDoseAmount] = useState("0.2");
  const [doseReason, setDoseReason] = useState("Traitement d'entretien");

  const filteredProducts = products.filter((p) => {
    if (filter === "tous") return true;
    if (filter === "desinfection") {
      return ["chlore_lent", "chlore_choc"].includes(p.category);
    }
    if (filter === "equilibre") {
      return ["ph_moins", "ph_plus", "tac_plus"].includes(p.category);
    }
    return ["desalgine", "floculant", "autre"].includes(p.category);
  });

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const qty = Math.max(0.1, parseFloat(newQty) || 1);
    const product: PoolProduct = {
      id: `prod-${Date.now()}`,
      name: newName.trim(),
      brand: newBrand.trim() || undefined,
      category: newCategory,
      quantity: qty,
      maxQuantity: qty,
      unit: newUnit,
      lowThreshold: Number((qty * 0.2).toFixed(2)),
      dosageGuide:
        newGuide.trim() || "Suivez les recommandations de l'étiquette selon le volume du bassin.",
    };
    onAddProduct(product);
    setNewName("");
    setNewBrand("");
    setNewQty("5");
    setNewGuide("");
    setShowAddForm(false);
  };

  const handleApplyDose = (product: PoolProduct) => {
    const amount = Math.max(0.01, parseFloat(doseAmount) || 0);
    if (amount <= 0) return;

    onLogTreatment(
      {
        id: `t-${Date.now()}`,
        timestamp: new Date().toISOString(),
        productId: product.id,
        productName: product.name,
        category: product.category,
        amount,
        unit: product.unit,
        reason: doseReason.trim() || "Apport manuel",
      },
      product.id,
      amount
    );
    setDosingProductId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header + Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Produits et stock piscine
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Suivez vos réserves de chlore, chlore choc, désalgine, pH- et enregistrez chaque dose.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter un produit</span>
        </button>
      </div>

      {/* Category Filter Segmented Control */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: "tous", label: "Tous les produits" },
            { id: "desinfection", label: "Chlore" },
            { id: "equilibre", label: "pH & Alcalinité" },
            { id: "algues_clarte", label: "Désalgine & Floculant" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              filter === tab.id
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add Product Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleCreateProduct}
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">
            Nouveau produit dans votre local technique
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nom du produit *
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex. : Chlore choc sans stabilisant"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catégorie
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {Object.entries(PRODUCT_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Quantité
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unité
                </label>
                <select
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value as PoolProduct["unit"])}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="galets">galets</option>
                  <option value="pastilles">pastilles</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Marque (optionnel)
              </label>
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Ex. : Bayrol / Marina"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Mémo dosage (optionnel)
            </label>
            <input
              type="text"
              value={newGuide}
              onChange={(e) => setNewGuide(e.target.value)}
              placeholder="Ex. : 150 g pour 10 m³"
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
            >
              Enregistrer le produit
            </button>
          </div>
        </form>
      )}

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800">
            Aucun produit dans cette catégorie
          </p>
          <p className="text-xs text-slate-500">
            Ajoutez votre premier produit ou changez de filtre ci-dessus.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const isLow = product.quantity <= product.lowThreshold;
            const pct = Math.min(
              100,
              Math.max(0, (product.quantity / Math.max(product.maxQuantity, 1)) * 100)
            );
            const isDosing = dosingProductId === product.id;

            return (
              <div
                key={product.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500">
                        {PRODUCT_CATEGORY_LABELS[product.category] || "Produit"}
                        {product.brand ? ` · ${product.brand}` : ""}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5">
                        {product.name}
                      </h3>
                    </div>

                    <button
                      type="button"
                      aria-label={`Supprimer ${product.name}`}
                      onClick={() => onDeleteProduct(product.id)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Stock indicator */}
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono-num text-xl font-bold text-slate-900">
                        {Number(product.quantity.toFixed(2))} {product.unit}
                      </span>
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Stock bas</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono-num">
                          Capacité {product.maxQuantity} {product.unit}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          isLow ? "bg-amber-500" : "bg-sky-600"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {product.dosageGuide}
                  </p>
                </div>

                {/* Inline Dose Form or Action Buttons */}
                {isDosing ? (
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Dose ({product.unit})
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.05"
                          value={doseAmount}
                          onChange={(e) => setDoseAmount(e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Motif
                        </label>
                        <input
                          type="text"
                          value={doseReason}
                          onChange={(e) => setDoseReason(e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyDose(product)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Valider</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDosingProductId(null)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDosingProductId(product.id);
                        setDoseAmount(
                          product.unit === "galets" || product.unit === "pastilles"
                            ? "1"
                            : "0.25"
                        );
                        setDoseReason("Traitement bassin");
                      }}
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Appliquer une dose
                    </button>
                    <button
                      type="button"
                      title="Réapprovisionner"
                      onClick={() =>
                        onUpdateStock(
                          product.id,
                          Number(
                            (
                              product.quantity +
                              (product.unit === "galets" || product.unit === "pastilles"
                                ? 5
                                : 1)
                            ).toFixed(2)
                          )
                        )
                      }
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>+ Stock</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
