/* ═══════════════════════════════════════════════════════════════════
   EB-SHRINKAGE — Empirical Bayes smanjivanje uzorka (v1)
   ═══════════════════════════════════════════════════════════════════
   Problem koji rješava: kad tim ima manje od 5 zabilježenih utakmica,
   njegova forma (npr. 3 golova u 2 utakmice → 1.5 po meču) je buka.
   Staro ponašanje je bilo "hardcoded" globalni prosjek (1.35 po timu)
   za svakoga — sada se procjena smanjuje (shrinkage) prema STVARNOM
   povijesnom prosjeku TE LIGE, težinski:

       λ_final = (n · λ_forma + k · λ_liga) / (n + k),   k = 5

   Pri n = 0 → čisti ligaški prior; pri n = 5 → 50/50; pri n = 20 →
   80% forma. Ovo je klasičan Empirical Bayes (James–Stein duh).

   Također definira:
     • jeMaliUzorak(n)      — n < 5 (prag iz specifikacije)
     • MAX_POVJERENJE_MALI  — 55% strop povjerenja za mali uzorak
     • priorZaLigu(liga)    — ligaški prosjek golova (ukupno, po timu)
   ═══════════════════════════════════════════════════════════════════ */

/** Koliko utakmica forme smatramo "bukom" — ispod ovoga shrinkage je jak. */
export const EB_K = 5;

/** Strop povjerenja kad je uzorak mali (< 5 utakmica). */
export const MAX_POVJERENJE_MALI = 55;

/** Ukupni golovi (oba tima) — povijesni prosjek po ligi. */
export const LIGE_GOLI: Record<string, number> = {
  bundesliga: 3.15,
  eredivisie: 3.2,
  "2. bundesliga": 3.05,
  allsvenskan: 2.95,
  eliteserien: 3.05,
  "premier league": 2.85,
  championship: 2.55,
  "la liga": 2.55,
  "serie a": 2.7,
  "ligue 1": 2.75,
  "primeira liga": 2.6,
  hnl: 2.7,
  "super lig": 2.9,
  superliga: 2.75,
  "pro league": 2.95,
  mls: 3.0,
  "liga mx": 2.7,
  brasileirao: 2.4,
  "primera argentina": 2.25,
  "j1 league": 2.7,
  "k league": 2.6,
  "saudi pro": 2.9,
  "a-league": 3.0,
  ligue2: 2.35,
  "serie b": 2.45,
  ecb: 2.5,
  "ekstraklasa": 2.6,
  "fortuna liga": 2.6,
  "super sport hnl": 2.7,
  "first league": 2.55,
  "tweede divisie": 3.1,
  "liga portugal 2": 2.5,
  "j2 league": 2.55,
  "k league 2": 2.5,
  default: 2.68,
};

export type LigaPrior = { naziv: string; ukupno: number; poTimu: number; tocna: boolean };

/** Nađi ligaški prior po nazivu lige (slobodno uparivanje sadrži li naziv). */
export function priorZaLigu(liga?: string | null): LigaPrior {
  const t = (liga ?? "").toLowerCase();
  if (t) {
    for (const [k, v] of Object.entries(LIGE_GOLI)) {
      if (k === "default") continue;
      if (t.includes(k)) return { naziv: k, ukupno: v, poTimu: v / 2, tocna: true };
    }
  }
  return { naziv: "opći prosjek", ukupno: LIGE_GOLI.default!, poTimu: LIGE_GOLI.default! / 2, tocna: false };
}

/** Empirical Bayes shrinkage jedne stope (golovi/bodovi po meču) prema prioru. */
export function shrinkajStopu(n: number, stopa: number, prior: number, k: number = EB_K): number {
  const nn = Math.max(0, n);
  if (!Number.isFinite(stopa)) return prior;
  return (nn * stopa + k * prior) / (nn + k);
}

/** Je li uzorak mali (manje od 5 utakmica) → strop povjerenja 55%. */
export function jeMaliUzorak(n: number): boolean {
  return Math.max(0, n) < EB_K;
}

/** Vrati povjerenje uz eventualni strop za mali uzorak. */
export function stropPovjerenja(povjerenje: number, mali: boolean): number {
  return mali ? Math.min(Math.round(povjerenje), MAX_POVJERENJE_MALI) : Math.round(povjerenje);
}

