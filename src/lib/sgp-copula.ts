// ============================================================
// SGP-COPULA — Same Game Parlay s Gaussian copulom
// (jednofaktorski model: zajednički faktor = gol/pace okruženje meča)
//
// Naivni parlay množi vjerojatnosti — to je točno SAMO za neovisne
// događaje. Opcije iz istog meča su korelirane (npr. "1" i Over 1.5).
// Copula računa pravu zajedničku vjerojatnost, pa je EV i Kelly ispravan.
// ============================================================

/* ── normalna raspodjela: CDF i inverz (Acklamova aproksimacija) ── */
export function fi(x: number): number {
  // Abramowitz & Stegun 7.1.26 erf
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  let p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function fiInv(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  q = p - 0.5;
  r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/* ── korelacija tržišta sa zajedničkim faktorom (gol okruženje meča) ──
   predznak: + znači da rastući gol intenzitet POVRAĆAVA vjerojatnost tipa */
export const KORELACIJE_TRZISTA: Record<string, number> = {
  o05: 0.35,
  o15: 0.55,
  o25: 0.65,
  o35: 0.6,
  o45: 0.5,
  u05: -0.35,
  u15: -0.55,
  u25: -0.65,
  u35: -0.6,
  u45: -0.5,
  bttsDa: 0.45,
  bttsNe: -0.45,
  "1": 0.2,
  "2": 0.2,
  X: -0.4,
  htftPoz: 0.3,
};

export interface SgpStavka {
  kljuc: string; // ključ tržišta (o25, bttsDa, "1", ...)
  label: string; // prikaz ("O2.5")
  p: number; // model vjerojatnost 0..1
  kvota: number; // tržišna kvota
}

export interface SgpIzlaz {
  n: number;
  kvota: number; // kombinirana (množenje kvota — to je točno i uz korelaciju)
  pNaivno: number; // naivno ∏p — POGREŠNO za korelirane opcije
  pCopula: number; // prava zajednička vjerojatnost (Gaussian copula)
  korelacijaKorekcija: number; // (pCopula − pNaivno) u pp
  edge: number; // kvota × pCopula − 1
  edgeNaivno: number;
  kelly: number; // puna Kelly na pCopula
  kellyPct: number; // preporučeni ulog (¼ Kelly, cap 3% banke)
  upozorenja: string[];
  konflikt: boolean;
  isplativo: boolean;
}

/* Simpsonova integracija po faktoru F (gusta mreža — numerički točna) */
const SIM_A = -7;
const SIM_B = 7;
const SIM_N = 280; // paran broj intervala, h = 0.05
const SIM_H = (SIM_B - SIM_A) / SIM_N;

function simpsonE(pairs: { z: number; rho: number }[]): number {
  const f = (F: number) => {
    let prod = 1;
    for (const { z, rho } of pairs) {
      prod *= fi((z - rho * F) / Math.sqrt(Math.max(1e-9, 1 - rho * rho)));
      if (prod < 1e-12) return 0;
    }
    return (prod * Math.exp((-F * F) / 2)) / Math.sqrt(2 * Math.PI);
  };
  let sum = f(SIM_A) + f(SIM_B);
  for (let i = 1; i < SIM_N; i++) {
    sum += f(SIM_A + i * SIM_H) * (i % 2 ? 4 : 2);
  }
  return (sum * SIM_H) / 3;
}

/**
 * Zajednička vjerojatnost koreliranih binarnih događaja:
 * p = E_F[ ∏ Φ((z_i − ρ_i·F) / √(1−ρ_i²)) ],  F ~ N(0,1)
 * — jednofaktorska Gaussian copula; faktor je gol-okruženje meča.
 */
export function zajednickaVjerojatnost(stavke: SgpStavka[]): number {
  if (stavke.length === 0) return 0;
  if (stavke.length === 1) return clamp01(stavke[0].p);
  const pairs = stavke.map((s) => ({
    z: fiInv(clamp01(s.p)),
    rho: Math.max(-0.85, Math.min(0.85, KORELACIJE_TRZISTA[s.kljuc] ?? 0.15)),
  }));
  return clamp01(simpsonE(pairs));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

/* tržišta koja se MEĐUSOBNO ISKLJUČUJU — ne smiju u isti SGP */
const KONFLIKT_PAROVI: [string, string][] = [
  ["o05", "u05"],
  ["o15", "u15"],
  ["o25", "u25"],
  ["o35", "u35"],
  ["o45", "u45"],
  ["bttsDa", "bttsNe"],
  ["1", "2"],
  ["1", "X"],
  ["2", "X"],
];

function pronadjiKonflikte(kljucevi: string[]): [string, string][] {
  const set = new Set(kljucevi);
  return KONFLIKT_PAROVI.filter(([a, b]) => set.has(a) && set.has(b));
}

export function izracunajSgp(stavke: SgpStavka[]): SgpIzlaz {
  const prazno: SgpIzlaz = {
    n: 0,
    kvota: 1,
    pNaivno: 0,
    pCopula: 0,
    korelacijaKorekcija: 0,
    edge: 0,
    edgeNaivno: 0,
    kelly: 0,
    kellyPct: 0,
    upozorenja: [],
    konflikt: false,
    isplativo: false,
  };
  const valjane = stavke.filter((s) => s.p > 0 && s.p < 1 && s.kvota > 1);
  if (valjane.length === 0) return prazno;

  const konfliktParovi = pronadjiKonflikte(valjane.map((s) => s.kljuc));
  const konflikt = konfliktParovi.length > 0;
  if (konflikt) {
    return {
      ...prazno,
      n: valjane.length,
      kvota: Math.round(valjane.reduce((a, s) => a * s.kvota, 1) * 100) / 100,
      konflikt: true,
      upozorenja: [
        `Konfliktna tržišta u istom listiću (${konfliktParovi.map(([a, b]) => `${a} + ${b}`).join(", ")}) — ta se opcije međusobno isključuju, SGP je nemoguć.`,
      ],
    };
  }

  const kvota = valjane.reduce((a, s) => a * s.kvota, 1);
  const pNaivno = valjane.reduce((a, s) => a * clamp01(s.p), 1);
  const pCopula = zajednickaVjerojatnost(valjane);
  const edge = kvota * pCopula - 1;
  const edgeNaivno = kvota * pNaivno - 1;

  const b = kvota - 1;
  const q = 1 - pCopula;
  const kelly = b > 0 ? Math.max(0, (b * pCopula - q) / b) : 0;
  // korelirani SGP = veći rizik → još stroži frakcijski Kelly (¼, cap 2%)
  const kellyPct = Math.min(2, kelly * 0.25 * 100);

  const upozorenja: string[] = [];
  if (valjane.length > 3)
    upozorenja.push(
      "Više od 3 noge: varijanca naglo raste — dugačka serija ovakvih listića gotovo sigurno gubi novac.",
    );
  const kor = (pCopula - pNaivno) * 100;
  if (Math.abs(kor) >= 3) {
    upozorenja.push(
      kor > 0
        ? `Pozitivna korelacija: prava vjerojatnost je ${kor.toFixed(1)}pp VIŠA od naivne — tržište množenjem podcjenjuje ovaj par.`
        : `Negativna korelacija: prava vjerojatnost je ${Math.abs(kor).toFixed(1)}pp NIŽA od naivne — naivni množitelj bi te prevario.`,
    );
  }
  if (edge <= 0) upozorenja.push("Nema pozitivnog edgea na ovom SGP-u — bez uloga.");

  return {
    n: valjane.length,
    kvota: Math.round(kvota * 100) / 100,
    pNaivno: Math.round(pNaivno * 1000) / 1000,
    pCopula: Math.round(pCopula * 1000) / 1000,
    korelacijaKorekcija: Math.round(kor * 10) / 10,
    edge: Math.round(edge * 1000) / 1000,
    edgeNaivno: Math.round(edgeNaivno * 1000) / 1000,
    kelly: Math.round(kelly * 1000) / 1000,
    kellyPct: Math.round(kellyPct * 100) / 100,
    upozorenja,
    konflikt: false,
    isplativo: edge > 0 && pCopula > 0,
  };
}
