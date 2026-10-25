/**
 * Kvantitativni rukometni model kalibriran prema Bet365 kvotama:
 * - Ukupni tempo golova: Normalna(μ_total, σ_total^2)
 * - Razlika golova: Diff ~ Normalna(μ_diff, σ_diff^2)
 * - Generira konkretne tipove: 1/2 pobjednik, ukupni golovi, timski golovi domaćina i gosta
 */
import type { RukometMarkets } from "./rukomet.functions";

export type Tip = {
  market: string;
  pick: string;
  prob: number;
  fair: number;
  odd: number | null;
  ev: number | null;
};

export type ConcreteRukometTips = {
  winner: {
    pick: string;
    type: "1" | "2" | "1X" | "X2";
    prob: number;
    fair: number;
    odd: number | null;
    ev: number | null;
    confidence: "VISOKA" | "SREDNJA" | "OPREZ";
    reason: string;
  };
  totalGoals: {
    pick: string;
    line: number;
    choice: "VIŠE" | "MANJE";
    prob: number;
    fair: number;
    odd: number | null;
    ev: number | null;
    projected: number;
    confidence: "VISOKA" | "SREDNJA";
    reason: string;
  };
  homeTotal: {
    pick: string;
    line: number;
    choice: "VIŠE" | "MANJE";
    prob: number;
    fair: number;
    odd: number | null;
    projected: number;
  };
  awayTotal: {
    pick: string;
    line: number;
    choice: "VIŠE" | "MANJE";
    prob: number;
    fair: number;
    odd: number | null;
    projected: number;
  };
};

export type RukometAnalysis = {
  muDiff: number;
  sigmaDiff: number;
  muTotal: number;
  muHome: number;
  muAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pHomeML: number;
  pAwayML: number;
  concrete: ConcreteRukometTips;
  x12: Tip[];
  dc: Tip[];
  ml: Tip[];
  totals: Tip[];
  homeTotals: Tip[];
  awayTotals: Tip[];
  best: Tip | null;
  safest: Tip | null;
  notes: string[];
  source: "API" | "ALGORITAM" | "RUČNO";
  isBet365: boolean;
};

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

function invPhi(p: number) {
  let lo = -6,
    hi = 6;
  for (let i = 0; i < 70; i++) {
    const m = (lo + hi) / 2;
    Phi(m) < p ? (lo = m) : (hi = m);
  }
  return (lo + hi) / 2;
}

/** SAFE-MATH štit: kvota je "ispravna" samo ako je konačan broj > 1.001. */
const isVal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 1.001;

function devig(odds: number[]): number[] {
  const inv = odds.map((o) => (Number.isFinite(o) && o > 1.001 ? 1 / o : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map((x) => x / s) : [];
}

const find = (m: RukometMarkets, re: RegExp) =>
  Object.entries(m).find(([k]) => re.test(k))?.[1];

/** SAFE-MATH štit: NaN kvota → odd null (nikad NaN tip). */
const tip = (market: string, pick: string, prob: number, odd: number | null): Tip => {
  const kv = odd != null && Number.isFinite(odd) && odd > 1.001 ? odd : null;
  const p = Number.isFinite(prob) ? prob : 0;
  return {
    market,
    pick,
    prob: p,
    fair: p > 0 ? 1 / p : 99,
    odd: kv,
    ev: kv ? (p * kv - 1) * 100 : null,
  };
};

/** Profilira tempo i zbroj golova prema ligi i tipu natjecanja */
function getLeagueGoalProfile(league: string): { mu: number; sigma: number } {
  const l = league.toLowerCase();
  if (/women|fem|žene|dame|damen|kvinder/i.test(l)) {
    return { mu: 53.0, sigma: 5.2 };
  }
  if (/bundesliga|germany|njemačka/i.test(l)) {
    return { mu: 60.5, sigma: 5.6 };
  }
  if (/champions league|ehf|liga prvaka/i.test(l)) {
    return { mu: 59.5, sigma: 5.7 };
  }
  if (/france|starligue|francuska/i.test(l)) {
    return { mu: 58.5, sigma: 5.5 };
  }
  if (/denmark|sweden|norway|handboldligaen|handbollsligan/i.test(l)) {
    return { mu: 58.0, sigma: 5.5 };
  }
  if (/asobal|spain|španjolska/i.test(l)) {
    return { mu: 56.5, sigma: 5.4 };
  }
  if (/croatia|premijer|balkan|seha|poland|superliga/i.test(l)) {
    return { mu: 55.5, sigma: 5.3 };
  }
  return { mu: 57.0, sigma: 5.5 };
}

/** Baza rukometnih snaga vodećih europskih klubova */
function getTeamStrengthDelta(home: string, away: string): number {
  const ratings: Record<string, number> = {
    barcelona: 10,
    magdeburg: 9.5,
    veszprem: 9.2,
    kielce: 9.0,
    flensburg: 8.8,
    berlin: 8.7,
    fuchse: 8.7,
    kiel: 8.6,
    paris: 8.5,
    psg: 8.5,
    aalborg: 8.5,
    nantes: 8.0,
    montpellier: 7.8,
    gog: 7.5,
    melsungen: 7.4,
    rhein: 7.2,
    lowen: 7.2,
    hannover: 7.0,
    plock: 7.5,
    wisla: 7.5,
    szeged: 7.4,
    pick: 7.4,
    zagreb: 6.8,
    pelister: 6.0,
    dinamo: 6.5,
    bucuresti: 6.5,
    bidasoa: 6.2,
    granollers: 6.0,
    nexe: 6.2,
    tatabanya: 5.8,
  };

  let hScore = 4.0;
  let aScore = 4.0;

  const h = home.toLowerCase();
  const a = away.toLowerCase();

  for (const [key, val] of Object.entries(ratings)) {
    if (h.includes(key)) hScore = Math.max(hScore, val);
    if (a.includes(key)) aScore = Math.max(aScore, val);
  }

  // Domaći teren u rukometu vrijedi oko +2.5 do +2.8 gola
  const homeAdv = 2.6;

  // Raspršenje po imenima
  let hash = 0;
  for (let i = 0; i < home.length; i++) hash = (hash * 31 + home.charCodeAt(i)) % 100;
  for (let i = 0; i < away.length; i++) hash = (hash * 37 + away.charCodeAt(i)) % 100;
  const variance = (hash / 100 - 0.5) * 1.5;

  return (hScore - aScore) * 1.6 + homeAdv + variance;
}

export function analyzeRukomet(
  m: RukometMarkets,
  league: string,
  homeTeam = "Domaćin",
  awayTeam = "Gost",
  sourceMode?: "API" | "ALGORITAM" | "RUČNO",
  isBet365 = false
): RukometAnalysis {
  const notes: string[] = [];
  const profile = getLeagueGoalProfile(league);

  // 1) UKUPNI ZBROJ GOLOVA (Over/Under)
  const ouMk =
    find(m, /^(over\/under|total goals|goals over\/under|total)$/i) ??
    find(m, /over\/under/i);

  const lines: { line: number; o: number; u: number }[] = [];
  if (ouMk) {
    const map = new Map<number, { o?: number; u?: number }>();
    for (const [k, v] of Object.entries(ouMk)) {
      const match = k.match(/(over|under)\s*([\d.]+)/i);
      if (!match) continue;
      const L = Number(match[2]);
      const entry = map.get(L) ?? {};
      /over/i.test(match[1]!) ? (entry.o = v) : (entry.u = v);
      map.set(L, entry);
    }
    for (const [line, entry] of map) {
      // SAFE-MATH štit: obje strane moraju biti konačne kvote > 1.001.
      if (isVal(entry.o) && isVal(entry.u)) lines.push({ line, o: entry.o, u: entry.u });
    }
    lines.sort((a, b) => a.line - b.line);
  }

  let muTotal = profile.mu;
  const sigmaTotal = profile.sigma;

  let mainLineBook: { line: number; o: number; u: number } | null = null;
  if (lines.length > 0) {
    mainLineBook = [...lines].sort((a, b) => Math.abs(a.o - a.u) - Math.abs(b.o - b.u))[0]!;
    const dv = devig([mainLineBook.o, mainLineBook.u]);
    if (dv.length === 2) {
      const pOver = dv[0]!;
      muTotal = mainLineBook.line + sigmaTotal * invPhi(pOver);
      if (isBet365) notes.push(`Kalibrirano prema Bet365 liniji zbroja: ${mainLineBook.line} golova.`);
    } else notes.push("Nekonzistentne kvote na zbroj golova — korišten profil lige.");
  } else {
    notes.push(`Procijenjen tempo lige (${league}): ~${profile.mu} golova.`);
  }
  // SAFE-MATH štit: ukupni očekivani golovi moraju biti zdrav broj.
  if (!Number.isFinite(muTotal) || !(muTotal > 20) || !(muTotal < 90)) muTotal = profile.mu;

  // 2) 1X2 I POBJEDNIK
  const three =
    find(m, /^(1x2|match winner|3 ?way result|full ?time result)$/i) ??
    find(m, /1x2/i);
  const twoWay =
    find(m, /^(home\/away|money ?line|winner)$/i) ??
    find(m, /home\/away/i);

  const tH = three?.["Home"] ?? three?.["1"];
  const tX = three?.["Draw"] ?? three?.["X"];
  const tA = three?.["Away"] ?? three?.["2"];
  const mlH = twoWay?.["Home"] ?? twoWay?.["1"];
  const mlA = twoWay?.["Away"] ?? twoWay?.["2"];

  let targetProbH: number | null = null;
  let source: "API" | "ALGORITAM" | "RUČNO" = sourceMode ?? "API";

  // SAFE-MATH štit: NaN kvota više ne prolazi truthy provjeru (NaN je truthy!).
  if (isVal(tH) && isVal(tX) && isVal(tA)) {
    const probs = devig([tH, tX, tA]);
    if (probs.length === 3) targetProbH = probs[0]!;
  } else if (isVal(mlH) && isVal(mlA)) {
    const probs = devig([mlH, mlA]);
    if (probs.length === 2) targetProbH = probs[0]! * 0.92;
  }
  if (targetProbH == null || !Number.isFinite(targetProbH)) {
    source = "ALGORITAM";
    const delta = getTeamStrengthDelta(homeTeam, awayTeam);
    const z = delta / 6.8;
    targetProbH = Math.max(0.12, Math.min(0.88, Phi(z) * 0.92));
    notes.push("Tržišne kvote nisu dostupne — izračunato kvantitativnim rukometnim modelom.");
  }


  const sigmaDiff = 6.8;
  let lo = -25,
    hi = 25;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    const pH = 1 - Phi((0.5 - mid) / sigmaDiff);
    pH < targetProbH ? (lo = mid) : (hi = mid);
  }
  const muDiff = (lo + hi) / 2;

  // Izračun vjerojatnosti 1X2
  const pDraw = Math.max(
    0.05,
    Math.min(0.12, Phi((0.5 - muDiff) / sigmaDiff) - Phi((-0.5 - muDiff) / sigmaDiff))
  );
  // POPRAVAK: ograniči domaćina prema remiju kako tri ishoda uvijek daju ukupno 1.
  const pHome = Math.max(0.02, Math.min(0.96, 1 - pDraw - 0.02, 1 - Phi((0.5 - muDiff) / sigmaDiff)));
  const pAway = 1 - pHome - pDraw;

  const pHomeML = pHome + pDraw * 0.5;
  const pAwayML = 1 - pHomeML;

  // 3) TIMSKI GOLOVI
  const muHome = (muTotal + muDiff) / 2;
  const muAway = (muTotal - muDiff) / 2;
  const sigmaTeam = sigmaTotal * 0.707;

  // 4) TIPOVI LISTE
  const x12: Tip[] = [
    tip("1X2", "1 (Domaćin)", pHome, tH ?? null),
    tip("1X2", "X (Neriješeno)", pDraw, tX ?? null),
    tip("1X2", "2 (Gost)", pAway, tA ?? null),
  ];

  const dcMk = find(m, /double chance/i);
  const dc: Tip[] = [
    tip("Dupla šansa", "1X", pHome + pDraw, dcMk?.["Home/Draw"] ?? dcMk?.["1X"] ?? null),
    tip("Dupla šansa", "X2", pAway + pDraw, dcMk?.["Draw/Away"] ?? dcMk?.["X2"] ?? null),
    tip("Dupla šansa", "12", pHome + pAway, dcMk?.["Home/Away"] ?? dcMk?.["12"] ?? null),
  ];

  const ml: Tip[] = [
    tip("Pobjednik (1 2)", "1", pHomeML, mlH ?? null),
    tip("Pobjednik (1 2)", "2", pAwayML, mlA ?? null),
  ];

  // UKUPNI GOLOVI
  const baseRoundTotal = Math.round(muTotal * 2) / 2;
  const targetLines = lines.length
    ? lines
    : [
        { line: baseRoundTotal - 1.5, o: 0, u: 0 },
        { line: baseRoundTotal + 0.5, o: 0, u: 0 },
        { line: baseRoundTotal + 2.5, o: 0, u: 0 },
      ];

  const totals: Tip[] = [];
  for (const item of targetLines) {
    const z = (item.line - muTotal) / sigmaTotal;
    const pOver = 1 - Phi(z);
    const pUnder = 1 - pOver;
    totals.push(tip(`Zbroj ${item.line}`, `Više od ${item.line}`, pOver, item.o || null));
    totals.push(tip(`Zbroj ${item.line}`, `Manje od ${item.line}`, pUnder, item.u || null));
  }

  // TIMSKI GOLOVI DOMAĆIN
  const homeOuMk = find(m, /(home total|team 1 total|domaćin zbroj)/i);
  const hLineBase = Math.round(muHome * 2) / 2;
  const hLines = [hLineBase - 1.0, hLineBase, hLineBase + 1.0];
  const homeTotals: Tip[] = [];
  for (const line of hLines) {
    const z = (line - muHome) / sigmaTeam;
    const pOver = 1 - Phi(z);
    const pUnder = 1 - pOver;
    const oddO = homeOuMk?.[`Over ${line}`] ?? homeOuMk?.[`Over`] ?? null;
    const oddU = homeOuMk?.[`Under ${line}`] ?? homeOuMk?.[`Under`] ?? null;
    homeTotals.push(tip(`Domaćin ${line}`, `Više od ${line}`, pOver, oddO));
    homeTotals.push(tip(`Domaćin ${line}`, `Manje od ${line}`, pUnder, oddU));
  }

  // TIMSKI GOLOVI GOST
  const awayOuMk = find(m, /(away total|team 2 total|gost zbroj)/i);
  const aLineBase = Math.round(muAway * 2) / 2;
  const aLines = [aLineBase - 1.0, aLineBase, aLineBase + 1.0];
  const awayTotals: Tip[] = [];
  for (const line of aLines) {
    const z = (line - muAway) / sigmaTeam;
    const pOver = 1 - Phi(z);
    const pUnder = 1 - pOver;
    const oddO = awayOuMk?.[`Over ${line}`] ?? awayOuMk?.[`Over`] ?? null;
    const oddU = awayOuMk?.[`Under ${line}`] ?? awayOuMk?.[`Under`] ?? null;
    awayTotals.push(tip(`Gost ${line}`, `Više od ${line}`, pOver, oddO));
    awayTotals.push(tip(`Gost ${line}`, `Manje od ${line}`, pUnder, oddU));
  }

  // 5) KONKRETIZIRANI TIPOVI
  // A) Pobjednik (1 ili 2)
  let winnerPick: ConcreteRukometTips["winner"];
  if (pHome >= 0.58) {
    winnerPick = {
      pick: `1 (${homeTeam})`,
      type: "1",
      prob: pHome,
      fair: 1 / pHome,
      odd: tH ?? mlH ?? null,
      ev: tH ? (pHome * tH - 1) * 100 : null,
      confidence: pHome > 0.70 ? "VISOKA" : "SREDNJA",
      reason: `Prednost domaćina +${muDiff.toFixed(1)} gola uz ${ (pHome * 100).toFixed(1) }% vjerojatnosti.`,
    };
  } else if (pAway >= 0.58) {
    winnerPick = {
      pick: `2 (${awayTeam})`,
      type: "2",
      prob: pAway,
      fair: 1 / pAway,
      odd: tA ?? mlA ?? null,
      ev: tA ? (pAway * tA - 1) * 100 : null,
      confidence: pAway > 0.70 ? "VISOKA" : "SREDNJA",
      reason: `Gost ima bolju formu i rejting za ${ Math.abs(muDiff).toFixed(1) } gola.`,
    };
  } else if (pHome >= pAway) {
    winnerPick = {
      pick: `1X (${homeTeam} ili neriješeno)`,
      type: "1X",
      prob: pHome + pDraw,
      fair: 1 / (pHome + pDraw),
      odd: dcMk?.["1X"] ?? null,
      ev: dcMk?.["1X"] ? ((pHome + pDraw) * dcMk["1X"] - 1) * 100 : null,
      confidence: "SREDNJA",
      reason: `Izjednačen meč — dupla šansa 1X nudi sigurnu zaštitu remija (${((pHome + pDraw) * 100).toFixed(1)}%).`,
    };
  } else {
    winnerPick = {
      pick: `X2 (${awayTeam} ili neriješeno)`,
      type: "X2",
      prob: pAway + pDraw,
      fair: 1 / (pAway + pDraw),
      odd: dcMk?.["X2"] ?? null,
      ev: dcMk?.["X2"] ? ((pAway + pDraw) * dcMk["X2"] - 1) * 100 : null,
      confidence: "SREDNJA",
      reason: `Izjednačen meč — dupla šansa X2 pokriva remi (${((pAway + pDraw) * 100).toFixed(1)}%).`,
    };
  }

  // B) Glavni zbroj golova
  const chosenTotalLine = mainLineBook ? mainLineBook.line : Math.round(muTotal * 2) / 2;
  const zTot = (chosenTotalLine - muTotal) / sigmaTotal;
  const pOverTot = 1 - Phi(zTot);
  const isOverFav = pOverTot >= 0.50;
  const totalOddsVal = mainLineBook ? (isOverFav ? mainLineBook.o : mainLineBook.u) : null;
  const totalProbVal = isOverFav ? pOverTot : 1 - pOverTot;

  const totalGoalsConcrete: ConcreteRukometTips["totalGoals"] = {
    pick: `${isOverFav ? "Više od" : "Manje od"} ${chosenTotalLine} golova`,
    line: chosenTotalLine,
    choice: isOverFav ? "VIŠE" : "MANJE",
    prob: totalProbVal,
    fair: 1 / totalProbVal,
    odd: totalOddsVal,
    ev: totalOddsVal ? (totalProbVal * totalOddsVal - 1) * 100 : null,
    projected: muTotal,
    confidence: totalProbVal > 0.60 ? "VISOKA" : "SREDNJA",
    reason: `Projiciran tempo utakmice: ${muTotal.toFixed(1)} golova (granica: ${chosenTotalLine}).`,
  };

  // C) Timske granice
  const hLineConcrete = Math.round(muHome * 2) / 2;
  const hProbOver = 1 - Phi((hLineConcrete - muHome) / sigmaTeam);
  const homeTotalConcrete: ConcreteRukometTips["homeTotal"] = {
    pick: `${hProbOver >= 0.5 ? "Više od" : "Manje od"} ${hLineConcrete} golova`,
    line: hLineConcrete,
    choice: hProbOver >= 0.5 ? "VIŠE" : "MANJE",
    prob: hProbOver >= 0.5 ? hProbOver : 1 - hProbOver,
    fair: 1 / (hProbOver >= 0.5 ? hProbOver : 1 - hProbOver),
    odd: homeOuMk?.[hProbOver >= 0.5 ? `Over ${hLineConcrete}` : `Under ${hLineConcrete}`] ?? null,
    projected: muHome,
  };

  const aLineConcrete = Math.round(muAway * 2) / 2;
  const aProbOver = 1 - Phi((aLineConcrete - muAway) / sigmaTeam);
  const awayTotalConcrete: ConcreteRukometTips["awayTotal"] = {
    pick: `${aProbOver >= 0.5 ? "Više od" : "Manje od"} ${aLineConcrete} golova`,
    line: aLineConcrete,
    choice: aProbOver >= 0.5 ? "VIŠE" : "MANJE",
    prob: aProbOver >= 0.5 ? aProbOver : 1 - aProbOver,
    fair: 1 / (aProbOver >= 0.5 ? aProbOver : 1 - aProbOver),
    odd: awayOuMk?.[aProbOver >= 0.5 ? `Over ${aLineConcrete}` : `Under ${aLineConcrete}`] ?? null,
    projected: muAway,
  };

  const allTips = [...x12, ...dc, ...ml, ...totals, ...homeTotals, ...awayTotals];
  const withOdds = allTips.filter((t) => t.odd && t.odd >= 1.25 && t.ev != null);
  const best = withOdds.length ? [...withOdds].sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0]! : null;
  const safest =
    withOdds.filter((t) => t.prob >= 0.65).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0] ??
    allTips.filter((t) => t.prob >= 0.70).sort((a, b) => b.prob - a.prob)[0] ??
    null;

  // SAFE-MATH štit: ne-konačne/nerazumne kvote u concrete bloku → null
  const ocistiKv = (t: unknown) => {
    const x = t as { odd?: number | null; ev?: number | null } | undefined;
    if (x) {
      x.odd = x.odd != null && Number.isFinite(x.odd) && x.odd > 1.001 && x.odd < 1000 ? x.odd : null;
      x.ev = x.odd != null && x.ev != null && Number.isFinite(x.ev) ? x.ev : null;
    }
    return x;
  };
  ocistiKv(winnerPick);
  ocistiKv(totalGoalsConcrete); ocistiKv(homeTotalConcrete); ocistiKv(awayTotalConcrete);

  return {
    muDiff,
    sigmaDiff,
    muTotal,
    muHome,
    muAway,
    pHome,
    pDraw,
    pAway,
    pHomeML,
    pAwayML,
    concrete: {
      winner: winnerPick,
      totalGoals: totalGoalsConcrete,
      homeTotal: homeTotalConcrete,
      awayTotal: awayTotalConcrete,
    },
    x12,
    dc,
    ml,
    totals,
    homeTotals,
    awayTotals,
    best,
    safest,
    notes,
    source,
    isBet365,
  };
}

