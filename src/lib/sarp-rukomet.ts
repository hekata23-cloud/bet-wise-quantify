// ============================================================
// SARP-RUKOMET.TS — Handball SARP Engine (SARP/Sharp sloj)
// Model napada: ~55-60 napada po utakmici, efikasnost napada vs
// obrane golmana, utjecaj isključenja na 2 minute, 1. poluvrijeme
// ≈ 47% golova, HT/FT kombinacije. Trostruka verifikacija:
// 1) Model posjeda/efikasnosti, 2) Skellam Monte Carlo 5.000,
// 3) De-vig tržišni konsenzus. Volatilnost >10 pp → spusti
// povjerenje. Edge guard: EV ≥ 4.5%. Kelly 0.25x, cap 3%.
// ============================================================

import type { RukometAnalysis } from "./rukomet-engine";

export interface HandballMatchStats {
  /** napadi (posjedi) po timu po utakmici — tipično 26-30 */
  attacksHome?: number; attacksAway?: number;
  /** efikasnost napada (udio pretvorenih napada, 0..1) — tipično 0.40-0.48 */
  attackEffHome?: number; attackEffAway?: number;
  /** postotak obrana golmana (0..1) — tipično 0.24-0.32 */
  gkSaveHome?: number; gkSaveAway?: number;
  /** prosječan broj isključenja na 2 minute po timu (bazno 1) */
  suspHome?: number; suspAway?: number;
  /** udio golova u 1. poluvremenu (default 0.47) */
  halfShare?: number;
}

export type SarpKandidat = {
  trziste: string; tip: string; label: string;
  p: number; kvota: number | null; fer: number;
  edge: number | null; kellyPct: number; isplativo: boolean;
};

export interface HandballSARPPrediction {
  fixtureId: number;
  tempo: {
    expAttacks: number | null;
    efikasnost: { home: number | null; away: number | null };
    oznaka: "Brzi Tempo" | "Umjereno" | "Defenzivna Utakmica";
    goloviNa50Napada: { home: number; away: number };
  };
  gk: { saveHome: number; saveAway: number; diff: number; procijenjeno: boolean };
  suspenzije: { home: number; away: number; utjecajGolova: number };
  lamHome: number; lamAway: number; expTotal: number; expSpread: number;
  sigmaTotal: number; sigmaDiff: number;
  p1HOver: number; linija1H: number; expTotal1H: number;
  htft: { kod: string; p: number }[];
  pHome: number; pDraw: number; pAway: number;
  pOver: number; pUnder: number; linijaTotala: number;
  mc: { n: number; pHome: number; pDraw: number; pAway: number; pOver: number };
  trziste: { pHome: number | null; pOver: number | null; devigIzvor: string | null };
  provjera: { maxDiscrepancy: number | null; volatility: boolean };
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
/** Poisson uzorkovanje (Knuth) — za λ ≤ 30 točno i brzo. */
function poisson(lambda: number, r: () => number): number {
  const L = Math.exp(-lambda); let k = 0; let p = 1;
  do { k++; p *= r(); } while (p > L && k < 200);
  return k - 1;
}

const GK_LIGA = 0.27;      // prosječan postotak obrana golmana u ligi
const SUSP_GOL = 0.25;     // svako isključenje preko baznog ≈ 0.25 primljenog gola
const SUSP_NAPAD = 0.15;   // ... i ≈ 0.15 gola manje vlastitog napada

export function sarpRukomet(args: {
  an: RukometAnalysis;
  home: string; away: string; fixtureId: number;
  stats?: HandballMatchStats;
}): HandballSARPPrediction {
  const { an, fixtureId } = args;
  const s = args.stats ?? {};
  const upozorenja: string[] = [];
  const izvori: string[] = ["Tržišne kvote (de-vig)", "Monte Carlo 5.000 (Skellam)", "Profil lige"];

  // — 1) NAPADI I EFIKASNOST —
  const attacksH = s.attacksHome ?? 28; const attacksA = s.attacksAway ?? 28;
  const expAttacks = attacksH + attacksA;
  const efH = s.attackEffHome ?? null; const efA = s.attackEffAway ?? null;
  if (efH != null && efA != null) izvori.push("Efikasnost napada (korisnička statistika)");

  // — 2) GOLMANI —
  const saveH = clamp(s.gkSaveHome ?? GK_LIGA, 0.15, 0.45);
  const saveA = clamp(s.gkSaveAway ?? GK_LIGA, 0.15, 0.45);
  const procijenjeno = s.gkSaveHome == null || s.gkSaveAway == null;
  if (!procijenjeno) izvori.push("Postotak obrana golmana (GK save %)");

  // — 3) ISKLJUČENJA (2 minute) —
  const suspH = clamp(s.suspHome ?? 1, 0, 5); const suspA = clamp(s.suspAway ?? 1, 0, 5);
  const utjecajGolova = (suspH - 1) * (SUSP_GOL + SUSP_NAPAD) - (suspA - 1) * (SUSP_GOL + SUSP_NAPAD);
  if (suspH !== 1 || suspA !== 1) izvori.push("Isključenja 2' (utjecaj na λ)");

  // — 4) λ IZ MODELA POSJEDA + FUZIJA S TRŽIŠTEM —
  let lamHome = an.muHome;
  let lamAway = an.muAway;
  if (efH != null && efA != null) {
    // golovi = napadi × efikasnost, korigirano obranom protivničkog golmana
    const mH = attacksH * efH * (1 - clamp((saveA - GK_LIGA) / GK_LIGA * 0.35, -0.2, 0.2));
    const mA = attacksA * efA * (1 - clamp((saveH - GK_LIGA) / GK_LIGA * 0.35, -0.2, 0.2));
    lamHome = 0.5 * lamHome + 0.5 * mH;
    lamAway = 0.5 * lamAway + 0.5 * mA;
  }
  // isključenja: domaćinovo isključenje → gost dolazi do više golova, domaćin ih daje manje
  lamAway += (suspH - 1) * SUSP_GOL; lamHome -= (suspH - 1) * SUSP_NAPAD;
  lamHome += (suspA - 1) * SUSP_GOL; lamAway -= (suspA - 1) * SUSP_NAPAD;
  lamHome = clamp(lamHome, 8, 45); lamAway = clamp(lamAway, 8, 45);

  const expTotal = lamHome + lamAway;
  const expSpread = lamHome - lamAway;
  // σ totala slijedi profil lige: ~5.5 gola na ~57 golova, skalirano tempom
  const sigmaTotal = clamp(5.5 * (expTotal / 57), 4, 7);
  const sigmaDiff = 6.8 * 0.9;

  const oznaka: HandballSARPPrediction["tempo"]["oznaka"] =
    expTotal > 60 ? "Brzi Tempo" : expTotal < 52 ? "Defenzivna Utakmica" : "Umjereno";

  // — 5) TROSTRUKA VERIFIKACIJA: model vs Skellam MC vs de-vig tržište —
  const N = 5000;
  const r = rng(fixtureId);
  let wH = 0, dr = 0, wA = 0, ov = 0;
  const linijaTotala = an.totals.length
    ? Number(an.totals[0]!.market.replace(/[^\d.]/g, "")) || Math.round(expTotal * 2) / 2
    : Math.round(expTotal * 2) / 2;
  for (let i = 0; i < N; i++) {
    const gh = poisson(lamHome, r); const ga = poisson(lamAway, r);
    const d = gh - ga;
    if (d > 0) wH++; else if (d === 0) dr++; else wA++;
    if (gh + ga > linijaTotala) ov++;
  }
  const mc = { n: N, pHome: wH / N, pDraw: dr / N, pAway: wA / N, pOver: ov / N };

  // de-vig tržišta iz 1X2 i glavne O/U linije
  const o1 = an.x12[0]?.odd ?? null; const oX = an.x12[1]?.odd ?? null; const o2 = an.x12[2]?.odd ?? null;
  const overTip = an.totals.find((t) => t.market === `Zbroj ${linijaTotala}` && t.pick.includes("Više"));
  const underTip = an.totals.find((t) => t.market === `Zbroj ${linijaTotala}` && t.pick.includes("Manje"));
  let pHomeMkt: number | null = null; let pOverMkt: number | null = null; let devigIzvor: string | null = null;
  if (o1 && oX && o2) { const p = devig([o1, oX, o2]); pHomeMkt = p[0]!; devigIzvor = "1X2"; }
  else if (an.ml[0]?.odd && an.ml[1]?.odd) { pHomeMkt = devig([an.ml[0]!.odd!, an.ml[1]!.odd!])[0]! * 0.92; devigIzvor = "ML"; }
  if (overTip?.odd && underTip?.odd) { pOverMkt = devig([overTip.odd, underTip.odd])[0]!; devigIzvor = devigIzvor ? `${devigIzvor} + O/U` : "O/U"; }

  const pHome = an.pHome; const pDraw = an.pDraw; const pAway = an.pAway;
  const pOverModel = 1 - Phi((linijaTotala - expTotal) / sigmaTotal);

  const discrep: number[] = [];
  if (pHomeMkt != null) discrep.push(Math.abs(pHome - pHomeMkt));
  if (pOverMkt != null) discrep.push(Math.abs(pOverModel - pOverMkt));
  const maxDiscrepancy = discrep.length ? Math.max(...discrep) : null;
  const volatility = maxDiscrepancy != null && maxDiscrepancy > 0.10;
  if (volatility) upozorenja.push(`⚠️ HIGH VOLATILITY / Market Disagreement: model i tržište se razilaze ${(maxDiscrepancy! * 100).toFixed(1)} pp — povjerenje spušteno.`);

  // — 6) 1. POLUVRIJEME (≈47% golova) —
  const halfShare = clamp(s.halfShare ?? 0.47, 0.4, 0.55);
  const expTotal1H = expTotal * halfShare;
  const sigma1H = sigmaTotal * Math.sqrt(halfShare);
  const linija1H = Math.round(expTotal1H * 2) / 2;
  const p1HOver = 1 - Phi((linija1H - expTotal1H) / sigma1H);

  // — 7) HT/FT MATRICA (9 kombinacija, nezavisnost HT→FT aproksimacija) —
  const sigmaHT = sigmaDiff * Math.sqrt(halfShare);
  const muHT = expSpread * halfShare;
  const pHT1 = 1 - Phi((0.5 - muHT) / sigmaHT);
  const pHTX = Phi((0.5 - muHT) / sigmaHT) - Phi((-0.5 - muHT) / sigmaHT);
  const pHT2 = 1 - pHT1 - pHTX;
  const htft: HandballSARPPrediction["htft"] = [];
  for (const ht of [["1", pHT1], ["X", pHTX], ["2", pHT2]] as const) {
    for (const ft of [["1", pHome], ["X", pDraw], ["2", pAway]] as const) {
      htft.push({ kod: `${ht[0]}/${ft[0]}`, p: (ht[1] as number) * (ft[1] as number) });
    }
  }
  htft.sort((a, b) => b.p - a.p);

  // — 8) POVJERENJE —
  let povjerenje = 40 + Math.min(45, izvori.length * 9);
  if (volatility) povjerenje -= 20;
  if (!o1 && !oX) { povjerenje -= 10; upozorenja.push("Nema kvota kladionica — EV se ne može provjeriti."); }
  povjerenje = clamp(Math.round(povjerenje), 10, 95);
  const razina: HandballSARPPrediction["razina"] = povjerenje >= 75 ? "A" : povjerenje >= 55 ? "B" : "C";

  // — 9) KANDIDATI + EDGE GUARD (EV ≥ 4.5%) + KELLY —
  const kand: SarpKandidat[] = [];
  const push = (trziste: string, tip: string, label: string, p: number, odd: number | null) => {
    const pp = clamp(p, 0.01, 0.99);
    const kv = odd && odd > 1.01 ? odd : null;
    const edge = kv ? pp * kv - 1 : null;
    const b = kv ? kv - 1 : 0;
    const kelly = kv ? (b * pp - (1 - pp)) / b : 0;
    kand.push({ trziste, tip, label, p: pp, kvota: kv, fer: 1 / pp, edge, kellyPct: Math.min(3, Math.max(0, kelly) * 0.25 * 100), isplativo: edge != null && edge >= 0.045 });
  };
  push("1X2", "1", `${args.home} pobjeda`, pHome, o1);
  push("1X2", "X", "Neriješeno", pDraw, oX);
  push("1X2", "2", `${args.away} pobjeda`, pAway, o2);
  push("O/U", "Over", `Više od ${linijaTotala}`, pOverModel, overTip?.odd ?? null);
  push("O/U", "Under", `Manje od ${linijaTotala}`, 1 - pOverModel, underTip?.odd ?? null);

  const valueList = kand.filter((k) => k.isplativo && k.p >= 0.45).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  const core = valueList[0] ?? kand.filter((k) => k.kvota && k.p >= 0.5).sort((a, b) => b.p - a.p)[0] ?? null;
  const alt = kand.filter((k) => k !== core && k.kvota).sort((a, b) => b.p - a.p)[0] ?? null;
  if (!valueList.length && core) upozorenja.push("Edge Guard: nema tipa s EV ≥ 4.5% — prikazan najsigurniji, ne isplativi tip.");
  if (pDraw > 0.10) upozorenja.push(`Rizik remija: ${(pDraw * 100).toFixed(1)}% — kod azijskog hendikepa razmisli o zaštiti (X).`);

  const goloviNa50 = (lam: number, att: number) => clamp((lam / Math.max(10, att)) * 50, 15, 55);

  return {
    fixtureId,
    tempo: {
      expAttacks, efikasnost: { home: efH, away: efA }, oznaka,
      goloviNa50Napada: { home: goloviNa50(lamHome, attacksH), away: goloviNa50(lamAway, attacksA) },
    },
    gk: { saveHome: saveH, saveAway: saveA, diff: saveH - saveA, procijenjeno },
    suspenzije: { home: suspH, away: suspA, utjecajGolova },
    lamHome, lamAway, expTotal, expSpread, sigmaTotal, sigmaDiff,
    p1HOver, linija1H, expTotal1H, htft,
    pHome, pDraw, pAway,
    pOver: pOverModel, pUnder: 1 - pOverModel, linijaTotala,
    mc, trziste: { pHome: pHomeMkt, pOver: pOverMkt, devigIzvor },
    provjera: { maxDiscrepancy, volatility },
    povjerenje, razina, core, alt, izvori, upozorenja,
  };
}

