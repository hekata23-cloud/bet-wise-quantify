// ═══════════════════════════════════════════════════════════════════════════
// ANDROMEDA AI — MOTOR SUPER TOČNOSTI v7.0
// Dodatne "verzije super točnosti" koje se mogu pojedinačno aktivirati i koje
// STVARNO mijenjaju matematiku predikcije (nisu ukras):
//   · Hijerarhijski Bayes (empirical Bayes shrinkage po timu)
//   · Time-decay forma (eksponencijalno vaganje procjena po pouzdanosti)
//   · Elo/kvota → λ korekcija (usklađivanje omjera snaga)
//   · Zero-inflation (low-block / 0:0 masa)
//   · Overdispersion (negativni binom — realnija varijanca golova)
//   · Platt/Beta kalibracija vjerojatnosti
//   · HT/FT puna matrica 9 kombinacija
//   · Elitni BTTS & O/U ansambl v2
//   · Anti-pogreška zaštita (koherentnost + apstinencija)
// Sve su čiste funkcije bez ovisnosti o mreži i bez ovisnosti o Lovable AI.
// ═══════════════════════════════════════════════════════════════════════════
import { loadJSON, saveJSON } from "./storage";
import { pois, scoreMatrix, monteCarlo, type ScoreMatrix } from "./accuracy";
import type { Market } from "./specialists";
import {
  bttsCopula,
  ouGameStateHazard,
  mathPackBriefing,
  type BttsCopulaResult,
  type OuHazardResult,
} from "./formulas";

export type ModeId =
  | "hier"
  | "decay"
  | "elo"
  | "zip"
  | "disp"
  | "calib"
  | "htft9"
  | "eliteGoals"
  | "eliteHtft"
  | "antiError"
  | "bttsCopula"
  | "ouGameState"
  | "mathPack";

export interface ModeDef {
  id: ModeId;
  name: string;
  desc: string;
  detail: string;
  markets: Market[];
  defaultOn: boolean;
}

export const SUPER_MODES: ModeDef[] = [
  {
    id: "hier",
    name: "v6 · Hijerarhijski Bayes (empirical Bayes)",
    desc: "Snaga svakog tima se povlači prema ligi ovisno o količini podataka.",
    detail:
      "λ_tim se ne uzima zdravo za gotovo — spaja se s prosjekom lige težinom n/(n+k). Male uzorke kroti, velike ostavlja. Gasi 'prenapuhane' napade nakon 3 dobre utakmice.",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals"],
    defaultOn: true,
  },
  {
    id: "decay",
    name: "v6 · Time-decay forma i vaganje modela",
    desc: "Novije informacije i pouzdaniji modeli imaju veću težinu.",
    detail:
      "Članovi ansambla dobivaju težinu conf^γ, a modelima se u promptu nalaže eksponencijalno vaganje forme s poluživotom u danima. Manje šuma iz starih utakmica.",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals"],
    defaultOn: true,
  },
  {
    id: "elo",
    name: "v6 · Elo/kvota → λ korekcija",
    desc: "Omjer λ_dom/λ_gost usklađuje se s razlikom snaga iz kvota.",
    detail:
      "Iz 1X2 kvota (ili navedenog Elo ratinga) računa se očekivani rezultat; ako se omjer λ ne slaže s njim, λ se rotira uz zadržavanje λ_total. Vrhunsko za 1X2 i HT/FT.",
    markets: ["1x2", "htft", "htx"],
    defaultOn: true,
  },
  {
    id: "zip",
    name: "v7 · Zero-inflation (low-block modul)",
    desc: "Dodaje realnu masu na 0:0 i rezultate bez golova.",
    detail:
      "Čisti Poisson podcjenjuje 0:0 u defenzivnim ligama i derbijima. π masa se prebacuje na 0:0, ostatak matrice se renormalizira — točnije NG i Under, i puno točniji HT 0:0.",
    markets: ["btts", "ou25", "htgoals", "htx"],
    defaultOn: true,
  },
  {
    id: "disp",
    name: "v7 · Overdispersion (negativni binom)",
    desc: "Realnija varijanca golova — manje lažne sigurnosti.",
    detail:
      "λ se miješa po gama distribuciji (shape k), pa se raspodjela golova širi. Rezultat: Over 3.5 i 0:0 dobivaju stvarnu težinu, a postoci prestaju biti nerealno visoki.",
    markets: ["btts", "ou25", "htgoals", "1x2"],
    defaultOn: true,
  },
  {
    id: "calib",
    name: "v7 · Platt/Beta kalibracija",
    desc: "Ispravlja sustavnu pristranost postotaka.",
    detail:
      "P se provlači kroz logit transformaciju a·logit(p)+b. a<1 kroti prenapuhane tipove, b ispravlja nagib prema favoritima. Kalibrirani postoci = poštene kvote.",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals"],
    defaultOn: true,
  },
  {
    id: "htft9",
    name: "v7 · HT/FT puna matrica (9 kombinacija)",
    desc: "Egzaktan izračun svih 9 HT/FT ishoda, ne aproksimacija.",
    detail:
      "Poluvrijeme i drugo poluvrijeme se modeliraju kao dvije neovisne Poissonove matrice sa split faktorom, pa se konvoluiraju. Dobiješ 1/1, 1/X, 1/2, X/1 … 2/2 s točnim P.",
    markets: ["htft", "htx", "htgoals"],
    defaultOn: true,
  },
  {
    id: "eliteGoals",
    name: "v7 · NAPREDNI BTTS & OVER/UNDER ANSAMBL",
    desc: "Elitni gol-modeli idu prvi i ulaze u konsenzus.",
    detail:
      "Kad pitaš za GG/NG ili Over/Under, prvo se pozivaju elitni gol-modeli (Poisson jezgra, bivariate, de-vig kalibrator, Monte Carlo replikator). Medijan + MAD filtar izbacuje outliere.",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
  },
  {
    id: "eliteHtft",
    name: "v7 · NAPREDNI HT/FT & POLUVRIJEME ANSAMBL",
    desc: "Zaseban elitni ansambl za HT/FT, HT X i HT golove.",
    detail:
      "Modeli specijalizirani za dinamiku poluvremena: split λ, uvjetna vjerojatnost drugog dijela, preokreti i vodstva. Rezultat se spaja s punom HT/FT matricom.",
    markets: ["htft", "htx", "htgoals"],
    defaultOn: true,
  },
  {
    id: "antiError",
    name: "v7 · ANTI-POGREŠKA zaštita",
    desc: "Kad brojke nisu koherentne, bot ne pogađa — traži podatke ili nudi sigurniji tip.",
    detail:
      "Matrica, Monte Carlo i konsenzus modela moraju se slagati unutar tolerancije. Ako ne — sigurnost se automatski smanjuje, tip se degradira na sigurniju varijantu i jasno se navede što nedostaje.",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals", "opce"],
    defaultOn: true,
  },
  {
    id: "bttsCopula",
    name: "v8 · BTTS KOPULA MOTOR (korelirani golovi)",
    desc: "GG/NG se računa kopulom, ne pretpostavkom da su golovi neovisni.",
    detail:
      "Frank kopula povezuje P(dom ne zabije) i P(gost ne zabije). ρ > 0 = gol izaziva gol (otvorene utakmice), ρ < 0 = obostrano gušenje (derbi, low block). Bot dobiva GG, NG, P(0:0) i koliko postotnih bodova korelacija pomiče tip u odnosu na čisti Poisson — pa mora obrazložiti razliku.",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
  },
  {
    id: "ouGameState",
    name: "v8 · OVER/UNDER 2.5 GAME-STATE HAZARD",
    desc: "Golovi se modeliraju kroz vrijeme, uz stanje utakmice.",
    detail:
      "Nehomogeni Poissonov proces: λ(t) raste prema kraju, a β korekcija hvata scenarij 'moraju juriti gol' (+) ili 'favorit zatvara utakmicu' (−). Bot dobiva λ_eff, raspodjelu golova po trećinama (0-30, 30-60, 60-90) i Over 1.5/2.5/3.5 s pomakom u pb.",
    markets: ["ou25", "btts", "htgoals"],
    defaultOn: true,
  },
  {
    id: "mathPack",
    name: "v8 · PROŠIRENI MATEMATIČKI PAKET (svi tipovi)",
    desc: "Skellam, bivariate Poisson, Shin/power de-vig, Kelly, entropija, Bayes, crveni karton.",
    detail:
      "Bot za BILO KOJI tip mora primijeniti: Skellam za hendikep/DNB, bivariate Poisson za korelirani napad, Shin i power de-vig umjesto naivne normalizacije kvota, frakcijski Kelly, Shannon entropiju kao indeks kaosa, Bayesovo osvježavanje λ, Glicko-lite rating i scenarij rane crvene karte/penala.",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals", "opce"],
    defaultOn: true,
  },
];

export interface SuperPrefs {
  modes: Record<ModeId, boolean>;
  /** Hijerarhijski Bayes: pseudo-uzorak k (veći = jače povlačenje prema ligi). */
  hierK: number;
  /** Time-decay: poluživot forme u danima. */
  halfLifeDays: number;
  /** Time-decay: eksponent vaganja pouzdanosti članova (conf^γ). */
  confGamma: number;
  /** Elo korekcija: koliko se λ omjer smije rotirati (0–1). */
  eloPull: number;
  /** Zero-inflation π (0–0.12). */
  zeroInflate: number;
  /** Overdispersion shape k (veći = bliže čistom Poissonu). */
  dispK: number;
  /** Platt a (nagib). */
  plattA: number;
  /** Platt b (pomak). */
  plattB: number;
  /** Split λ prvo poluvrijeme (0.38–0.48). */
  htSplit: number;
  /** Anti-pogreška: tolerancija neslaganja matrice i Monte Carla (pb). */
  coherenceTol: number;
  /** Anti-pogreška: minimalno slaganje modela ispod kojeg se tip degradira. */
  minAgreement: number;
  /** BTTS kopula: korelacija golova ρ (−0.35 gušenje … +0.35 otvorena utakmica). */
  bttsRho: number;
  /** O/U game-state β (−0.5 zatvaranje utakmice … +0.5 juriš na gol). */
  ouBeta: number;
  /** O/U: nagib intenziteta golova prema kraju utakmice. */
  lateSkew: number;
  /** Matematički paket: frakcija Kellyja (0.1–1). */
  kellyFraction: number;
  /** Matematički paket: metoda uklanjanja marže. */
  devig: "shin" | "power" | "mult";
}

export const DEFAULT_SUPER: SuperPrefs = {
  modes: SUPER_MODES.reduce(
    (acc, m) => ({ ...acc, [m.id]: m.defaultOn }),
    {} as Record<ModeId, boolean>,
  ),
  hierK: 6,
  halfLifeDays: 45,
  confGamma: 1.3,
  eloPull: 0.5,
  zeroInflate: 0.035,
  dispK: 14,
  plattA: 0.92,
  plattB: 0,
  htSplit: 0.44,
  coherenceTol: 6,
  minAgreement: 0.45,
  bttsRho: 0.08,
  ouBeta: 0.05,
  lateSkew: 0.18,
  kellyFraction: 0.25,
  devig: "shin",
};

const KEY = "andromeda.super.prefs";

export function loadSuper(): SuperPrefs {
  const saved = loadJSON<Partial<SuperPrefs>>(KEY, {});
  return {
    ...DEFAULT_SUPER,
    ...saved,
    modes: { ...DEFAULT_SUPER.modes, ...(saved.modes ?? {}) },
  };
}
export function saveSuper(p: SuperPrefs): void {
  saveJSON(KEY, p);
}
export function isModeOn(p: SuperPrefs, id: ModeId): boolean {
  return p.modes[id] !== false && p.modes[id] === true;
}

// ───────────────────────── Hijerarhijski Bayes ─────────────────────────
/**
 * Empirical Bayes shrinkage λ tima prema prosjeku lige.
 * w = n/(n+k) — s malo podataka (n) vjerujemo ligi, s puno vjerujemo timu.
 */
export function hierarchicalLambda(lambda: number, leagueMean: number, n: number, k: number): number {
  const w = n / (n + Math.max(0.5, k));
  return w * lambda + (1 - w) * leagueMean;
}

// ───────────────────────── Time-decay vaganje ─────────────────────────
/** Težina promatranja staro `days` dana uz poluživot `halfLife`. */
export function decayWeight(days: number, halfLife: number): number {
  return Math.pow(0.5, days / Math.max(1, halfLife));
}

/** Težinski medijan/srednjak procjena članova ansambla po pouzdanosti. */
export function confWeightedMean(values: number[], confs: number[], gamma: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const w = Math.pow(Math.min(1, Math.max(0.05, confs[i] ?? 0.5)), gamma);
    num += w * values[i];
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

// ───────────────────────── Elo / kvota → λ ─────────────────────────
/** Očekivani rezultat po Elu (0..1). */
export function eloExpected(diff: number): number {
  return 1 / (1 + Math.pow(10, -diff / 400));
}

/** Iz teksta izvlači Elo razliku ("elo 1680 vs 1520") ako postoji. */
export function parseEloDiff(text: string): number | null {
  const m = /elo[^0-9]{0,12}(\d{3,4})[^0-9]{1,12}(\d{3,4})/i.exec(text);
  if (!m) return null;
  return Number(m[1]) - Number(m[2]);
}

/**
 * Rotira λ_dom/λ_gost prema ciljanoj snazi domaćina (0..1) uz očuvanje λ_total.
 * pull = koliko jako (0 = bez promjene, 1 = potpuno na cilj).
 */
export function rotateLambdas(
  lh: number,
  la: number,
  targetHomeShare: number,
  pull: number,
): [number, number] {
  const total = lh + la;
  const current = lh / Math.max(0.01, total);
  const target = Math.min(0.85, Math.max(0.15, targetHomeShare));
  const share = current + (target - current) * Math.min(1, Math.max(0, pull));
  return [total * share, total * (1 - share)];
}

// ───────────────────────── Zero-inflation ─────────────────────────
/** Prebacuje π mase na 0:0 i renormalizira matricu. */
export function zeroInflateMatrix(sm: ScoreMatrix, pi: number): ScoreMatrix {
  const p = Math.min(0.2, Math.max(0, pi));
  if (p <= 0) return sm;
  const m = sm.m.map((row) => row.map((v) => v * (1 - p)));
  m[0][0] += p;
  return { ...sm, m };
}

// ───────────────────────── Overdispersion (neg. binom) ─────────────────────────
/**
 * Gama-Poisson mješavina: umjesto fiksne λ koristi se λ ~ Gamma(k, λ/k).
 * Rezultat je negativna binomna distribucija s istom sredinom, većom varijancom.
 */
export function negBinomPmf(lambda: number, k: number, x: number): number {
  const r = Math.max(1, k);
  const pSucc = r / (r + lambda);
  // log-gama za stabilnost
  const lg = (z: number): number => {
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7,
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lg(1 - z);
    z -= 1;
    let a = c[0];
    const t = z + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
  };
  const logP =
    lg(x + r) - lg(r) - lg(x + 1) + r * Math.log(pSucc) + x * Math.log(1 - pSucc);
  return Math.exp(logP);
}

/** Matrica rezultata s overdispersijom (negativni binom po timu). */
export function overdispersedMatrix(lh: number, la: number, k: number, n = 10): ScoreMatrix {
  const m: number[][] = [];
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    m[i] = [];
    for (let j = 0; j <= n; j++) {
      const v = negBinomPmf(lh, k, i) * negBinomPmf(la, k, j);
      m[i][j] = v;
      sum += v;
    }
  }
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) m[i][j] /= sum;
  return { m, lh, la };
}

/** Miješa dvije matrice (w = udio druge). */
export function blendMatrices(a: ScoreMatrix, b: ScoreMatrix, w: number): ScoreMatrix {
  const n = a.m.length;
  const m: number[][] = [];
  for (let i = 0; i < n; i++) {
    m[i] = [];
    for (let j = 0; j < n; j++) m[i][j] = (1 - w) * a.m[i][j] + w * (b.m[i]?.[j] ?? 0);
  }
  return { m, lh: a.lh, la: a.la };
}

// ───────────────────────── Kalibracija ─────────────────────────
const clamp01 = (p: number) => Math.min(0.995, Math.max(0.005, p));
export function plattCalibrate(p: number, a: number, b: number): number {
  const x = Math.log(clamp01(p) / (1 - clamp01(p)));
  return 1 / (1 + Math.exp(-(a * x + b)));
}

// ───────────────────────── HT/FT puna matrica ─────────────────────────
export interface HtFtTable {
  /** ključevi: "1/1","1/X","1/2","X/1","X/X","X/2","2/1","2/X","2/2" */
  probs: Record<string, number>;
  best: { combo: string; p: number };
  htHome: number;
  htDraw: number;
  htAway: number;
}

const OUTCOMES = ["1", "X", "2"] as const;

function outcomeOf(i: number, j: number): "1" | "X" | "2" {
  return i > j ? "1" : i === j ? "X" : "2";
}

/**
 * Egzaktna HT/FT matrica: dvije neovisne Poissonove matrice (1. i 2. poluvrijeme)
 * konvoluirane u konačni rezultat. Nema aproksimacija tipa "htH × home × 1.18".
 */
export function htftTable(lh: number, la: number, split: number, tau: number, rho: number): HtFtTable {
  const s = Math.min(0.5, Math.max(0.35, split));
  const h1 = scoreMatrix(lh * s, la * s, tau * 1.2, rho, 6).m;
  const h2 = scoreMatrix(lh * (1 - s), la * (1 - s), tau, rho, 6).m;
  const probs: Record<string, number> = {};
  for (const a of OUTCOMES) for (const b of OUTCOMES) probs[`${a}/${b}`] = 0;
  let htHome = 0;
  let htDraw = 0;
  let htAway = 0;
  for (let i = 0; i < h1.length; i++) {
    for (let j = 0; j < h1.length; j++) {
      const pHt = h1[i][j];
      if (pHt < 1e-9) continue;
      const ht = outcomeOf(i, j);
      if (ht === "1") htHome += pHt;
      else if (ht === "X") htDraw += pHt;
      else htAway += pHt;
      for (let x = 0; x < h2.length; x++) {
        for (let y = 0; y < h2.length; y++) {
          const p = pHt * h2[x][y];
          if (p < 1e-10) continue;
          probs[`${ht}/${outcomeOf(i + x, j + y)}`] += p;
        }
      }
    }
  }
  let total = 0;
  for (const k of Object.keys(probs)) total += probs[k];
  for (const k of Object.keys(probs)) probs[k] /= total || 1;
  const best = Object.entries(probs)
    .map(([combo, p]) => ({ combo, p }))
    .sort((a, b) => b.p - a.p)[0];
  return { probs, best, htHome, htDraw, htAway };
}

/** HT golovi iz split λ (neovisno o FT matrici). */
export function htGoals(lh: number, la: number, split: number): {
  exp: number;
  over05: number;
  over15: number;
  g0: number;
  g1: number;
  g2plus: number;
} {
  const l = (lh + la) * Math.min(0.5, Math.max(0.35, split));
  const g0 = pois(l, 0);
  const g1 = pois(l, 1);
  return { exp: l, over05: 1 - g0, over15: 1 - g0 - g1, g0, g1, g2plus: 1 - g0 - g1 };
}

// ───────────────────────── Anti-pogreška ─────────────────────────
export interface CoherenceReport {
  ok: boolean;
  driftPb: number;
  agreement: number;
  penalty: number;
  reasons: string[];
  missing: string[];
}

/**
 * Provjerava slažu li se analitička matrica, Monte Carlo i konsenzus modela.
 * Kad se ne slažu, vraća kaznu koja stišće P prema 50% i popis razloga.
 */
export function coherenceCheck(
  pMatrix: number,
  pMonteCarlo: number | null,
  pEnsemble: number,
  agreement: number,
  prefs: SuperPrefs,
  userText: string,
): CoherenceReport {
  const reasons: string[] = [];
  const drifts: number[] = [];
  if (pMonteCarlo !== null && Number.isFinite(pMonteCarlo)) {
    const d = Math.abs(pMatrix - pMonteCarlo) * 100;
    drifts.push(d);
    if (d > prefs.coherenceTol)
      reasons.push(`Monte Carlo odstupa ${d.toFixed(1)} pb od analitičke matrice.`);
  }
  const dEns = Math.abs(pMatrix - pEnsemble) * 100;
  drifts.push(dEns);
  if (dEns > prefs.coherenceTol * 2)
    reasons.push(`Konsenzus modela odstupa ${dEns.toFixed(1)} pb od matrice.`);
  if (agreement < prefs.minAgreement)
    reasons.push(`Slaganje modela je nisko (${(agreement * 100).toFixed(0)}%).`);

  const t = userText.toLowerCase();
  const missing: string[] = [];
  if (!/xg|x-g|očekivan|ocekivan/.test(t)) missing.push("xG / xGA oba tima");
  if (!/\d\.\d{1,2}/.test(t)) missing.push("kvote (za de-vig i edge)");
  if (!/ozljed|izostan|suspenz|kartoni/.test(t)) missing.push("izostanci i ozljede");
  if (!/forma|zadnjih|posljednjih/.test(t)) missing.push("forma zadnjih 5–10 utakmica");

  const driftMax = drifts.length ? Math.max(...drifts) : 0;
  const penalty = Math.min(
    0.45,
    Math.max(0, (driftMax - prefs.coherenceTol) / 100) * 2 +
      Math.max(0, prefs.minAgreement - agreement) * 0.6,
  );
  return { ok: reasons.length === 0, driftPb: driftMax, agreement, penalty, reasons, missing };
}

/** Stišće P prema 50% razmjerno kazni koherentnosti. */
export function applyPenalty(p: number, penalty: number): number {
  return 0.5 + (p - 0.5) * (1 - Math.min(0.6, penalty));
}

// ───────────────────────── Pipeline za konsenzus ─────────────────────────
export interface SuperPipelineInput {
  lambdaHome: number;
  lambdaAway: number;
  leagueTotal: number;
  sampleSize: number;
  tau: number;
  rho: number;
  homeShareFromOdds: number | null;
  eloDiff: number | null;
  mcIters: number;
}

export interface SuperPipelineOutput {
  lambdaHome: number;
  lambdaAway: number;
  matrix: ScoreMatrix;
  mc: { over25: number; btts: number; home: number; draw: number };
  applied: string[];
  htft: HtFtTable | null;
  ht: ReturnType<typeof htGoals>;
  /** v8 · BTTS kopula (korelirani golovi) */
  btts: BttsCopulaResult | null;
  /** v8 · Over/Under game-state hazard */
  ou: OuHazardResult | null;
}

/** Primjenjuje sve aktivne module super točnosti na λ i matricu. */
export function runSuperPipeline(inp: SuperPipelineInput, p: SuperPrefs): SuperPipelineOutput {
  const applied: string[] = [];
  let lh = inp.lambdaHome;
  let la = inp.lambdaAway;

  if (p.modes.hier) {
    const mean = inp.leagueTotal / 2;
    lh = hierarchicalLambda(lh, mean, inp.sampleSize, p.hierK);
    la = hierarchicalLambda(la, mean, inp.sampleSize, p.hierK);
    applied.push(`Hijerarhijski Bayes (k=${p.hierK}, n=${inp.sampleSize})`);
  }

  if (p.modes.elo) {
    const target =
      inp.eloDiff !== null ? eloExpected(inp.eloDiff) : inp.homeShareFromOdds;
    if (target !== null && Number.isFinite(target)) {
      const share = 0.5 + (target - 0.5) * 0.7; // λ udio je blaži od P(pobjede)
      [lh, la] = rotateLambdas(lh, la, share, p.eloPull);
      applied.push(`Elo/kvota → λ rotacija (pull=${p.eloPull})`);
    }
  }

  let matrix = scoreMatrix(lh, la, inp.tau, inp.rho, 10);

  if (p.modes.disp) {
    const nb = overdispersedMatrix(lh, la, p.dispK, 10);
    matrix = blendMatrices(matrix, nb, 0.45);
    applied.push(`Overdispersion negativni binom (k=${p.dispK})`);
  }
  if (p.modes.zip) {
    matrix = zeroInflateMatrix(matrix, p.zeroInflate);
    applied.push(`Zero-inflation π=${p.zeroInflate}`);
  }

  const mc = monteCarlo(lh, la, inp.mcIters);
  const htft = p.modes.htft9 ? htftTable(lh, la, p.htSplit, inp.tau, inp.rho) : null;
  const ht = htGoals(lh, la, p.htSplit);
  if (htft) applied.push("HT/FT puna matrica (9 kombinacija)");

  const btts = p.modes.bttsCopula ? bttsCopula(lh, la, p.bttsRho) : null;
  if (btts) applied.push(`BTTS kopula motor (ρ=${p.bttsRho})`);
  const ou = p.modes.ouGameState ? ouGameStateHazard(lh, la, p.ouBeta, p.lateSkew) : null;
  if (ou) applied.push(`O/U game-state hazard (β=${p.ouBeta}, kasni nagib=${p.lateSkew})`);

  return { lambdaHome: lh, lambdaAway: la, matrix, mc, applied, htft, ht, btts, ou };
}

/** Dodatne upute koje aktivni modovi ubacuju u prompt članova ansambla. */
export function superPromptDirectives(p: SuperPrefs, market: Market): string {
  const out: string[] = [];
  if (p.modes.decay)
    out.push(
      `Formu vaguj eksponencijalno: utakmica stara ${p.halfLifeDays} dana vrijedi pola koliko jučerašnja.`,
    );
  if (p.modes.hier)
    out.push(
      "Ako imaš manje od 8 utakmica uzorka, povuci procjenu prema prosjeku lige (empirical Bayes).",
    );
  if (p.modes.elo)
    out.push("Provjeri omjer snaga Elo logikom (400 bodova ≈ 91% očekivanog rezultata).");
  if (p.modes.zip)
    out.push("Uzmi u obzir zero-inflation: u defenzivnim ligama i derbijima 0:0 je češći nego po čistom Poissonu.");
  if (p.modes.disp)
    out.push("Golovi su overdisperzirani (var > mean) — ne budi previše samouvjeren u uski raspon.");
  if ((market === "htft" || market === "htx" || market === "htgoals") && p.modes.htft9)
    out.push(
      `Poluvrijeme modeliraj odvojeno: λ_HT = ${p.htSplit.toFixed(2)} × λ_FT, drugo poluvrijeme ostatak, pa konvoluiraj.`,
    );
  if (p.modes.antiError)
    out.push(
      "Ako nemaš dovoljno pouzdanih podataka, spusti conf ispod 0.45 umjesto da izmišljaš brojke.",
    );
  if (p.modes.bttsCopula)
    out.push(
      `BTTS računaj kopulom s korelacijom ρ=${p.bttsRho}: P(GG) = 1 − P(dom 0) − P(gost 0) + C(P(dom 0), P(gost 0)). Ako se kopula i neovisni Poisson razlikuju više od 4 pb, objasni zašto (otvorena utakmica ili obostrano gušenje).`,
    );
  if (p.modes.ouGameState)
    out.push(
      `Over/Under računaj nehomogenim procesom: λ(t) raste prema kraju (nagib ${p.lateSkew}), a game-state β=${p.ouBeta} pomiče λ_eff (juriš na gol vs zatvaranje utakmice). Obavezno navedi λ_eff i raspodjelu golova po trećinama.`,
    );
  if (p.modes.mathPack)
    out.push(
      `Za svaki tip primijeni prošireni paket: Skellam (hendikep/DNB/razlika golova), bivariate Poisson (korelirani napadi), ${p.devig === "shin" ? "Shin" : p.devig === "power" ? "power" : "multiplikativni"} de-vig za kvote, frakcijski Kelly (${p.kellyFraction}× puni Kelly, max 5% banke), Shannon entropiju kao indeks kaosa, Bayesovo osvježavanje λ i scenarij rane crvene karte/penala.`,
    );
  return out.length ? `\nDODATNI MODULI SUPER TOČNOSTI:\n- ${out.join("\n- ")}` : "";
}

/** Sažetak aktivnih modula za briefing bota. */
export function superBriefing(o: SuperPipelineOutput, rep: CoherenceReport | null, p: SuperPrefs): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`═══ SUPER TOČNOST v7 — aktivni moduli ═══`);
  lines.push(o.applied.length ? o.applied.map((a) => `· ${a}`).join("\n") : "· (osnovni Poisson/Dixon-Coles)");
  if (p.modes.calib) lines.push(`· Platt kalibracija a=${p.plattA}, b=${p.plattB}`);
  if (o.htft) {
    const rows = Object.entries(o.htft.probs)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v)}`)
      .join(" · ");
    lines.push(`HT/FT (egzaktno): ${rows}`);
    lines.push(
      `HT ishod: 1 ${pct(o.htft.htHome)} · X ${pct(o.htft.htDraw)} · 2 ${pct(o.htft.htAway)} — najvjerojatnija kombinacija ${o.htft.best.combo} (${pct(o.htft.best.p)})`,
    );
  }
  lines.push(
    `HT golovi: očekivano ${o.ht.exp.toFixed(2)} · Over 0.5 ${pct(o.ht.over05)} · Over 1.5 ${pct(o.ht.over15)} · 0 golova ${pct(o.ht.g0)}`,
  );
  if (o.btts) {
    lines.push(
      `BTTS KOPULA (ρ=${p.bttsRho}): GG ${pct(o.btts.gg)} · NG ${pct(o.btts.ng)} · P(0:0) ${pct(o.btts.p00)} · neovisni Poisson bi dao ${pct(o.btts.ggIndependent)} (pomak ${o.btts.shiftPb.toFixed(1)} pb).`,
    );
  }
  if (o.ou) {
    lines.push(
      `O/U GAME-STATE (β=${p.ouBeta}): λ_eff ${o.ou.lambdaEff.toFixed(2)} · Over 1.5 ${pct(o.ou.over15)} · Over 2.5 ${pct(o.ou.over25)} · Under 2.5 ${pct(o.ou.under25)} · Over 3.5 ${pct(o.ou.over35)} · pomak ${o.ou.shiftPb.toFixed(1)} pb · golovi po trećinama ${o.ou.thirds.map((t) => t.toFixed(2)).join(" / ")}.`,
    );
  }
  if (p.modes.mathPack) {
    lines.push(mathPackBriefing({ lh: o.lambdaHome, la: o.lambdaAway, bttsRho: p.bttsRho, ouBeta: p.ouBeta }));
  }
  if (rep) {
    lines.push(
      `ANTI-POGREŠKA: ${rep.ok ? "sve je koherentno (matrica ≈ Monte Carlo ≈ konsenzus)" : "UPOZORENJE — " + rep.reasons.join(" ")}`,
    );
    if (!rep.ok && rep.missing.length)
      lines.push(
        `Nedostaju podaci koji bi digli točnost: ${rep.missing.join(", ")}. Traži ih od korisnika u jednoj rečenici na kraju.`,
      );
  }
  return lines.join("\n");
}
