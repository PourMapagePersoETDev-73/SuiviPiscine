import { PARAMETER_META } from "../data/poolCatalog";
import {
  DosageRecommendation,
  ParameterKey,
  PoolProfile,
  WaterMeasurement,
  WaterStatus,
} from "../types/pool";

export function evaluateParameterStatus(
  key: ParameterKey,
  value: number | undefined
): { status: WaterStatus; label: string } {
  if (value === undefined || Number.isNaN(value)) {
    return { status: "attention", label: "Non mesuré" };
  }
  if (key === "stabilizer") {
    if (value >= 30 && value <= 50) {
      return { status: "optimal", label: "Idéal" };
    }
    if (value > 50 && value <= 100) {
      return { status: "optimal", label: "OK" };
    }
    if (value > 100) {
      return { status: "critique", label: "Sur-stabilisé" };
    }
    return { status: "attention", label: "Faible" };
  }

  const meta = PARAMETER_META[key];
  if (value >= meta.idealMin && value <= meta.idealMax) {
    return { status: "optimal", label: "Optimal" };
  }

  if (key === "ph") {
    if (value < 6.8 || value > 7.8) {
      return { status: "critique", label: value < 6.8 ? "Trop acide" : "Trop basique" };
    }
    return { status: "attention", label: value < meta.idealMin ? "Un peu bas" : "Un peu haut" };
  }

  if (key === "freeChlorine") {
    if (value < 0.5 || value > 4.0) {
      return { status: "critique", label: value < 0.5 ? "Insuffisant" : "Surdosage" };
    }
    return { status: "attention", label: value < meta.idealMin ? "Un peu faible" : "Élevé" };
  }

  if (key === "alkalinity") {
    if (value < 50 || value > 180) {
      return { status: "critique", label: value < 50 ? "TAC très bas" : "TAC très haut" };
    }
    return { status: "attention", label: value < meta.idealMin ? "Un peu bas" : "Un peu haut" };
  }

  return {
    status: "attention",
    label: value < meta.idealMin ? "Bas" : "Haut",
  };
}

export interface FiltrationAdvice {
  isContinuous: boolean;
  hoursPerDay: number;
  shortLabel: string;
  detailLabel: string;
}

export function getRecommendedFiltration(tempC: number): FiltrationAdvice {
  if (tempC >= 28) {
    return {
      isContinuous: true,
      hoursPerDay: 24,
      shortLabel: "24h/24 (continu)",
      detailLabel: "Filtration continue 24h/24 recommandée (eau ≥ 28 °C)",
    };
  }
  const hours = Math.max(4, Math.round(tempC / 2) + 1);
  return {
    isContinuous: false,
    hoursPerDay: hours,
    shortLabel: `${hours} h/j`,
    detailLabel: `Filtration recommandée : ${hours} h/j (T°/2 + 1 h)`,
  };
}

export function getChlorineActivityPercent(ph: number): number {
  if (ph <= 6.8) return 83;
  if (ph <= 7.0) return 73;
  if (ph <= 7.2) return 63;
  if (ph <= 7.4) return 52;
  if (ph <= 7.6) return 40;
  if (ph <= 7.8) return 28;
  return 20;
}

export function computeDosagePlan(
  pool: PoolProfile,
  latest: WaterMeasurement | undefined
): DosageRecommendation[] {
  const recs: DosageRecommendation[] = [];
  const v = latest?.values ?? {};
  const vol = Math.max(1, pool.volumeM3);
  const effectiveTemp = latest?.temperature ?? pool.temperatureC;

  // 1. Alcalinité (TAC) en premier pour éviter l'effet yoyo du pH
  if (v.alkalinity !== undefined && v.alkalinity < 80) {
    const deficit = 100 - v.alkalinity;
    // ~18 g / m³ pour +10 mg/L de TAC
    const grams = Math.round((deficit / 10) * 18 * vol);
    recs.push({
      id: "rec-tac-plus",
      priority: 1,
      category: "tac_plus",
      title: "1. Stabiliser l'alcalinité (Alcaplus / TAC+)",
      status: v.alkalinity < 50 ? "critique" : "attention",
      currentValueText: `${v.alkalinity} mg/L`,
      targetValueText: "80 – 120 mg/L",
      recommendedAmount: grams >= 1000 ? Number((grams / 1000).toFixed(2)) : grams,
      recommendedUnit: grams >= 1000 ? "kg" : "g",
      actionSummary: `Ajouter ${grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`} d'Alcaplus`,
      explanation:
        "Un TAC bas rend le pH instable. Toujours corriger le TAC avant d'ajuster le pH.",
      safetyNote: "Dissoudre devant les buses de refoulement, filtration en marche. Attendre 4h avant de tester le pH.",
    });
  }

  // 2. pH ensuite
  if (v.ph !== undefined) {
    if (v.ph > 7.4) {
      const delta = v.ph - 7.2;
      // ~15 g par m³ pour baisser de 0.1 unité (poudre pH- standard)
      const grams = Math.round((delta / 0.1) * 15 * vol);
      const activityPct = getChlorineActivityPercent(v.ph);
      recs.push({
        id: "rec-ph-moins",
        priority: 2,
        category: "ph_moins",
        title: "2. Réduire le pH (pH Moins)",
        status: v.ph > 7.7 ? "critique" : "attention",
        currentValueText: `${v.ph.toFixed(1)}`,
        targetValueText: "7.0 – 7.4",
        recommendedAmount: grams >= 1000 ? Number((grams / 1000).toFixed(2)) : grams,
        recommendedUnit: grams >= 1000 ? "kg" : "g",
        actionSummary: `Ajouter ${grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`} de pH Moins`,
        explanation: `À pH ${v.ph.toFixed(1)}, le chlore n'est actif qu'à environ ${activityPct} %. Baisser vers 7.2 restaure la désinfection.`,
        safetyNote:
          delta > 0.3
            ? "Procéder en 2 apports espacés de 4 heures (max -0,2 pH par apport)."
            : "Répartir devant les refoulements, filtration continue pendant 4h.",
      });
    } else if (v.ph < 7.0) {
      const delta = 7.2 - v.ph;
      const grams = Math.round((delta / 0.1) * 15 * vol);
      recs.push({
        id: "rec-ph-plus",
        priority: 2,
        category: "ph_plus",
        title: "2. Remonter le pH (pH Plus)",
        status: v.ph < 6.8 ? "critique" : "attention",
        currentValueText: `${v.ph.toFixed(1)}`,
        targetValueText: "7.0 – 7.4",
        recommendedAmount: grams >= 1000 ? Number((grams / 1000).toFixed(2)) : grams,
        recommendedUnit: grams >= 1000 ? "kg" : "g",
        actionSummary: `Ajouter ${grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`} de pH Plus`,
        explanation:
          "Un pH trop bas irrite les yeux et peut corroder les équipements (liner, pompe).",
        safetyNote: "Effectuer l'apport le soir hors baignade.",
      });
    }
  }

  // 3. Stabilisant (alerte sur-stabilisation au-dessus de 100 mg/L)
  if (v.stabilizer !== undefined && v.stabilizer > 100) {
    recs.push({
      id: "rec-cya-high",
      priority: 2,
      category: "autre",
      title: "Sur-stabilisation détectée (CYA)",
      status: "critique",
      currentValueText: `${v.stabilizer} mg/L`,
      targetValueText: "30 – 50 mg/L (OK ≤ 100)",
      recommendedAmount: Math.round(vol * 0.3),
      recommendedUnit: "m³ à renouveler",
      actionSummary: `Renouveler ~${Math.round(vol * 0.3)} m³ d'eau (30 %)`,
      explanation:
        "Au-delà de 100 mg/L, le stabilisant bloque le chlore même si la bandelette indique une valeur correcte. Passez temporairement au chlore non stabilisé (hypochlorite / chlore choc sans CYA).",
    });
  }

  // 4. Désinfection : Chlore choc ou Chlore lent
  {
    const cl = v.freeChlorine;
    if (pool.visualState === "verte" || (cl !== undefined && cl < 0.5)) {
      // Chlore choc : ~15 g par m³ (150 g / 10 m³)
      const grams = Math.round(15 * vol);
      recs.push({
        id: "rec-chlore-choc",
        priority: 3,
        category: "chlore_choc",
        title: "3. Traitement Chlore Choc",
        status: "critique",
        currentValueText: cl !== undefined ? `${cl.toFixed(1)} mg/L` : "Eau verte",
        targetValueText: "1.0 – 2.0 mg/L",
        recommendedAmount: grams >= 1000 ? Number((grams / 1000).toFixed(2)) : grams,
        recommendedUnit: grams >= 1000 ? "kg" : "g",
        actionSummary: `Chlore choc : ${grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`}`,
        explanation:
          pool.visualState === "verte"
            ? "Eau verte : un traitement choc immédiat est indispensable pour détruire les algues."
            : "Chlore libre très bas : risque rapide de développement d'algues.",
        safetyNote: "Toujours appliquer le soir après baignade, filtration en continu 24h.",
      });
    } else if (cl !== undefined && cl < 1.0) {
      const galets = Math.max(1, Math.round(vol / 25));
      recs.push({
        id: "rec-chlore-lent",
        priority: 3,
        category: "chlore_lent",
        title: "3. Remonter le chlore lent",
        status: "attention",
        currentValueText: `${cl.toFixed(1)} mg/L`,
        targetValueText: "1.0 – 2.0 mg/L",
        recommendedAmount: galets,
        recommendedUnit: "galets",
        actionSummary:
          pool.disinfectant === "sel"
            ? "Augmenter l'électrolyseur de +15 % (ou Boost 24h)"
            : `Placer ${galets} galet${galets > 1 ? "s" : ""} de chlore lent (250 g)`,
        explanation:
          "Le taux est juste en dessous du seuil de confort (0.5 – 0.9 mg/L). Renforcez la diffusion.",
      });
    }
  }

  // 5. Désalgine (Anti-algues) si température >= 24°C ou eau verte/trouble
  if (pool.visualState === "verte" || effectiveTemp >= 24) {
    const isCurative = pool.visualState === "verte";
    const mlPer10m3 = isCurative ? 150 : 50;
    const ml = Math.round((mlPer10m3 * vol) / 10);
    recs.push({
      id: "rec-desalgine",
      priority: 4,
      category: "desalgine",
      title: isCurative
        ? "4. Désalgine curatif (anti-algues)"
        : "4. Prévention Désalgine (eau chaude)",
      status: isCurative ? "critique" : "attention",
      currentValueText: isCurative ? "Eau verte" : `${effectiveTemp} °C`,
      targetValueText: isCurative ? "Éradication algues" : "Prévention hebdo",
      recommendedAmount: ml >= 1000 ? Number((ml / 1000).toFixed(2)) : ml,
      recommendedUnit: ml >= 1000 ? "L" : "mL",
      actionSummary: `Verser ${ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${ml} mL`} de Désalgine`,
      explanation: isCurative
        ? "Complète le chlore choc pour détruire les parois cellulaires des algues."
        : `À ${effectiveTemp} °C, les algues prolifèrent vite. Une dose préventive hebdomadaire sécurise l'eau.`,
    });
  }

  // 6. Floculant si eau trouble
  if (pool.visualState === "trouble") {
    const cartouches = Math.max(1, Math.round(vol / 40));
    recs.push({
      id: "rec-floculant",
      priority: 5,
      category: "floculant",
      title: "5. Clarifier l'eau (Floculant)",
      status: "attention",
      currentValueText: "Eau trouble",
      targetValueText: "Eau cristalline",
      recommendedAmount: cartouches,
      recommendedUnit: "pastilles",
      actionSummary: `Mettre ${cartouches} cartouche${cartouches > 1 ? "s" : ""} de floculant dans le skimmer`,
      explanation:
        "Agglomère les fines particules en suspension pour qu'elles soient retenues par le filtre à sable/verre.",
      safetyNote: "Non compatible avec les filtres à diatomées ou cartouches papier sans produit spécifique.",
    });
  }

  // 7. Recommandation filtration 24h/24 dès 28 °C
  if (effectiveTemp >= 28) {
    recs.push({
      id: "rec-filtration-24h",
      priority: 6,
      category: "autre",
      title: "Filtration continue 24h/24 recommandée",
      status: "attention",
      currentValueText: `${effectiveTemp} °C`,
      targetValueText: "Filtration 24h/24",
      recommendedAmount: 24,
      recommendedUnit: "h/j",
      actionSummary: "Passer la pompe en filtration continue 24h/24",
      explanation:
        "À partir de 28 °C, l'eau devient très favorable au développement des algues et à la perte de chlore. Laissez la filtration tourner 24h/24 tant que l'eau reste à 28 °C ou plus.",
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

// Conversions colorimétriques perceptuelles (RGB -> CIELAB -> Delta E) pour l'outil pipette manuel
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [128, 128, 128];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const srgb = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  const x = (srgb[0] * 0.4124 + srgb[1] * 0.3576 + srgb[2] * 0.1805) / 0.95047;
  const y = (srgb[0] * 0.2126 + srgb[1] * 0.7152 + srgb[2] * 0.0722) / 1.0;
  const z = (srgb[0] * 0.0193 + srgb[1] * 0.1192 + srgb[2] * 0.9505) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lab1 = rgbToLab(rgb1[0], rgb1[1], rgb1[2]);
  const lab2 = rgbToLab(rgb2[0], rgb2[1], rgb2[2]);
  return Math.sqrt(
    Math.pow(lab1[0] - lab2[0], 2) +
      Math.pow(lab1[1] - lab2[1], 2) +
      Math.pow(lab1[2] - lab2[2], 2)
  );
}
