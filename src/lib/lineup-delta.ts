// ============================================================
// LINEUP-DELTA — T-45 min rekalibracija nakon službenih postava
// Uspoređuje startnih XI s "jezgrom" tima (najčešći starteri iz
// zapamćenih postava). Pravila:
//   • nema prvog golmana ili ključnog stopera → BTTS +6.8 pp, Over 2.5 +7.4 pp
//     + oznaka "LINEUP ALERT: DEFENSIVE ROTATION DETECTED"
//   • prvi napadač na klupi → λ_attack tog tima −0.18
// ============================================================

import type { IgracLin } from "./lineup-engine";

export const BTTS_BOOST = 0.068;
export const OVER25_BOOST = 0.074;
export const NAPAD_PAD = 0.18;
export const PROZOR_MIN = 45;

export interface JezgraTima {
  golman?: number;
  stoperi: number[];
  napadac?: number;
}

export interface LineupDeltaUlaz {
  startDom: IgracLin[];
  startGost: IgracLin[];
  jezgraDom: JezgraTima;
  jezgraGost: JezgraTima;
  pBtts: number;
  pOver25: number;
  lambdaDom: number;
  lambdaGost: number;
}

export interface LineupDeltaIzlaz {
  alert: boolean;
  oznaka: string | null;
  pBtts: number;
  pOver25: number;
  lambdaDom: number;
  lambdaGost: number;
  razlozi: string[];
}

const clamp = (x: number) => Math.max(0.01, Math.min(0.99, x));

/** Je li utakmica u prozoru od 45 min prije početka (kad se objavljuju postave)? */
export function uLineupProzoru(kickoff: string | number | Date, sad = Date.now()): boolean {
  const t = new Date(kickoff).getTime() - sad;
  return t >= 0 && t <= PROZOR_MIN * 60_000;
}

export function lineupDelta(u: LineupDeltaUlaz): LineupDeltaIzlaz {
  const ids = (xi: IgracLin[]) =>
    new Set(xi.map((p) => p.id).filter((x): x is number => x != null));
  const dom = ids(u.startDom),
    gost = ids(u.startGost);
  const razlozi: string[] = [];
  let obrana = false;
  let lambdaDom = u.lambdaDom,
    lambdaGost = u.lambdaGost;

  const provjeri = (set: Set<number>, j: JezgraTima, ime: string) => {
    if (j.golman != null && !set.has(j.golman)) {
      obrana = true;
      razlozi.push(`${ime}: prvi golman nije u postavi`);
    }
    if (j.stoperi.some((s) => !set.has(s))) {
      obrana = true;
      razlozi.push(`${ime}: ključni stoper nije u postavi`);
    }
  };
  if (dom.size) provjeri(dom, u.jezgraDom, "Domaćin");
  if (gost.size) provjeri(gost, u.jezgraGost, "Gost");

  if (dom.size && u.jezgraDom.napadac != null && !dom.has(u.jezgraDom.napadac)) {
    lambdaDom = Math.max(0.05, lambdaDom - NAPAD_PAD);
    razlozi.push("Domaćin: prvi napadač na klupi (λ −0.18)");
  }
  if (gost.size && u.jezgraGost.napadac != null && !gost.has(u.jezgraGost.napadac)) {
    lambdaGost = Math.max(0.05, lambdaGost - NAPAD_PAD);
    razlozi.push("Gost: prvi napadač na klupi (λ −0.18)");
  }

  return {
    alert: obrana,
    oznaka: obrana ? "LINEUP ALERT: DEFENSIVE ROTATION DETECTED" : null,
    pBtts: obrana ? clamp(u.pBtts + BTTS_BOOST) : u.pBtts,
    pOver25: obrana ? clamp(u.pOver25 + OVER25_BOOST) : u.pOver25,
    lambdaDom,
    lambdaGost,
    razlozi,
  };
}

/* ── Jezgra tima: najčešći starteri iz zapamćenih postava (localStorage) ── */
const K = (teamId: number) => `pc.jezgra.v1.${teamId}`;

export function zapamtiPostavu(teamId: number, xi: IgracLin[]) {
  try {
    const arr: IgracLin[][] = JSON.parse(localStorage.getItem(K(teamId)) ?? "[]");
    arr.push(xi.map(({ id, ime, poz }) => ({ id, ime, poz })));
    localStorage.setItem(K(teamId), JSON.stringify(arr.slice(-8)));
  } catch {
    /* */
  }
}

export function jezgraIz(postave: IgracLin[][]): JezgraTima {
  const cnt = (poz: string) => {
    const m = new Map<number, number>();
    for (const xi of postave)
      for (const p of xi) if (p.poz === poz && p.id != null) m.set(p.id, (m.get(p.id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };
  return { golman: cnt("G")[0], stoperi: cnt("D").slice(0, 2), napadac: cnt("F")[0] };
}

export function jezgraTima(teamId: number): JezgraTima {
  try {
    return jezgraIz(JSON.parse(localStorage.getItem(K(teamId)) ?? "[]"));
  } catch {
    return { stoperi: [] };
  }
}
