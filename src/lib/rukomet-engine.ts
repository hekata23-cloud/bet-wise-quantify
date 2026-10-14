/**
 * Kvantitativni rukometni model:
 * Rukometni tempo golova: Ukupni golovi ~ Normalna(μ_total, σ_total^2)
 * Razlika golova: Diff ~ Normalna(μ_diff, σ_diff^2)
 * Podržava:
 * - Kvote iz API-ja (Bet365 / druge kladionice)
 * - Automatsku ligu i timsku parametrizaciju ako kvote još nisu objavljene
 * - Ručno unesene kvote
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
  x12: Tip[];
  dc: Tip[];
  ml: Tip[];
  totals: Tip[];
  homeTotals: Tip[];
  awayTotals: Tip[];
  totalPick: Tip;
  homeTotalPick: Tip;
  awayTotalPick: Tip;
  best: Tip | null;
  safest: Tip | null;
  notes: string[];
  source: "API" | "ALGORITAM" | "RUČNO";
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

function devig(odds: number[]): number[] {
  const inv = odds.map((o) => (o > 0 ? 1 / o : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map((x) => x / s) : odds.map(() => 1 / odds.length);
}

const find = (m: RukometMarkets, re: RegExp) =>
  Object.entries(m).find(([k]) => re.test(k))?.[1];

const tip = (market: string, pick: string, prob: number, odd: number | null): Tip => ({
  market,
  pick,
  prob,
  fair: prob > 0 ? 1 / prob : 99,
  odd,
  ev: odd ? (prob * odd - 1) * 100 : null,
});

/** Profilira tempo i zbroj golova prema ligi i tipu natjecanja */
function getLeagueGoalProfile(league: string): { mu: number; sigma: number } {
  const l = league.toLowerCase();
  if (/women|fem|žene|dame|damen|kvinder/i.test(l)) {
    return { mu: 52.0, sigma: 5.2 };
  }
  if (/bundesliga|germany|njemačka/i.test(l)) {
    return { mu: 60.5, sigma: 5.6 };
  }
  if (/champions league|ehf|liga prvaka/i.test(l)) {
    return { mu: 59.5, sigma: 5.7 };
  }
  if (/france|starligue|francuska/i.test(l)) {
    return { mu: 58.0, sigma: 5.5 };
  }
  if (/denmark|sweden|norway|handboldligaen|handbollsligan/i.test(l)) {
    return { mu: 57.5, sigma: 5.5 };
  }
  if (/asobal|spain|španjolska/i.test(l)) {
    return { mu: 56.5, sigma: 5.4 };
  }
  if (/croatia|premijer|balkan|seha|poland|superliga/i.test(l)) {
    return { mu: 55.5, sigma: 5.3 };
  }
  return { mu: 56.5, sigma: 5.5 };
}

/** Generira dinamički omjer snaga na temelju imena klubova i prednosti domaćeg parketa */
function getTeamStrengthDelta(home: string, away: string): number {
  const topTier = [
    "barcelona", "magdeburg", "veszprem", "kielce", "paris", "psg",
    "flensburg", "kiel", "aalborg", "montpellier", "gog", "fuchse", "berlin",
    "zagreb", "pelister", "pick szeged", "nantes", "dinamo bucuresti"
  ];

  let hScore = 0;
  let aScore = 0;

  const h = home.toLowerCase();
  const a = away.toLowerCase();

  for (const t of topTier) {
    if (h.includes(t)) hScore += 3.5;
    if (a.includes(t)) aScore += 3.5;
  }

  // Domaći teren u rukometu vrijedi tipično +2.5 do +3.0 gola
  const homeCourtAdvantage = 2.6;

  // Raspršenje po hash-u imena da svaka utakmica dobije prirodnu razliku
  let hash = 0;
  for (let i = 0; i < home.length; i++) hash = (hash * 31 + home.charCodeAt(i)) % 100;
  for (let i = 0; i < away.length; i++) hash = (hash * 37 + away.charCodeAt(i)) % 100;
  const variance = (hash / 100 - 0.5) * 2.0;

  return (hScore - aScore) + homeCourtAdvantage + variance;
}

export function analyzeRukomet(
  m: RukometMarkets,
  league: string,
  homeTeam = "Domaćin",
  awayTeam = "Gost",
  sourceMode?: "API" | "ALGORITAM" | "RUČNO"
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
      if (entry.o && entry.u) lines.push({ line, o: entry.o, u: entry.u });
    }
    lines.sort((a, b) => a.line - b.line);
  }

  let muTotal = profile.mu;
  const sigmaTotal = profile.sigma;

  if (lines.length > 0) {
    const main = [...lines].sort((a, b) => Math.abs(a.o - a.u) - Math.abs(b.o - b.u))[0]!;
    const pOver = devig([main.o, main.u])[0]!;
    muTotal = main.line + sigmaTotal * invPhi(pOver);
  } else {
    notes.push(`Procijenjen tempo lige (${league}): ~${profile.mu} golova.`);
  }

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

  if (tH && tX && tA) {
    const probs = devig([tH, tX, tA]);
    targetProbH = probs[0]!;
  } else if (mlH && mlA) {
    const probs = devig([mlH, mlA]);
    targetProbH = probs[0]! * 0.92;
  } else {
    // Ako nema kvota u API-ju, izračunaj iz snage timova i prednosti domaćeg parketa
    source = "ALGORITAM";
    const delta = getTeamStrengthDelta(homeTeam, awayTeam);
    const z = delta / 6.8;
    targetProbH = Math.max(0.15, Math.min(0.85, Phi(z) * 0.92));
    notes.push("Tržišne kvote nisu dostupne — izračunato kvantitativnim modelom Andromeda AI.");
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
    Math.min(0.13, Phi((0.5 - muDiff) / sigmaDiff) - Phi((-0.5 - muDiff) / sigmaDiff))
  );
  const pHome = Math.max(0.02, Math.min(0.96, 1 - Phi((0.5 - muDiff) / sigmaDiff)));
  const pAway = Math.max(0.02, 1 - pHome - pDraw);

  const pHomeML = pHome + pDraw * 0.5;
  const pAwayML = 1 - pHomeML;

  // 3) TIMSKI GOLOVI
  const muHome = (muTotal + muDiff) / 2;
  const muAway = (muTotal - muDiff) / 2;
  const sigmaTeam = sigmaTotal * 0.707;

  // 4) TIPOVI
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

  // UKUPNI GOLOVI LISTA
  const targetLines = lines.length
    ? lines
    : [
        { line: Math.round(muTotal) - 1.5, o: 0, u: 0 },
        { line: Math.round(muTotal) + 0.5, o: 0, u: 0 },
        { line: Math.round(muTotal) + 2.5, o: 0, u: 0 },
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
  const hLineBase = Math.round(muHome);
  const hLines = [hLineBase - 1.5, hLineBase + 0.5, hLineBase + 1.5];
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
  const aLineBase = Math.round(muAway);
  const aLines = [aLineBase - 1.5, aLineBase + 0.5, aLineBase + 1.5];
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

  // Glavni tipovi
  const mainLineTotal =
    totals.filter((t) => t.odd != null).sort((a, b) => Math.abs(a.prob - 0.5) - Math.abs(b.prob - 0.5))[0] ??
    totals.sort((a, b) => Math.abs(a.prob - 0.5) - Math.abs(b.prob - 0.5))[0]!;
  const totalPick = mainLineTotal;

  const homeTotalPick =
    homeTotals.filter((t) => t.odd != null).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0] ??
    homeTotals.sort((a, b) => Math.abs(a.prob - 0.5) - Math.abs(b.prob - 0.5))[0]!;

  const awayTotalPick =
    awayTotals.filter((t) => t.odd != null).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0] ??
    awayTotals.sort((a, b) => Math.abs(a.prob - 0.5) - Math.abs(b.prob - 0.5))[0]!;

  const allTips = [...x12, ...dc, ...ml, ...totals, ...homeTotals, ...awayTotals];
  const withOdds = allTips.filter((t) => t.odd && t.odd >= 1.25 && t.ev != null);
  const best = withOdds.length ? [...withOdds].sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0]! : null;
  const safest =
    withOdds.filter((t) => t.prob >= 0.65).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))[0] ??
    allTips.filter((t) => t.prob >= 0.70).sort((a, b) => b.prob - a.prob)[0] ??
    null;

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
    x12,
    dc,
    ml,
    totals,
    homeTotals,
    awayTotals,
    totalPick,
    homeTotalPick,
    awayTotalPick,
    best,
    safest,
    notes,
    source,
  };
}

