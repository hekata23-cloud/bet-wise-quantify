/* ═══════════════════════════════════════════════════════════════════
   MATH-ENGINE — čista matematika za sve kartice (bez API poziva)
   ═══════════════════════════════════════════════════════════════════
   Sve što treba analiza, u jednom samostalnom modulu:
     • Poisson pmf/CDF i Dixon-Coles korekcija → matrica rezultata
     • Skellam raspored razlike golova (nezavisna provjera 1X2)
     • De-marginiranje kvota (2- i 3-igračna) → prave vjerojatnosti
     • Kelly kriterij (kvartalni, ograničen) → ulog % banke
     • Monte Carlo simulacije (10k) iz matrice rezultata
   Bez ovisnosti — može se zvati iz bilo koje kartice ili modula.
   ═══════════════════════════════════════════════════════════════════ */

export const MAX_GOL = 9;

export function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

/* ── POISSON ──────────────────────────────────────────────────────── */

/** P(X = k) za Poisson(λ). */
export function poissonPmf(k: number, lam: number): number {
  if (k < 0 || lam <= 0) return 0;
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

/** P(X ≤ k) za Poisson(λ). */
export function poissonKum(k: number, lam: number): number {
  if (k < 0) return 0;
  let p = Math.exp(-lam);
  let s = p;
  for (let i = 1; i <= k; i++) {
    p *= lam / i;
    s += p;
  }
  return s;
}

/** Pronađi λ tako da je P(X ≤ k) = cilj (bisekcija) — za O/U linije. */
export function lambdaIzKumulativne(k: number, cilj: number): number | null {
  if (!(cilj > 0.001 && cilj < 0.999)) return null;
  let lo = 0.05, hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (poissonKum(k, mid) > cilj) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── DIXON-COLES MATRICA ──────────────────────────────────────────── */

/** Dixon-Coles težina za niske rezultate (rho < 0 jače veže 0:0/1:1). */
export function dcTezina(x: number, y: number, lam: number, mu: number, rho: number): number {
  if (rho === 0) return 1;
  if (x === 0 && y === 0) return 1 - lam * mu * rho;
  if (x === 0 && y === 1) return 1 + lam * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Matrica vjerojatnosti rezultata (0..MAX_GOL × 0..MAX_GOL), zbroj = 1. */
export function izgradiGrid(lam: number, mu: number, rho = 0): number[][] {
  const g: number[][] = [];
  let z = 0;
  for (let i = 0; i <= MAX_GOL; i++) {
    g[i] = [];
    for (let j = 0; j <= MAX_GOL; j++) {
      const v = Math.max(0, poissonPmf(i, lam) * poissonPmf(j, mu) * dcTezina(i, j, lam, mu, rho));
      g[i]![j] = v;
      z += v;
    }
  }
  for (let i = 0; i <= MAX_GOL; i++)
    for (let j = 0; j <= MAX_GOL; j++) g[i]![j] = g[i]![j]! / z;
  return g;
}

export type GridMetrike = {
  p1: number; pX: number; p2: number;
  btts: number; o15: number; o25: number; o35: number;
  distribucijaUkupno: number[]; // P(ukupno golova = k), k = 0..2*MAX_GOL
  topRezultati: { rezultat: string; p: number }[];
};

export function metrikeIzGrida(g: number[][]): GridMetrike {
  let p1 = 0, pX = 0, p2 = 0, btts = 0, o15 = 0, o25 = 0, o35 = 0;
  const distribucijaUkupno: number[] = new Array(2 * MAX_GOL + 1).fill(0);
  const top: { rezultat: string; p: number }[] = [];
  for (let i = 0; i <= MAX_GOL; i++) {
    for (let j = 0; j <= MAX_GOL; j++) {
      const p = g[i]![j]!;
      if (i > j) p1 += p;
      else if (i === j) pX += p;
      else p2 += p;
      if (i > 0 && j > 0) btts += p;
      const uk = i + j;
      distribucijaUkupno[uk]! += p;
      if (uk > 1.5) o15 += p;
      if (uk > 2.5) o25 += p;
      if (uk > 3.5) o35 += p;
      if (i <= 5 && j <= 5) top.push({ rezultat: `${i}:${j}`, p });
    }
  }
  top.sort((a, b) => b.p - a.p);
  return { p1, pX, p2, btts, o15, o25, o35, distribucijaUkupno, topRezultati: top.slice(0, 6) };
}

/* ── SKELLAM — raspored razlike golova (nezavisna provjera 1X2) ───── */

/** Modificirana Besselova funkcija prve vrste I_n(x), redom. */
function besselI(n: number, x: number): number {
  // I_n(x) = Σ_{m=0..∞} (1/(m! (m+n)!)) (x/2)^(2m+n)
  let s = 0;
  let term = Math.pow(x / 2, n) / faktorijel(n);
  let m = 0;
  while (m < 200) {
    s += term;
    const next = term * ((x / 2) * (x / 2)) / ((m + 1) * (m + 1 + n));
    if (Math.abs(next) < 1e-16 || !Number.isFinite(next)) break;
    term = next;
    m++;
  }
  return s;
}
function faktorijel(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** P(razlika golova domaćin−gost = k) za Poisson(λ) − Poisson(μ). */
export function skellamPmf(k: number, lam: number, mu: number): number {
  if (lam <= 0 || mu <= 0) return 0;
  const ak = Math.abs(k);
  return (
    Math.exp(-(lam + mu)) *
    Math.pow(lam / mu, k / 2) *
    besselI(ak, 2 * Math.sqrt(lam * mu))
  );
}

/** 1X2 iz Skellam rasporeda (bez Dixon-Coles korelacije — nezavisna provjera). */
export function skellam1x2(lam: number, mu: number): { p1: number; pX: number; p2: number } {
  let p1 = 0, pX = 0, p2 = 0;
  for (let k = -2 * MAX_GOL; k <= 2 * MAX_GOL; k++) {
    const p = skellamPmf(k, lam, mu);
    if (k > 0) p1 += p;
    else if (k === 0) pX += p;
    else p2 += p;
  }
  const z = p1 + pX + p2;
  return { p1: p1 / z, pX: pX / z, p2: p2 / z };
}

/* ── DE-MARGINIRANJE KVOTA ────────────────────────────────────────── */

/** Dvoglavi: prave vjerojatnosti iz para kvota (bez bookmaker marže). */
export function deMargin2(o: number | undefined, u: number | undefined): { pA: number; pB: number } | null {
  if (o == null || u == null || !(o >= 1.01) || !(u >= 1.01)) return null;
  const a = 1 / o, b = 1 / u;
  const s = a + b;
  return { pA: a / s, pB: b / s };
}

/** Troglavi: 1X2 bez marže. */
export function deMargin3(k1: number | undefined, kX: number | undefined, k2: number | undefined) {
  if (k1 == null || kX == null || k2 == null || k1 < 1.01 || kX < 1.01 || k2 < 1.01) return null;
  const a = 1 / k1, b = 1 / kX, c = 1 / k2;
  const s = a + b + c;
  return { p1: a / s, pX: b / s, p2: c / s };
}

/* ── KELLY ────────────────────────────────────────────────────────── */

/**
 * Kelly ulog kao % banke. Kvartalni Kelly (¼), ograničen na maxPct (default 3%).
 * @param p vjerojatnost pobjede tipa (0..1)
 * @param kvota decimalna kvota (> 1)
 */
export function kellyUlogPct(p: number, kvota: number, maxPct = 3): number {
  if (!(kvota > 1) || !(p > 0) || !(p < 1)) return 0;
  const b = kvota - 1;
  const f = (b * p - (1 - p)) / b; // puni Kelly kao udio (0..1)
  if (f <= 0) return 0;
  return Math.min(maxPct, f * 25); // ¼ Kelly × 100
}

/** Očekivani rast banke (EV) tipa kao % uloga. */
export function evPct(p: number, kvota: number): number {
  return p * kvota - 1;
}

/* ── MONTE CARLO ──────────────────────────────────────────────────── */

/** Deterministički RNG (mulberry32) — iste simulacije za isti seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type McIzlaz = {
  n: number;
  p1: number; pX: number; p2: number;
  btts: number; o15: number; o25: number; o35: number;
  topRezultati: { rezultat: string; p: number; broj: number }[];
};

/**
 * Monte Carlo: N simulacija iz matrice rezultata (exact-score sampling).
 * Deterministički za isti seed — iste brojke svaki put.
 */
export function monteCarlo(g: number[][], n = 10_000, seed = 42): McIzlaz {
  const rng = mulberry32(seed);
  // kumulativna distribucija ćelija
  const kum: number[] = [];
  const ii: number[] = [];
  const jj: number[] = [];
  let z = 0;
  for (let i = 0; i <= MAX_GOL; i++) {
    for (let j = 0; j <= MAX_GOL; j++) {
      z += g[i]![j]!;
      kum.push(z);
      ii.push(i);
      jj.push(j);
    }
  }
  let p1 = 0, pX = 0, p2 = 0, btts = 0, o15 = 0, o25 = 0, o35 = 0;
  const brojaci = new Map<string, number>();
  for (let s = 0; s < n; s++) {
    const u = rng() * z;
    let lo = 0, hi = kum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kum[mid]! < u) lo = mid + 1;
      else hi = mid;
    }
    const i = ii[lo]!, j = jj[lo]!;
    if (i > j) p1++;
    else if (i === j) pX++;
    else p2++;
    if (i > 0 && j > 0) btts++;
    if (i + j > 1.5) o15++;
    if (i + j > 2.5) o25++;
    if (i + j > 3.5) o35++;
    const klj = `${i}:${j}`;
    brojaci.set(klj, (brojaci.get(klj) ?? 0) + 1);
  }
  const top = [...brojaci.entries()]
    .map(([rezultat, broj]) => ({ rezultat, p: broj / n, broj }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 6);
  return {
    n,
    p1: p1 / n, pX: pX / n, p2: p2 / n,
    btts: btts / n, o15: o15 / n, o25: o25 / n, o35: o35 / n,
    topRezultati: top,
  };
}

/* ── LAMBDA IZ FORME (isto kao u goals-motoru, samostalno) ────────── */

export type FormaGolovi = {
  odigrano: number;
  postignuti: number;
  primljeni: number;
  btts: number;
  over15: number;
  over25: number;
  under35: number;
  penali: number;
};

const LIGA_PO_TIMU = 1.35;

/** Očekivani golovi timova iz forme (multiplikativni Dixon-Coles stil). */
export function lambdaIzForme(dom: FormaGolovi | null, gost: FormaGolovi | null): { lam: number; mu: number } {
  const napadDom = dom && dom.odigrano > 0 ? dom.postignuti / dom.odigrano : LIGA_PO_TIMU;
  const obranaGost = gost && gost.odigrano > 0 ? gost.primljeni / gost.odigrano : LIGA_PO_TIMU;
  const napadGost = gost && gost.odigrano > 0 ? gost.postignuti / gost.odigrano : LIGA_PO_TIMU;
  const obranaDom = dom && dom.odigrano > 0 ? dom.primljeni / dom.odigrano : LIGA_PO_TIMU;
  const sNapadDom = clamp(napadDom / LIGA_PO_TIMU, 0.35, 2.2);
  const sObranaGost = clamp(obranaGost / LIGA_PO_TIMU, 0.35, 2.2);
  const sNapadGost = clamp(napadGost / LIGA_PO_TIMU, 0.35, 2.2);
  const sObranaDom = clamp(obranaDom / LIGA_PO_TIMU, 0.35, 2.2);
  const multDom = sNapadDom * sObranaGost;
  const avgDom = (sNapadDom + sObranaGost) / 2;
  const multGost = sNapadGost * sObranaDom;
  const avgGost = (sNapadGost + sObranaDom) / 2;
  const lam = clamp((0.55 * multDom + 0.45 * avgDom) * LIGA_PO_TIMU * 1.08, 0.25, 4.2);
  const mu = clamp((0.55 * multGost + 0.45 * avgGost) * LIGA_PO_TIMU * 0.94, 0.2, 4.2);
  return { lam, mu };
}

/* ═══════════════════════════════════════════════════════════════════
   SKELLAM AH + HAZARD NADGRADNJA (v5) — delegira na skellam.ts
   ═══════════════════════════════════════════════════════════════════
   skellam.ts drži egzaktnu implementaciju (BesselovI, AH win/push/
   loss, gol-linija s pushom, hazard β = 1.18). Ovdje su izloženi pod
   istim API-jem da svi postojeći pozivatelji math-engine imaju
   pristup bez promjene importa. */
export {
  ahSkellam,
  skellamUkupnoOver,
  HAZARD_BETA,
  hazardEfektivneLam,
  type SkellamAhIshod,
  type SkellamUkupnoIshod,
  type HazardScenarij,
  type HazardIzlaz,
} from "./skellam";

/* ── OKOLIS I SUDAC (v6) ────────────────────────────────────────────
   Environmental & Match Official modifikatori — čiste funkcije,
   identitet bez podataka (nijedan broj se ne mijenja kad input
   nema uvjet). Poziva ih sarp-brain prije gradnje grid/Skellam. */

export type OkolisUlaz = {
  /** brzina vjetra u km/h (mjereno ili prognoza) */
  vjetarKmh?: number;
  /** jaka/česta kiša (ne laka rosulja) */
  kisa?: boolean;
  /** stanje terena */
  teren?: "dobro" | "mokro" | "lose";
};

export type OkolisIzlaz = {
  primijenjeno: boolean;
  /** pomak ukupne λ (negativan = manje golova) */
  pomakGolovi: number;
  /** pomak projekcije kornera */
  pomakKornera: number;
  razlozi: string[];
  opis: string;
};

/** Pragovi — javni da UI/selftest i chat mogu citati iste brojke. */
export const VJETAR_PRAG_KMH = 35;
export const DRAG_GOLOVI = 0.22;
export const DRAG_KORNERI = 1.5;

/**
 * WEATHER DRAG FACTOR: vjetar > 35 km/h, jaka kiša ili ekstremni
 * teren smanjuju tempo i preciznost → ukupna λ −0.22 i −1.5 kornera.
 * Svaki zadovoljen uvjet sam po sebi aktivira drag (ne množe se);
 * razlozi se slažu u listu za prompt chatova.
 */
export function okolisPomak(v?: OkolisUlaz | null): OkolisIzlaz {
  const razlozi: string[] = [];
  if (v) {
    if (v.vjetarKmh != null && v.vjetarKmh > VJETAR_PRAG_KMH)
      razlozi.push(`vjetar ${v.vjetarKmh.toFixed(0)} km/h > ${VJETAR_PRAG_KMH}`);
    if (v.kisa) razlozi.push("jaka kiša");
    if (v.teren === "mokro" || v.teren === "lose") razlozi.push(`teren: ${v.teren}`);
  }
  const primijenjeno = razlozi.length > 0;
  return {
    primijenjeno,
    pomakGolovi: primijenjeno ? -DRAG_GOLOVI : 0,
    pomakKornera: primijenjeno ? -DRAG_KORNERI : 0,
    razlozi,
    opis: primijenjeno
      ? `weather drag −${DRAG_GOLOVI.toFixed(2)} λ ukupno · −${DRAG_KORNERI.toFixed(1)} kornera (${razlozi.join(", ")})`
      : "identitet (bez okolnosti)",
  };
}

export type SudacUlaz = {
  /** prosjek kartona po utakmici suca */
  kartonaPoUtakmici?: number;
  /** prosjek dodijeljenih penala po utakmici */
  penaliPoUtakmici?: number;
};

export type SudacIzlaz = {
  primijenjeno: boolean;
  strog: boolean;
  /** vjerojatnost ≥1 crvenog kartona u ovoj utakmici (0..1) */
  rizikCrvena: number;
  opis: string;
};

export const SUDAC_KARTONA_PRAG = 5.0;
export const SUDAC_PENALI_PRAG = 0.4;
export const RIZIK_CRVENA_MIN = 0.18;

/**
 * REFEREE PROFILE ENGINE: sudac s > 5.0 kartona/utakmici ili
 * > 0.4 penala/utakmici je "strog" → rizik crvenog kartona ide na
 * > 18%. Model rizika: ligaška baza ~13% za barem jedan crveni;
 * raste 3 pp za svaki karton iznad 4.5 i 10 pp za svaki penal
 * iznad 0.3; strogim sucu pod pod 18%, strop 35%.
 */
export function sudacProfil(s?: SudacUlaz | null): SudacIzlaz {
  const k = s?.kartonaPoUtakmici ?? null;
  const p = s?.penaliPoUtakmici ?? null;
  if (k == null && p == null)
    return { primijenjeno: false, strog: false, rizikCrvena: 0.13, opis: "identitet (bez podataka o sucu)" };
  const strog = (k != null && k > SUDAC_KARTONA_PRAG) || (p != null && p > SUDAC_PENALI_PRAG);
  let rizik = 0.13;
  if (k != null) rizik += Math.max(0, k - 4.5) * 0.03;
  if (p != null) rizik += Math.max(0, p - 0.3) * 0.10;
  if (strog) rizik = Math.max(RIZIK_CRVENA_MIN, rizik);
  rizik = clamp(rizik, strog ? RIZIK_CRVENA_MIN : 0.05, 0.35);
  return {
    primijenjeno: true,
    strog,
    rizikCrvena: Math.round(rizik * 1000) / 1000,
    opis: strog
      ? `STROG SUDAC — kartona ${k != null ? k.toFixed(1) : "—"}/utakmici · penali ${p != null ? p.toFixed(2) : "—"}/utakmici → rizik crvenog kartona ${(rizik * 100).toFixed(0)}%`
      : `sudac u granicama — rizik crvenog kartona ${(rizik * 100).toFixed(0)}%`,
  };
}

/* ── ENTERPRISE PRECISION — optional calculation modules ──────────── */
export {
  calculateMotivation,
  calculateCircadianAdjustment,
  applyCircadianToFirstHalfLambda,
  calculateBenchDepth,
  applyDerbySuspensionShield,
  formatEdgeCaseSignals,
  applyMotivationToLambdas,
  applyDerbyDrawAdjustment,
  calculateSetPieceXg,
  calculateTravelFatigue,
  calculateCalibrationMetrics,
  calibrateProbability,
  formatEnterpriseSignals,
  type CircadianInput,
  type CircadianResult,
  type BenchDepthInput,
  type BenchDepthResult,
  type BenchSideResult,
  type SuspensionPlayerInput,
  type SuspensionPlayerResult,
  type EdgeCaseMatchSignals,
  type MotivationInput,
  type MotivationResult,
  type SetPieceInput,
  type SetPieceResult,
  type TravelInput,
  type TravelResult,
  type CalibrationSample,
  type CalibrationMetrics,
  type EnterpriseMatchSignals,
} from "./enterprise-precision";
