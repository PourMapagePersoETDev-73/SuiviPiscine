export type AppTheme = "light" | "gray" | "dark" | "blue";

export type ParameterKey =
  | "freeChlorine"
  | "totalChlorine"
  | "ph"
  | "alkalinity"
  | "totalHardness"
  | "stabilizer";

export type StripProfileId =
  | "aquachek_4"
  | "marina_4"
  | "bayrol_6"
  | "auto_detect";

export type WaterStatus = "optimal" | "attention" | "critique";

export type DisinfectantType = "chlore" | "sel";

export type PoolCoating = "liner" | "coque" | "carrelage" | "beton";

export type WaterVisualState = "limpide" | "trouble" | "verte";

export interface PoolProfile {
  name: string;
  volumeM3: number;
  coating: PoolCoating;
  disinfectant: DisinfectantType;
  temperatureC: number;
  visualState: WaterVisualState;
}

export interface ColorSwatchStep {
  value: number;
  label: string;
  hex: string;
  description: string;
}

export interface ParameterMeta {
  key: ParameterKey;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  idealMin: number;
  idealMax: number;
  step: number;
  swatches: ColorSwatchStep[];
  roleDescription: string;
}

export interface StripProfile {
  id: StripProfileId;
  name: string;
  subtitle: string;
  parameters: ParameterKey[];
}

export interface WaterMeasurement {
  id: string;
  timestamp: string;
  source: "camera" | "manuel";
  stripProfile?: StripProfileId;
  temperature?: number;
  values: Partial<Record<ParameterKey, number>>;
  notes?: string;
  authorName?: string;
}

export interface ScannedParameterReading {
  parameterKey: ParameterKey | "other";
  label: string;
  unit: string;
  estimatedValue: number;
  matchedScaleStep: string;
  confidence: "haute" | "moyenne" | "faible";
  observedColorName: string;
  padHex: string;
  matchedSwatchHex: string;
  comparisonNote: string;
}

export interface StripScanResponse {
  bottleDetected: boolean;
  stripDetected: boolean;
  lightingQuality: "bon" | "moyen" | "faible" | string;
  lightingNote: string;
  whiteCalibrationNote: string;
  overallSummary: string;
  readings: ScannedParameterReading[];
}

export type ProductCategory =
  | "chlore_lent"
  | "chlore_choc"
  | "desalgine"
  | "ph_moins"
  | "ph_plus"
  | "tac_plus"
  | "floculant"
  | "autre";

export interface PoolProduct {
  id: string;
  name: string;
  brand?: string;
  category: ProductCategory;
  quantity: number;
  maxQuantity: number;
  unit: "kg" | "L" | "galets" | "pastilles";
  lowThreshold: number;
  dosageGuide: string;
}

export interface TreatmentLogEntry {
  id: string;
  timestamp: string;
  productId?: string;
  productName: string;
  category: ProductCategory;
  amount: number;
  unit: string;
  reason: string;
  authorName?: string;
}

export interface SharedPoolRecord extends PoolProfile {
  id: string;
  ownerId: string;
  memberIds: string[];
}

export interface DosageRecommendation {
  id: string;
  priority: number;
  category: ProductCategory;
  title: string;
  status: WaterStatus;
  currentValueText: string;
  targetValueText: string;
  recommendedAmount: number;
  recommendedUnit: string;
  actionSummary: string;
  explanation: string;
  safetyNote?: string;
}
