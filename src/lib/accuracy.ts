// ═══════════════════════════════════════════════════════════════════════════
// MOTOR TOČNOSTI v5.0 — matematička jezgra koja stoji iza "super točnosti".
// Sve je čista funkcija bez ovisnosti o mreži: matrica rezultata (Dixon-Coles
// + bivariate Poisson korelacija), de-vig kvota (proporcionalni, power i Shin),
// Bayesovo spajanje modela s tržištem u logit prostoru, shrinkage prema
// prosjeku lige, Monte Carlo i kalibracija pouzdanosti.
// ═══════════════════════════════════════════════════════════════════════════
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

// ───────────────────────────── Postavke točnosti ─────────────────────────────
export interface AccuracyPrefs {
  /** Broj članova ansambla koji se poziva paralelno (3–9). */
  members: number;
  /** Self-consistency: koliko puta svaki model računa isto (1–3), pa medijan. */
  passes: number;
  /** Težina tržišta (de-vig kvote) pri Bayesovom spajanju, 0–1. */
  marketWeight: number;
  /** Shrinkage λ prema prosjeku lige, 0–0.5 (smanjuje ekstremne procjene). */
  shrink: number;
  /** Dixon-Coles τ jačina korekcije niskih rezultata, 0–0.2. */
  tau: number;
  /** Korelacija golova ρ (obično −0.05 do 0.05). */
  rho: number;
  /** Minimalni edge (%) da se tip proglasi vrijednim. */
  minEdge: number;
  /** Prag sigurnosti (%) ispod kojeg Luna kaže "nema tipa". */
  minConfidence: number;
  /** Konzervativni način: strože pragove i uvijek nudi sigurniju alternativu. */
  conservative: boolean;
  /** Monte Carlo iteracije za provjeru matrice. */
  mc: number;
  /** Odbaci člana ansambla čija P odstupa više od X pb od medijana. */
  outlier: number;
  /** Automatski upari s prosjekom lige kad korisnik ne navede podatke. */
  leaguePrior: boolean;
  /** Kelly frakcija (0.25 = četvrt Kelly). */
  kellyFraction: number;
}

export const DEFAULT_ACCURACY: AccuracyPrefs = {
  members: 6,
  passes: 2,
  marketWeight: 0.42,
  shrink: 0.18,
  tau: 0.08,
  rho: -0.03,
  minEdge: 4,
  minConfidence: 57,
  conservative: true,
  mc: 20000,
  outlier: 14,
  leaguePrior: true,
  kellyFraction: 0.25,
};

const PREFS_KEY = "tm.accuracy.prefs";

export function loadAccuracy(): AccuracyPrefs {
  return { ...DEFAULT_ACCURACY, ...loadJSON<Partial<AccuracyPrefs>>(PREFS_KEY, {}) };
}
export function saveAccuracy(p: AccuracyPrefs): void {
  saveJSON(PREFS_KEY, p);
}

// ───────────────────────────── Prosjeci liga ─────────────────────────────
/** λ_total prior po ligi — koristi se za shrinkage kad podaci fale. */
export const LEAGUE_GOALS: Record<string, number> = {
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
  "superliga": 2.75,
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
  default: 2.68,
};

export function leaguePriorTotal(text: string): number {
  const t = text.toLowerCase();
  for (const [k, v] of Object.entries(LEAGUE_GOALS)) if (k !== "default" && t.includes(k)) return v;
  return LEAGUE_GOALS.default;
}

// ───────────────────────────── Poisson jezgra ─────────────────────────────
function fact(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
export function pois(l: number, k: number): number {
  return (Math.exp(-l) * Math.pow(l, k)) / fact(k);
}

/** Dixon-Coles korekcija niskih rezultata. */
function dc(i: number, j: number, lh: number, la: number, tau: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * tau;
  if (i === 0 && j === 1) return 1 + lh * tau;
  if (i === 1 && j === 0) return 1 + la * tau;
  if (i === 1 && j === 1) return 1 - tau;
  return 1;
}

export interface ScoreMatrix {
  m: number[][];
  lh: number;
  la: number;
}

/** Matrica rezultata 0..N s Dixon-Coles korekcijom i korelacijom ρ. */
export function scoreMatrix(lh: number, la: number, tau = 0.08, rho = -0.03, n = 10): ScoreMatrix {
  const m: number[][] = [];
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    m[i] = [];
    for (let j = 0; j <= n; j++) {
      // bivariate aproksimacija: ρ pomiče masu prema/od dijagonale
      const corr = 1 + rho * ((i - lh) * (j - la)) / Math.max(0.35, Math.sqrt(lh * la));
      const v = pois(lh, i) * pois(la, j) * dc(i, j, lh, la, tau) * Math.max(0.05, corr);
      m[i][j] = v;
      sum += v;
    }
  }
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) m[i][j] /= sum;
  return { m, lh, la };
}

export interface MarketProbs {
  home: number;
  draw: number;
  away: number;
  btts: number;
  over15: number;
  over25: number;
  over35: number;
  htOver05: number;
  htOver15: number;
  htDraw: number;
  htHome: number;
  htAway: number;
  htftHH: number;
  cleanSheetHome: number;
  cleanSheetAway: number;
  topScores: { score: string; p: number }[];
  htGoalsExp: number;
  htDist: { g0: number; g1: number; g2: number; g3plus: number };
}

export function marketProbs(sm: ScoreMatrix, tau = 0.08, rho = -0.03): MarketProbs {
  const { m, lh, la } = sm;
  const n = m.length - 1;
  let home = 0, draw = 0, away = 0, btts = 0, o15 = 0, o25 = 0, o35 = 0, csH = 0, csA = 0;
  const scores: { score: string; p: number }[] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const p = m[i][j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i > 0 && j > 0) btts += p;
      const tot = i + j;
      if (tot > 1.5) o15 += p;
      if (tot > 2.5) o25 += p;
      if (tot > 3.5) o35 += p;
      if (j === 0) csH += p;
      if (i === 0) csA += p;
      scores.push({ score: `${i}:${j}`, p });
    }
  // poluvrijeme: λ_HT ≈ 0.44 λ_FT, vlastita matrica
  const hh = 0.44 * lh, ha = 0.44 * la;
  const htm = scoreMatrix(hh, ha, tau * 1.2, rho, 6).m;
  let htD = 0, htH = 0, htA = 0, g0 = 0, g1 = 0, g2 = 0, g3 = 0, htExp = 0;
  for (let i = 0; i < htm.length; i++)
    for (let j = 0; j < htm.length; j++) {
      const p = htm[i][j];
      if (i > j) htH += p; else if (i === j) htD += p; else htA += p;
      const t = i + j;
      htExp += t * p;
      if (t === 0) g0 += p; else if (t === 1) g1 += p; else if (t === 2) g2 += p; else g3 += p;
    }
  return {
    home, draw, away, btts,
    over15: o15, over25: o25, over35: o35,
    htOver05: 1 - g0,
    htOver15: 1 - g0 - g1,
    htDraw: htD, htHome: htH, htAway: htA,
    htftHH: htH * (home / Math.max(0.01, home + draw + away)) * 1.18,
    cleanSheetHome: csH,
    cleanSheetAway: csA,
    topScores: scores.sort((a, b) => b.p - a.p).slice(0, 6),
    htGoalsExp: htExp,
    htDist: { g0, g1, g2, g3plus: g3 },
  };
}

/** Glavna vjerojatnost za traženo tržište. */
export function probForMarket(mp: MarketProbs, market: Market): number {
  switch (market) {
    case "btts": return mp.btts;
    case "ou25": return mp.over25;
    case "htgoals": return mp.htOver05;
    case "1x2": return mp.home;
    case "htx": return mp.htDraw;
    case "htft": return mp.htftHH;
    default: return mp.home;
  }
}

// ───────────────────────────── De-vig metode ─────────────────────────────
/** Proporcionalni de-vig (2-way). */
export function devigProportional(o1: number, o2: number): [number, number] {
  const a = 1 / o1, b = 1 / o2, s = a + b;
  return [a / s, b / s];
}
/** Power de-vig — točniji za neuravnotežene kvote. */
export function devigPower(o1: number, o2: number): [number, number] {
  const a = 1 / o1, b = 1 / o2;
  let k = 1;
  for (let i = 0; i < 60; i++) {
    const s = Math.pow(a, k) + Math.pow(b, k);
    if (Math.abs(s - 1) < 1e-9) break;
    k *= s > 1 ? 1.002 : 0.998;
  }
  const s = Math.pow(a, k) + Math.pow(b, k);
  return [Math.pow(a, k) / s, Math.pow(b, k) / s];
}
/** Shin de-vig — modelira udio informiranih igrača (najbolji za value). */
export function devigShin(o1: number, o2: number): [number, number] {
  const a = 1 / o1, b = 1 / o2, s = a + b;
  let z = 0;
  for (let i = 0; i < 80; i++) {
    const f = (x: number) => (Math.sqrt(z * z + 4 * (1 - z) * (x * x) / s) - z) / (2 * (1 - z));
    const tot = f(a) + f(b);
    if (Math.abs(tot - 1) < 1e-10) break;
    z += tot > 1 ? 0.0008 : -0.0008;
    z = Math.min(Math.max(z, 0), 0.35);
  }
  const f = (x: number) => (Math.sqrt(z * z + 4 * (1 - z) * (x * x) / s) - z) / (2 * (1 - z));
  const t = f(a) + f(b);
  return [f(a) / t, f(b) / t];
}
/** Konsenzus triju metoda de-viga. */
export function devig(o1: number, o2: number): number {
  const [p1] = devigProportional(o1, o2);
  const [p2] = devigPower(o1, o2);
  const [p3] = devigShin(o1, o2);
  return (p1 + p2 + p3) / 3;
}

// ───────────────────── Bayes u logit prostoru ─────────────────────
const logit = (p: number) => Math.log(Math.min(Math.max(p, 1e-4), 1 - 1e-4) / (1 - Math.min(Math.max(p, 1e-4), 1 - 1e-4)));
const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** Spaja procjenu modela s tržišnom vjerojatnošću (w = težina tržišta). */
export function blendWithMarket(pModel: number, pMarket: number | null, w: number): number {
  if (pMarket === null || !Number.isFinite(pMarket)) return pModel;
  return sig((1 - w) * logit(pModel) + w * logit(pMarket));
}

/** Shrinkage prema 0.5 — kažnjava pretjerano samouvjerene procjene. */
export function shrinkToPrior(p: number, k: number, prior = 0.5): number {
  return sig((1 - k) * logit(p) + k * logit(prior));
}

// ───────────────────── Robusna statistika ansambla ─────────────────────
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}
/** Odbacuje outliere po MAD-u pa vraća težinski trimmed mean. */
export function robustMean(xs: number[], maxDev: number): { value: number; kept: number[]; spread: number } {
  if (!xs.length) return { value: NaN, kept: [], spread: 0 };
  const m = median(xs);
  const d = Math.max(mad(xs) * 2.5, 0.03);
  const kept = xs.filter((x) => Math.abs(x - m) <= Math.min(maxDev, Math.max(d, 0.05)));
  const use = kept.length >= 2 ? kept : xs;
  // težine: bliže medijanu = veća težina
  let num = 0, den = 0;
  for (const x of use) {
    const w = 1 / (1 + 8 * Math.abs(x - m));
    num += w * x;
    den += w;
  }
  return { value: num / den, kept: use, spread: Math.max(...xs) - Math.min(...xs) };
}

// ───────────────────── Monte Carlo provjera ─────────────────────
export function monteCarlo(lh: number, la: number, iters: number): { over25: number; btts: number; home: number; draw: number } {
  const samp = (l: number) => {
    // Knuth
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  };
  let o = 0, b = 0, h = 0, d = 0;
  const n = Math.max(1000, Math.min(iters, 60000));
  for (let i = 0; i < n; i++) {
    const a = samp(lh), c = samp(la);
    if (a + c > 2.5) o++;
    if (a > 0 && c > 0) b++;
    if (a > c) h++; else if (a === c) d++;
  }
  return { over25: o / n, btts: b / n, home: h / n, draw: d / n };
}

// ───────────────────── Kvote iz teksta ─────────────────────
export interface ParsedOdds {
  main?: number;
  alt?: number;
  raw: string[];
}
/** Vadi kvote iz korisničkog teksta ("gg 1.75 ng 2.05", "over 2.10"). */
export function parseOdds(text: string, market: Market): ParsedOdds {
  const t = text.toLowerCase().replace(/,/g, ".");
  const raw = [...t.matchAll(/\b\d\.\d{1,2}\b/g)].map((m) => m[0]).filter((s) => +s >= 1.05 && +s <= 25);
  const near = (kw: RegExp): number | undefined => {
    const m = kw.exec(t);
    if (!m) return undefined;
    const after = t.slice(m.index, m.index + 40);
    const num = /(\d{1,2}\.\d{1,2})/.exec(after);
    return num ? +num[1] : undefined;
  };
  let main: number | undefined, alt: number | undefined;
  if (market === "btts") { main = near(/\b(gg|btts|oba tima)\b/); alt = near(/\bng\b/); }
  else if (market === "ou25") { main = near(/\bover\b|\bvi[sš]e\b/); alt = near(/\bunder\b|\bmanje\b/); }
  else if (market === "1x2") { main = near(/\bdoma[cć]in|kvota\s*1\b/); alt = near(/\bgost/); }
  else if (market === "htx") { main = near(/\bx\b|remi/); }
  return { main, alt, raw };
}

// ───────────────────── Edge, Kelly, ocjena ─────────────────────
export interface Verdict {
  pick: string;
  p: number;
  fairOdds: number;
  edge: number | null;
  kelly: number | null;
  stars: number; // 1..5
  valueOk: boolean;
  advice: string;
}

export function verdict(
  p: number,
  labelMain: string,
  labelAlt: string,
  odds: number | null,
  agreement: number,
  a: AccuracyPrefs,
): Verdict {
  const takeMain = p >= 0.5;
  const pick = takeMain ? labelMain : labelAlt;
  const pp = takeMain ? p : 1 - p;
  const fair = 1 / pp;
  const edge = odds ? (pp * odds - 1) * 100 : null;
  const kelly = odds && odds > 1 ? Math.max(0, ((pp * odds - 1) / (odds - 1)) * a.kellyFraction * 100) : null;
  const confPts = pp * 100;
  let stars = 1;
  if (confPts >= a.minConfidence) stars = 3;
  if (confPts >= a.minConfidence + 6 && agreement >= 0.6) stars = 4;
  if (confPts >= a.minConfidence + 12 && agreement >= 0.75) stars = 5;
  if (confPts < a.minConfidence - 4 || agreement < 0.4) stars = 2;
  const valueOk =
    confPts >= a.minConfidence && (edge === null || edge >= a.minEdge) && agreement >= (a.conservative ? 0.5 : 0.35);
  const advice = valueOk
    ? `Tip prolazi filtre (sigurnost ${confPts.toFixed(1)}%, slaganje ${(agreement * 100).toFixed(0)}%).`
    : `NEMA DOVOLJNO EDGEA — sigurnost ${confPts.toFixed(1)}% (prag ${a.minConfidence}%)${
        edge !== null ? `, edge ${edge.toFixed(1)}% (prag ${a.minEdge}%)` : ""
      }, slaganje ${(agreement * 100).toFixed(0)}%. Ponudi sigurniju alternativu.`;
  return { pick, p: pp, fairOdds: fair, edge, kelly, stars, valueOk, advice };
}

/** Sigurnije alternative po tržištu kad glavni tip ne prolazi filtre. */
export function saferAlternative(market: Market, mp: MarketProbs): string {
  switch (market) {
    case "ou25":
      return mp.over25 >= 0.5
        ? `Over 1.5 gola (P ≈ ${(mp.over15 * 100).toFixed(1)}%)`
        : `Under 3.5 gola (P ≈ ${((1 - mp.over35) * 100).toFixed(1)}%)`;
    case "btts":
      return mp.btts >= 0.5
        ? `Over 1.5 gola (P ≈ ${(mp.over15 * 100).toFixed(1)}%)`
        : `Under 3.5 gola (P ≈ ${((1 - mp.over35) * 100).toFixed(1)}%)`;
    case "1x2":
      return mp.home >= mp.away
        ? `Dvostruka šansa 1X (P ≈ ${((mp.home + mp.draw) * 100).toFixed(1)}%)`
        : `Dvostruka šansa X2 (P ≈ ${((mp.away + mp.draw) * 100).toFixed(1)}%)`;
    case "htgoals":
      return `HT Under 1.5 (P ≈ ${((1 - mp.htOver15) * 100).toFixed(1)}%)`;
    case "htx":
      return `HT Under 1.5 gola (P ≈ ${((1 - mp.htOver15) * 100).toFixed(1)}%)`;
    case "htft":
      return `Dvostruka šansa 1X na kraju (P ≈ ${((mp.home + mp.draw) * 100).toFixed(1)}%)`;
    default:
      return `Over 1.5 gola (P ≈ ${(mp.over15 * 100).toFixed(1)}%)`;
  }
}
