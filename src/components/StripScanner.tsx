import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
  FlipHorizontal,
  HelpCircle,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  SunMedium,
  Thermometer,
  Upload,
  X,
} from "lucide-react";
import { PARAMETER_META, STRIP_PROFILES } from "../data/poolCatalog";
import {
  ParameterKey,
  ScannedParameterReading,
  StripProfileId,
  StripScanResponse,
  WaterMeasurement,
} from "../types/pool";
import {
  deltaE76,
  evaluateParameterStatus,
  rgbToHex,
} from "../utils/chemistry";

interface StripScannerProps {
  defaultTemperatureC: number;
  onSaveMeasurement: (measurement: WaterMeasurement) => void;
  onCancel?: () => void;
}

interface EditableReading extends ScannedParameterReading {
  confirmedValue: number;
}

interface StripAnchor {
  startX: number; // % (0-100) center of top pad (end pad, e.g. pH)
  startY: number;
  endX: number; // % (0-100) center of bottom pad (pad nearest handle, e.g. Stabilizer)
  endY: number;
}

const SAMPLE_STRIP_IMAGE = "./assets/aistudio/Piscine_test_8a1e2dbc.jpg";

// Exact pad positions on Piscine_test_8a1e2dbc.jpg (from top pH pad to bottom Stabilizer pad)
const SAMPLE_PHOTO_ANCHOR: StripAnchor = {
  startX: 82.4,
  startY: 43.3,
  endX: 80.9,
  endY: 71.5,
};

const DEFAULT_STRIP_ANCHOR: StripAnchor = {
  startX: 78,
  startY: 28,
  endX: 78,
  endY: 70,
};

function getAnchorPadsForProfile(profileId: StripProfileId): ParameterKey[] {
  if (profileId === "aquachek_4" || profileId === "marina_4" || profileId === "auto_detect") {
    // Physical order on AquaChek 4-en-1 from END PAD (top) to HANDLE (bottom)
    return ["ph", "freeChlorine", "alkalinity", "stabilizer"];
  }
  const found = STRIP_PROFILES.find((p) => p.id === profileId);
  return found?.parameters ?? ["ph", "freeChlorine", "alkalinity", "stabilizer"];
}

export const StripScanner: React.FC<StripScannerProps> = ({
  defaultTemperatureC,
  onSaveMeasurement,
  onCancel,
}) => {
  const [selectedProfile, setSelectedProfile] = useState<StripProfileId>("aquachek_4");
  const [showGuide, setShowGuide] = useState(false);

  // 15-second strip immersion timer
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerDone, setTimerDone] = useState(false);

  // Camera & captured photo
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [rawCapturedUrl, setRawCapturedUrl] = useState<string | null>(null);
  const [calibratedUrl, setCalibratedUrl] = useState<string | null>(null);
  const [useCalibratedView, setUseCalibratedView] = useState(true);

  // Interactive Strip Zone ("Zone bandelette") overlay
  const [showStripOverlay, setShowStripOverlay] = useState(true);
  const [stripAnchor, setStripAnchor] = useState<StripAnchor>(DEFAULT_STRIP_ANCHOR);
  const [overlayTouched, setOverlayTouched] = useState(false);
  const [dragTarget, setDragTarget] = useState<"start" | "end" | "move" | null>(null);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    anchor: StripAnchor;
  } | null>(null);
  const [livePadColors, setLivePadColors] = useState<
    Array<{ key: ParameterKey; shortLabel: string; xPct: number; yPct: number; hex: string }>
  >([]);

  // Per-photo White-Balance & Optional Black-Point Contrast Calibration
  const [calibPickMode, setCalibPickMode] = useState<"white" | "black" | null>(null);
  const [whiteSampleRgb, setWhiteSampleRgb] = useState<[number, number, number] | null>(null);
  const [blackSampleRgb, setBlackSampleRgb] = useState<[number, number, number] | null>(null);
  const [whiteCalibInfo, setWhiteCalibInfo] = useState<{
    sampledHex: string;
    blackHex?: string;
    shiftSummary: string;
  } | null>(null);

  // AI optical analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisElapsedSec, setAnalysisElapsedSec] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<StripScanResponse | null>(null);
  const [editableReadings, setEditableReadings] = useState<EditableReading[]>([]);
  const [expandedDetailIdx, setExpandedDetailIdx] = useState<number | null>(null);
  const [waterTemperature, setWaterTemperature] = useState<number>(defaultTemperatureC);
  const [scanNotes, setScanNotes] = useState("");

  // Optional advanced tools (Delta-E pipette)
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [pipetteMode, setPipetteMode] = useState(false);
  const [pipetteTarget, setPipetteTarget] = useState<"pad" | "swatchA" | "swatchB">("pad");
  const [pipetteColors, setPipetteColors] = useState<{
    pad?: { hex: string; rgb: [number, number, number] };
    swatchA?: { hex: string; rgb: [number, number, number]; label: string };
    swatchB?: { hex: string; rgb: [number, number, number]; label: string };
  }>({});
  const [swatchALabel, setSwatchALabel] = useState("0.5");
  const [swatchBLabel, setSwatchBLabel] = useState("1.0");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const overlayWrapRef = useRef<HTMLDivElement | null>(null);

  const activePhotoUrl =
    useCalibratedView && calibratedUrl ? calibratedUrl : rawCapturedUrl;

  const anchorKeys = useMemo(
    () => getAnchorPadsForProfile(selectedProfile),
    [selectedProfile]
  );

  // Compute the N evenly spaced pad coordinates along the strip line
  const computedPadPoints = useMemo(() => {
    const count = Math.max(2, anchorKeys.length);
    return anchorKeys.map((key, idx) => {
      const t = count === 1 ? 0 : idx / (count - 1);
      return {
        key,
        shortLabel: PARAMETER_META[key]?.shortLabel ?? key,
        xPct: stripAnchor.startX + (stripAnchor.endX - stripAnchor.startX) * t,
        yPct: stripAnchor.startY + (stripAnchor.endY - stripAnchor.startY) * t,
      };
    });
  }, [anchorKeys, stripAnchor]);

  useEffect(() => {
    setWaterTemperature(defaultTemperatureC);
  }, [defaultTemperatureC]);

  // Timer countdown effect
  useEffect(() => {
    if (timerSeconds === null) return;
    if (timerSeconds <= 0) {
      setTimerSeconds(null);
      setTimerDone(true);
      return;
    }
    const t = window.setTimeout(() => {
      setTimerSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [timerSeconds]);

  // Live elapsed timer while AI color analysis runs
  useEffect(() => {
    if (!isAnalyzing) {
      setAnalysisElapsedSec(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setAnalysisElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [isAnalyzing]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  // Sample live pad hex colors from activePhotoUrl whenever photo or pad positions change
  useEffect(() => {
    if (!activePhotoUrl || !showStripOverlay) {
      setLivePadColors([]);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      const sampled = computedPadPoints.map((pt) => {
        const cx = Math.max(
          2,
          Math.min(canvas.width - 3, Math.round((pt.xPct / 100) * canvas.width))
        );
        const cy = Math.max(
          2,
          Math.min(canvas.height - 3, Math.round((pt.yPct / 100) * canvas.height))
        );
        const patch = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < patch.length; i += 4) {
          r += patch[i];
          g += patch[i + 1];
          b += patch[i + 2];
        }
        const hex = rgbToHex(r / 25, g / 25, b / 25);
        return { ...pt, hex };
      });
      setLivePadColors(sampled);
    };
    img.src = activePhotoUrl;
    return () => {
      cancelled = true;
    };
  }, [activePhotoUrl, computedPadPoints, showStripOverlay]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const resetPhotoState = () => {
    setRawCapturedUrl(null);
    setCalibratedUrl(null);
    setWhiteSampleRgb(null);
    setBlackSampleRgb(null);
    setWhiteCalibInfo(null);
    setCalibPickMode(null);
    setPipetteMode(false);
    setPipetteColors({});
    setScanResult(null);
    setEditableReadings([]);
    setExpandedDetailIdx(null);
    setAnalysisError(null);
    setStripAnchor(DEFAULT_STRIP_ANCHOR);
    setOverlayTouched(false);
  };

  const startCamera = async (mode: "environment" | "user" = facingMode) => {
    setCameraError(null);
    resetPhotoState();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Votre navigateur ne permet pas le flux vidéo direct. Utilisez « Appareil photo » ou « Galerie »."
      );
      return;
    }

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError(
        "Accès caméra refusé ou indisponible. Utilisez « Appareil photo » ou « Galerie » ci-dessous."
      );
      setCameraActive(false);
    }
  };

  const toggleFacingMode = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (cameraActive) {
      startCamera(next);
    }
  };

  const captureFromVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    stopCameraStream();
    resetPhotoState();
    setRawCapturedUrl(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCameraStream();
    resetPhotoState();

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setRawCapturedUrl(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const loadSampleCalibrationPhoto = async () => {
    stopCameraStream();
    resetPhotoState();

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error("Impossible de charger la photo d'exemple."));
        img.src = SAMPLE_STRIP_IMAGE;
      });
      const maxDim = 1200;
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || 1600;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setRawCapturedUrl(canvas.toDataURL("image/jpeg", 0.88));
      setStripAnchor(SAMPLE_PHOTO_ANCHOR);
      setShowStripOverlay(true);
      setOverlayTouched(true);
    } catch {
      setAnalysisError("Impossible de charger la photo Piscine test.jpg.");
    }
  };

  // Drag handlers for the interactive Strip Zone ("Zone bandelette") overlay
  const startOverlayDrag = (
    e: React.PointerEvent,
    target: "start" | "end" | "move"
  ) => {
    if (calibPickMode || pipetteMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragTarget(target);
    setOverlayTouched(true);
    dragOriginRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      anchor: { ...stripAnchor },
    };
  };

  const moveOverlayDrag = (e: React.PointerEvent) => {
    if (!dragTarget || !dragOriginRef.current || !overlayWrapRef.current) return;
    const rect = overlayWrapRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - dragOriginRef.current.clientX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragOriginRef.current.clientY) / rect.height) * 100;
    const clamp = (v: number) => Math.max(4, Math.min(96, v));
    const orig = dragOriginRef.current.anchor;

    if (dragTarget === "start") {
      setStripAnchor({
        ...orig,
        startX: clamp(orig.startX + dxPct),
        startY: clamp(orig.startY + dyPct),
      });
    } else if (dragTarget === "end") {
      setStripAnchor({
        ...orig,
        endX: clamp(orig.endX + dxPct),
        endY: clamp(orig.endY + dyPct),
      });
    } else {
      setStripAnchor({
        startX: clamp(orig.startX + dxPct),
        startY: clamp(orig.startY + dyPct),
        endX: clamp(orig.endX + dxPct),
        endY: clamp(orig.endY + dyPct),
      });
    }
  };

  const endOverlayDrag = () => {
    setDragTarget(null);
    dragOriginRef.current = null;
  };

  // Sample average 7x7 RGB patch from raw image at click coordinates
  const samplePatchFromRawImage = (
    clientX: number,
    clientY: number
  ): Promise<[number, number, number] | null> => {
    return new Promise((resolve) => {
      if (!previewImgRef.current || !rawCapturedUrl) {
        resolve(null);
        return;
      }
      const rect = previewImgRef.current.getBoundingClientRect();
      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;

      const srcImg = new Image();
      srcImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = srcImg.naturalWidth;
        canvas.height = srcImg.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(srcImg, 0, 0);
        const cx = Math.max(3, Math.min(canvas.width - 4, Math.round(normX * canvas.width)));
        const cy = Math.max(3, Math.min(canvas.height - 4, Math.round(normY * canvas.height)));
        const patch = ctx.getImageData(cx - 3, cy - 3, 7, 7).data;
        let r = 0;
        let g = 0;
        let b = 0;
        const n = 49;
        for (let i = 0; i < patch.length; i += 4) {
          r += patch[i];
          g += patch[i + 1];
          b += patch[i + 2];
        }
        resolve([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      };
      srcImg.src = rawCapturedUrl;
    });
  };

  const recomputeCalibratedPhoto = (
    nextWhite: [number, number, number] | null,
    nextBlack: [number, number, number] | null
  ) => {
    if (!rawCapturedUrl) return;
    if (!nextWhite && !nextBlack) {
      setCalibratedUrl(null);
      setWhiteCalibInfo(null);
      return;
    }

    const white = nextWhite ?? [246, 246, 246];
    const black = nextBlack ?? [0, 0, 0];
    const targetWhite = 246;
    const targetBlack = nextBlack ? 24 : 0;

    const spanR = Math.max(45, white[0] - black[0]);
    const spanG = Math.max(45, white[1] - black[1]);
    const spanB = Math.max(45, white[2] - black[2]);

    const gainR = Math.min(1.9, Math.max(0.65, (targetWhite - targetBlack) / spanR));
    const gainG = Math.min(1.9, Math.max(0.65, (targetWhite - targetBlack) / spanG));
    const gainB = Math.min(1.9, Math.max(0.65, (targetWhite - targetBlack) / spanB));

    const srcImg = new Image();
    srcImg.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = srcImg.naturalWidth;
      canvas.height = srcImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(srcImg, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(
          0,
          Math.min(255, Math.round((data[i] - black[0]) * gainR + targetBlack))
        );
        data[i + 1] = Math.max(
          0,
          Math.min(255, Math.round((data[i + 1] - black[1]) * gainG + targetBlack))
        );
        data[i + 2] = Math.max(
          0,
          Math.min(255, Math.round((data[i + 2] - black[2]) * gainB + targetBlack))
        );
      }
      ctx.putImageData(imgData, 0, 0);
      setCalibratedUrl(canvas.toDataURL("image/jpeg", 0.92));
      setUseCalibratedView(true);
      setCalibPickMode(null);

      const avgGain = (gainR + gainG + gainB) / 3;
      const lumDesc =
        avgGain > 1.15
          ? `Luminosité +${Math.round((avgGain - 1) * 100)} %`
          : avgGain < 0.92
          ? "Surexposition atténuée"
          : "Exposition équilibrée";
      const tempDesc =
        gainB > gainR * 1.07
          ? "soleil chaud compensé"
          : gainR > gainB * 1.07
          ? "ombre froide compensée"
          : "teinte neutre";

      setWhiteCalibInfo({
        sampledHex: rgbToHex(white[0], white[1], white[2]),
        blackHex: nextBlack ? rgbToHex(black[0], black[1], black[2]) : undefined,
        shiftSummary: `${lumDesc} · ${tempDesc}`,
      });
    };
    srcImg.src = rawCapturedUrl;
  };

  const applyCalibrationFromClick = async (
    mode: "white" | "black",
    clientX: number,
    clientY: number
  ) => {
    if (!rawCapturedUrl) return;
    const sampled = await samplePatchFromRawImage(clientX, clientY);
    if (!sampled) return;

    if (mode === "white") {
      setWhiteSampleRgb(sampled);
      recomputeCalibratedPhoto(sampled, blackSampleRgb);
    } else {
      setBlackSampleRgb(sampled);
      recomputeCalibratedPhoto(whiteSampleRgb, sampled);
    }
  };

  const handlePhotoClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (calibPickMode) {
      await applyCalibrationFromClick(calibPickMode, e.clientX, e.clientY);
      return;
    }
    if (!pipetteMode || !previewImgRef.current || !activePhotoUrl) return;

    const imgEl = previewImgRef.current;
    const rect = imgEl.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(imgEl, 0, 0);

    const cx = Math.max(2, Math.min(canvas.width - 3, Math.round(normX * canvas.width)));
    const cy = Math.max(2, Math.min(canvas.height - 3, Math.round(normY * canvas.height)));
    const patch = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < patch.length; i += 4) {
      r += patch[i];
      g += patch[i + 1];
      b += patch[i + 2];
    }
    const avgRgb: [number, number, number] = [
      Math.round(r / 25),
      Math.round(g / 25),
      Math.round(b / 25),
    ];
    const hex = rgbToHex(avgRgb[0], avgRgb[1], avgRgb[2]);

    if (pipetteTarget === "pad") {
      setPipetteColors((prev) => ({ ...prev, pad: { hex, rgb: avgRgb } }));
      setPipetteTarget("swatchA");
    } else if (pipetteTarget === "swatchA") {
      setPipetteColors((prev) => ({
        ...prev,
        swatchA: { hex, rgb: avgRgb, label: swatchALabel },
      }));
      setPipetteTarget("swatchB");
    } else {
      setPipetteColors((prev) => ({
        ...prev,
        swatchB: { hex, rgb: avgRgb, label: swatchBLabel },
      }));
      setPipetteTarget("pad");
    }
  };

  const prepareFastAnalysisJpeg = (
    dataUrl: string,
    maxDim = 960,
    quality = 0.84
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const analyzeCapturedPhoto = async () => {
    const sourcePhoto = activePhotoUrl;
    if (!sourcePhoto) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setExpandedDetailIdx(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    try {
      const imageToSend = await prepareFastAnalysisJpeg(sourcePhoto, 960, 0.84);
      const profile =
        STRIP_PROFILES.find((p) => p.id === selectedProfile) ?? STRIP_PROFILES[0];
      const expectedParameters =
        selectedProfile === "auto_detect"
          ? []
          : profile.parameters.map((key) => {
              const meta = PARAMETER_META[key];
              return {
                key,
                parameterKey: key,
                label: meta.label,
                unit: meta.unit,
                scaleSteps: meta.swatches.map((s) => s.value),
                colorDescription: meta.swatches
                  .map((s) => `${s.value}: ${s.description}`)
                  .join(" | "),
              };
            });

      const padZonesPayload =
        showStripOverlay && overlayTouched && livePadColors.length > 0
          ? livePadColors.map((p) => ({
              parameterKey: p.key,
              label: p.shortLabel,
              xPct: Number(p.xPct.toFixed(1)),
              yPct: Number(p.yPct.toFixed(1)),
              sampledHex: p.hex,
            }))
          : undefined;

      const requestPayload = JSON.stringify({
        imageBase64: imageToSend,
        mimeType: "image/jpeg",
        stripProfile: profile.id,
        profileLabel: profile.name,
        whiteBalanced: Boolean(calibratedUrl && useCalibratedView),
        whiteSampleNote: whiteCalibInfo
          ? `Blanc ${whiteCalibInfo.sampledHex}${
              whiteCalibInfo.blackHex ? `, noir ${whiteCalibInfo.blackHex}` : ""
            } (${whiteCalibInfo.shiftSummary})`
          : undefined,
        padZones: padZonesPayload,
        expectedParameters,
      });

      const callAnalyzeApi = async (): Promise<{
        response: Response;
        rawText: string;
      }> => {
        const resp = await fetch("./api/analyze-strip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          body: requestPayload,
        });
        const text = await resp.text();
        return { response: resp, rawText: text };
      };

      let { response, rawText } = await callAnalyzeApi();
      const looksLikeHtml = (txt: string) => {
        const t = txt.trim().toLowerCase();
        return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<");
      };

      // Retry once automatically if the server was restarting or hit a transient 502/503 HTML proxy response
      if (looksLikeHtml(rawText) || response.status === 502 || response.status === 503) {
        await new Promise((r) => window.setTimeout(r, 1200));
        ({ response, rawText } = await callAnalyzeApi());
      }

      if (looksLikeHtml(rawText)) {
        if (response.redirected || response.status === 401 || response.status === 403) {
          throw new Error(
            "Session expirée sur cette page. Rechargez l'application (ou reconnectez-vous sur AI Studio) puis réessayez."
          );
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error(
            `Le serveur d'analyse est momentanément indisponible (HTTP ${response.status}). Patientez quelques secondes et réessayez.`
          );
        }
        if (response.status === 404) {
          throw new Error(
            "L'analyse IA automatique nécessite le serveur Node (non disponible sur un hébergement statique comme GitHub Pages). Utilisez les outils manuels ou la pipette Delta-E."
          );
        }
        throw new Error(
          `Le serveur a renvoyé une page HTML au lieu de l'analyse (HTTP ${response.status}). Rechargez la page ; si vous utilisez le lien partagé (ais-pre), republiez l'app depuis AI Studio (Share / Publish).`
        );
      }

      let data: unknown;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          `Réponse serveur illisible (HTTP ${response.status}). Rechargez la page et réessayez.`
        );
      }

      const parsedObj = data as { error?: string } & StripScanResponse;
      if (!response.ok) {
        throw new Error(parsedObj?.error || "Échec de l'analyse colorimétrique.");
      }

      const result = parsedObj as StripScanResponse;
      setScanResult(result);
      setEditableReadings(
        (result.readings || []).map((r) => ({
          ...r,
          confirmedValue: r.estimatedValue,
        }))
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setAnalysisError(
          "Délai dépassé (45 s). Vérifiez votre connexion 4G/Wi-Fi et réessayez."
        );
      } else {
        const msg =
          err instanceof Error ? err.message : "Erreur réseau lors de l'analyse.";
        setAnalysisError(msg);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  };

  const updateConfirmedValue = (index: number, nextVal: number) => {
    setEditableReadings((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, confirmedValue: Number(nextVal.toFixed(2)) }
          : item
      )
    );
  };

  const handleSaveScan = () => {
    const values: Partial<Record<ParameterKey, number>> = {};
    for (const r of editableReadings) {
      if (r.parameterKey !== "other" && r.parameterKey in PARAMETER_META) {
        values[r.parameterKey as ParameterKey] = r.confirmedValue;
      }
    }
    if (Object.keys(values).length === 0) return;

    const measurement: WaterMeasurement = {
      id: `m-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: "camera",
      stripProfile: selectedProfile,
      temperature: Number(waterTemperature.toFixed(1)),
      values,
      notes:
        scanNotes.trim() ||
        `AquaChek · ${whiteCalibInfo ? "Étalonnage blanc appliqué" : "Lecture boîte côte à côte"}`,
    };
    onSaveMeasurement(measurement);
  };

  const pipetteVerdict = (() => {
    if (!pipetteColors.pad || !pipetteColors.swatchA || !pipetteColors.swatchB) {
      return null;
    }
    const dA = deltaE76(pipetteColors.pad.rgb, pipetteColors.swatchA.rgb);
    const dB = deltaE76(pipetteColors.pad.rgb, pipetteColors.swatchB.rgb);
    const total = dA + dB || 1;
    const weightB = dA / total;
    const numA = parseFloat(swatchALabel.replace(",", "."));
    const numB = parseFloat(swatchBLabel.replace(",", "."));
    const interpolated =
      !Number.isNaN(numA) && !Number.isNaN(numB)
        ? Number((numA + (numB - numA) * weightB).toFixed(2))
        : null;
    return {
      dA: dA.toFixed(1),
      dB: dB.toFixed(1),
      closerTo: dA <= dB ? swatchALabel : swatchBLabel,
      interpolated,
    };
  })();

  return (
    <div className="space-y-4">
      {/* Compact Top Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Analyseur bandelette
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Placez la bandelette à droite du flacon et alignez les 4 repères
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTimerDone(false);
                setTimerSeconds(15);
              }}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                timerDone
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              <span>
                {timerSeconds !== null
                  ? `${timerSeconds} s`
                  : timerDone
                  ? "Prêt !"
                  : "15 s"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-label="Guide de placement"
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center"
            >
              <HelpCircle className="w-4 h-4 text-sky-600" />
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Fermer"
                className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Modèle de bandelette"
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value as StripProfileId)}
            className="flex-1 min-w-[210px] min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {STRIP_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {timerSeconds !== null && (
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-sky-600 h-1.5 transition-all duration-500"
                style={{ width: `${((15 - timerSeconds) / 15) * 100}%` }}
              />
            </div>
          )}
        </div>

        {showGuide && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src={SAMPLE_STRIP_IMAGE}
                alt="Exemple de placement de la bandelette AquaChek à côté du flacon"
                className="w-full h-48 object-contain"
              />
            </div>
            <ol className="md:col-span-8 space-y-1.5 text-xs sm:text-sm text-slate-600 list-decimal pl-5">
              <li>
                <strong className="text-slate-900">15 secondes :</strong> trempez 1 s et
                tenez la bandelette à droite de l'étiquette AquaChek (bout pH vers le haut).
              </li>
              <li>
                <strong className="text-slate-900">Zone bandelette :</strong> glissez les
                repères <span className="font-semibold">pH</span> (haut) et{" "}
                <span className="font-semibold">CYA</span> (bas) exactement sur vos 4 pastilles.
              </li>
              <li>
                <strong className="text-slate-900">Point blanc :</strong> si l'ombre ou le
                soleil fausse les tons, cliquez sur <em>Étalonner blanc</em> puis touchez le
                plastique blanc.
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Main Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Step 1: Capture + Visual Strip Zone Overlay */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
          {cameraActive ? (
            <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[3/4] sm:aspect-[4/3]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Clear Camera Reticle: Bottle Left + 4 Strip Pad Slots Right */}
              <div className="absolute inset-0 pointer-events-none p-3 sm:p-5 flex items-stretch gap-3">
                <div className="flex-[1.45] border-2 border-dashed border-white/75 rounded-xl flex flex-col justify-between p-2.5 bg-black/10">
                  <span className="text-[11px] font-semibold text-white bg-black/60 px-2 py-0.5 rounded self-start">
                    Flacon AquaChek
                  </span>
                  <span className="text-[11px] text-white/85">
                    Gardez les échelles nettes
                  </span>
                </div>

                <div className="flex-[0.65] border-2 border-dashed border-sky-300 rounded-xl flex flex-col items-center justify-between py-4 px-2 bg-sky-500/10">
                  <span className="text-[11px] font-semibold text-white bg-sky-700/90 px-2 py-0.5 rounded">
                    Bandelette
                  </span>
                  <div className="flex flex-col items-center gap-3 my-auto">
                    {anchorKeys.map((k) => (
                      <div
                        key={k}
                        className="w-9 h-9 rounded-md border-2 border-sky-300 bg-black/25 flex items-center justify-center text-[10px] font-bold text-white"
                      >
                        {PARAMETER_META[k]?.shortLabel.slice(0, 4)}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-sky-100 text-center">
                    Alignez les 4 pastilles
                  </span>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="min-h-[42px] px-3 rounded-xl bg-black/65 text-white text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-sm"
                >
                  <FlipHorizontal className="w-4 h-4" />
                  <span>Inverser</span>
                </button>
                <button
                  type="button"
                  onClick={captureFromVideo}
                  className="min-h-[46px] px-5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capturer</span>
                </button>
                <button
                  type="button"
                  onClick={stopCameraStream}
                  className="min-h-[42px] px-3 rounded-xl bg-black/65 text-white text-xs font-medium"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : activePhotoUrl ? (
            <div className="space-y-3">
              {/* Compact Calibration + Strip Zone Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPipetteMode(false);
                      setCalibPickMode((m) => (m === "white" ? null : "white"));
                    }}
                    className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                      calibPickMode === "white"
                        ? "bg-amber-600 border-amber-600 text-white"
                        : whiteSampleRgb
                        ? "bg-sky-50 border-sky-200 text-sky-900"
                        : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <SunMedium className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      {calibPickMode === "white"
                        ? "Touchez un blanc..."
                        : whiteSampleRgb
                        ? "Blanc OK"
                        : "Étalonner blanc"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowStripOverlay((v) => !v)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                      showStripOverlay
                        ? "bg-sky-50 border-sky-200 text-sky-900"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    {showStripOverlay ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                    <span>Zone bandelette</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {whiteCalibInfo && (
                    <button
                      type="button"
                      onClick={() => setUseCalibratedView((v) => !v)}
                      className="text-sky-700 font-medium hover:underline"
                    >
                      {useCalibratedView ? "Origine" : "Calibrée"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetPhotoState}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Changer</span>
                  </button>
                </div>
              </div>

              {/* Photo Preview with Interactive Draggable 4-Pad Strip Overlay */}
              <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-100 overflow-hidden">
                <div
                  ref={overlayWrapRef}
                  onPointerMove={moveOverlayDrag}
                  onPointerUp={endOverlayDrag}
                  onPointerCancel={endOverlayDrag}
                  className="relative inline-block select-none"
                >
                  <img
                    ref={previewImgRef}
                    src={activePhotoUrl}
                    alt="Bandelette AquaChek et boîte d'étalonnage"
                    onClick={handlePhotoClick}
                    draggable={false}
                    className={`block max-h-[430px] w-auto max-w-full ${
                      calibPickMode || pipetteMode ? "cursor-crosshair" : ""
                    }`}
                  />

                  {/* Visual Strip Alignment Overlay */}
                  {showStripOverlay && !calibPickMode && !pipetteMode && (
                    <>
                      {/* Strip Guide Line connecting all pads */}
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        <line
                          x1={stripAnchor.startX}
                          y1={stripAnchor.startY}
                          x2={stripAnchor.endX}
                          y2={stripAnchor.endY}
                          stroke="#38BDF8"
                          strokeWidth="0.9"
                          strokeDasharray="1.8 1.2"
                        />
                      </svg>

                      {/* Invisible wide middle drag bar to slide entire strip at once */}
                      <div
                        title="Glisser toute la zone bandelette"
                        onPointerDown={(e) => startOverlayDrag(e, "move")}
                        style={{
                          left: `${(stripAnchor.startX + stripAnchor.endX) / 2}%`,
                          top: `${(stripAnchor.startY + stripAnchor.endY) / 2}%`,
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-24 cursor-grab active:cursor-grabbing touch-none z-10"
                      />

                      {/* The 4 Pad Target Squares */}
                      {computedPadPoints.map((pt, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === computedPadPoints.length - 1;
                        const handleType = isFirst
                          ? "start"
                          : isLast
                          ? "end"
                          : "move";

                        return (
                          <div
                            key={pt.key}
                            onPointerDown={(e) => startOverlayDrag(e, handleType)}
                            style={{
                              left: `${pt.xPct}%`,
                              top: `${pt.yPct}%`,
                            }}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 touch-none z-20 flex items-center gap-1 ${
                              isFirst || isLast
                                ? "cursor-grab active:cursor-grabbing"
                                : "cursor-move"
                            }`}
                          >
                            {/* Target square centered right over the pad */}
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md border-2 shadow-sm flex items-center justify-center ${
                                isFirst || isLast
                                  ? "border-sky-400 bg-sky-400/15 ring-2 ring-white/80"
                                  : "border-white bg-white/10 ring-1 ring-sky-400"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-white shadow" />
                            </div>
                            {/* Compact label pill to the left of the square so it doesn't cover the pad */}
                            <span
                              style={{ position: "absolute", right: "100%", marginRight: "4px" }}
                              className="px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-bold whitespace-nowrap pointer-events-none"
                            >
                              {pt.shortLabel}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {calibPickMode && (
                    <div className="absolute top-2 left-2 right-2 bg-amber-950/90 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm flex items-center justify-between gap-2 z-30">
                      <span>
                        {calibPickMode === "white"
                          ? "Touchez le plastique blanc de la bandelette ou le fond blanc de la boîte"
                          : "Touchez un texte noir imprimé sur le flacon"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalibPickMode(null)}
                        className="text-amber-200 font-semibold shrink-0"
                      >
                        Annuler
                      </button>
                    </div>
                  )}

                  {pipetteMode && !calibPickMode && (
                    <div className="absolute top-2 left-2 right-2 bg-slate-900/90 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm flex items-center justify-between gap-2 z-30">
                      <span>
                        {pipetteTarget === "pad" && "1. Touchez la pastille"}
                        {pipetteTarget === "swatchA" && `2. Touchez étalon ${swatchALabel}`}
                        {pipetteTarget === "swatchB" && `3. Touchez étalon ${swatchBLabel}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPipetteMode(false)}
                        className="text-sky-300 font-semibold shrink-0"
                      >
                        Terminer
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Live Sampled Colors Bar from the 4 Defined Pad Zones */}
              {showStripOverlay && livePadColors.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">
                      Pastilles captées dans la zone bandelette
                    </span>
                    <span>
                      {overlayTouched
                        ? "Zones alignées"
                        : "Glissez pH / Stabilisant sur vos pastilles"}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {livePadColors.map((pad) => (
                      <div
                        key={pad.key}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200"
                      >
                        <span
                          className="w-4 h-4 rounded border border-black/15 shrink-0"
                          style={{ backgroundColor: pad.hex }}
                        />
                        <span className="text-[11px] font-semibold text-slate-800 truncate">
                          {pad.shortLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Main Analyze Button */}
              <button
                type="button"
                onClick={analyzeCapturedPhoto}
                disabled={isAnalyzing}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="font-mono-num">
                      Analyse rapide... ({analysisElapsedSec} s)
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyser la bandelette</span>
                  </>
                )}
              </button>

              {/* Optional Advanced Tools Accordion (Black-point & Delta-E pipette) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedTools((v) => !v)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  {showAdvancedTools ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>Outils avancés (point noir, pipette Lab)</span>
                </button>

                {showAdvancedTools && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPipetteMode(false);
                          setCalibPickMode((m) => (m === "black" ? null : "black"));
                        }}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium border ${
                          calibPickMode === "black"
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white border-slate-200 text-slate-700"
                        }`}
                      >
                        {blackSampleRgb ? "Point noir OK" : "+ Point noir (soleil fort)"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCalibPickMode(null);
                          setPipetteMode((v) => !v);
                        }}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                          pipetteMode
                            ? "bg-sky-50 border-sky-500 text-sky-800"
                            : "bg-white border-slate-200 text-slate-700"
                        }`}
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Pipette Delta-E</span>
                      </button>

                      {whiteCalibInfo && (
                        <button
                          type="button"
                          onClick={() => {
                            setWhiteSampleRgb(null);
                            setBlackSampleRgb(null);
                            recomputeCalibratedPhoto(null, null);
                          }}
                          className="text-xs text-slate-500 hover:underline ml-auto"
                        >
                          Réinit. blanc
                        </button>
                      )}
                    </div>

                    {pipetteMode && (
                      <div className="space-y-2 pt-1 border-t border-slate-200">
                        <div className="flex items-center gap-3 text-xs">
                          <label className="text-slate-600">
                            A :
                            <input
                              type="text"
                              value={swatchALabel}
                              onChange={(e) => setSwatchALabel(e.target.value)}
                              className="ml-1 w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono-num"
                            />
                          </label>
                          <label className="text-slate-600">
                            B :
                            <input
                              type="text"
                              value={swatchBLabel}
                              onChange={(e) => setSwatchBLabel(e.target.value)}
                              className="ml-1 w-12 px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono-num"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { id: "pad", label: "Pastille", val: pipetteColors.pad?.hex },
                              {
                                id: "swatchA",
                                label: `Étalon ${swatchALabel}`,
                                val: pipetteColors.swatchA?.hex,
                              },
                              {
                                id: "swatchB",
                                label: `Étalon ${swatchBLabel}`,
                                val: pipetteColors.swatchB?.hex,
                              },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setPipetteTarget(item.id)}
                              className={`p-1.5 rounded-lg border text-left text-[11px] bg-white ${
                                pipetteTarget === item.id
                                  ? "border-sky-600"
                                  : "border-slate-200"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0"
                                  style={{ backgroundColor: item.val || "#E2E8F0" }}
                                />
                                <span className="font-medium truncate">{item.label}</span>
                              </div>
                            </button>
                          ))}
                        </div>

                        {pipetteVerdict && (
                          <div className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between">
                            <span>Plus proche : {pipetteVerdict.closerTo}</span>
                            {pipetteVerdict.interpolated !== null && (
                              <strong className="font-mono-num text-sky-700">
                                ≈ {pipetteVerdict.interpolated}
                              </strong>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty Capture Prompt — Clean Smartphone-First Layout */
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 sm:p-7 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  Photographiez votre bandelette AquaChek
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-sm mx-auto">
                  Posez la bandelette à droite du flacon, puis alignez les 4 repères
                  colorés sur vos pastilles.
                </p>
              </div>

              {cameraError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  {cameraError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>Prendre photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Galerie / Photos</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="text-slate-600 hover:text-slate-900 hover:underline font-medium"
                >
                  Caméra directe avec mire
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={loadSampleCalibrationPhoto}
                  className="inline-flex items-center gap-1.5 font-semibold text-sky-700 hover:underline"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Tester avec Piscine test.jpg</span>
                </button>
              </div>

              {/* Direct native camera input (Android & iOS) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
              {/* Gallery / Photos library input without capture attribute */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {analysisError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
              {analysisError}
            </div>
          )}
        </div>

        {/* Step 2: Clean e-Pool Connect / Spalyzer Style Results */}
        <div className="lg:col-span-6 space-y-4">
          {!scanResult && !isAnalyzing && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Lecture simple en 3 étapes
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">1. Photo</div>
                  <p className="text-slate-600">
                    Bandelette posée à droite de la boîte AquaChek.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">2. Zones</div>
                  <p className="text-slate-600">
                    Alignez les 4 carrés (pH, Cl, TAC, CYA) sur vos pastilles.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">3. Résultat</div>
                  <p className="text-slate-600">
                    Ajustez si besoin d'un toucher et enregistrez avec la T°.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Lecture colorimétrique rapide...{" "}
                    <span className="font-mono-num text-sky-700">
                      ({analysisElapsedSec} s)
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Photo optimisée · Comparaison directe avec les carrés du flacon.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-xl bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            </div>
          )}

          {scanResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              {/* Compact Result Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Résultats de l'analyse
                </h2>
                <span className="text-xs font-medium text-slate-500">
                  Boîte {scanResult.bottleDetected ? "repérée" : "non visible"} · Éclairage{" "}
                  {scanResult.lightingQuality}
                </span>
              </div>

              {editableReadings.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900">
                  Aucune pastille réactive lue nettement. Alignez la zone bandelette ou
                  étalonnez le blanc puis relancez l'analyse.
                </div>
              ) : (
                <>
                  {/* Clean 2-column grid on tablet/PC, clean stack on smartphone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {editableReadings.map((reading, idx) => {
                      const meta =
                        reading.parameterKey !== "other" &&
                        reading.parameterKey in PARAMETER_META
                          ? PARAMETER_META[reading.parameterKey as ParameterKey]
                          : null;
                      const evalResult = meta
                        ? evaluateParameterStatus(meta.key, reading.confirmedValue)
                        : null;
                      const statusColorClass =
                        evalResult?.status === "optimal"
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : evalResult?.status === "critique"
                          ? "text-red-700 bg-red-50 border-red-200"
                          : "text-amber-700 bg-amber-50 border-amber-200";
                      const isExpanded = expandedDetailIdx === idx;

                      return (
                        <div
                          key={`${reading.parameterKey}-${idx}`}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5"
                        >
                          {/* Row 1: Parameter Name + Status Badge */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {meta ? meta.shortLabel : reading.label}
                            </span>
                            {evalResult && (
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusColorClass}`}
                              >
                                {evalResult.label}
                              </span>
                            )}
                          </div>

                          {/* Row 2: Big Crisp Value + Nudge Controls */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                title="Pastille lue"
                                className="w-4 h-4 rounded border border-slate-300 shrink-0"
                                style={{
                                  backgroundColor: reading.padHex || "#E2E8F0",
                                }}
                              />
                              <span className="font-mono-num text-xl font-bold text-slate-900">
                                {reading.confirmedValue}
                              </span>
                              <span className="text-xs text-slate-500">
                                {reading.unit !== "pH" ? reading.unit : ""}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                aria-label={`Diminuer ${reading.label}`}
                                onClick={() =>
                                  updateConfirmedValue(
                                    idx,
                                    Math.max(
                                      meta?.min ?? 0,
                                      reading.confirmedValue - (meta?.step ?? 0.1)
                                    )
                                  )
                                }
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Augmenter ${reading.label}`}
                                onClick={() =>
                                  updateConfirmedValue(
                                    idx,
                                    Math.min(
                                      meta?.max ?? 1000,
                                      reading.confirmedValue + (meta?.step ?? 0.1)
                                    )
                                  )
                                }
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Row 3: Compact Interactive Color Scale Bar */}
                          {meta && (
                            <div
                              className="grid gap-1"
                              style={{
                                gridTemplateColumns: `repeat(${meta.swatches.length}, minmax(0, 1fr))`,
                              }}
                            >
                              {meta.swatches.map((swatch) => {
                                const isClosest =
                                  Math.abs(reading.confirmedValue - swatch.value) <=
                                  (meta.step === 0.1 ? 0.25 : meta.step * 0.8);
                                return (
                                  <button
                                    key={swatch.value}
                                    type="button"
                                    onClick={() =>
                                      updateConfirmedValue(idx, swatch.value)
                                    }
                                    title={`${swatch.label} — ${swatch.description}`}
                                    className={`rounded-md p-0.5 border text-center transition-all ${
                                      isClosest
                                        ? "border-sky-600 ring-1 ring-sky-400 bg-white"
                                        : "border-transparent hover:border-slate-300"
                                    }`}
                                  >
                                    <div
                                      className="w-full h-3.5 rounded-sm border border-black/10"
                                      style={{ backgroundColor: swatch.hex }}
                                    />
                                    <div className="font-mono-num text-[10px] font-semibold text-slate-700 mt-0.5 leading-tight">
                                      {swatch.label}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Optional compact details toggle */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                            <span className="truncate">{reading.matchedScaleStep}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDetailIdx(isExpanded ? null : idx)
                              }
                              className="text-sky-700 font-medium hover:underline shrink-0 ml-2"
                            >
                              {isExpanded ? "Masquer" : "Détail"}
                            </button>
                          </div>

                          {isExpanded && (
                            <p className="text-[11px] text-slate-600 leading-relaxed pt-1 border-t border-slate-200/70">
                              {reading.comparisonNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Water Temperature + Save */}
                  <div className="pt-2 space-y-3 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/50 border border-amber-200/80">
                      <div className="flex items-center gap-2">
                        <Thermometer className="w-4 h-4 text-amber-700 shrink-0" />
                        <label
                          htmlFor="scan-temp"
                          className="text-xs font-semibold text-slate-900"
                        >
                          Eau (°C)
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Diminuer la température"
                          onClick={() =>
                            setWaterTemperature((t) =>
                              Math.max(5, Number((t - 0.5).toFixed(1)))
                            )
                          }
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          id="scan-temp"
                          type="number"
                          step="0.5"
                          min="5"
                          max="42"
                          value={waterTemperature}
                          onChange={(e) =>
                            setWaterTemperature(
                              parseFloat(e.target.value) || defaultTemperatureC
                            )
                          }
                          className="w-16 min-h-[36px] text-center px-1.5 py-1 rounded-lg bg-white border border-slate-200 font-mono-num text-sm font-bold text-slate-900"
                        />
                        <button
                          type="button"
                          aria-label="Augmenter la température"
                          onClick={() =>
                            setWaterTemperature((t) =>
                              Math.min(42, Number((t + 0.5).toFixed(1)))
                            )
                          }
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={scanNotes}
                      onChange={(e) => setScanNotes(e.target.value)}
                      placeholder="Note optionnelle (ex. : après 1 galet de chlore lent...)"
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />

                    <button
                      type="button"
                      onClick={handleSaveScan}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      <span>Enregistrer l'analyse ({waterTemperature} °C)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
