/* ═══════════════════════════════════════════════════════════════════
   GLOBAL-CALIBRATION — jedan sloj kalibracije za sve kartice (v2)
   ═══════════════════════════════════════════════════════════════════
   PROBLEM: goals-motor miješa formu i tržište tek pri izbori λ, ali
   finalne vjerojatnosti (BTTS, O/U, 1X2) ostaju "modelne" — kad je
   uzorak forme mali ili model frustriran infama, kartica prikazuje
   previše samopouzdanja i lažne value tipove.

   RJEŠENJE — logaritamski pool (log-linear pooling) modela s
   de-margined tržištem:

       p_kal ∝ p_model^(1−w) · p_tržište^w ,   w = težina kalibracije

   w raste s brojem kladionica i pokrivenošću tržišta (max 0.45 —
   tržište nikad ne prekucava model u potpunosti). Bez kvota (w = 0)
   modul NE mijenja ništa — analiza je onda čisto modelna, kao i do sad.

   OSIGURANE INVARIJANTE (novo stanje je uvijek koherentno):
     • Over + Under = 100% (par se pool-a zajedno i normalizira)
     • O1.5 ≥ O2.5 ≥ O3.5 (monotonija nametnuta nakon poola)
     • P(BTTS) ≤ P(Over 1.5) (strop nakon poola)
     • 1X2 zbroj = 100% (trojni pool normaliziran)
     • distribucija g0..g5+ REKONSTRUIRANA iz kalibrirane ljestve —
       kante i linije su uvijek međusobno konzistentne, zbroj = 100%
     • bez kvota → identitet (ništa se ne mijenja)

   Modul je čista matematika: bez API-ja, bez ovisnosti, bez UI-ja.

   v2 — STVARNA TOČNOST (accuracy-ledger): pored log-poola s tržištem
   vjerojatnosti se temperiraju prema vlastitom pogotkovnom rekordu
   iz Dnevnika: preoptimističan model → T > 1 (hlađenje prema
   uniformi), podzastavljen → T < 1 (oštrije). Temperiranje je
   monotono, pa sve invarijante (zbrojevi, monotonija, stropovi)
   ostaju netaknute. Bez dovoljno settled tipova (n < 10) ili bez
   Dnevnika → identitet (ponašanje v1).
   ═══════════════════════════════════════════════════════════════════ */

import { tempIN, type EmpStanje } from "./accuracy-ledger";

/** Temperaturna transformacija para (logit): T=1 → identitet; T>1 hladi. */
export function tempPar(p: number, T: number): number {
  if (!(T > 0) || Math.abs(T - 1) < 1e-9) return p;
  if (!(p > 0 && p < 1)) return p;
  const z = Math.log(p / (1 - p)) / T;
  return 1 / (1 + Math.exp(-z));
}

/** Temperaturna transformacija trojke (1X2) — softmax z/T, zbroj = 1. */
export function tempTrojku(p: number[], T: number): number[] {
  if (!(T > 0) || Math.abs(T - 1) < 1e-9) return p.slice();
  const zs = p.map((pi) => (pi > 0 ? Math.log(pi) / T : Number.NEGATIVE_INFINITY));
  const mx = Math.max(...zs);
  if (!Number.isFinite(mx)) return p.slice();
  const e = zs.map((z) => (Number.isFinite(z) ? Math.exp(z - mx) : 0));
  const zbroj = e.reduce((a, b) => a + b, 0);
  return zbroj > 0 ? e.map((x) => x / zbroj) : p.slice();
}

/** Baza težine tržištu (množi se s pokrivenošću knjiga i parova). */
export const KAL_BAZA = 0.4;
/** Tvrdi strop: tržište nikad ne dobije više od 45% težine. */
export const KAL_MAX = 0.45;

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

/** Težina kalibracije: više kladionica i više dostupnih parova → jači pool. */
export function tezinaKalibracije(brojKladionica: number, brojParova: number): number {
  const knj = clamp((brojKladionica || 0) / 6, 0, 1);
  const par = clamp(brojParova / 4, 0, 1);
  return Math.min(KAL_MAX, KAL_BAZA * knj * par);
}

/** Logaritamski pool PARA s težinom w, normaliziran na par (zbroj = 1).
 *  q == null (nema tržišta) ili w ≤ 0 → vraća model nepromijenjen. */
export function poolPar(p: number, q: number | undefined, w: number, T = 1): number {
  const pT = tempPar(p, T);
  if (q == null || w <= 0) return pT;
  if (!(pT > 0 && pT < 1) || !(q > 0 && q < 1)) return clamp(!(pT > 0 && pT < 1) ? (q != null && w > 0 ? q : p) : pT, 0.01, 0.99);
  const a = (1 - w) * Math.log(pT) + w * Math.log(q);
  const b = (1 - w) * Math.log(1 - pT) + w * Math.log(1 - q);
  const mx = Math.max(a, b);
  const e = Math.exp(a - mx);
  const f = Math.exp(b - mx);
  return e / (e + f);
}

/** Trojni (1X2) logaritamski pool, normaliziran na zbroj 1. */
export function poolTrojku(p: number[], m: Array<number | undefined>, w: number, T = 1): number[] {
  if (w <= 0 || m.some((x) => x == null)) return tempTrojku(p, T);
  if (p.some((x) => !(x > 0))) return p.slice();
  const pi = tempTrojku(p, T);
  const loga = pi.map((v, i) => (1 - w) * Math.log(Math.max(v, 1e-9)) + w * Math.log(Math.max(m[i]!, 1e-9)));
  const mx = Math.max(...loga);
  const e = loga.map((x) => Math.exp(x - mx));
  const z = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / z);
}

export type KalIzlaz = {
  final: Record<string, number>;
  primijenjena: boolean;
  tezina: number;
  /** prosječni |pomak| u postotnim bodovima po kalibriranim tržištima */
  prosjecniPomak: number;
  /** pomak u pp po ključu (pozitivno = vjerojatnost porasla) */
  pomaci: Record<string, number>;
  /** STVARNA TOČNOST: temperiranje prema rekordu iz Dnevnika (dijagnostika) */
  emp?: { primijenjena: boolean; temp: Record<string, number>; uzorak: Record<string, number> };
};

const KAL_KLJUCEVI = ["o15", "o25", "o35", "bttsDa", "1", "X", "2"];

/** Glavni ulaz: kalibrira goals-final prema de-margined tržištu.
 *  Mutira NIŠTA — vraća novi zapis. Bez kvota ili w = 0 → identitet. */
export function kalibrirajGoalsFinal(
  final: Record<string, number>,
  market: Record<string, number>,
  w: number,
  emp?: EmpStanje,
): KalIzlaz {
  const prije = { ...final };
  const pomaci: Record<string, number> = {};
  const empOU = tempIN("ou", emp);
  const empBTTS = tempIN("btts", emp);
  const emp1X2 = tempIN("1x2", emp);
  const empAktivno = empOU.T !== 1 || empBTTS.T !== 1 || emp1X2.T !== 1;
  const empDijag = {
    primijenjena: empAktivno,
    temp: { ou: empOU.T, btts: empBTTS.T, "1x2": emp1X2.T },
    uzorak: { ou: empOU.n, btts: empBTTS.n, "1x2": emp1X2.n },
  };
  if (!(w > 0) && !empAktivno) {
    return { final: { ...final }, primijenjena: false, tezina: 0, prosjecniPomak: 0, pomaci };
  }
  const izl: Record<string, number> = { ...final };

  /* 1) Ljestva O/U — svaka linija pool-ana s de-margined parom */
  const mq = (ok: string, uk: string): number | undefined => {
    if (market[ok] != null) return market[ok];
    if (market[uk] != null) return 1 - market[uk]!;
    return undefined;
  };
  const o15 = poolPar(final.o15 ?? 0.5, mq("o15", "u15"), w, empOU.T);
  const o25 = poolPar(final.o25 ?? 0.5, mq("o25", "u25"), w, empOU.T);
  const o35 = poolPar(final.o35 ?? 0.5, mq("o35", "u35"), w, empOU.T);
  /* monotonija O1.5 ≥ O2.5 ≥ O3.5, nametnuta nakon poola */
  const o15c = clamp(o15, 0.02, 0.98);
  const o25c = clamp(Math.min(o25, o15c), 0.01, o15c);
  const o35c = clamp(Math.min(o35, o25c), 0.01, o25c);
  izl.o15 = o15c;
  izl.o25 = o25c;
  izl.o35 = o35c;
  izl.u15 = 1 - o15c;
  izl.u25 = 1 - o25c;
  izl.u35 = 1 - o35c;

  /* 2) BTTS — pool sa stropom P(BTTS) ≤ P(Over 1.5) */
  const mqBtts = market.bttsDa != null ? market.bttsDa : market.bttsNe != null ? 1 - market.bttsNe : undefined;
  const da = clamp(poolPar(final.bttsDa ?? 0.5, mqBtts, w, empBTTS.T), 0.02, Math.min(0.98, o15c));
  izl.bttsDa = da;
  izl.bttsNe = 1 - da;

  /* 3) 1X2 — trojni pool (samo kad je cijelo tržište dostupno);
        inače čisto temperiranje ako stvarna točnost zahtijeva */
  const p1x2 = [final["1"] ?? 0.33, final["X"] ?? 0.33, final["2"] ?? 0.33];
  if (market["1"] != null && market["X"] != null && market["2"] != null) {
    const t = poolTrojku(p1x2, [market["1"], market["X"], market["2"]], w, emp1X2.T);
    izl["1"] = t[0]!;
    izl["X"] = t[1]!;
    izl["2"] = t[2]!;
  } else if (emp1X2.T !== 1) {
    const t = tempTrojku(p1x2, emp1X2.T);
    izl["1"] = t[0]!;
    izl["X"] = t[1]!;
    izl["2"] = t[2]!;
  }

  /* 4) Kante g0..g5+ rekonstruirane iz kalibrirane ljestve —
     kante i linije su sad po definiciji konzistentne, zbroj = 1 */
  const C1 = 1 - o15c; // P(total ≤ 1)
  const C2 = 1 - o25c; // P(total ≤ 2)
  const C3 = 1 - o35c; // P(total ≤ 3)
  const g0 = clamp(final.g0 ?? 0, 0, Math.max(0, 0.9 * C1));
  const g1 = Math.max(0, C1 - g0);
  const g2 = Math.max(0, C2 - C1);
  const g3 = Math.max(0, C3 - C2);
  const rep = Math.max(0, 1 - C3);
  const mt4 = Math.max(0, final.g4 ?? 0);
  const mt5 = Math.max(0, final["g5+"] ?? 0);
  const mtZ = mt4 + mt5;
  const g4 = mtZ > 0 ? (rep * mt4) / mtZ : rep / 2;
  const g5p = rep - g4;
  izl.g0 = g0;
  izl.g1 = g1;
  izl.g2 = g2;
  izl.g3 = g3;
  izl.g4 = g4;
  izl["g5+"] = g5p;

  /* 5) dijagnostika: pomak u postotnim bodovima */
  let zbroj = 0, n = 0;
  for (const k of KAL_KLJUCEVI) {
    const p0 = prije[k];
    const p1 = izl[k];
    if (p0 != null && p1 != null) {
      const pp = (p1 - p0) * 100;
      if (Math.abs(pp) > 1e-9) pomaci[k] = Math.round(pp * 100) / 100;
      zbroj += Math.abs(pp);
      n++;
    }
  }
  return {
    final: izl,
    primijenjena: w > 0 || empAktivno,
    tezina: Math.round(w * 1000) / 1000,
    prosjecniPomak: n ? Math.round((zbroj / n) * 100) / 100 : 0,
    pomaci,
    emp: empDijag,
  };
}
