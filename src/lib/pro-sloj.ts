// Profesionalni kladioničarski sloj: Pinnacle de-vig, pad kvota (steam),
// xG model jačine i kalibracija vlastitih tipova (Brier + shrink).
// Čiste funkcije — vjerojatnosti 0..1.
import { loadJSON, saveJSON } from "./storage";

/** De-vig "power" metodom (bisekcija): p_i = (1/o_i)^k, Σ = 1. */
export function powerDevig(odds: number[]): number[] {
  const imp = odds.map((o) => 1 / o);
  if (!odds.length || odds.some((o) => !(o > 1))) return [];
  // POPRAVAK: proširi interval do Σpᵏ ≤ 1 kako bi bisekcija dosegla stvarni korijen.
  let lo = 0,
    hi = 3;
  while (imp.reduce((a, p) => a + Math.pow(p, hi), 0) > 1) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const k = (lo + hi) / 2;
    const s = imp.reduce((a, p) => a + Math.pow(p, k), 0);
    if (s > 1) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const powered = imp.map((p) => Math.pow(p, k));
  const total = powered.reduce((a, p) => a + p, 0);
  return total > 0 ? powered.map((p) => p / total) : [];
}

export interface PinnacleRow {
  fairProb: number;
  fairOdds: number;
  softOdds: number;
  edgePct: number;
  value: boolean;
}

/** Usporedba meke kladionice s Pinnacleom (oštra linija = istina). */
export function pinnacleCompare(pinnacle: number[], soft: number[]): PinnacleRow[] {
  const fair = powerDevig(pinnacle);
  if (!fair.length || soft.length !== pinnacle.length) return [];
  return fair.map((p, i) => {
    const edge = (p * soft[i] - 1) * 100;
    return { fairProb: p, fairOdds: 1 / p, softOdds: soft[i], edgePct: edge, value: edge > 2 };
  });
}

export interface MoveRow {
  openProb: number;
  nowProb: number;
  shiftPts: number;
  dropPct: number;
  signal: "steam" | "drift" | "mirno";
}

/** Pad kvota: pomak de-vig vjerojatnosti otvaranje → sada. */
export function oddsMovement(open: number[], now: number[]): MoveRow[] {
  const a = powerDevig(open),
    b = powerDevig(now);
  if (!a.length || a.length !== b.length) return [];
  return a.map((p, i) => {
    const shift = (b[i] - p) * 100;
    const drop = (1 - now[i] / open[i]) * 100;
    return {
      openProb: p,
      nowProb: b[i],
      shiftPts: shift,
      dropPct: drop,
      signal: shift >= 3 ? "steam" : shift <= -3 ? "drift" : "mirno",
    };
  });
}

export interface XgInput {
  homeXgFor: number;
  homeXgAg: number;
  awayXgFor: number;
  awayXgAg: number;
  leagueAvg: number;
  homeAdv?: number;
}

/** xG model jačine (Maher): λ = napad × obrana_protivnika × prosjek lige. */
export function xgLambdas(x: XgInput): { lh: number; la: number } {
  const avg = x.leagueAvg > 0 ? x.leagueAvg : 1.35;
  const adv = x.homeAdv ?? 1.1;
  const lh = (x.homeXgFor / avg) * (x.awayXgAg / avg) * avg * Math.sqrt(adv);
  const la = ((x.awayXgFor / avg) * (x.homeXgAg / avg) * avg) / Math.sqrt(adv);
  return { lh, la };
}

function pois(k: number, l: number) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

/** Tržišta iz λ (neovisni Poisson 0..10). */
export function marketsFromLambdas(lh: number, la: number) {
  let h = 0,
    d = 0,
    a = 0,
    o25 = 0,
    gg = 0,
    total = 0;
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 10; j++) {
      const p = pois(i, lh) * pois(j, la);
      total += p;
      if (i > j) h += p;
      else if (i === j) d += p;
      else a += p;
      if (i + j > 2) o25 += p;
      if (i > 0 && j > 0) gg += p;
    }
  // POPRAVAK: ukloni masu golova izvan matrice 0..10 da bi sve tržišne vjerojatnosti bile konzistentne.
  return total > 0
    ? { home: h / total, draw: d / total, away: a / total, over25: o25 / total, btts: gg / total }
    : { home: 0, draw: 0, away: 0, over25: 0, btts: 0 };
}

// ───── kalibracija ─────
export interface TrackedPick {
  id: string;
  label: string;
  prob: number;
  won: boolean | null;
  ts: number;
}
const KEY = "pro.kalibracija.v1";
export const loadPicks = () => loadJSON<TrackedPick[]>(KEY, []);
export const savePicks = (p: TrackedPick[]) => saveJSON(KEY, p);

/** Brier score i faktor skupljanja prema 50% (1 = savršeno kalibrirano). */
export function calibrationStats(picks: TrackedPick[]) {
  const done = picks.filter((p) => p.won !== null);
  if (done.length < 1)
    return {
      n: 0,
      brier: null as number | null,
      hitRate: null as number | null,
      avgProb: null as number | null,
      shrink: 1,
    };
  const brier = done.reduce((s, p) => s + (p.prob - (p.won ? 1 : 0)) ** 2, 0) / done.length;
  const hitRate = done.filter((p) => p.won).length / done.length;
  const avgProb = done.reduce((s, p) => s + p.prob, 0) / done.length;
  // shrink: koliko stvarni rezultat iznad 50% odgovara predviđenom; uz Bayesov prior od 20 tipova
  const raw = avgProb - 0.5 > 0.01 ? (hitRate - 0.5) / (avgProb - 0.5) : 1;
  const w = done.length / (done.length + 20);
  const shrink = Math.min(1.1, Math.max(0.3, w * raw + (1 - w)));
  return { n: done.length, brier, hitRate, avgProb, shrink };
}

/** Kalibrirana vjerojatnost: povuci prema 50% prema povijesnoj točnosti. */
export function calibrate(p: number, shrink: number): number {
  return Math.min(0.99, Math.max(0.01, 0.5 + (p - 0.5) * shrink));
}

/** Upute za chat: profesionalna metodologija + kalibracija. */
export function proDirectives(): string {
  const s = calibrationStats(loadPicks());
  const cal =
    s.n >= 5
      ? `KALIBRACIJA KORISNIKA: ${s.n} ocijenjenih tipova, pogodak ${(s.hitRate! * 100).toFixed(0)}% uz prosječno predviđenih ${(s.avgProb! * 100).toFixed(0)}%. Svaku svoju sigurnost pomnoži prema 50% faktorom ${s.shrink.toFixed(2)} (p' = 50 + (p−50)×${s.shrink.toFixed(2)}).`
      : "Kalibracija: premalo ocijenjenih tipova — budi konzervativan, sigurnost iznad 80% samo uz vrlo jasne pokazatelje.";
  return `═══ PROFESIONALNA METODOLOGIJA (kako rade trgovci kladionica) ═══
1) JAČINA IZ xG: procijeni xG za i protiv obje momčadi (zadnjih ~10 utakmica, domaće/gostujuće odvojeno), λ_dom = napad_dom × obrana_gost × prosjek lige × ~1.05; λ_gost analogno / ~1.05. Iz λ izvedi SVA tržišta iz iste raspodjele (Poisson + Dixon-Coles korekcija niskih rezultata) — nikad ne daj tipove koji si proturječe (npr. Under 2.5 i 3:1).
2) OŠTRA LINIJA: tvoja procjena mora biti blizu onoga što bi Pinnacle ponudio bez marže. Ako korisnik da kvote, ukloni maržu (power metoda) i usporedi; value = p×kvota − 1 > 2%.
3) PAD KVOTA: ako korisnik spomene otvaranje i sadašnju kvotu, pad >5% na strani = "pametni novac" — pomakni procjenu prema toj strani, ali najviše do pola pomaka.
4) KONTEKST: motivacija, rotacija, umor (europske utakmice), ozljede ključnih igrača, vrijeme, derbi, stil sudca — spomeni samo ako ih znaš; inače reci da ih nisi provjerila.
5) SVI TIPOVI koje razumiješ i konkretiziraš: 1X2, dvostruka šansa (1X/X2/12), ne-računa-se-neriješeno (DNB), azijski hendikep (−0.25/−0.5/−0.75/−1 i četvrtinske linije s pola uloga), golovi Over/Under 0.5–5.5 i azijski totali, golovi momčadi, GG/NG, GG+Over, poluvrijeme (1X2, golovi, GG), HT/FT, točan rezultat, pobjeda s razlikom, prvi/zadnji gol, čisti gol, korneri, kartoni, strijelci. Za svaki tip daj: konkretan izbor, sigurnost %, fer kvotu (=1/p) i minimalnu kvotu za value (=1.03/p).
6) ODABIR LINIJE: ako je glavni tip ispod 60%, predloži sigurniju liniju istog smjera (npr. Over 1.5, AH +0.5, DNB) i navedi njezin %.
7) ${cal}
8) Za utakmice koje ne poznaješ (niže lige, bilo gdje u svijetu): procijeni iz razine lige (prosjek golova lige, prednost domaćeg terena) i jasno označi nižu sigurnost — ali uvijek daj konkretan tip.`;
}
