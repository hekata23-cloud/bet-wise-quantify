// ============================================================
// LIVE-MOTOR — In-Play / Uživo preračunavanje vjerojatnosti
// Čista logika, bez API poziva i bez ovisnosti o projektu.
//
// Način rada:
//  - preostalo vrijeme = (90 + sudbinska nadoknada ~4') − minuta
//  - crveni karton: tim s kartonom ×0.85 λ, protivnik ×1.22 λ (po kartonu)
//  - preostali golovi: neovisna Poisson distribucija (klasični pristup)
//  - svi tržišni izlazi (O/U, BTTS, 1X2, sljedeći gol) uvjetovani
//    trenutnim rezultatom i minutom
// ============================================================

export interface LiveUlaz {
  lambdaDom: number; // pre-match λ domaćina (iz SARP/goals motora)
  lambdaGost: number;
  minuta: number; // 0..120
  goloviDom: number;
  goloviGost: number;
  crveniDom?: number;
  crveniGost?: number;
}

export interface LiveIzlaz {
  preostaloMinuta: number;
  lamPreostaloDom: number;
  lamPreostaloGost: number;
  /** puni match, uvjetovano trenutnim stanjem */
  o05: number;
  o15: number;
  o25: number;
  o35: number;
  o45: number;
  btts: number;
  p1: number;
  pX: number;
  p2: number;
  /** sljedeći gol (u preostalom vremenu) */
  sljedeciDom: number;
  sljedeciGost: number;
  sljedeciNema: number;
  /** vjerojatnost da NE padne više gol u meču */
  nemaViseGolova: number;
  ocekivaniKonacniRezultat: string;
}

const NADOKNADA = 4; // ~4' prosječna nadoknada cijele utakmice

function fakts(n: number): number[] {
  const f = [1];
  for (let i = 1; i <= n; i++) f[i] = f[i - 1] * i;
  return f;
}
const FAKT = fakts(12);

function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k > 12) return 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FAKT[k];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Vjerojatnost da ukupno (a+b) bude ≥ N kad su a~Pois(λa), b~Pois(λb). */
function pZbrojNajmanje(la: number, lb: number, n: number): number {
  let p = 0;
  for (let i = 0; i <= 10; i++) {
    const pa = poissonPmf(la, i);
    if (pa === 0) continue;
    for (let j = 0; j <= 10; j++) {
      if (i + j >= n) p += pa * poissonPmf(lb, j);
    }
  }
  return p;
}

/** Zajednička raspodjela preostalih golova (i,j ≤ 10) → agregirana tržišta. */
export function liveAnaliza(ulaz: LiveUlaz): LiveIzlaz {
  const ld = Math.max(0.05, ulaz.lambdaDom);
  const lg = Math.max(0.05, ulaz.lambdaGost);
  const preostalo = clamp(90 + NADOKNADA - ulaz.minuta, 0, 94);

  let lamD = ld * (preostalo / 90);
  let lamG = lg * (preostalo / 90);

  const crD = Math.max(0, ulaz.crveniDom ?? 0);
  const crG = Math.max(0, ulaz.crveniGost ?? 0);
  if (crD > 0) {
    lamD *= Math.pow(0.85, crD);
    lamG *= Math.pow(1.22, crD);
  }
  if (crG > 0) {
    lamG *= Math.pow(0.85, crG);
    lamD *= Math.pow(1.22, crG);
  }

  const gd = Math.max(0, Math.round(ulaz.goloviDom));
  const gg = Math.max(0, Math.round(ulaz.goloviGost));
  const ukupnoSad = gd + gg;

  const o = (n: number) => (ukupnoSad >= n ? 1 : pZbrojNajmanje(lamD, lamG, n - ukupnoSad));

  // BTTS (final): oba tima daju ≥1
  let pDomNula = 0,
    pGostNula = 0,
    pObojeNula = 0;
  if (gd === 0 && gg === 0) {
    pDomNula = Math.exp(-lamD);
    pGostNula = Math.exp(-lamG);
    pObojeNula = Math.exp(-lamD - lamG);
  } else if (gd === 0) {
    pDomNula = Math.exp(-lamD);
  } else if (gg === 0) {
    pGostNula = Math.exp(-lamG);
  }
  const btts = clamp(1 - pDomNula - pGostNula + pObojeNula, 0, 1);

  // finalni ishod 1X2: suma po preostalim golovima
  let p1 = 0,
    pX = 0,
    p2 = 0;
  for (let i = 0; i <= 10; i++) {
    const pa = poissonPmf(lamD, i);
    if (pa === 0) continue;
    for (let j = 0; j <= 10; j++) {
      const pb = poissonPmf(lamG, j);
      if (pb === 0) continue;
      const konD = gd + i,
        konG = gg + j;
      const w = pa * pb;
      if (konD > konG) p1 += w;
      else if (konD === konG) pX += w;
      else p2 += w;
    }
  }
  const s = p1 + pX + p2 || 1;
  p1 /= s;
  pX /= s;
  p2 /= s;

  // sljedeći gol: Poisson utrka (neovisni procesi, brzina ∝ λ)
  const lamUk = lamD + lamG;
  const sljedeciNema = lamUk <= 0 ? 1 : Math.exp(-lamUk);
  const sljedeciDom = lamUk <= 0 ? 0 : (1 - sljedeciNema) * (lamD / lamUk);
  const sljedeciGost = lamUk <= 0 ? 0 : (1 - sljedeciNema) * (lamG / lamUk);

  return {
    preostaloMinuta: Math.round(preostalo),
    lamPreostaloDom: Math.round(lamD * 100) / 100,
    lamPreostaloGost: Math.round(lamG * 100) / 100,
    o05: o(1),
    o15: o(2),
    o25: o(3),
    o35: o(4),
    o45: o(5),
    btts: Math.round(btts * 1000) / 1000,
    p1: Math.round(p1 * 1000) / 1000,
    pX: Math.round(pX * 1000) / 1000,
    p2: Math.round(p2 * 1000) / 1000,
    sljedeciDom: Math.round(sljedeciDom * 1000) / 1000,
    sljedeciGost: Math.round(sljedeciGost * 1000) / 1000,
    sljedeciNema: Math.round(sljedeciNema * 1000) / 1000,
    nemaViseGolova: sljedeciNema,
    ocekivaniKonacniRezultat: `${gd + Math.round(lamD)}:${gg + Math.round(lamG)}`,
  };
}

/** Live value: p (model) vs uživo kvota. Edge ≥ prag → LIVE VALUE. */
export function liveEdge(p: number, kvota: number): number {
  if (!(kvota > 1) || p <= 0 || p >= 1) return 0;
  return p * kvota - 1;
}

export const LIVE_VALUE_PRAG = 0.05;
