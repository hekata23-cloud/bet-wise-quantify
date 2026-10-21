/* ═══════════════════════════════════════════════════════════════════
   ACCURACY-LEDGER — stvarna točnost iz Dnevnika (v1)
   ═══════════════════════════════════════════════════════════════════
   SVE kartice već upisuju tipove u Dnevnik (dnevnik.ts, ključ
   "pc.dnevnik.v1"). Ovaj modul taj rekord pretvara u JEDNU zajedničku
   korekciju koju primjenjuju svi motori (nogomet, košarka, rukomet):

     • po familiji tržišta (1X2, BTTS, O/U) računa stvarni hit-rate
       protiv prosječno najavljene vjerojatnosti;
     • preoptimističan model (najavljeno > stvarno) → T > 1: vjerojat-
       nosti se "hlade" prema uniformi (logit temperiranje);
     • podzastavljen model (stvarno > najavljeno) → T < 1: oštrije
       vjerojatnosti;
     • T = 1 + (najavljeno − stvarno) · min(1, n/40), ograđeno na
       [0.8, 1.25]; n < 10 settled tipova → T = 1 (identitet).

   Modul je čista logika: samo čita Dnevnik, ništa ne piše, SSR-siguran
   (bez window-a vraća prazno stanje pa motori ostaju deterministični).
   ═══════════════════════════════════════════════════════════════════ */

import { dnevnikUnosi, type DnevnikUnos, type Provjera } from "./dnevnik";

/** Familije tržišta koje se empirijski kalibriraju. */
export type EmpTrziste = "1x2" | "btts" | "ou";

export type EmpStat = {
  n: number;
  pogodeno: number;
  hitRate: number | null;
  najavljeno: number | null;
  brier: number | null;
};

export type EmpStanje = Partial<Record<EmpTrziste, EmpStat>>;

/** Neutralno stanje — motori ostaju identitetni (Samotest, SSR). */
export const PRAZNO_EMP: EmpStanje = {};

/** Ispod ovog uzorka nema korekcije (previše šuma). */
export const EMP_MIN_N = 10;
/** Uzorak pri kojem težina korekcije dostiže 100%. */
export const EMP_PUNA_TEZINA = 40;
/** Ograničenje na (najavljeno − stvarno) prije težine. */
export const EMP_MAX_POMAK = 0.25;
/** Sigurnosni raspon faktora temperature. */
export const TEMP_MIN = 0.8;
export const TEMP_MAX = 1.25;

/** Familija tržišta iz provjere tipa; htft se preskače (previše raznolik). */
export function trzisteOdProvjere(pr: Provjera): EmpTrziste | null {
  switch (pr.vrsta) {
    case "1x2":
    case "1x2reg":
      return "1x2";
    case "btts":
      return "btts";
    case "ou":
    case "tt":
      return "ou";
    default:
      return null;
  }
}

/** Empirijsko stanje iz zadane liste Dnevnik unosa (samo settled tipovi). */
export function izracunajEmp(unosi: DnevnikUnos[]): EmpStanje {
  const sk = new Map<EmpTrziste, { n: number; win: number; sumP: number; brier: number }>();
  for (const u of unosi) {
    if (u.status !== "pogodak" && u.status !== "promasaj") continue;
    if (!(u.p > 0 && u.p < 1)) continue;
    const t = trzisteOdProvjere(u.provjera);
    if (t == null) continue;
    const cilj = u.status === "pogodak" ? 1 : 0;
    const s = sk.get(t) ?? { n: 0, win: 0, sumP: 0, brier: 0 };
    s.n++;
    s.win += cilj;
    s.sumP += u.p;
    s.brier += (u.p - cilj) * (u.p - cilj);
    sk.set(t, s);
  }
  const out: EmpStanje = {};
  for (const [t, s] of sk) {
    out[t] = {
      n: s.n,
      pogodeno: s.win,
      hitRate: s.n > 0 ? s.win / s.n : null,
      najavljeno: s.n > 0 ? s.sumP / s.n : null,
      brier: s.n > 0 ? s.brier / s.n : null,
    };
  }
  return out;
}

/** Empirijsko stanje iz živog Dnevnika (SSR-sigurno: bez window-a prazno). */
export function ucitajEmp(): EmpStanje {
  if (typeof window === "undefined") return PRAZNO_EMP;
  return izracunajEmp(dnevnikUnosi());
}

/** Faktor temperature i veličina uzorka za familiju. T=1 → identitet. */
export function tempIN(t: EmpTrziste, emp?: EmpStanje): { T: number; n: number } {
  const st = (emp ?? ucitajEmp())[t];
  const n = st?.n ?? 0;
  if (!st || n < EMP_MIN_N || st.hitRate == null || st.najavljeno == null) return { T: 1, n };
  const deficit = Math.max(-EMP_MAX_POMAK, Math.min(EMP_MAX_POMAK, st.najavljeno - st.hitRate));
  const T = 1 + deficit * Math.min(1, n / EMP_PUNA_TEZINA);
  return { T: Math.max(TEMP_MIN, Math.min(TEMP_MAX, T)), n };
}

/** Samo faktor temperature (kratica). */
export function tempZa(t: EmpTrziste, emp?: EmpStanje): number {
  return tempIN(t, emp).T;
}

/** Veličina uzorka familije (za dijagnostiku u karticama). */
export function nZa(t: EmpTrziste, emp?: EmpStanje): number {
  return (emp ?? ucitajEmp())[t]?.n ?? 0;
}
