// ═══ MASTERMIND v11 — glavni um koji ujedinjuje SVE u aplikaciji ═══
// Jedan prekidač: kad ga uključiš, Mastermind sam bira najbolje modele,
// sam pali sve potrebne motore (OMNI, ansambl, super točnost, Snajper v9,
// ANTI-GREŠKA, Titan v10) i spaja ih u jedan lanac odlučivanja prije nego
// Luna izgovori tip. Sve postavke ostaju tvoje — Mastermind ih samo
// nadograđuje u trenutku odgovora (ne briše ono što si ručno namjestio).
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";
import { AUTO_SPECIALISTS } from "./specialists";
import { loadSuper, saveSuper, SUPER_MODES, type SuperPrefs } from "./superaccuracy";
import { loadSniper, saveSniper, SNIPER_FILTERS, type SniperPrefs } from "./sniper";
import { loadTitan, saveTitan, TITAN_MODULES, type TitanPrefs } from "./titan";
import { loadAntiError, saveAntiError, type AntiErrorPrefs } from "./antierror";
import { loadOmni, saveOmni, type OmniPrefs } from "./omni";

export type MasterLevel = "balanced" | "strict" | "maximum";

export interface MastermindPrefs {
  /** Glavni prekidač — ručna aktivacija. */
  enabled: boolean;
  /** Na koja tržišta se primjenjuje. */
  markets: Partial<Record<Market, boolean>>;
  /** Razina strogosti. */
  level: MasterLevel;
  /** Automatski uključi najbolje modele za traženo tržište. */
  autoModels: boolean;
  /** Automatski pokreni sve motore (OMNI, ansambl, super točnost). */
  autoEngines: boolean;
  /** Automatski primijeni Snajper v9 filtre. */
  autoSniper: boolean;
  /** Automatski primijeni ANTI-GREŠKA zaštitu. */
  autoAntiError: boolean;
  /** Automatski primijeni Titan v10 presudu. */
  autoTitan: boolean;
  /** Koliko modela smije paralelno angažirati. */
  maxModels: number;
  /** Broj internih prolaza (self-consistency) prije objave. */
  passes: number;
  /** Minimalna sigurnost da tip uopće izađe. */
  minConfidence: number;
  /** Minimalno slaganje izvora (%). */
  minAgreement: number;
  /** Radije ponudi sigurniju liniju nego "PRESKAČEM". */
  preferSaferLine: boolean;
  /** Jedan jedini konačni tip (bez lepeze alternativa). */
  singleAnswer: boolean;
  /** Obavezan blok s izvorima brojki. */
  showAudit: boolean;
}

export const DEFAULT_MASTERMIND: MastermindPrefs = {
  enabled: false,
  markets: { btts: true, ou25: true, "1x2": true, htft: true, htx: true, htgoals: true, opce: false },
  level: "strict",
  autoModels: true,
  autoEngines: true,
  autoSniper: true,
  autoAntiError: true,
  autoTitan: true,
  maxModels: 8,
  passes: 3,
  minConfidence: 70,
  minAgreement: 75,
  preferSaferLine: true,
  singleAnswer: true,
  showAudit: true,
};

const KEY = "andromeda.mastermind.v11";

export function loadMastermind(): MastermindPrefs {
  const raw = loadJSON<Partial<MastermindPrefs>>(KEY, {});
  return {
    ...DEFAULT_MASTERMIND,
    ...raw,
    markets: { ...DEFAULT_MASTERMIND.markets, ...(raw.markets ?? {}) },
  };
}

export function saveMastermind(p: MastermindPrefs): void {
  saveJSON(KEY, p);
}

export function mastermindActive(p: MastermindPrefs, market: Market): boolean {
  return p.enabled && Boolean(p.markets[market]);
}

export const LEVEL_LABEL: Record<MasterLevel, string> = {
  balanced: "Uravnoteženo (više tipova, umjerena strogost)",
  strict: "Strogo (manje tipova, veća točnost)",
  maximum: "Maksimalna točnost (samo tipovi visoke sigurnosti)",
};

const LEVEL_BOOST: Record<MasterLevel, { conf: number; agree: number; passes: number }> = {
  balanced: { conf: -8, agree: -10, passes: 0 },
  strict: { conf: 0, agree: 0, passes: 1 },
  maximum: { conf: 8, agree: 8, passes: 2 },
};

/** Efektivni pragovi nakon razine strogosti. */
export function effectiveThresholds(p: MastermindPrefs) {
  const b = LEVEL_BOOST[p.level];
  return {
    minConfidence: Math.min(98, Math.max(50, p.minConfidence + b.conf)),
    minAgreement: Math.min(98, Math.max(50, p.minAgreement + b.agree)),
    passes: Math.min(6, p.passes + b.passes),
  };
}

// ───────── automatsko podizanje ostalih motora u trenutku odgovora ─────────

export function boostSuper(p: MastermindPrefs, s: SuperPrefs): SuperPrefs {
  if (!p.autoEngines) return s;
  const modes = { ...s.modes };
  for (const m of SUPER_MODES) modes[m.id] = true;
  return { ...s, modes };
}

export function boostSniper(p: MastermindPrefs, s: SniperPrefs): SniperPrefs {
  if (!p.autoSniper) return s;
  const on = { ...s.on };
  for (const f of SNIPER_FILTERS) on[f.id] = true;
  const t = effectiveThresholds(p);
  return { ...s, on, minProb: Math.max(s.minProb, t.minConfidence / 100) };
}

export function boostTitan(p: MastermindPrefs, t: TitanPrefs): TitanPrefs {
  if (!p.autoTitan) return t;
  const on = { ...t.on };
  for (const m of TITAN_MODULES) on[m.id] = true;
  const th = effectiveThresholds(p);
  return { ...t, on, minSources: Math.max(t.minSources, 3), gradeA: Math.max(t.gradeA, th.minConfidence / 100) };
}

export function boostAntiError(p: MastermindPrefs, a: AntiErrorPrefs): AntiErrorPrefs {
  if (!p.autoAntiError) return a;
  const th = effectiveThresholds(p);
  return {
    ...a,
    enabled: true,
    applyAll: true,
    applyBtts: true,
    applyOu25: true,
    forceEngines: true,
    numericAudit: true,
    hallucinationGuard: true,
    crossMarketCheck: true,
    saferLine: p.preferSaferLine,
    minConfidence: Math.max(a.minConfidence, th.minConfidence),
    minAgreement: Math.max(a.minAgreement, th.minAgreement),
    passes: Math.max(a.passes, th.passes),
  };
}

export function boostOmni(p: MastermindPrefs, o: OmniPrefs): OmniPrefs {
  if (!p.autoEngines) return o;
  const th = effectiveThresholds(p);
  return {
    ...o,
    enabled: true,
    brains: { openrouter: true, nvidia: true, huggingface: true, groq: true, gemini: true },
    modelsPerBrain: Math.max(o.modelsPerBrain, Math.min(8, Math.ceil(p.maxModels / 3))),
    passes: Math.max(o.passes, Math.min(3, th.passes)),
    minConfidence: Math.max(o.minConfidence, th.minConfidence),
    bothMarkets: true,
  };
}

/** Jednokratno trajno uključivanje svega (gumb "Aktiviraj sve najbolje"). */
export function activateEverything(p: MastermindPrefs): void {
  saveSuper(boostSuper(p, loadSuper()));
  saveSniper(boostSniper(p, loadSniper()));
  saveTitan(boostTitan(p, loadTitan()));
  saveAntiError(boostAntiError(p, loadAntiError()));
  saveOmni(boostOmni(p, loadOmni()));
}

/** Najbolji automatski modeli za traženo tržište. */
export function autoModelsFor(market: Market, max: number): string[] {
  return AUTO_SPECIALISTS.filter((s: { markets: Market[] }) => s.markets.includes(market) || s.markets.includes("opce"))
    .slice(0, Math.max(1, max))
    .map((s: { id: string }) => s.id);
}

/** Blok za sistemski prompt. */
export function mastermindDirectives(p: MastermindPrefs, market: Market): string {
  if (!mastermindActive(p, market)) return "";
  const t = effectiveThresholds(p);
  const models = p.autoModels ? autoModelsFor(market, p.maxModels) : [];
  return `\n\n═══ MASTERMIND v11 — GLAVNI UM (RUČNO AKTIVIRAN · razina: ${LEVEL_LABEL[p.level]}) ═══
Mastermind je vrhovni koordinator: on odlučuje koji se motori i modeli koriste i sve njihove izlaze spaja u JEDAN konačan odgovor. Nikad ne proturječi strožem modulu — uvijek vrijedi najstroža granica u lancu.
1) AUTOMATSKI IZBOR MODELA: angažiraj do ${p.maxModels} najjačih dostupnih modela za ovo tržište${models.length ? ` (preporučeni: ${models.join(", ")})` : ""} i njihove procjene tretiraj kao neovisne izvore.
2) AUTOMATSKI MOTORI: ${p.autoEngines ? "OMNI gol motor, ansambl konsenzus i sve super točnosti smatraj uključenima" : "koristi samo ono što je ručno uključeno"}; ${p.autoSniper ? "Snajper v9 filtri vrijede svi" : "Snajper po ručnoj postavci"}; ${p.autoAntiError ? "ANTI-GREŠKA zaštita je uključena" : "ANTI-GREŠKA po ručnoj postavci"}; ${p.autoTitan ? "Titan v10 donosi konačnu presudu" : "Titan po ručnoj postavci"}.
3) LANAC ODLUKE (obavezan redoslijed): podaci → λ_dom/λ_gost → matrica 0..6 s Dixon-Coles → druga neovisna metoda (Monte Carlo/kopula/hazard) → de-vig tržište → spajanje u logit prostoru → kalibracija → filtri → konačna presuda.
4) ${t.passes} interna prolaza (self-consistency). Ako se prolazi razlikuju više od 6 postotnih bodova, uzmi medijan i smanji sigurnost.
5) PRAGOVI: tip izlazi samo uz kalibriranu sigurnost ≥ ${t.minConfidence}% i slaganje izvora ≥ ${t.minAgreement}%. ${p.preferSaferLine ? "Ako padne — ponudi sigurniju liniju (Over 1.5, Under 3.5, dvostruka šansa, 'GG ili Over 2.5') i objasni zašto." : "Ako padne — napiši velikim slovima PRESKAČEM."}
6) ${p.singleAnswer ? "JEDAN KONAČAN TIP: prva rečenica = tip + sigurnost u %. Bez lepeze varijanti; najviše jedna alternativa na kraju." : "Dopuštene su dvije varijante tipa."}
7) ${p.showAudit ? "REVIZIJA: na kraju kratki blok 'MASTERMIND REVIZIJA' — λ_dom, λ_gost, p glavnog tipa, raspon (min–max izvora), slaganje %, edge, Kelly i glavni rizik u jednoj rečenici." : "Bez revizijskog bloka."}
8) Nijedna brojka bez izvora ili jasne oznake "pretpostavka". Ako podatak ne postoji, reci koji fali umjesto da ga izmisliš.`;
}
