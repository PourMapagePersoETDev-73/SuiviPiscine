import React, { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { AppTheme } from "../types/pool";

export const THEME_OPTIONS: {
  id: AppTheme;
  label: string;
  swatchBg: string;
  swatchBorder: string;
  metaThemeColor: string;
}[] = [
  {
    id: "light",
    label: "Clair",
    swatchBg: "#ffffff",
    swatchBorder: "#cbd5e1",
    metaThemeColor: "#0284c7",
  },
  {
    id: "gray",
    label: "Gris",
    swatchBg: "#cbd5e1",
    swatchBorder: "#64748b",
    metaThemeColor: "#475569",
  },
  {
    id: "dark",
    label: "Sombre",
    swatchBg: "#0f172a",
    swatchBorder: "#475569",
    metaThemeColor: "#0b1220",
  },
  {
    id: "blue",
    label: "Bleu",
    swatchBg: "#bae6fd",
    swatchBorder: "#0284c7",
    metaThemeColor: "#0369a1",
  },
];

interface ThemeSwitcherProps {
  theme: AppTheme;
  onChange: (theme: AppTheme) => void;
  variant?: "bar" | "menu";
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  theme,
  onChange,
  variant = "bar",
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current = THEME_OPTIONS.find((t) => t.id === theme) ?? THEME_OPTIONS[0];

  if (variant === "menu") {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Changer le thème (actuel : ${current.label})`}
          title={`Thème : ${current.label}`}
          className="min-h-[38px] md:min-h-[42px] px-2.5 md:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <span
            className="w-3 h-3 rounded-full border shrink-0"
            style={{
              backgroundColor: current.swatchBg,
              borderColor: current.swatchBorder,
            }}
          />
          <Palette className="w-3.5 h-3.5 sm:hidden" />
          <span className="hidden sm:inline">{current.label}</span>
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Choisir un thème"
            className="theme-popover absolute right-0 mt-2 w-44 rounded-xl bg-white border border-slate-200 shadow-lg p-1.5 z-50 space-y-0.5"
          >
            <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Thème
            </div>
            {THEME_OPTIONS.map((opt) => {
              const isSelected = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? "bg-sky-50 text-sky-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border shrink-0"
                      style={{
                        backgroundColor: opt.swatchBg,
                        borderColor: opt.swatchBorder,
                      }}
                    />
                    <span>{opt.label}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l'application"
      className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
    >
      {THEME_OPTIONS.map((opt) => {
        const isSelected = opt.id === theme;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.id)}
            className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              isSelected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full border shrink-0"
              style={{
                backgroundColor: opt.swatchBg,
                borderColor: opt.swatchBorder,
              }}
            />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
