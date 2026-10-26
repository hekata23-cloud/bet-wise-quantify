// ============================================================
// OU-NISKI.TS — Over/Under 0.5 i 1.5 iz Dixon-Coles matrice
// Over 0.5  = 1 − P(0:0)   (g0 direktno iz matrice goals-motora)
// Over 1.5  = iz kalibrirane matrice (final.o15)
// 1H Over 0.5 = 1 − exp(−0.44·λ ukupno)  (44% golova u 1. poluvremenu)
// Edge/Kelly spram kvote kladionice (¼ Kelly, cap 3% banke).
// ============================================================

import type { GoalsIzlaz } from "./goals-motor";

export type Razina = "A+" | "A" | "B" | "C";

export type OuNiskiIzlaz = {
  lambdaUkupno: number;
  o05: number; // P(Over 0.5) cijela utakmica
  o05Fer: number; // fer kvota
  razina05: Razina;
  o05HT: number; // P(Over 0.5) 1. poluvrijeme
  o05HTFer: number;
  razina05HT: Razina;
  o15: number; // P(Over 1.5) cijela utakmica
  o15Fer: number;
  razina15: Razina;
  nulaNula: number; // P(0:0)
};

const HT_DIO = 0.44; // ~44% golova pada u 1. poluvrijeme

function razina(p: number): Razina {
  if (p >= 0.9) return "A+";
  if (p >= 0.8) return "A";
  if (p >= 0.65) return "B";
  return "C";
}

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
}

export function ouNiskiIzAnalize(a: GoalsIzlaz): OuNiskiIzlaz {
  const lam = clamp(a.lambdaUkupno, 0.3, 7);
  // g0 iz matrice (goals-motor ga uvijek stavi u final["g0"]); fallback e^-λ
  const g0 = clamp(a.final["g0"] ?? Math.exp(-lam), 0.005, 0.5);
  const o05 = clamp(1 - g0, 0.5, 0.995);
  const o05HT = clamp(1 - Math.exp(-HT_DIO * lam), 0.3, 0.99);
  const o15 = clamp(a.final["o15"] ?? 1 - g0 - Math.exp(-lam) * lam, 0.2, 0.995);

  return {
    lambdaUkupno: lam,
    o05,
    o05Fer: 1 / o05,
    razina05: razina(o05),
    o05HT,
    o05HTFer: 1 / o05HT,
    razina05HT: razina(o05HT),
    o15,
    o15Fer: 1 / o15,
    razina15: razina(o15),
    nulaNula: g0,
  };
}

export type OuTiket = {
  edge: number; // p·kvota − 1
  kelly: number; // puna Kelly frakcija
  ulogPerc: number; // preporučeni ulog % banke (¼ Kelly, cap 3%)
  isplativo: boolean;
};

export function ouTiket(p: number, kvota: number, kellyFrac = 0.25, capPerc = 3): OuTiket {
  const pp = clamp(p, 0.01, 0.99);
  const kv = clamp(kvota, 1.01, 1000);
  const edge = kv * pp - 1;
  const b = kv - 1;
  const kelly = b > 0 ? (b * pp - (1 - pp)) / b : 0;
  const ulogPerc = Math.min(capPerc, Math.max(0, kelly) * kellyFrac * 100);
  return { edge, kelly, ulogPerc, isplativo: edge > 0 && ulogPerc > 0 };
}

export type PreciznostIzlaz = { score: number; razina: Razina; tocke: string[] };

/** Data Precision Score — koliko provjerenih izvora podataka kartica koristi. */
export function preciznostOcjena(x: {
  knjigaOu: number;
  knjigaBtts: number;
  imaFormuDom: boolean;
  imaFormuGost: boolean;
  brojKvota: number;
}): PreciznostIzlaz {
  let s = 15; // λ model iz matrice uvijek izračunat
  s += Math.min(20, x.knjigaOu * 5);
  s += x.imaFormuDom ? 20 : 0;
  s += x.imaFormuGost ? 20 : 0;
  s += Math.min(25, x.brojKvota * 2.5);
  const score = Math.round(Math.min(100, s));
  const tocke: string[] = [];
  if (x.knjigaOu > 0) tocke.push(`O/U knjige: ${x.knjigaOu}`);
  if (x.knjigaBtts > 0) tocke.push(`BTTS knjige: ${x.knjigaBtts}`);
  if (x.imaFormuDom) tocke.push("Forma domaćina (6)");
  if (x.imaFormuGost) tocke.push("Forma gosta (6)");
  if (x.brojKvota > 0) tocke.push(`Kvote: ${x.brojKvota}`);
  tocke.push("Dixon-Coles ρ");
  return { score, razina: razina(score / 100), tocke };
}
