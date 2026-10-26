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
import { broj as safeBroj, type UniversalMatchContext } from "./safe-math";

export interface BasketballMatchStats {
  /** posjedi po utakmici (pace) */
  homePace?: number;
  awayPace?: number;
  leagueAvgPace?: number;
  /** Dean Oliver ratingi (poena na 100 posjeda) */
  homeORtg?: number;
  awayORtg?: number;
  homeDRtg?: number;
  awayDRtg?: number;
  leagueAvgORtg?: number;
  /** Four Factors (udio 0..1) */
  efgHome?: number;
  efgAway?: number;
  tovHome?: number;
  tovAway?: number;
  orbHome?: number;
  orbAway?: number;
  ftrHome?: number;
  ftrAway?: number;
  /** Umor: back-to-back i 3 utakmice u 4 noći */
  homeB2B?: boolean;
  awayB2B?: boolean;
  home3in4?: boolean;
  away3in4?: boolean;
}

export type SarpKandidat = {
  trziste: string;
  tip: string;
  label: string;
  p: number;
  kvota: number | null;
  fer: number;
  edge: number | null;
  kellyPct: number;
  isplativo: boolean;
};

export interface BasketballSARPPrediction {
  fixtureId: number;
  pace: {
    expPossessions: number | null;
    tempoOznaka: "High Pace" | "Moderate" | "Defensive Grind";
    normLige: number;
  };
  expHome: number;
  expAway: number;
  expTotal: number;
  expSpread: number;
  sigma: number;
  sigmaTotal: number;
  expTotal1H: number;
  sigmaTotal1H: number;
  p1HOver: number;
  linija1H: number;
  expTotal1Q: number;
  sigmaTotal1Q: number;
  p1QOver: number;
  linija1Q: number;
  pML1: number;
  pML2: number;
  pDraw: number;
  spread: { linija: number | null; pCover1: number; izvor: "market" | "model" };
  pOver: number;
  pUnder: number;
  linijaTotala: number;
  umor: {
    homeB2B: boolean;
    awayB2B: boolean;
    home3in4: boolean;
    away3in4: boolean;
    indeks: number;
  };
  fourFactors: { primijenjeno: boolean; tezine: string; pomakMu: number; clutch: boolean };
  /** OT MODEL: vjerojatnost produžetka + uvjetni pomak totala (+5.2) */
  ot: { p: number; primijenjeno: boolean; pomakBodovi: number };
  /** BLOWOUT/GARBAGE TIME (v6): korekcija totala kod velikih margina */
  blowout: { primijenjeno: boolean; margina: number; pomakBodovi: number };
  mc: { n: number; pML1: number; pSpread1: number; pOver: number; pDraw: number };
  trziste: { pML1: number | null; pOver: number | null; devigIzvor: string | null };
  provjera: { maxDiscrepancy: number | null; volatility: boolean };
  /** GLOBALNA KALIBRACIJA: log-pool ML i O/U s de-margined tržištem (dijagnostika) */
  kalibracija: { primijenjena: boolean; tezina: number; prosjecniPomak: number };
  /** STVARNA TOČNOST: temperiranje prema vlastitom rekordu (Dnevnik) */
  empTocnost: { primijenjena: boolean; temp: Record<string, number> };
  povjerenje: number;
  razina: "A" | "B" | "C";
  core: SarpKandidat | null;
  alt: SarpKandidat | null;
  izvori: string[];
  upozorenja: string[];
}

const clamp = (x: number, a: number, b: number) =>
  Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
const erf = (x: number) => {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
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
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-9, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const B2B_PENAL = 3.0; // Bayesian B2B korekcija (−2.5..−3.5 → srednja vrijednost)
const IN4_PENAL = 2.0; // dodatno 3 utakmice u 4 noći
const HCA = 2.8; // prednost domaćeg terena (poena)

/** Four Factors indeks (Dean Oliver). U Q4 CLUTCH modu (bliska
 *  završnica) FTR ima veću težinu — failovi produžavaju utakmicu i
 *  dodaju poene iz crte, pa je slobodno bacanje kvalitetniji faktor. */
function fourFactorIndex(s: BasketballMatchStats, tim: "h" | "a", clutch: boolean): number | null {
  const efg = tim === "h" ? s.efgHome : s.efgAway;
  const tov = tim === "h" ? s.tovHome : s.tovAway;
  const orb = tim === "h" ? s.orbHome : s.orbAway;
  const ftr = tim === "h" ? s.ftrHome : s.ftrAway;
  if (efg == null || tov == null || orb == null || ftr == null) return null;
  return clutch
    ? 0.35 * efg - 0.22 * tov + 0.18 * orb + 0.25 * ftr // Q4 clutch
    : 0.4 * efg - 0.25 * tov + 0.2 * orb + 0.15 * ftr; // baza
}

export function sarpKosarka(args: {
  an: KosAnalysis;
  mk: KosMarkets | null;
  home: string;
  away: string;
  league: string;
  fixtureId: number;
  stats?: BasketballMatchStats;
  /** broj kladionica s kvotama — jača kalibraciju (opcionalno; default 3 kad kvote postoje) */
  brojKladionica?: number;
  /** STVARNA TOČNOST: ručno ubrizgano empirijsko stanje (Samotest); bez toga čita Dnevnik */
  empirijske?: EmpStanje;
  /** UNIVERSAL MATCH CONTEXT (v7): normalizirani kontekst utakmice — pace/
   *  ORtg/DRtg indexi i B2B umor dopunjuju podatke koji fale (identitet kad
   *  su svi podaci već prisutni). */
  kontekst?: UniversalMatchContext | null;
}): BasketballSARPPrediction | null {
  const { mk, fixtureId } = args;
  let an = args.an;
  const sRaw = args.stats ?? {};
  // SAFE-MATH štit: svaki numerički podatak o statistici prolazi kroz
  // koerciju — string, null ili NaN postaje undefined (motor koristi
  // svoje sigurne prosjeke lige umjesto da zarazi projekciju).
  const c = (v: unknown): number | undefined => {
    const n = typeof v === "number" ? v : safeBroj(v as unknown, NaN, -1e6, 1e6);
    return Number.isFinite(n) ? n : undefined;
  };
  const s = {
    homePace: c(sRaw.homePace),
    awayPace: c(sRaw.awayPace),
    leagueAvgPace: c(sRaw.leagueAvgPace),
    homeORtg: c(sRaw.homeORtg),
    awayORtg: c(sRaw.awayORtg),
    homeDRtg: c(sRaw.homeDRtg),
    awayDRtg: c(sRaw.awayDRtg),
    leagueAvgORtg: c(sRaw.leagueAvgORtg),
    efgHome: c(sRaw.efgHome),
    efgAway: c(sRaw.efgAway),
    tovHome: c(sRaw.tovHome),
    tovAway: c(sRaw.tovAway),
    orbHome: c(sRaw.orbHome),
    orbAway: c(sRaw.orbAway),
    ftrHome: c(sRaw.ftrHome),
    ftrAway: c(sRaw.ftrAway),
    homeB2B: sRaw.homeB2B === true,
    awayB2B: sRaw.awayB2B === true,
    home3in4: sRaw.home3in4 === true,
    away3in4: sRaw.away3in4 === true,
  } as typeof sRaw;
  // SAFE-MATH štit za tržišno-motorsku analizu (KosAnalysis): NaN ukupno
  // ili marža pada na sigurne vrijednosti lige (2 × prosječni poeni).
  // vjerojatnosti iz analize: ne-konačne → neutralna trojka (1/3)
  const pOk = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  an = {
    ...an,
    total: Number.isFinite(an.total) && an.total > 40 ? an.total : 160, // ligaški default (NBA usklađeno kasnije)
    mu: Number.isFinite(an.mu) ? an.mu : 0,
    pHomeOT: pOk(an.pHomeOT) ? an.pHomeOT : 1 / 3,
    pAwayOT: pOk(an.pAwayOT) ? an.pAwayOT : 1 / 3,
    pDraw: pOk(an.pDraw) ? an.pDraw : 1 / 3,
  } as typeof an;
  const upozorenja: string[] = [];
  const izvori: string[] = ["Tržišne kvote (de-vig)", "Monte Carlo 5.000", "Profil lige"];

  // — 1) PACE / POSJEDI —
  const nba = an.nba;
  const normLige = nba ? 225 : 160;
  const paceModel =
    s.homePace != null && s.awayPace != null && s.leagueAvgPace != null && s.leagueAvgPace > 0;
  const expPossessions = paceModel
    ? clamp((s.homePace! * s.awayPace!) / s.leagueAvgPace!, 80, 300)
    : null;
  if (paceModel) izvori.push("Pace/posjedi (korisnička statistika)");
  const tempoOznaka: BasketballSARPPrediction["pace"]["tempoOznaka"] =
    an.total > normLige + 7
      ? "High Pace"
      : an.total < normLige - 7
        ? "Defensive Grind"
        : "Moderate";

  // — 2) UMOR —
  const umorH = (s.homeB2B ? B2B_PENAL : 0) + (s.home3in4 ? IN4_PENAL : 0);
  const umorA = (s.awayB2B ? B2B_PENAL : 0) + (s.away3in4 ? IN4_PENAL : 0);
  if (umorH > 0)
    upozorenja.push(
      `Domaćin igra umorno (B2B${s.home3in4 ? " + 3u4" : ""}) — oduzeto ~${(umorH * 0.5).toFixed(1)} poena modelu.`,
    );
  if (umorA > 0)
    upozorenja.push(
      `Gost igra umorno (B2B${s.away3in4 ? " + 3u4" : ""}) — oduzeto ~${(umorA * 0.5).toFixed(1)} poena modelu.`,
    );

  // — 3) EFIKASNOST (Pace*ORtg*DRtg model + fuzija s tržištem) —
  const ortgModel =
    paceModel &&
    s.homeORtg != null &&
    s.awayORtg != null &&
    s.homeDRtg != null &&
    s.awayDRtg != null &&
    s.leagueAvgORtg != null;
  let expHome: number;
  let expAway: number;
  let expTotal: number;
  let expSpread: number;
  if (ortgModel) {
    izvori.push("ORtg/DRtg efikasnost (Oliverov model)");
    let eh = (expPossessions! * s.homeORtg! * s.awayDRtg!) / s.leagueAvgORtg! + HCA;
    let ea = (expPossessions! * s.awayORtg! * s.homeDRtg!) / s.leagueAvgORtg!;
    eh -= umorH;
    ea -= umorA;
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

  // — 3b) UNIVERSAL MATCH CONTEXT (v7): dopuna podataka koji fale —
  // pace index i B2B umor ulaze samo kad kartica nema bolje podatke.
  const cx = args.kontekst;
  if (cx && cx.sport === "kosarka") {
    if (!paceModel && (Math.abs(cx.homePace - 1) > 1e-9 || Math.abs(cx.awayPace - 1) > 1e-9)) {
      const avg = clamp((cx.homePace + cx.awayPace) / 2, 0.8, 1.25);
      expTotal = clamp(expTotal * avg, 100, 320);
      expSpread = clamp(expSpread, -45, 45);
      expHome = (expTotal + expSpread) / 2;
      expAway = (expTotal - expSpread) / 2;
      izvori.push("Pace index (universal kontekst)");
    }
    if (cx.b2bFatigue > 0 && !s.homeB2B && !s.awayB2B) {
      const pen = 2.5 * clamp(cx.b2bFatigue, 0, 1);
      expHome = Math.max(60, expHome - pen);
      expTotal = Math.max(100, expTotal - pen);
      upozorenja.push(`Kontekst: back-to-back umor domaćina — oduzeto ~${pen.toFixed(1)} poena.`);
    }
  }

  // — 4) FOUR FACTORS (Dean Oliver) s Q4 CLUTCH modom —
  // Clutch mod: projicirana marża ≤ 6 poena → bliska završnica →
  // FTR dobiva težinu 0.25 (failovi produžavaju utakmicu).
  const spreadPreFf = expSpread;
  const clutch = Math.abs(spreadPreFf) <= 6;
  const ffH = fourFactorIndex(s, "h", clutch);
  const ffA = fourFactorIndex(s, "a", clutch);
  let ffPomak = 0;
  if (ffH != null && ffA != null) {
    ffPomak = clamp((ffH - ffA) * 12, -3, 3);
    expSpread += ffPomak * 0.5;
    expHome += ffPomak * 0.25;
    expAway -= ffPomak * 0.25;
    izvori.push(
      clutch
        ? "Four Factors Q4 clutch (eFG 35% · TOV 22% · ORB 18% · FTR 25%)"
        : "Four Factors (eFG 40% · TOV 25% · ORB 20% · FTR 15%)",
    );
  }

  // — 5) DINAMIČKE SIGME (tempo ovisne; σ razlike ≈ 9.5–12.5) —
  const sigma = clamp(expTotal * 0.052, 9.5, 12.5);
  let sigmaTotal = clamp(expTotal * 0.075, 14, 18);

  // — 5b) OT MODEL: produžetak i njegov utjecaj na total (v5) —
  // Zaostala varijanca marže u zadnjih 6 min ≈ σ·√(6/48). P(OT) =
  // P(|kraj marže| ≤ 0.5). SPEC: ako je |spread| ≤ 3.0, total blizu
  // linije i P(OT) > 8.5% → total dobiva +5.2 očekivana poena (OT
  // period donosi dodatne posjede i failove). Inače je model identitet.
  const sigmaFin = sigma * Math.sqrt(6 / 48);
  const pOT = clamp(
    Phi((0.5 - expSpread) / sigmaFin) - Phi((-0.5 - expSpread) / sigmaFin),
    0.0005,
    0.999,
  );
  const linijaTrzPre = an.totals.length
    ? Number(an.totals[0]!.market.replace(/[^\d.]/g, "")) || null
    : null;
  const totalBlizuLinije = linijaTrzPre != null ? Math.abs(expTotal - linijaTrzPre) <= 2.0 : true;
  const otTrigger = Math.abs(expSpread) <= 3.0 && totalBlizuLinije && pOT > 0.085;
  const otPomak = otTrigger ? 5.2 : 0;
  if (otTrigger) {
    expTotal += otPomak;
    expHome += otPomak / 2;
    expAway += otPomak / 2;
    sigmaTotal = clamp(expTotal * 0.075, 14, 18);
    izvori.push(
      `OT model: P(OT) = ${(pOT * 100).toFixed(1)}% > 8.5% → total +${otPomak.toFixed(1)}`,
    );
    upozorenja.push(
      `Bliska utakmica (P(OT) = ${(pOT * 100).toFixed(1)}%) — produžetak je moguć: Over/Under nosi dodatnu varijancu OT perioda (+5.2 poena u totalu).`,
    );
  }
  const ot = { p: Math.round(pOT * 1000) / 1000, primijenjeno: otTrigger, pomakBodovi: otPomak };

  // — 5c) BLOWOUT / GARBAGE TIME (v6) —
  // Kod velikih margina (|spread| > 16.5) četvrta četvrtina postaje
  // garažna: klupe dobivaju minute, obrana pada (DRtg +6%), failovi
  // i tranzicije daju bodove — "pogrešan Under" je česta pogreška.
  // Korigiramo total prema gore: do +3.0 poena (0.22 × poena margine
  // iznad praga 16.5); σ totala slijedi novi expTotal.
  const marginaPre = Math.abs(expSpread);
  const blowoutTrigger = marginaPre > 16.5;
  const blowoutPomak = blowoutTrigger ? Math.min(3.0, 0.22 * (marginaPre - 16.5)) : 0;
  if (blowoutTrigger) {
    expTotal += blowoutPomak;
    expHome += blowoutPomak / 2;
    expAway += blowoutPomak / 2;
    sigmaTotal = clamp(expTotal * 0.075, 14, 18);
    izvori.push(
      `Blowout/garbage time: margina ${marginaPre.toFixed(1)} > 16.5 → total +${blowoutPomak.toFixed(1)} (DRtg +6% u Q4, klupe u igri)`,
    );
  }
  const blowout = {
    primijenjeno: blowoutTrigger,
    margina: Math.round(marginaPre * 100) / 100,
    pomakBodovi: Math.round(blowoutPomak * 100) / 100,
  };

  // — 6) PODJELE: 1. poluvrijeme ≈ 46.2% poena, 1. četvrtina ≈ 23.5% —
  const expTotal1H = expTotal * 0.462;
  const sigmaTotal1H = sigmaTotal * 0.68;
  const linija1H = Math.round(expTotal1H * 2) / 2;
  const p1HOver = 1 - Phi((linija1H - expTotal1H) / sigmaTotal1H);
  const expTotal1Q = expTotal * 0.235;
  const sigmaTotal1Q = sigmaTotal * 0.48;
  const linija1Q = Math.round(expTotal1Q * 2) / 2;
  const p1QOver = 1 - Phi((linija1Q - expTotal1Q) / sigmaTotal1Q);

  // — 7) SPREAD (handicap iz kvota ako postoji) —
  let spreadLinija: number | null = null;
  let spreadIzvor: "market" | "model" = "model";
  const hcpMk = mk ? Object.entries(mk).find(([k]) => /handicap|spread/i.test(k))?.[1] : undefined;
  if (hcpMk) {
    const hk = Object.keys(hcpMk).find((k) => /home/i.test(k));
    if (hk) {
      const num = hk.match(/(-?\d+\.?\d*)/);
      if (num) {
        spreadLinija = Number(num[1]);
        spreadIzvor = "market";
      }
    }
  }
  const pSpread1 =
    spreadLinija != null
      ? 1 - Phi((-spreadLinija - expSpread) / sigma)
      : 1 - Phi((0.5 - expSpread) / sigma);
  if (spreadLinija == null)
    upozorenja.push("Kladionice nisu objavile handicap — linija razlike je procjena modela.");

  // — 8) TROSTRUKA VERIFIKACIJA: model vs Monte Carlo vs de-vig tržište —
  const N = 5000;
  const r = rng(fixtureId);
  let ml1 = 0,
    dr = 0,
    sp1 = 0;
  for (let i = 0; i < N; i++) {
    const m = gauss(r) * sigma + expSpread;
    if (m > 0.5) ml1++;
    else if (m >= -0.5) dr++;
    if (spreadLinija != null ? m + spreadLinija > 0.5 : m > 0.5) sp1++;
  }
  // linija totala iz analize (glavni par)
  const linijaTotala = an.totals.length
    ? Number(an.totals[0]!.market.replace(/[^\d.]/g, "")) || Math.round(expTotal * 2) / 2
    : Math.round(expTotal * 2) / 2;
  const r2 = rng(fixtureId + 7);
  let ov2 = 0;
  for (let i = 0; i < N; i++) {
    const t = gauss(r2) * sigmaTotal + expTotal;
    if (t > linijaTotala) ov2++;
  }
  const pOverModel = 1 - Phi((linijaTotala - expTotal) / sigmaTotal);

  // de-vig tržišta: ML par iz analize, O/U par glavne linije
  const mlHodd = an.ml[0]?.odd ?? null;
  const mlAodd = an.ml[1]?.odd ?? null;
  const overTip = an.totals.find(
    (t) => t.market === `Zbroj ${linijaTotala}` && t.pick.startsWith("Više"),
  );
  const underTip = an.totals.find(
    (t) => t.market === `Zbroj ${linijaTotala}` && t.pick.startsWith("Manje"),
  );
  let pML1Market: number | null = null;
  let pOverMarket: number | null = null;
  let devigIzvor: string | null = null;
  if (mlHodd && mlAodd) {
    pML1Market = devig([mlHodd, mlAodd])[0]!;
    devigIzvor = "Moneyline";
  }
  if (overTip?.odd && underTip?.odd) {
    pOverMarket = devig([overTip.odd, underTip.odd])[0]!;
    devigIzvor = devigIzvor ? `${devigIzvor} + O/U` : "O/U";
  }

  const mc = { n: N, pML1: ml1 / N, pSpread1: sp1 / N, pOver: ov2 / N, pDraw: dr / N };
  // ML trojka mora zbrajati na 1 — kad pozivatelj pošalje malo pomaknut
  // ulaz, normaliziramo (identitet kad je zbroj već 1).
  const zbrojML = an.pHomeOT + an.pAwayOT + an.pDraw;
  const pML1 = zbrojML > 0 && Math.abs(zbrojML - 1) > 1e-12 ? an.pHomeOT / zbrojML : an.pHomeOT;
  const pML2 = zbrojML > 0 && Math.abs(zbrojML - 1) > 1e-12 ? an.pAwayOT / zbrojML : an.pAwayOT;
  const pDraw = zbrojML > 0 && Math.abs(zbrojML - 1) > 1e-12 ? an.pDraw / zbrojML : an.pDraw;

  // — 8b) GLOBALNA KALIBRACIJA — logaritamski pool modela s de-margined
  // tržištem (ista matematika kao u goals-motoru). Težina raste s brojem
  // kladionica i pokrivenošću tržišta (max 0.45); bez kvota je w = 0 →
  // model ostaje nepromijenjen (identitet). Zbroj ML ishoda i O/U para
  // ostaje točno 1 po konstrukciji.
  const books =
    args.brojKladionica ?? ((mlHodd && mlAodd) || (overTip?.odd && underTip?.odd) ? 3 : 0);
  const parovi = (mlHodd && mlAodd ? 1 : 0) + (overTip?.odd && underTip?.odd ? 1 : 0);
  const wKal = tezinaKalibracije(books, parovi);
  const T_ML = tempZa("1x2", args.empirijske);
  const T_OU = tempZa("ou", args.empirijske);
  let pML1Kal = pML1;
  let pML2Kal = pML2;
  let pDrawKal = pDraw;
  let pOverKal = pOverModel;
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
  const kalPomak = listaPomaka.length
    ? listaPomaka.reduce((a, b) => a + b, 0) / listaPomaka.length
    : 0;
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
  const volatility = maxDiscrepancy != null && maxDiscrepancy > 0.1;
  if (volatility)
    upozorenja.push(
      `⚠️ HIGH VOLATILITY / Market Disagreement: model i tržište se razilaze ${(maxDiscrepancy! * 100).toFixed(1)} pp — povjerenje automatski spušteno.`,
    );

  // — 9) POVJERENJE (broj izvora + volatilnost) —
  let povjerenje = 40 + Math.min(45, izvori.length * 9);
  if (volatility) povjerenje -= 20;
  if (!mlHodd && !overTip?.odd) {
    povjerenje -= 10;
    upozorenja.push("Nema kvota kladionica — EV se ne može provjeriti.");
  }
  povjerenje = clamp(Math.round(povjerenje), 10, 95);
  const razina: BasketballSARPPrediction["razina"] =
    povjerenje >= 75 ? "A" : povjerenje >= 55 ? "B" : "C";

  // — 10) KANDIDATI + EDGE GUARD (EV ≥ 4.5%) + KELLY 0.25x cap 3% —
  const kand: SarpKandidat[] = [];
  const push = (trziste: string, tip: string, label: string, p: number, odd: number | null) => {
    const pp = clamp(p, 0.01, 0.99);
    const kv = odd && odd > 1.01 ? odd : null;
    const edge = kv ? pp * kv - 1 : null;
    const b = kv ? kv - 1 : 0;
    const kelly = kv ? (b * pp - (1 - pp)) / b : 0;
    kand.push({
      trziste,
      tip,
      label,
      p: pp,
      kvota: kv,
      fer: 1 / pp,
      edge,
      kellyPct: Math.min(3, Math.max(0, kelly) * 0.25 * 100),
      isplativo: edge != null && edge >= 0.045,
    });
  };
  push("Moneyline", "1", `${args.home} pobjeda (uklj. OT)`, pML1Kal, mlHodd);
  push("Moneyline", "2", `${args.away} pobjeda (uklj. OT)`, pML2Kal, mlAodd);
  if (spreadLinija != null) {
    const hcpOdd = hcpMk
      ? (Object.entries(hcpMk).find(([k]) => /home/i.test(k))?.[1] ?? null)
      : null;
    push(
      "Spread",
      "1",
      `${args.home} pokriva ${spreadLinija > 0 ? "+" : ""}${spreadLinija}`,
      pSpread1,
      hcpOdd,
    );
  }
  push("O/U", "Over", `Više od ${linijaTotala}`, pOverKal, overTip?.odd ?? null);
  push("O/U", "Under", `Manje od ${linijaTotala}`, 1 - pOverKal, underTip?.odd ?? null);

  const valueList = kand
    .filter((k) => k.isplativo && k.p >= 0.45)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  const core =
    valueList[0] ??
    kand.filter((k) => k.kvota && k.p >= 0.5).sort((a, b) => b.p - a.p)[0] ??
    kand.filter((k) => k.p >= 0.5).sort((a, b) => b.p - a.p)[0] ??
    kand.sort((a, b) => b.p - a.p)[0] ??
    null;
  const alt =
    kand
      .filter((k) => k !== core && (k.kvota ? true : k.p >= 0.4))
      .sort((a, b) => (b.kvota ? 1 : 0) - (a.kvota ? 1 : 0) || b.p - a.p)[0] ?? null;
  if (!valueList.length && core)
    upozorenja.push(
      "Edge Guard: nema tipa s EV ≥ 4.5% — prikazan je najsigurniji, ne i isplativi tip.",
    );

  return {
    fixtureId,
    pace: { expPossessions, tempoOznaka, normLige },
    expHome,
    expAway,
    expTotal,
    expSpread,
    sigma,
    sigmaTotal,
    expTotal1H,
    sigmaTotal1H,
    p1HOver,
    linija1H,
    expTotal1Q,
    sigmaTotal1Q,
    p1QOver,
    linija1Q,
    pML1: pML1Kal,
    pML2: pML2Kal,
    pDraw: pDrawKal,
    spread: { linija: spreadLinija, pCover1: pSpread1, izvor: spreadIzvor },
    pOver: pOverKal,
    pUnder: 1 - pOverKal,
    linijaTotala,
    umor: {
      homeB2B: !!s.homeB2B,
      awayB2B: !!s.awayB2B,
      home3in4: !!s.home3in4,
      away3in4: !!s.away3in4,
      indeks: umorH - umorA,
    },
    fourFactors: {
      primijenjeno: ffH != null && ffA != null,
      pomakMu: ffPomak,
      clutch,
      tezine: clutch
        ? "eFG 35% · TOV 22% · ORB 18% · FTR 25% (Q4 clutch)"
        : "eFG 40% · TOV 25% · ORB 20% · FTR 15%",
    },
    ot,
    blowout,
    mc,
    trziste: { pML1: pML1Market, pOver: pOverMarket, devigIzvor },
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
    povjerenje,
    razina,
    core,
    alt,
    izvori,
    upozorenja,
  };
}
