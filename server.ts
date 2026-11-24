import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface AnalyzeStripBody {
  imageBase64?: string;
  mimeType?: string;
  stripProfile?: string;
  profileLabel?: string;
  whiteBalanced?: boolean;
  whiteSampleNote?: string;
  padZones?: Array<{
    parameterKey: string;
    label: string;
    xPct: number;
    yPct: number;
    sampledHex?: string;
  }>;
  expectedParameters?: Array<{
    key: string;
    parameterKey?: string;
    label: string;
    unit: string;
    scaleSteps: number[];
    colorDescription: string;
  }>;
}

const stripAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    bottleDetected: {
      type: Type.BOOLEAN,
      description:
        "Vrai si la boîte ou l'échelle colorimétrique imprimée est visible à côté de la bandelette.",
    },
    stripDetected: {
      type: Type.BOOLEAN,
      description:
        "Vrai si une bandelette d'analyse avec des pastilles réactives est clairement visible.",
    },
    lightingQuality: {
      type: Type.STRING,
      description:
        "Qualité de l'éclairage observé : 'bon', 'moyen' ou 'faible' (ombre dure, reflets, contre-jour).",
    },
    lightingNote: {
      type: Type.STRING,
      description:
        "1 phrase très courte (max 10 mots) en français sur l'éclairage et la lisibilité.",
    },
    whiteCalibrationNote: {
      type: Type.STRING,
      description:
        "1 phrase très courte (max 10 mots) sur la dominante lumineuse observée sur le blanc.",
    },
    overallSummary: {
      type: Type.STRING,
      description:
        "Synthèse en 1 phrase courte (max 14 mots) en français.",
    },
    readings: {
      type: Type.ARRAY,
      description:
        "Paramètres lus de haut en bas sur la bandelette.",
      items: {
        type: Type.OBJECT,
        properties: {
          parameterKey: {
            type: Type.STRING,
            description:
              "Identifiant : 'freeChlorine', 'totalChlorine', 'ph', 'alkalinity', 'totalHardness', 'stabilizer' ou 'other'.",
          },
          label: {
            type: Type.STRING,
            description: "Nom court en français (ex: 'Chlore libre', 'pH', 'TAC', 'Stabilisant').",
          },
          unit: {
            type: Type.STRING,
            description: "Unité ('mg/L', 'pH', 'ppm').",
          },
          estimatedValue: {
            type: Type.NUMBER,
            description:
              "Valeur numérique estimée par comparaison directe avec les carrés de la boîte sur cette photo (interpolée finement si entre deux repères, ex: 0.7).",
          },
          matchedScaleStep: {
            type: Type.STRING,
            description:
              "Repère court sur la boîte (ex: '0.5–1.0 (≈ 0.7)', '7.2', '80–120').",
          },
          confidence: {
            type: Type.STRING,
            description: "'haute', 'moyenne' ou 'faible'.",
          },
          observedColorName: {
            type: Type.STRING,
            description:
              "Nom bref de couleur (2-3 mots, ex: 'Mauve très pâle').",
          },
          padHex: {
            type: Type.STRING,
            description: "Hex RGB approximatif de la pastille (ex: '#DCD2D5').",
          },
          matchedSwatchHex: {
            type: Type.STRING,
            description:
              "Hex RGB approximatif du carré correspondant sur la boîte (ex: '#D8CED2').",
          },
          comparisonNote: {
            type: Type.STRING,
            description:
              "Explication ultra-courte (max 12 mots) comparant la pastille aux carrés voisins.",
          },
        },
        required: [
          "parameterKey",
          "label",
          "unit",
          "estimatedValue",
          "matchedScaleStep",
          "confidence",
          "observedColorName",
          "padHex",
          "matchedSwatchHex",
          "comparisonNote",
        ],
      },
    },
  },
  required: [
    "bottleDetected",
    "stripDetected",
    "lightingQuality",
    "lightingNote",
    "whiteCalibrationNote",
    "overallSummary",
    "readings",
  ],
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Clé GEMINI_API_KEY manquante côté serveur. Configurez-la dans Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "18mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/analyze-strip", async (req, res) => {
    try {
      const body = req.body as AnalyzeStripBody;
      if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
        res.status(400).json({
          error: "Aucune image fournie pour l'analyse colorimétrique.",
        });
        return;
      }

      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
      const mimeType =
        typeof body.mimeType === "string" && allowedMimeTypes.includes(body.mimeType)
          ? body.mimeType
          : "image/jpeg";

      const cleanBase64 = body.imageBase64.replace(/^data:[^;]+;base64,/, "").trim();
      if (!cleanBase64 || cleanBase64.length > 16_000_000) {
        res.status(400).json({
          error: "Format ou taille d'image invalide pour l'analyse.",
        });
        return;
      }

      const profileLabel =
        typeof body.profileLabel === "string"
          ? body.profileLabel.slice(0, 80)
          : "AquaChek 4-en-1";
      const safeWhiteNote =
        typeof body.whiteSampleNote === "string"
          ? body.whiteSampleNote.slice(0, 200)
          : "balance des blancs appliquée";
      const calibrationContext = body.whiteBalanced
        ? `L'utilisateur a déjà effectué un étalonnage du point blanc sur cette photo (${safeWhiteNote}).`
        : "Aucun pré-étalonnage blanc manuel appliqué : utilise obligatoirement le support plastique blanc de la bandelette ET le fond blanc du flacon dans CETTE photo pour étalonner la balance des blancs et la luminosité.";

      const padZonesText =
        Array.isArray(body.padZones) && body.padZones.length > 0
          ? "\nZONES DE PASTILLES DÉFINIES PAR L'UTILISATEUR SUR LA PHOTO (du bout de la bandelette vers le manche) :\n" +
            body.padZones
              .slice(0, 8)
              .map(
                (z) =>
                  `- ${String(z.label || "").slice(0, 40)} (${String(
                    z.parameterKey || ""
                  ).slice(0, 30)}) : position x=${Math.round(
                    Math.max(0, Math.min(100, Number(z.xPct) || 0))
                  )}%, y=${Math.round(
                    Math.max(0, Math.min(100, Number(z.yPct) || 0))
                  )}%${
                    z.sampledHex
                      ? ` | couleur échantillonnée ≈ ${String(z.sampledHex).slice(0, 12)}`
                      : ""
                  }`
              )
              .join("\n")
          : "";

      const expectedParamsText =
        Array.isArray(body.expectedParameters) && body.expectedParameters.length > 0
          ? body.expectedParameters
              .slice(0, 10)
              .map(
                (p) =>
                  `- ${String(p.label || "").slice(0, 60)} (clé: ${String(
                    p.parameterKey || p.key || ""
                  ).slice(0, 40)}, unité: ${String(p.unit || "").slice(
                    0,
                    20
                  )}) | Graduations typiques: [${
                    Array.isArray(p.scaleSteps) ? p.scaleSteps.slice(0, 15).join(", ") : ""
                  }] | Échelle: ${String(p.colorDescription || "").slice(0, 200)}`
              )
              .join("\n")
          : "Détecte automatiquement tous les paramètres imprimés sur la boîte (notamment AquaChek 4-en-1 : pH, Chlore libre, Alcalinité/TAC, Stabilisant/CYA).";

      const prompt = `Colorimètre optique piscine (${profileLabel}). ${calibrationContext}
${padZonesText}
PARAMÈTRES :
${expectedParamsText}

RÈGLES COURTES :
1. Calibre sur le blanc du plastique et de l'étiquette dans CETTE photo, puis compare chaque pastille uniquement aux carrés imprimés sur le flacon dans CETTE photo.
2. AquaChek Jaune 4-en-1 (haut → bas) :
   - pH : 6.2 jaune → 6.8 orange clair → 7.2 orange vif → 7.8 corail → 8.4 framboise.
   - Chlore libre : 0 crème → 0.5 beige très pâle → 1 mauve/rose grisé pâle → 3 lavande → 5/10 violet (si entre 0.5 et 1, interpole ex. 0.7).
   - TAC : 0 moutarde → 40 olive → 80 prairie → 120 sauge → 180 canard → 240 bleu-vert.
   - Stabilisant : 0 ocre → 40 (30-50 IDEAL) cuivré → 100 corail → 150 magenta → 300 violet.
3. Si les coordonnées des zones sont fournies, lis précisément à ces positions.
4. Réponds en JSON strict, avec des textes très courts (1 phrase max par note).`;

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: "application/json",
          responseSchema: stripAnalysisSchema,
        },
      });

      const rawText = (response.text ?? "{}")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === "number" ? errorObj.status : 500;
      const message =
        errorObj?.message ||
        "Erreur lors de l'analyse optique de la bandelette avec Gemini.";
      console.error("[/api/analyze-strip] error:", message);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
      });
    }
  });

  // Ensure any unknown /api route or Express middleware error (e.g. 413/400) returns JSON, never HTML
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "Route API introuvable." });
  });

  app.use(
    "/api",
    (
      err: { status?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        err?.type === "entity.too.large"
          ? 413
          : typeof err?.status === "number"
          ? err.status
          : 500;
      res.status(status).json({
        error:
          status === 413
            ? "La photo est trop volumineuse pour être envoyée. Réessayez avec une image plus légère."
            : err?.message || "Erreur serveur lors du traitement de la requête.",
      });
    }
  );

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur Suivi Piscine actif sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
