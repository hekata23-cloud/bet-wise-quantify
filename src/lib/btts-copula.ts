/* ═══════════════════════════════════════════════════════════════════
   BTTS-COPULA — korelacija golova za BTTS (GG/NG) (v1)
   ═══════════════════════════════════════════════════════════════════
   Čisti nezavisni Poisson za BTTS grije: kad jedan tim povede,
   protivnik često otvara igru → golovi su POZITIVNO korelirani.
   Literatura (fudbalsko modeliranje): korelacija golova ρ ≈ 0.08.

   Tri međusobno nezavisna "suda" o zavisnosti:
     1) Dixon–Coles matrica (rho fitiran na U 1.5)  → težina 50%
     2) Bivarijantni Poisson (Karlis–Ntzoufras),    → težina 30%
        λ3 = ρ · √(λH·λA), ρ = 0.08 (zajednička komponenta)
     3) Frank kopula, θ riješen tako da je Pearson korelacija       → težina 20%
        golova točno 0.08

   Finalna P(BTTS) = mješavina sva tri — model varijance zavisnosti
   umjesto da se kladimo na jedan ekstrem. Grid i korelacije su
   numerički testirani (zbrojevi = 1, BTTS ≤ P(Over 1.5)).
   ═══════════════════════════════════════════════════════════════════ */

const MAXK = 15; // do 15 golova po timu — pokriva praktički sve rezultate

/** P(X = k) za Poisson(λ). */
function pois(k: number, lam: number): number {
  if (k < 0 || !(lam > 0)) return k === 0 && lam === 0 ? 1 : 0;
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

/** Bivarijantni Poisson grid: X = X1+X3, Y = X2+X3, λ3 = ρ√(λHλA). */
export function bivarPoissonGrid(lamH: number, lamA: number, rhoBp = 0.08): number[][] {
  const lam3 = Math.min(Math.max(rhoBp * Math.sqrt(Math.max(lamH, 0) * Math.max(lamA, 0)), 0), Math.min(lamH, lamA) * 0.9);
  const lam1 = Math.max(lamH - lam3, 0);
  const lam2 = Math.max(lamA - lam3, 0);
  const g: number[][] = [];
  for (let x = 0; x <= MAXK; x++) {
    g[x] = [];
    for (let y = 0; y <= MAXK; y++) {
      let s = 0;
      const kMax = Math.min(x, y);
      for (let k = 0; k <= kMax; k++) s += pois(x - k, lam1) * pois(y - k, lam2) * pois(k, lam3);
      g[x]![y] = s;
    }
  }
  // normaliziraj (rez na MAXK gubi zanemarivu masu)
  let z = 0;
  for (let x = 0; x <= MAXK; x++) for (let y = 0; y <= MAXK; y++) z += g[x]![y]!;
  for (let x = 0; x <= MAXK; x++) for (let y = 0; y <= MAXK; y++) g[x]![y] = g[x]![y]! / z;
  return g;
}

/** P(BTTS) iz bivarijantnog Poissona. */
export function bpBtts(lamH: number, lamA: number, rhoBp = 0.08): number {
  const g = bivarPoissonGrid(lamH, lamA, rhoBp);
  let s = 0;
  for (let x = 1; x <= MAXK; x++) for (let y = 1; y <= MAXK; y++) s += g[x]![y]!;
  return s;
}

/* ── FRANK COPULA ────────────────────────────────────────────────── */

/** Frank C(u,v) = −(1/θ)·ln(1 + (e^{−θu}−1)(e^{−θv}−1)/(e^{−θ}−1)). */
export function frankC(u: number, v: number, theta: number): number {
  if (theta === 0) return u * v;
  const a = Math.exp(-theta * u) - 1;
  const b = Math.exp(-theta * v) - 1;
  const d = Math.exp(-theta) - 1;
  return -Math.log(1 + (a * b) / d) / theta;
}

/** Zglobna pmf iz kopule i diskretnih Poissonovih margina (mješovite razlike). */
export function frankJointGrid(lamH: number, lamA: number, theta: number): number[][] {
  const u: number[] = []; // u(x) = P(X ≤ x)
  const v: number[] = [];
  let cu = 0, cv = 0;
  for (let x = 0; x <= MAXK; x++) { cu += pois(x, lamH); u[x] = Math.min(cu, 1); }
  for (let y = 0; y <= MAXK; y++) { cv += pois(y, lamA); v[y] = Math.min(cv, 1); }
  const g: number[][] = [];
  for (let x = 0; x <= MAXK; x++) {
    g[x] = [];
    for (let y = 0; y <= MAXK; y++) {
      const c00 = frankC(x === 0 ? 0 : u[x - 1]!, y === 0 ? 0 : v[y - 1]!, theta);
      const c10 = frankC(u[x]!, y === 0 ? 0 : v[y - 1]!, theta);
      const c01 = frankC(x === 0 ? 0 : u[x - 1]!, v[y]!, theta);
      const c11 = frankC(u[x]!, v[y]!, theta);
      g[x]![y] = Math.max(0, c11 - c10 - c01 + c00);
    }
  }
  let z = 0;
  for (let x = 0; x <= MAXK; x++) for (let y = 0; y <= MAXK; y++) z += g[x]![y]!;
  for (let x = 0; x <= MAXK; x++) for (let y = 0; y <= MAXK; y++) g[x]![y] = g[x]![y]! / z;
  return g;
}

/** Pearson korelacija golova u Frank zglobnoj distribuciji. */
function frankKorelacija(lamH: number, lamA: number, theta: number): number {
  const g = frankJointGrid(lamH, lamA, theta);
  let exy = 0;
  for (let x = 0; x <= MAXK; x++) for (let y = 0; y <= MAXK; y++) exy += x * y * g[x]![y]!;
  const cov = exy - lamH * lamA;
  const sd = Math.sqrt(Math.max(lamH, 1e-9) * Math.max(lamA, 1e-9));
  return cov / sd;
}

/** Nađi θ tako da korelacija golova = cilj (0.08). Bisekcija po θ ∈ (−5, 8). */
export function frankThetaZaKorelaciju(cilj = 0.08, lamH = 1.5, lamA = 1.3): number {
  let lo = -5, hi = 8;
  const f = (t: number) => frankKorelacija(lamH, lamA, t) - cilj;
  // korelacija je rastuća u θ za Frank
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** P(BTTS) pod Frank kopulom s datim θ (ekzaktna suma preko preživljavanja). */
export function frankBtts(lamH: number, lamA: number, theta: number): number {
  const u0 = pois(0, lamH); // P(X = 0)
  const v0 = pois(0, lamA); // P(Y = 0)
  return 1 - u0 - v0 + frankC(u0, v0, theta);
}

/* ── GLAVNI ULAZ ─────────────────────────────────────────────────── */

/** Mješavina DC + bivarijantni Poisson + Frank → P(BTTS). */
export function bttsIzKopule(
  lamH: number,
  lamA: number,
  dcBtts: number,
  rhoBp = 0.08,
  tezine: { dc: number; bp: number; frank: number } = { dc: 0.5, bp: 0.3, frank: 0.2 },
): { btts: number; dc: number; bp: number; frank: number; theta: number } {
  const theta = frankThetaZaKorelaciju(rhoBp, Math.min(lamH, lamA), Math.max(lamH, lamA));
  const pBp = bpBtts(lamH, lamA, rhoBp);
  const pFrank = frankBtts(lamH, lamA, theta);
  const mix = tezine.dc * dcBtts + tezine.bp * pBp + tezine.frank * pFrank;
  return {
    btts: Math.min(Math.max(mix, 0.001), 0.999),
    dc: dcBtts,
    bp: pBp,
    frank: pFrank,
    theta,
  };
}

