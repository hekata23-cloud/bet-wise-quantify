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
  // POPRAVAK: λ=0 mora značiti da momčad sigurno ne zabije; ne namećite umjetni minimum.
  const u = Math.exp(-Math.max(0, Number.isFinite(lh) ? lh : 0));
  const v = Math.exp(-Math.max(0, Number.isFinite(la) ? la : 0));
  // POPRAVAK: pozitivni rho za otvorenu utakmicu mora podići zajedničko zabijanje.
  const safeRho = Number.isFinite(rho) ? Math.max(-0.35, Math.min(0.35, rho)) : 0;
  // POPRAVAK: neispravan ρ ne smije učiniti kopulu i BTTS vjerojatnosti NaN.
  const theta = 8 * safeRho; // rho→theta mapiranje
  // POPRAVAK: zajednička vjerojatnost mora poštovati Fréchetove granice kopule.
  const p00 = Math.min(
    Math.min(u, v),
    Math.max(Math.max(0, u + v - 1), frankCopula(u, v, theta)),
  );
  // POPRAVAK: BTTS i neovisna BTTS moraju zadržati točne rubne vrijednosti 0 i 1.
  const gg = Math.min(1, Math.max(0, 1 - u - v + p00));
  const ggIndependent = Math.min(1, Math.max(0, 1 - u - v + u * v));
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
  // POPRAVAK: valjani nenegativni λ i ograničen nagib čuvaju zbroj vjerojatnosti.
  const base = Math.max(0, Number.isFinite(lh) ? lh : 0) + Math.max(0, Number.isFinite(la) ? la : 0);
  const safeLateSkew = Number.isFinite(lateSkew) ? Math.max(-0.49, Math.min(0.49, lateSkew)) : 0.18;
  // Vremenski profil: udjeli po trećinama uz nagib prema kraju.
  const w: [number, number, number] = [
    (1 - safeLateSkew) / 3,
    1 / 3,
    (1 + 2 * safeLateSkew) / 3,
  ];
  const wSum = w[0] + w[1] + w[2];
  const thirds: [number, number, number] = [
    (base * w[0]) / wSum,
    (base * w[1]) / wSum,
    (base * w[2]) / wSum,
  ];
  // Game-state multiplikator djeluje najjače u zadnjoj trećini.
  const b = Number.isFinite(beta) ? Math.max(-0.5, Math.min(0.5, beta)) : 0;
  thirds[1] *= 1 + b * 0.35;
  thirds[2] *= 1 + b;
  // POPRAVAK: ne namećite najmanje 0.2 gola kad je očekivani intenzitet nula.
  const lambdaEff = Math.max(0, thirds[0] + thirds[1] + thirds[2]);

  const cdf = (l: number, n: number) => {
    let s = 0;
    for (let k = 0; k <= n; k++) s += pois(l, k);
    return s;
  };
  // POPRAVAK: tržišne vjerojatnosti ostaju u [0,1] bez umjetnog minimuma koji remeti komplement.
  const over25 = Math.min(1, Math.max(0, 1 - cdf(lambdaEff, 2)));
  return {
    over25,
    under25: 1 - over25,
    over15: Math.min(1, Math.max(0, 1 - cdf(lambdaEff, 1))),
    over35: Math.min(1, Math.max(0, 1 - cdf(lambdaEff, 3))),
    lambdaEff,
    over25Base: Math.min(1, Math.max(0, 1 - cdf(base, 2))),
    shiftPb: (over25 - Math.min(1, Math.max(0, 1 - cdf(base, 2)))) * 100,
    thirds,
  };
}

// ───────────────────────── Opći paket formula ─────────────────────────

/** Skellam: P(razlika golova = d) — za hendikepe i DNB. */
export function skellam(lh: number, la: number, d: number): number {
  // POPRAVAK: odbacite nevaljane ulaze i uključite Poissonov rep za veće λ.
  if (!Number.isFinite(lh) || !Number.isFinite(la) || lh < 0 || la < 0 || !Number.isInteger(d)) return 0;
  const maxLambda = Math.max(lh, la);
  // POPRAVAK: pomak razlike d utječe na središte zbroja, ne samo na donju granicu.
  const maxK = Math.ceil(Math.max(la, lh - d, 0) + 10 * Math.sqrt(maxLambda + 1) + 10);
  let s = 0;
  for (let k = 0; k <= maxK; k++) {
    const a = d + k;
    if (a < 0) continue;
    s += pois(lh, a) * pois(la, k);
  }
  return s;
}

/** Bivariate Poisson P(x,y) s kovarijancom λ3. */
export function bivariatePoisson(lh: number, la: number, l3: number, x: number, y: number): number {
  // POPRAVAK: nevažeće ulazne vrijednosti ne smiju dati NaN ili neispravnu masu.
  if (![lh, la, l3, x, y].every(Number.isFinite) || lh < 0 || la < 0 || l3 < 0 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return 0;
  // POPRAVAK: zajednička komponenta ne smije nadmašiti margine ni dodavati lažnu lambdu 0.01.
  const common = Math.max(0, Math.min(l3, lh, la));
  const l1 = Math.max(0, lh - common);
  const l2 = Math.max(0, la - common);
  let s = 0;
  const kMax = Math.min(x, y);
  for (let k = 0; k <= kMax; k++) s += pois(l1, x - k) * pois(l2, y - k) * pois(common, k);
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
  // Σ r_i^k = 1, k ≥ 1 (veći k → manja suma). Bisekcija po k.
  // POPRAVAK: širi interval (0..∞) da bisekcija pokrije i vrlo visoke marže i arbitražu (Σ1/o < 1).
  let lo = 0;
  let hi = 5;
  while (raw.reduce((acc, r) => acc + Math.pow(r, hi), 0) > 1 && hi < 256) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const k = (lo + hi) / 2;
    const s = raw.reduce((acc, r) => acc + Math.pow(r, k), 0);
    if (s > 1) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const p = raw.map((r) => Math.pow(r, k));
  const t = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / t);
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
  // POPRAVAK: kvota ≤ 1 ili neispravni ulazi ne daju Kellyjev ulog.
  if (!Number.isFinite(p) || !Number.isFinite(odds) || !Number.isFinite(fraction) || odds <= 1) return 0;
  const probability = Math.min(1, Math.max(0, p));
  const b = odds - 1;
  const f = (probability * b - (1 - probability)) / b;
  return Math.max(0, Math.min(0.05, f * fraction));
}

/** Shannonova entropija (base = broj ishoda) — indeks slučajnosti 0..1. */
export function entropy(probs: number[]): number {
  const base = Math.max(2, probs.length);
  let h = 0;
  for (const p of probs) {
    // POPRAVAK: nulta vjerojatnost doprinosi točno nula Shannonovoj entropiji.
    if (!Number.isFinite(p) || p <= 0) continue;
    const q = Math.min(1, p);
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
  // Glicko-1 ažuriranje za jednu utakmicu (protivnik s RD≈rd).
  const q = Math.log(10) / 400;
  const g = 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
  const e = Math.min(0.999, Math.max(0.001, expected));
  const d2 = 1 / (q * q * g * g * e * (1 - e));
  return rating + (q / (1 / (rd * rd) + 1 / d2)) * g * (actual - e);
}

/** Utjecaj crvene karte na λ: kažnjeni tim ≈ −35%, protivnik ≈ +22% (skalirano preostalim vremenom). */
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
  let pDraw = 0, pHome = 0;
  // POPRAVAK: uključite repove razlike golova umjesto da velike pobjede domaćina pripišete gostu.
  const maxDifference = Math.ceil(Math.max(inp.lh, inp.la) + 10 * Math.sqrt(Math.max(inp.lh, inp.la) + 1) + 10);
  for (let d = -maxDifference; d <= maxDifference; d++) {
    const v = skellam(inp.lh, inp.la, d);
    if (d === 0) pDraw += v; else if (d > 0) pHome += v;
  }
  const pAway = Math.max(0, 1 - pHome - pDraw);
  const ent = entropy([pHome, pDraw, pAway]);
  return [
    "═══ PROŠIRENI MATEMATIČKI PAKET v8 (izračunato lokalno) ═══",
    `BTTS kopula (ρ=${inp.bttsRho}): GG ${pct(c.gg)} · NG ${pct(c.ng)} · P(0:0) ${pct(c.p00)} · korelacijski pomak ${c.shiftPb.toFixed(1)} pb u odnosu na neovisni Poisson (${pct(c.ggIndependent)}).`,
    `O/U game-state hazard (β=${inp.ouBeta}): λ_eff ${o.lambdaEff.toFixed(2)} (baza ${(inp.lh + inp.la).toFixed(2)}) · Over 1.5 ${pct(o.over15)} · Over 2.5 ${pct(o.over25)} · Under 2.5 ${pct(o.under25)} · Over 3.5 ${pct(o.over35)} · pomak ${o.shiftPb.toFixed(1)} pb.`,
    `Golovi po trećinama: 0-30' ${o.thirds[0].toFixed(2)} · 30-60' ${o.thirds[1].toFixed(2)} · 60-90' ${o.thirds[2].toFixed(2)}.`,
    `Skellam: P(razlika = 0) ${pct(h0)} · P(dom +1) ${pct(h1)} — koristi za DNB, hendikep i točan rezultat.`,
    `Indeks slučajnosti (Shannon, 1X2 iz λ: 1 ${pct(pHome)} · X ${pct(pDraw)} · 2 ${pct(pAway)}): ${ent.toFixed(2)} — iznad 0.90 smanji ulog ili preskoči.`,
  ].join("\n");
}
