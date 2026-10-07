// ═══════════════════════════════════════════════════════════════════════════
// ANDROMEDA AI — PROŠIRENI MATEMATIČKI PAKET v8
// Dvije nove napredne funkcije za razmišljanje bota:
//   1) BTTS KOPULA MOTOR — korelirani golovi (Frank kopula + bivariate Poisson)
//   2) OVER/UNDER 2.5 GAME-STATE HAZARD — golovi po minutama, stanje utakmice
// Plus opći paket metoda koje bot primjenjuje na BILO KOJI tip predikcije:
//   Skellam, Shin de-vig, power de-vig, Kelly, Shannon entropija, Brier/log-loss,
//   Bayesovo osvježavanje, Glicko-lite, crvena karta / penal scenariji.
// Sve su čiste funkcije — bez mreže, bez Lovable AI, bez tokena.
// ═══════════════════════════════════════════════════════════════════════════
import { pois } from "./accuracy";

const clamp01 = (p: number) => Math.min(0.9995, Math.max(0.0005, p));

// ───────────────────────── 1) BTTS KOPULA MOTOR ─────────────────────────

/** Frank kopula generator — modelira ovisnost između "dom zabija" i "gost zabija". */
function frankCopula(u: number, v: number, theta: number): number {
  if (Math.abs(theta) < 1e-6) return u * v;
  const e = (x: number) => Math.exp(-theta * x) - 1;
  return (-1 / theta) * Math.log(1 + (e(u) * e(v)) / (Math.exp(-theta) - 1));
}

export interface BttsCopulaResult {
  /** P(oba tima zabiju) */
  gg: number;
  /** P(barem jedan tim ne zabije) */
  ng: number;
  /** P(0:0) */
  p00: number;
  /** neovisna (Poisson) referenca — za usporedbu koliko korelacija mijenja tip */
  ggIndependent: number;
  /** korelacijski pomak u postotnim bodovima */
  shiftPb: number;
  theta: number;
}

/**
 * BTTS s koreliranim golovima.
 * rho > 0 = otvorena utakmica (gol izaziva gol), rho < 0 = obostrano gušenje.
 * u = P(dom ne zabije) = e^-λh, v = P(gost ne zabije) = e^-λa.
 * P(0:0) = C(u, v), P(GG) = 1 − u − v + C(u,v).
 */
export function bttsCopula(lh: number, la: number, rho: number): BttsCopulaResult {
  const u = Math.exp(-Math.max(0.05, lh));
  const v = Math.exp(-Math.max(0.05, la));
  const theta = -8 * Math.max(-0.35, Math.min(0.35, rho)); // rho→theta mapiranje
  const p00 = Math.min(0.6, Math.max(u * v * 0.35, frankCopula(u, v, theta)));
  const gg = clamp01(1 - u - v + p00);
  const ggIndependent = clamp01(1 - u - v + u * v);
  return {
    gg,
    ng: 1 - gg,
    p00,
    ggIndependent,
    shiftPb: (gg - ggIndependent) * 100,
    theta,
  };
}

// ─────────────── 2) OVER/UNDER 2.5 — GAME-STATE HAZARD MODEL ───────────────

export interface OuHazardResult {
  over25: number;
  under25: number;
  over15: number;
  over35: number;
  /** očekivani broj golova nakon korekcije stanjem utakmice */
  lambdaEff: number;
  /** osnovni Poisson bez game-state korekcije */
  over25Base: number;
  shiftPb: number;
  /** raspodjela golova po trećinama utakmice (0-30, 30-60, 60-90) */
  thirds: [number, number, number];
}

/**
 * Nehomogeni Poissonov proces: intenzitet golova nije konstantan kroz utakmicu.
 * λ(t) raste prema kraju (umor, otvaranje igre), a kad je rezultat "odlučen"
 * ili tijesan, timovi mijenjaju rizik → beta korekcija stanja utakmice.
 *
 * beta > 0  = timovi jure gol (zaostatak, moraju pobijediti) → više golova
 * beta < 0  = utakmica se "zatvara" (favorit vodi, low block) → manje golova
 */
export function ouGameStateHazard(
  lh: number,
  la: number,
  beta: number,
  lateSkew = 0.18,
): OuHazardResult {
  const base = lh + la;
  // Vremenski profil: udjeli po trećinama uz nagib prema kraju.
  const w: [number, number, number] = [
    (1 - lateSkew) / 3,
    1 / 3,
    (1 + 2 * lateSkew) / 3,
  ];
  const wSum = w[0] + w[1] + w[2];
  const thirds: [number, number, number] = [
    (base * w[0]) / wSum,
    (base * w[1]) / wSum,
    (base * w[2]) / wSum,
  ];
  // Game-state multiplikator djeluje najjače u zadnjoj trećini.
  const b = Math.max(-0.5, Math.min(0.5, beta));
  thirds[1] *= 1 + b * 0.35;
  thirds[2] *= 1 + b;
  const lambdaEff = Math.max(0.2, thirds[0] + thirds[1] + thirds[2]);

  const cdf = (l: number, n: number) => {
    let s = 0;
    for (let k = 0; k <= n; k++) s += pois(l, k);
    return s;
  };
  const over25 = clamp01(1 - cdf(lambdaEff, 2));
  return {
    over25,
    under25: 1 - over25,
    over15: clamp01(1 - cdf(lambdaEff, 1)),
    over35: clamp01(1 - cdf(lambdaEff, 3)),
    lambdaEff,
    over25Base: clamp01(1 - cdf(base, 2)),
    shiftPb: (over25 - clamp01(1 - cdf(base, 2))) * 100,
    thirds,
  };
}

// ───────────────────────── Opći paket formula ─────────────────────────

/** Skellam: P(razlika golova = d) — za hendikepe i DNB. */
export function skellam(lh: number, la: number, d: number): number {
  // Suma po zajedničkom broju golova (numerički stabilno za male λ).
  let s = 0;
  for (let k = 0; k <= 12; k++) {
    const a = d + k;
    if (a < 0) continue;
    s += pois(lh, a) * pois(la, k);
  }
  return s;
}

/** Bivariate Poisson P(x,y) s kovarijancom λ3. */
export function bivariatePoisson(lh: number, la: number, l3: number, x: number, y: number): number {
  const l1 = Math.max(0.01, lh - l3);
  const l2 = Math.max(0.01, la - l3);
  let s = 0;
  const kMax = Math.min(x, y);
  for (let k = 0; k <= kMax; k++) s += pois(l1, x - k) * pois(l2, y - k) * pois(l3, k);
  return s;
}

/** Multiplikativni de-vig (normalizacija implicitnih vjerojatnosti). */
export function devigMultiplicative(odds: number[]): number[] {
  const raw = odds.map((o) => 1 / Math.max(1.01, o));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / s);
}

/** Power de-vig: rješava Σ p_i^(1/α) = 1 — točniji za favorit/autsajder bias. */
export function devigPower(odds: number[]): number[] {
  const raw = odds.map((o) => 1 / Math.max(1.01, o));
  let lo = 0.5;
  let hi = 2;
  for (let i = 0; i < 60; i++) {
    const a = (lo + hi) / 2;
    const s = raw.reduce((acc, r) => acc + Math.pow(r, 1 / a), 0);
    if (s > 1) lo = a;
    else hi = a;
  }
  const a = (lo + hi) / 2;
  return raw.map((r) => Math.pow(r, 1 / a));
}

/** Shin de-vig — modelira udio "insajderskog" novca z. */
export function devigShin(odds: number[]): number[] {
  const raw = odds.map((o) => 1 / Math.max(1.01, o));
  const book = raw.reduce((a, b) => a + b, 0);
  let z = 0;
  for (let i = 0; i < 100; i++) {
    const p = raw.map((r) => (Math.sqrt(z * z + 4 * (1 - z) * (r * r) / book) - z) / (2 * (1 - z)));
    const s = p.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) < 1e-9) break;
    z += (s - 1) * 0.5;
    z = Math.max(0, Math.min(0.35, z));
  }
  const p = raw.map((r) => (Math.sqrt(z * z + 4 * (1 - z) * (r * r) / book) - z) / (2 * (1 - z)));
  const s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / s);
}

/** Kelly udio banke (frakcijski). */
export function kelly(p: number, odds: number, fraction = 0.25): number {
  const b = odds - 1;
  const f = (p * b - (1 - p)) / Math.max(0.01, b);
  return Math.max(0, Math.min(0.05, f * fraction));
}

/** Shannonova entropija (base = broj ishoda) — indeks slučajnosti 0..1. */
export function entropy(probs: number[]): number {
  const base = Math.max(2, probs.length);
  let h = 0;
  for (const p of probs) {
    const q = clamp01(p);
    h -= q * (Math.log(q) / Math.log(base));
  }
  return h;
}

/** Brier score — mjera kalibracije predikcije. */
export function brier(p: number, outcome: 0 | 1): number {
  return (p - outcome) ** 2;
}

/** Log-loss — kaznjava samouvjerene promašaje. */
export function logLoss(p: number, outcome: 0 | 1): number {
  const q = clamp01(p);
  return -(outcome * Math.log(q) + (1 - outcome) * Math.log(1 - q));
}

/** Bayesovo osvježavanje: prior λ (Gamma) + novi podaci. */
export function bayesLambda(priorMean: number, priorStrength: number, obsGoals: number, obsGames: number): number {
  return (priorMean * priorStrength + obsGoals) / (priorStrength + Math.max(0.5, obsGames));
}

/** Glicko-lite: rating pomak s obzirom na nesigurnost (RD). */
export function glickoShift(rating: number, rd: number, expected: number, actual: number): number {
  const q = Math.log(10) / 400;
  const g = 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
  return rating + q * g * (actual - expected) * (rd * rd) * 0.01;
}

/** Utjecaj rane crvene karte na λ (prosječno: −22% za igrača manje). */
export function redCardAdjust(lh: number, la: number, minute: number, onHome: boolean): [number, number] {
  const remaining = Math.max(0, (90 - Math.min(90, minute)) / 90);
  const drop = 0.35 * remaining;
  const boost = 0.22 * remaining;
  return onHome ? [lh * (1 - drop), la * (1 + boost)] : [lh * (1 + boost), la * (1 - drop)];
}

/** Očekivani doprinos penala λ-i (prosjek ~0.24 penala/utakmica × 0.78 konverzija). */
export function penaltyLambda(refPensPerGame: number): number {
  return Math.max(0, refPensPerGame) * 0.78;
}

/** Value / edge = p × kvota − 1. */
export function edge(p: number, odds: number): number {
  return p * odds - 1;
}

/** Poštena kvota iz vjerojatnosti. */
export function fairOdds(p: number): number {
  return 1 / clamp01(p);
}

// ───────────────────────── Briefing za bota ─────────────────────────

export interface MathPackBriefingInput {
  lh: number;
  la: number;
  bttsRho: number;
  ouBeta: number;
}

/** Konkretni izračuni koje bot dobiva prije odgovora (ne samo upute). */
export function mathPackBriefing(inp: MathPackBriefingInput): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const c = bttsCopula(inp.lh, inp.la, inp.bttsRho);
  const o = ouGameStateHazard(inp.lh, inp.la, inp.ouBeta);
  const h1 = skellam(inp.lh, inp.la, 1);
  const h0 = skellam(inp.lh, inp.la, 0);
  const ent = entropy([0.4, 0.28, 0.32]);
  return [
    "═══ PROŠIRENI MATEMATIČKI PAKET v8 (izračunato lokalno) ═══",
    `BTTS kopula (ρ=${inp.bttsRho}): GG ${pct(c.gg)} · NG ${pct(c.ng)} · P(0:0) ${pct(c.p00)} · korelacijski pomak ${c.shiftPb.toFixed(1)} pb u odnosu na neovisni Poisson (${pct(c.ggIndependent)}).`,
    `O/U game-state hazard (β=${inp.ouBeta}): λ_eff ${o.lambdaEff.toFixed(2)} (baza ${(inp.lh + inp.la).toFixed(2)}) · Over 1.5 ${pct(o.over15)} · Over 2.5 ${pct(o.over25)} · Under 2.5 ${pct(o.under25)} · Over 3.5 ${pct(o.over35)} · pomak ${o.shiftPb.toFixed(1)} pb.`,
    `Golovi po trećinama: 0-30' ${o.thirds[0].toFixed(2)} · 30-60' ${o.thirds[1].toFixed(2)} · 60-90' ${o.thirds[2].toFixed(2)}.`,
    `Skellam: P(razlika = 0) ${pct(h0)} · P(dom +1) ${pct(h1)} — koristi za DNB, hendikep i točan rezultat.`,
    `Indeks slučajnosti (Shannon, referentni 1X2 profil): ${ent.toFixed(2)} — iznad 0.90 smanji ulog ili preskoči.`,
  ].join("\n");
}
