import { useState, useEffect, useCallback } from "react";

export type SharpPreset = "syndicate" | "banker" | "value_hunter" | "anti_trap";

export interface SharpFilterSettings {
  enabled: boolean;
  preset: SharpPreset;
  minProb: number; // 0.0 - 1.0 (npr. 0.65 za 65%)
  minEV: number; // u postocima, npr. 2.0 za +2%
  maxMargin: number; // max marža kladionice u %, npr. 7.5%
  minOdds: number; // minimalna kvota
  maxOdds: number; // maksimalna kvota
  antiDrawFilter: boolean; // odbacuje čistu pobjedu ako je remi > 28%
  onlyCertified: boolean; // filtrira/skriva necertificirane tipove
}

export const SHARP_PRESETS: Record<
  SharpPreset,
  { name: string; icon: string; desc: string; settings: Omit<SharpFilterSettings, "enabled" | "preset"> }
> = {
  syndicate: {
    name: "Balansirani Sindikat",
    icon: "🎯",
    desc: "Optimalan omjer visoke vjerojatnosti (≥62%) i stabilnog prinosa.",
    settings: {
      minProb: 0.62,
      minEV: 1.5,
      maxMargin: 7.5,
      minOdds: 1.25,
      maxOdds: 3.5,
      antiDrawFilter: true,
      onlyCertified: false,
    },
  },
  banker: {
    name: "Ultra Banker (72%+)",
    icon: "🛡️",
    desc: "Samo matematički najsigurniji tipovi s minimalnim rizikom gubitka.",
    settings: {
      minProb: 0.72,
      minEV: -2.0,
      maxMargin: 8.5,
      minOdds: 1.2,
      maxOdds: 2.1,
      antiDrawFilter: true,
      onlyCertified: true,
    },
  },
  value_hunter: {
    name: "Value Hunter (EV ≥ +4%)",
    icon: "💎",
    desc: "Otkriva krive procjene kladionica gdje je kvota znatno veća od fer vrijednosti.",
    settings: {
      minProb: 0.38,
      minEV: 4.0,
      maxMargin: 6.5,
      minOdds: 1.45,
      maxOdds: 4.5,
      antiDrawFilter: false,
      onlyCertified: false,
    },
  },
  anti_trap: {
    name: "Anti-Trap Smart Money",
    icon: "⚡",
    desc: "Eliminira 'narodne zicere' s lihvarskim maržama i rizikom favorita.",
    settings: {
      minProb: 0.58,
      minEV: 2.5,
      maxMargin: 6.0,
      minOdds: 1.3,
      maxOdds: 3.2,
      antiDrawFilter: true,
      onlyCertified: true,
    },
  },
};

const STORAGE_KEY = "andromeda.sharp_filter.v1";
const EVENT_NAME = "andromeda:sharp-filter-changed";

export const DEFAULT_SHARP_SETTINGS: SharpFilterSettings = {
  enabled: false,
  preset: "syndicate",
  ...SHARP_PRESETS.syndicate.settings,
};

export function getSharpSettings(): SharpFilterSettings {
  if (typeof window === "undefined") return DEFAULT_SHARP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHARP_SETTINGS;
    return { ...DEFAULT_SHARP_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SHARP_SETTINGS;
  }
}

export function saveSharpSettings(settings: SharpFilterSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: settings }));
}

export interface SharpVerdict {
  approved: boolean;
  status: "DIAMOND" | "GOLD" | "VALUE" | "TRAP" | "NEUTRAL";
  badgeText: string;
  badgeClass: string;
  reasons: string[];
  ev: number | null;
  fairOdds: number | null;
  p: number;
}

/**
 * Glavni matematički evaluator — provjerava tip prema pravilima aktivnog profila.
 */
export function evaluateTip(
  p: number,
  odd?: number | null,
  options?: {
    market?: string;
    label?: string;
    bookmakerMargin?: number;
    drawProb?: number;
    customSettings?: SharpFilterSettings;
  }
): SharpVerdict {
  const cfg = options?.customSettings ?? getSharpSettings();
  const fairOdds = p > 0 ? 1 / p : null;
  const ev = odd && isFinite(odd) && p > 0 ? (p * odd - 1) * 100 : null;
  const margin = options?.bookmakerMargin ?? 5.5;
  const drawProb = options?.drawProb ?? 0;

  // Ako filter nije uključen, vraća neutralan status
  if (!cfg.enabled) {
    return {
      approved: true,
      status: "NEUTRAL",
      badgeText: "STANDARD",
      badgeClass: "bg-muted text-muted-foreground",
      reasons: [],
      ev,
      fairOdds,
      p,
    };
  }

  const reasons: string[] = [];
  let isTrap = false;

  // 1. Provjera marže kladionice (Vig)
  if (margin > cfg.maxMargin) {
    reasons.push(`Previsoka marža kladionice (${margin.toFixed(1)}% > ${cfg.maxMargin}%) — nepovoljan tečaj`);
    isTrap = true;
  }

  // 2. Anti-draw provjera (kad je oklada na favorita, a šansa za remi velika)
  if (cfg.antiDrawFilter && (options?.label?.startsWith("1") || options?.label?.startsWith("2"))) {
    if (drawProb > 0.28) {
      reasons.push(`Rizičan favorit: Visoka šansa za remi (${(drawProb * 100).toFixed(0)}%)`);
      isTrap = true;
    }
  }

  // 3. Provjera raspona kvota
  if (odd) {
    if (odd < cfg.minOdds) {
      reasons.push(`Premala kvota (${odd.toFixed(2)} < ${cfg.minOdds}) — nema vrijednosti`);
      isTrap = true;
    } else if (odd > cfg.maxOdds) {
      // POPRAVAK: maksimalna kvota je obvezni limit, ne samo upozorenje.
      reasons.push(`Previsoka kvota (${odd.toFixed(2)} > ${cfg.maxOdds}) — previsok rizik`);
      isTrap = true;
    }
  }

  // 4. Provjera EV (Expected Value)
  const evPass = ev !== null ? ev >= cfg.minEV : p >= cfg.minProb;
  if (ev !== null && ev < cfg.minEV) {
    reasons.push(`Negativan ili prenizak EV (${ev > 0 ? "+" : ""}${ev.toFixed(1)}% < ${cfg.minEV > 0 ? "+" : ""}${cfg.minEV}%)`);
  }

  // 5. Provjera vjerojatnosti
  const probPass = p >= cfg.minProb;
  if (!probPass) {
    reasons.push(`Vjerojatnost ispod praga (${(p * 100).toFixed(1)}% < ${(cfg.minProb * 100).toFixed(0)}%)`);
  }

  // Određivanje certifikata
  if (p >= 0.72 && (!ev || ev >= -1.0) && !isTrap) {
    return {
      approved: true,
      status: "GOLD",
      badgeText: "🛡️ ULTRA BANKER",
      badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
      reasons: ["Izrazito visoka matematička vjerojatnost", "Minimalan rizik"],
      ev,
      fairOdds,
      p,
    };
  }

  if (ev !== null && ev >= 3.5 && p >= 0.45 && !isTrap) {
    return {
      approved: true,
      status: "DIAMOND",
      badgeText: "💎 SHARP VALUE",
      badgeClass: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-semibold",
      reasons: [`Matematički Edge +${ev.toFixed(1)}%`, "Kvota znatno iznad fer procjene"],
      ev,
      fairOdds,
      p,
    };
  }

  if (probPass && evPass && !isTrap) {
    return {
      approved: true,
      status: "VALUE",
      badgeText: "✓ SHARP ODOBRENO",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
      reasons: ["Prolazi sve kriterije sindikata"],
      ev,
      fairOdds,
      p,
    };
  }

  // Ako ne prolazi:
  return {
    approved: false,
    status: "TRAP",
    badgeText: isTrap ? "⚠️ KLADIONIČARSKA ZAMKA" : "✕ ODBAČENO OD FILTERA",
    badgeClass: "bg-destructive/15 text-destructive border border-destructive/30",
    reasons,
    ev,
    fairOdds,
    p,
  };
}

/**
 * React hook koji se automatski sinkronizira na svim karticama
 */
export function useSharpFilter() {
  const [settings, setSettings] = useState<SharpFilterSettings>(getSharpSettings);

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getSharpSettings());
    };
    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, enabled };
      saveSharpSettings(next);
      return next;
    });
  }, []);

  const setPreset = useCallback((preset: SharpPreset) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        preset,
        ...SHARP_PRESETS[preset].settings,
      };
      saveSharpSettings(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((partial: Partial<SharpFilterSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSharpSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const def = { ...DEFAULT_SHARP_SETTINGS };
    saveSharpSettings(def);
    setSettings(def);
  }, []);

  return {
    settings,
    enabled: settings.enabled,
    setEnabled,
    setPreset,
    updateSettings,
    resetSettings,
    evaluate: (p: number, odd?: number | null, opt?: Parameters<typeof evaluateTip>[2]) =>
      evaluateTip(p, odd, { ...opt, customSettings: settings }),
  };
}

