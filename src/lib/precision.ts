// ═══ PRECIZNOST PROTOKOL v9 — sloj točnosti za SVA tržišta ═══
// Brat blizanac Titan v10 i ANTI-GREŠKE: kad je uključen, Luna prije objave
// tipa mora kalibrirati procjenu prema tržištu, provjeriti brojke s dvije
// neovisne metode i priznati kad podatak ne postoji.
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

export interface PrecisionPrefs {
  /** Glavni prekidač — ručna aktivacija. */
  enabled: boolean;
  /** Na koja tržišta se primjenjuje (prazno = sva). */
  markets: Partial<Record<Market, boolean>>;
  /** Kalibracija prema tržištu: p' = (n·p + m·pm)/(n+m), tržište ima prednost. */
  calibration: boolean;
  /** Dvije neovisne metode (matrica rezultata + druga: Monte Carlo/kopula/kvote). */
  dualMethod: boolean;
  /** Revizija brojki: svaka brojka ima izvor ili je označena pretpostavka. */
  numericAudit: boolean;
  /** Zabrana izmišljanja imena, rezultata, ozljeda i kvota. */
  hallucinationGuard: boolean;
  /** Minimalna kalibrirana sigurnost za objavu tipa (%). */
  minProb: number;
  /** Maksimalno dopušteno odstupanje modela od tržišta (postotni bodovi). */
  maxDeviationPb: number;
  /** Kelly ulog uz glavni tip (frakcija banke). */
  kellyFraction: number;
}

export const DEFAULT_PRECISION: PrecisionPrefs = {
  enabled: false,
  markets: { btts: true, ou25: true, "1x2": true, htft: true, htx: true, htgoals: true, opce: true },
  calibration: true,
  dualMethod: true,
  numericAudit: true,
  hallucinationGuard: true,
  minProb: 60,
  maxDeviationPb: 12,
  kellyFraction: 0.25,
};

const KEY = "andromeda.precision.v9";

export function loadPrecision(): PrecisionPrefs {
  const raw = loadJSON<Partial<PrecisionPrefs>>(KEY, {});
  return {
    ...DEFAULT_PRECISION,
    ...raw,
    markets: { ...DEFAULT_PRECISION.markets, ...(raw.markets ?? {}) },
  };
}

export function savePrecision(p: PrecisionPrefs): void {
  saveJSON(KEY, p);
}

/** Vrijedi li protokol za traženo tržište? */
export function precisionActive(p: PrecisionPrefs, market: Market): boolean {
  return p.enabled && Boolean(p.markets[market] ?? true);
}

/** Blok za sistemski prompt — isto prvo tržište, pa override za "opce". */
export function precisionDirectives(p0: Market, p1: PrecisionPrefs): string {
  const market = p0;
  const p = p1;
  if (!precisionActive(p, market)) return "";
  const rules: string[] = [];
  if (p.dualMethod)
    rules.push(
      "DVOSTRUKA METODA: glavnu vjerojatnost izračunaj dvjema neovisnim metodama (Poisson/Dixon-Coles matrica rezultata + Monte Carlo, kopula/game-state hazard ili de-vig tržište). Ako se razlikuju više od 5 postotnih bodova, uzmi manju i smanji sigurnost.",
    );
  if (p.calibration)
    rules.push(
      `KALIBRACIJA PREMA TRŽIŠTU: de-vigiraj kladioničarske kvote i usporedi sa svojim p. Završna procjena je p' = (n·p + m·pm)/(n+m) uz m ≥ n (tržište je pametnije). Ako se tvoj p razlikuje od tržišta više od ${p.maxDeviationPb} postotnih bodova, provjeri jeste li pogriješili ti ili tržište prije nego hvataš value.`,
    );
  if (p.numericAudit)
    rules.push(
      "REVIZIJA BROJKI: svaka brojka u odgovoru mora imati izvor (podatak, izračun ili kvota) ili biti izričito označena kao pretpostavka. Bez izuzetaka.",
    );
  if (p.hallucinationGuard)
    rules.push(
      "ZAŠTITA OD IZMIŠLJANJA: zabranjeno je izmišljati imena igrača, ozljede, rezultate, kvote i statistike. Ako podatak nemaš, napiši 'nemam podatak', navedi pretpostavku i smanji sigurnost.",
    );
  rules.push(
    `PRAG OBJAVE: tip objavi samo uz kalibriranu sigurnost ≥ ${p.minProb}%; ispod toga ponudi sigurniju liniju ili napiši PRESKAČEM.`,
  );
  rules.push(
    `KELLY: uz glavni tip navedi preporučeni ulog kao frakcijski Kelly ×${p.kellyFraction} banke, nikad puni Kelly.`,
  );
  return `\n\n═══ PRECIZNOST PROTOKOL v9 (RUČNO AKTIVIRAN — tržište: ${market}) ═══
Protokol preciznosti vrijedi za SVAKI tip u ovom odgovoru i ne smije se zaobići ni jednom brojkom.
${rules.map((r, i) => `${i + 1}) ${r}`).join("\n")}
Na kraju odgovora u jednoj liniji napiši koje si korake preciznosti primijenio.`;
}
