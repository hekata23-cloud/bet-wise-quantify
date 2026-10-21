// ============================================================
// SARP-KOSARKA.TS — Basketball SARP Engine (SARP/Sharp sloj)
// Trostruka verifikacija: 1) Analitički model (pace/efikasnost),
// 2) Monte Carlo 5.000 iteracija, 3) De-vig tržišni konsenzus.
// Ako se model i tržište razilaze >10 pp → "High Volatility"
// i automatsko spuštanje povjerenja. Edge guard: value edge
// prikazujemo samo ako je EV ≥ 4.5% (zaštita od marže i šuma).
// Kelly: frakcijski 0.25x, cap 3% banke.
// v2 — GLOBALNA KALIBRACIJA: finalne vjerojatnosti (ML i O/U) log-pool-
// ane su s de-margined tržištem (težina max 0.45; bez kvota = identitet).
// ============================================================

import type { KosMarkets } from "./kosarka.functions";
import type { KosAnalysis } from "./kosarka-engine";
import { poolPar, tezinaKalibracije, tempPar } from "./global-calibration";
import { tempZa, type EmpStanje } from "./accuracy-ledger";

export interface BasketballMatchStats {
  /** posjedi po utakmici (pace) */
  homePace?: number; awayPace?: number; leagueAvgPace?: number;
  /** Dean Oliver ratingi (poena na 100 posjeda) */
  homeORtg?: number; awayORtg?: number; homeDRtg?: number; awayDRtg?: number; leagueAvgORtg?: number;
  /** Four Factors (udio 0..1) */
  efgHome?: number; efgAway?: number; tovHome?: number; tovAway?: number;
  orbHome?: number; orbAway?: number; ftrHome?: number; ftrAway?: number;
  /** Umor: back-to-back i 3 utakmice u 4 noći */
  homeB2B?: boolean; awayB2B?: boolean; home3in4?: boolean; away3in4?: boolean;
}

export type SarpKandidat = {
  trziste: string; tip: string; label: string;
  p: number; kvota: number | null; fer: number;
  edge: number | null; kellyPct: number; isplativo: boolean;
};

export interface BasketballSARPPrediction {
  fixtureId: number;
  pace: {
    expPossessions: number | null;
    tempoOznaka: "High Pace" | "Moderate" | "Defensive Grind";
    normLige: number;
  };
  expHome: number; expAway: number; expTotal: number; expSpread: number;
  sigma: number; sigmaTotal: number;
  expTotal1H: number; sigmaTotal1H: number; p1HOver: number; linija1H: number;
  expTotal1Q: number; sigmaTotal1Q: number; p1QOver: number; linija1Q: number;
  pML1: number; pML2: number; pDraw: number;
  spread: { linija: number | null; pCover1: number; izvor: "market" | "model" };
  pOver: number; pUnder: number; linijaTotala: number;
  umor: { homeB2B: boolean; awayB2B: boolean; home3in4: boolean; away3in4: boolean; indeks: number };
  fourFactors: { primijenjeno: boolean; tezine: string; pomakMu: number };
  mc: { n: number; pML1: number; pSpread1: number; pOver: number; pDraw: number };
  trziste: { pML1: number | null; pOver: number | null; devigIzvor: string | null };
  provjera: { maxDiscrepancy: number | null; volatility: boolean };
  /** GLOBALNA KALIBRACIJA: log-pool ML i O/U s de-margined tržištem (dijagnostika) */
  kalibracija: { primijenjena: boolean; tezina: number; prosjecniPomak: number };
  /** STVARNA TOČNOST: temperiranje prema vlastitom rekordu (Dnevnik) */
  empTocnost: { primijenjena: boolean; temp: Record<string, number> };
  povjerenje: number; razina: "A" | "B" | "C";
  core: SarpKandidat | null; alt: SarpKandidat | null;
  izvori: string[];
  upozorenja: string[];
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
const erf = (x: number) => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
export const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

function devig(odds: number[]): number[] {
  const inv = odds.map((o) => (o > 1 ? 1 / o : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map((x) => x / s) : odds.map(() => 1 / odds.length);
}

/** Deterministički RNG (mulberry32) — ista utakmica = iste simulacije. */
function rng(seed: number) {
  let a = (seed || 1) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const B2B_PENAL = 3.0;   // Bayesian B2B korekcija (−2.5..−3.5 → srednja vrijednost)
const IN4_PENAL = 2.0;   // dodatno 3 utakmice u 4 noći
const HCA = 2.8;         // prednost domaćeg terena (poena)

function fourFactorIndex(s: BasketballMatchStats, tim: "h" | "a"): number | null {
  const efg = tim === "h" ? s.efgHome : s.efgAway;
  const tov = tim === "h" ? s.tovHome : s.tovAway;
  const orb = tim === "h" ? s.orbHome : s.orbAway;
  const ftr = tim === "h" ? s.ftrHome : s.ftrAway;
  if (efg == null || tov == null || orb == null || ftr == null) return null;
  return 0.4 * efg - 0.25 * tov + 0.2 * orb + 0.15 * ftr;
}

export function sarpKosarka(args: {
  an: KosAnalysis; mk: KosMarkets | null;
  home: string; away: string; league: string; fixtureId: number;
  stats?: BasketballMatchStats;
  /** broj kladionica s kvotama — jača kalibraciju (opcionalno; default 3 kad kvote postoje) */
  brojKladionica?: number;
  /** STVARNA TOČNOST: ručno ubrizgano empirijsko stanje (Samotest); bez toga čita Dnevnik */
  empirijske?: EmpStanje;
}): BasketballSARPPrediction | null {
  const { an, mk, fixtureId } = args;
  const s = args.stats ?? {};
  const upozorenja: string[] = [];
  const izvori: string[] = ["Tržišne kvote (de-vig)", "Monte Carlo 5.000", "Profil lige"];

  // — 1) PACE / POSJEDI —
  const nba = an.nba;
  const normLige = nba ? 225 : 160;
  const paceModel =
    s.homePace != null && s.awayPace != null && s.leagueAvgPace != null && s.leagueAvgPace > 0;
  const expPossessions = paceModel ? (s.homePace! * s.awayPace!) / s.leagueAvgPace! : null;
  if (paceModel) izvori.push("Pace/posjedi (korisnička statistika)");
  const tempoOznaka: BasketballSARPPrediction["pace"]["tempoOznaka"] =
    an.total > normLige + 7 ? "High Pace" : an.total < normLige - 7 ? "Defensive Grind" : "Moderate";

  // — 2) UMOR —
  const umorH = (s.homeB2B ? B2B_PENAL : 0) + (s.home3in4 ? IN4_PENAL : 0);
  const umorA = (s.awayB2B ? B2B_PENAL : 0) + (s.away3in4 ? IN4_PENAL : 0);
  if (umorH > 0) upozorenja.push(`Domaćin igra umorno (B2B${s.home3in4 ? " + 3u4" : ""}) — oduzeto ~${(umorH * 0.5).toFixed(1)} poena modelu.`);
  if (umorA > 0) upozorenja.push(`Gost igra umorno (B2B${s.away3in4 ? " + 3u4" : ""}) — oduzeto ~${(umorA * 0.5).toFixed(1)} poena modelu.`);

  // — 3) EFIKASNOST (Pace*ORtg*DRtg model + fuzija s tržištem) —
  const ortgModel =
    paceModel && s.homeORtg != null && s.awayORtg != null && s.homeDRtg != null && s.awayDRtg != null && s.leagueAvgORtg != null;
  let expHome: number; let expAway: number; let expTotal: number; let expSpread: number;
  if (ortgModel) {
    izvori.push("ORtg/DRtg efikasnost (Oliverov model)");
    let eh = (expPossessions! * s.homeORtg! * s.awayDRtg!) / s.leagueAvgORtg! + HCA;
    let ea = (expPossessions! * s.awayORtg! * s.homeDRtg!) / s.leagueAvgORtg!;
    eh -= umorH; ea -= umorA;
    // fuzija s tržištem 50/50 (tržište zna informacije koje mi ne znamo)
    expTotal = 0.5 * (eh + ea) + 0.5 * an.total;
    expSpread = 0.5 * (eh - ea) + 0.5 * an.mu;
    expHome = (expTotal + expSpread) / 2;
    expAway = (expTotal - expSpread) / 2;
  } else {
    // tržišno-kalibrirana projekcija + umor (50% težine — tržište često već uključuje umor)
    expTotal = an.total - 0.5 * (umorH + umorA);
    expSpread = an.mu - 0.5 * (umorH - umorA);
    expHome = (expTotal + expSpread) / 2;
    expAway = (expTotal - expSpread) / 2;
  }

  // — 4) FOUR FACTORS (Dean Oliver: eFG 40%, TOV 25%, ORB 20%, FTR 15%) —
  const ffH = fourFactorIndex(s, "h"); const ffA = fourFactorIndex(s, "a");
  let ffPomak = 0;
  if (ffH != null && ffA != null) {
    ffPomak = clamp((ffH - ffA) * 12, -3, 3);
    expSpread += ffPomak * 0.5;
    expHome += ffPomak * 0.25; expAway -= ffPomak * 0.25;
    izvori.push("Four Factors (eFG/TOV/ORB/FTR)");
  }

  // — 5) DINAMIČKE SIGME (tempo ovisne; σ razlike ≈ 9.5–12.5) —
  const sigma = clamp(expTotal * 0.052, 9.5, 12.5);
  const sigmaTotal = clamp(expTotal * 0.075, 14, 18);

  // — 6) PODJELE: 1. poluvrijeme ≈ 46.2% poena, 1. četvrtina ≈ 23.5% —
  const expTotal1H = expTotal * 0.462; const sigmaTotal1H = sigmaTotal * 0.68;
  const linija1H = Math.round(expTotal1H * 2) / 2;
  const p1HOver = 1 - Phi((linija1H - expTotal1H) / sigmaTotal1H);
  const expTotal1Q = expTotal * 0.235; const sigmaTotal1Q = sigmaTotal * 0.48;
  const linija1Q = Math.round(expTotal1Q * 2) / 2;
  const p1QOver = 1 - Phi((linija1Q - expTotal1Q) / sigmaTotal1Q);

  // — 7) SPREAD (handicap iz kvota ako postoji) —
  let spreadLinija: number | null = null; let spreadIzvor: "market" | "model" = "model";
  const hcpMk = mk ? Object.entries(mk).find(([k]) => /handicap|spread/i.test(k))?.[1] : undefined;
  if (hcpMk) {
    const hk = Object.keys(hcpMk).find((k) => /home/i.test(k));
    if (hk) {
      const num = hk.match(/(-?\d+\.?\d*)/);
      if (num) { spreadLinija = Number(num[1]); spreadIzvor = "market"; }
    }
  }
  const pSpread1 = spreadLinija != null
    ? 1 - Phi((-spreadLinija - expSpread) / sigma)
    : 1 - Phi((0.5 - expSpread) / sigma);
  if (spreadLinija == null) upozorenja.push("Kladionice nisu objavile handicap — linija razlike je procjena modela.");

  // — 8) TROSTRUKA VERIFIKACIJA: model vs Monte Carlo vs de-vig tržište —
  const N = 5000;
  const r = rng(fixtureId);
  let ml1 = 0, dr = 0, sp1 = 0;
  for (let i = 0; i < N; i++) {
    const m = gauss(r) * sigma + expSpread;
    if (m > 0.5) ml1++; else if (m >= -0.5) dr++;
    if (spreadLinija != null ? m + spreadLinija > 0.5 : m > 0.5) sp1++;
  }
  // linija totala iz analize (glavni par)
  const linijaTotala = an.totals.length
    ? Number(an.totals[0]!.market.replace(/[^\d.]/g, "")) || Math.round(expTotal * 2) / 2
    : Math.round(expTotal * 2) / 2;
  const r2 = rng(fixtureId + 7);
  let ov2 = 0;
  for (let i = 0; i < N; i++) { const t = gauss(r2) * sigmaTotal + expTotal; if (t > linijaTotala) ov2++; }
  const pOverModel = 1 - Phi((linijaTotala - expTotal) / sigmaTotal);

  // de-vig tržišta: ML par iz analize, O/U par glavne linije
  const mlHodd = an.ml[0]?.odd ?? null; const mlAodd = an.ml[1]?.odd ?? null;
  const overTip = an.totals.find((t) => t.market === `Zbroj ${linijaTotala}` && t.pick.startsWith("Više"));
  const underTip = an.totals.find((t) => t.market === `Zbroj ${linijaTotala}` && t.pick.startsWith("Manje"));
  let pML1Market: number | null = null; let pOverMarket: number | null = null; let devigIzvor: string | null = null;
  if (mlHodd && mlAodd) { pML1Market = devig([mlHodd, mlAodd])[0]!; devigIzvor = "Moneyline"; }
  if (overTip?.odd && underTip?.odd) { pOverMarket = devig([overTip.odd, underTip.odd])[0]!; devigIzvor = devigIzvor ? `${devigIzvor} + O/U` : "O/U"; }

  const mc = { n: N, pML1: ml1 / N, pSpread1: sp1 / N, pOver: ov2 / N, pDraw: dr / N };
  const pML1 = an.pHomeOT;
  const pML2 = an.pAwayOT;
  const pDraw = an.pDraw;

  // — 8b) GLOBALNA KALIBRACIJA — logaritamski pool modela s de-margined
  // tržištem (ista matematika kao u goals-motoru). Težina raste s brojem
  // kladionica i pokrivenošću tržišta (max 0.45); bez kvota je w = 0 →
  // model ostaje nepromijenjen (identitet). Zbroj ML ishoda i O/U para
  // ostaje točno 1 po konstrukciji.
  const books = args.brojKladionica ?? ((mlHodd && mlAodd) || (overTip?.odd && underTip?.odd) ? 3 : 0);
  const parovi = (mlHodd && mlAodd ? 1 : 0) + (overTip?.odd && underTip?.odd ? 1 : 0);
  const wKal = tezinaKalibracije(books, parovi);
  const T_ML = tempZa("1x2", args.empirijske);
  const T_OU = tempZa("ou", args.empirijske);
  let pML1Kal = pML1; let pML2Kal = pML2; let pDrawKal = pDraw; let pOverKal = pOverModel;
  const listaPomaka: number[] = [];
  if (pML1Market != null && wKal > 0) {
    const m = poolPar(pML1, pML1Market, wKal, T_ML);
    listaPomaka.push(Math.abs(m - pML1));
    // komplement (2 + neriješeno) zadržava modelni omjer — zbroj ostaje 1
    const komp = Math.max(1e-9, pML2 + pDraw);
    pML2Kal = (1 - m) * (pML2 / komp);
    pDrawKal = (1 - m) * (pDraw / komp);
    pML1Kal = m;
  } else if (T_ML !== 1) {
    // bez tržišta: čisto temperiranje prema stvarnoj točnosti
    const m = tempPar(pML1, T_ML);
    listaPomaka.push(Math.abs(m - pML1));
    const komp = Math.max(1e-9, pML2 + pDraw);
    pML2Kal = (1 - m) * (pML2 / komp);
    pDrawKal = (1 - m) * (pDraw / komp);
    pML1Kal = m;
  }
  if (pOverMarket != null && wKal > 0) {
    const o = poolPar(pOverModel, pOverMarket, wKal, T_OU);
    listaPomaka.push(Math.abs(o - pOverModel));
    pOverKal = o;
  } else if (T_OU !== 1) {
    pOverKal = tempPar(pOverModel, T_OU);
    listaPomaka.push(Math.abs(pOverKal - pOverModel));
  }
  const kalPomak = listaPomaka.length ? listaPomaka.reduce((a, b) => a + b, 0) / listaPomaka.length : 0;
  const empAktivno = T_ML !== 1 || T_OU !== 1;
  const kalPrimijenjena = listaPomaka.length > 0 && (wKal > 0 || empAktivno);
  if (kalPrimijenjena) {
    if (wKal > 0) {
      izvori.push(`Globalna kalibracija (log-pool, težina ${(wKal * 100).toFixed(0)}%)`);
      if (kalPomak > 0.06)
        upozorenja.push(
          `Kalibracija je znatno povukla model prema tržištu (${(kalPomak * 100).toFixed(1)} pp) — forma i tržište se razilazu (infu, povrede ili iskočila kvota); tretirajte tipove oprezno.`,
        );
    }
    if (empAktivno) {
      izvori.push("Stvarna točnost (Dnevnik): temperiranje prema vlastitom rekordu");
      if (Math.abs(T_ML - 1) >= 0.12 || Math.abs(T_OU - 1) >= 0.12)
        upozorenja.push(
          "Stvarna točnost se znatno razlikuje od najavljenih vjerojatnosti — tretirajte samopouzdanje s rezervom.",
        );
    }
  }

  const discrep: number[] = [];
  if (pML1Market != null) discrep.push(Math.abs(pML1 - pML1Market));
  if (pOverMarket != null) discrep.push(Math.abs(pOverModel - pOverMarket));
  const maxDiscrepancy = discrep.length ? Math.max(...discrep) : null;
  const volatility = maxDiscrepancy != null && maxDiscrepancy > 0.10;
  if (volatility) upozorenja.push(`⚠️ HIGH VOLATILITY / Market Disagreement: model i tržište se razilaze ${(maxDiscrepancy! * 100).toFixed(1)} pp — povjerenje automatski spušteno.`);

  // — 9) POVJERENJE (broj izvora + volatilnost) —
  let povjerenje = 40 + Math.min(45, izvori.length * 9);
  if (volatility) povjerenje -= 20;
  if (!mlHodd && !overTip?.odd) { povjerenje -= 10; upozorenja.push("Nema kvota kladionica — EV se ne može provjeriti."); }
  povjerenje = clamp(Math.round(povjerenje), 10, 95);
  const razina: BasketballSARPPrediction["razina"] = povjerenje >= 75 ? "A" : povjerenje >= 55 ? "B" : "C";

  // — 10) KANDIDATI + EDGE GUARD (EV ≥ 4.5%) + KELLY 0.25x cap 3% —
  const kand: SarpKandidat[] = [];
  const push = (trziste: string, tip: string, label: string, p: number, odd: number | null) => {
    const pp = clamp(p, 0.01, 0.99);
    const kv = odd && odd > 1.01 ? odd : null;
    const edge = kv ? pp * kv - 1 : null;
    const b = kv ? kv - 1 : 0;
    const kelly = kv ? (b * pp - (1 - pp)) / b : 0;
    kand.push({ trziste, tip, label, p: pp, kvota: kv, fer: 1 / pp, edge, kellyPct: Math.min(3, Math.max(0, kelly) * 0.25 * 100), isplativo: edge != null && edge >= 0.045 });
  };
  push("Moneyline", "1", `${args.home} pobjeda (uklj. OT)`, pML1Kal, mlHodd);
  push("Moneyline", "2", `${args.away} pobjeda (uklj. OT)`, pML2Kal, mlAodd);
  if (spreadLinija != null) {
    const hcpOdd = hcpMk ? Object.entries(hcpMk).find(([k]) => /home/i.test(k))?.[1] ?? null : null;
    push("Spread", "1", `${args.home} pokriva ${spreadLinija > 0 ? "+" : ""}${spreadLinija}`, pSpread1, hcpOdd);
  }
  push("O/U", "Over", `Više od ${linijaTotala}`, pOverKal, overTip?.odd ?? null);
  push("O/U", "Under", `Manje od ${linijaTotala}`, 1 - pOverKal, underTip?.odd ?? null);

  const valueList = kand.filter((k) => k.isplativo && k.p >= 0.45).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  const core = valueList[0]
    ?? kand.filter((k) => k.kvota && k.p >= 0.5).sort((a, b) => b.p - a.p)[0]
    ?? null;
  const alt = kand.filter((k) => k !== core && k.kvota).sort((a, b) => b.p - a.p)[0] ?? null;
  if (!valueList.length && core) upozorenja.push("Edge Guard: nema tipa s EV ≥ 4.5% — prikazan je najsigurniji, ne i isplativi tip.");

  return {
    fixtureId,
    pace: { expPossessions, tempoOznaka, normLige },
    expHome, expAway, expTotal, expSpread, sigma, sigmaTotal,
    expTotal1H, sigmaTotal1H, p1HOver, linija1H,
    expTotal1Q, sigmaTotal1Q, p1QOver, linija1Q,
    pML1: pML1Kal, pML2: pML2Kal, pDraw: pDrawKal,
    spread: { linija: spreadLinija, pCover1: pSpread1, izvor: spreadIzvor },
    pOver: pOverKal, pUnder: 1 - pOverKal, linijaTotala,
    umor: { homeB2B: !!s.homeB2B, awayB2B: !!s.awayB2B, home3in4: !!s.home3in4, away3in4: !!s.away3in4, indeks: umorH - umorA },
    fourFactors: { primijenjeno: ffH != null && ffA != null, tezine: "eFG 40% · TOV 25% · ORB 20% · FTR 15%", pomakMu: ffPomak },
    mc, trziste: { pML1: pML1Market, pOver: pOverMarket, devigIzvor },
    provjera: { maxDiscrepancy, volatility },
    kalibracija: {
      primijenjena: kalPrimijenjena,
      tezina: Math.round(wKal * 1000) / 1000,
      prosjecniPomak: Math.round(kalPomak * 1000) / 1000,
    },
    empTocnost: {
      primijenjena: empAktivno,
      temp: { "1x2": T_ML, ou: T_OU },
    },
    povjerenje, razina, core, alt, izvori, upozorenja,
  };
}
