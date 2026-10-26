/**
 * Košarkaški model: razlika poena ~ Normalna(μ, σ), zbroj poena ~ Normalna(T, σT).
 * μ se kalibrira bisekcijom iz de-vig kvota Pobjednik (uklj. produžetke) ili 1X2 (regularno).
 * Neriješeno nakon 4 četvrtine = P(|razlika| < 0.5). Zbroj uključuje produžetke.
 */
import type { KosMarkets } from "./kosarka.functions";

export type Tip = {
  market: string;
  pick: string;
  prob: number;
  fair: number;
  odd: number | null;
  ev: number | null;
};
export type KosAnalysis = {
  mu: number;
  sigma: number;
  total: number;
  sigmaT: number;
  nba: boolean;
  pHome: number;
  pDraw: number;
  pAway: number;
  pHomeOT: number;
  pAwayOT: number;
  x12: Tip[];
  dc: Tip[];
  ml: Tip[];
  totals: Tip[];
  best: Tip | null;
  safest: Tip | null;
  totalPick: Tip;
  notes: string[];
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
  let lo = -8,
    hi = 8;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    Phi(m) < p ? (lo = m) : (hi = m);
  }
  return (lo + hi) / 2;
}

/** SAFE-MATH štit: kvota je "ispravna" samo ako je konačan broj > 1.001. */
const isVal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 1.001;

/** De-vig proporcionalno (dovoljno precizno za 2–3 ishoda). */
function devig(odds: number[]) {
  const inv = odds.filter((o) => Number.isFinite(o) && o > 1.001).map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map((x) => x / s) : [];
}

const find = (m: KosMarkets, re: RegExp) => Object.entries(m).find(([k]) => re.test(k))?.[1];

function regProbs(mu: number, sigma: number) {
  const pDraw = Phi((0.5 - mu) / sigma) - Phi((-0.5 - mu) / sigma);
  const pHome = 1 - Phi((0.5 - mu) / sigma);
  return { pHome, pDraw, pAway: 1 - pHome - pDraw };
}

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

export function analyzeKos(m: KosMarkets, league: string): KosAnalysis | null {
  const notes: string[] = [];
  // POPRAVAK: samo NBA ima 48 minuta; WNBA i NCAA koriste 40-minutni format.
  const nba = /\bnba\b/i.test(league);
  const qMin = nba ? 48 : 40;

  // 1) Zbroj poena — glavna linija (najbliža 50/50)
  const ouMk = find(m, /^(over\/under|total|points over\/under)/i) ?? find(m, /over\/under/i);
  const lines: { line: number; o: number; u: number }[] = [];
  if (ouMk) {
    const map = new Map<number, { o?: number; u?: number }>();
    for (const [k, v] of Object.entries(ouMk)) {
      const mm = k.match(/(over|under)\s*([\d.]+)/i);
      if (!mm) continue;
      const L = Number(mm[2]);
      const e = map.get(L) ?? {};
      /over/i.test(mm[1]!) ? (e.o = v) : (e.u = v);
      map.set(L, e);
    }
    // SAFE-MATH štit: obje strane moraju biti konačne kvote > 1.001.
    for (const [line, e] of map) if (isVal(e.o) && isVal(e.u)) lines.push({ line, o: e.o, u: e.u });
    lines.sort((a, b) => a.line - b.line);
  }
  let total = nba ? 225 : 160;
  let sigmaT = 0;
  if (lines.length) {
    const main = [...lines].sort((a, b) => Math.abs(a.o - a.u) - Math.abs(b.o - b.u))[0]!;
    sigmaT = main.line * 0.075;
    const dv = devig([main.o, main.u]);
    if (dv.length === 2) {
      const pOver = dv[0]!;
      // POPRAVAK: total određuje sigmaT, zato kalibracija mora riješiti jednadžbu s konačnom σT.
      total = main.line / (1 - 0.075 * invPhi(pOver));
    } else notes.push("Nekonzistentne kvote na zbroj poena — korištena prosječna liga.");
  } else notes.push("Nema kvota na zbroj poena — korištena prosječna liga.");
  // SAFE-MATH štit: total mora biti zdrav broj, inače ligaški prosjek.
  if (!Number.isFinite(total) || !(total > 80) || !(total < 400)) total = nba ? 225 : 160;
  sigmaT = total * 0.075;

  // σ razlike skalira s tempom (NBA ≈ 12.5 pri 225 poena)
  const sigma = Math.max(6, total * 0.056);
  const otPts = (total / qMin) * 5;

  // 2) Kalibracija μ
  const ml = find(m, /^home\/away$/i) ?? find(m, /money ?line/i);
  const three = find(m, /^3 ?way result$/i) ?? find(m, /^(match winner|1x2)$/i);
  const mlH = ml?.["Home"] ?? ml?.["1"];
  const mlA = ml?.["Away"] ?? ml?.["2"];
  const tH = three?.["Home"] ?? three?.["1"];
  const tX = three?.["Draw"] ?? three?.["X"];
  const tA = three?.["Away"] ?? three?.["2"];

  let target: number | null = null;
  let mode: "ml" | "3w" = "ml";
  // SAFE-MATH štit: NaN kvota više ne prolazi truthy provjeru (NaN je truthy!).
  if (isVal(mlH) && isVal(mlA)) {
    const dv = devig([mlH, mlA]);
    if (dv.length === 2) target = dv[0]!;
  } else if (isVal(tH) && isVal(tX) && isVal(tA)) {
    const p = devig([tH, tX, tA]);
    if (p.length === 3) {
      target = p[0]! / (p[0]! + p[2]!);
      mode = "3w";
    }
  }
  if (target == null || !Number.isFinite(target)) return null;
  if (mode === "3w") notes.push("Kalibrirano iz 1X2 (regularno vrijeme).");

  let lo = -40,
    hi = 40;
  for (let i = 0; i < 80; i++) {
    const mu = (lo + hi) / 2;
    const r = regProbs(mu, sigma);
    const pHomeOT = r.pHome + r.pDraw * 0.5; // produžetak ~ 50/50 uz blagu prednost jačeg
    const v = mode === "ml" ? pHomeOT : r.pHome / (r.pHome + r.pAway);
    v < target ? (lo = mu) : (hi = mu);
  }
  const mu = (lo + hi) / 2;
  const { pHome, pDraw, pAway } = regProbs(mu, sigma);
  const pHomeOT = pHome + pDraw * 0.5,
    pAwayOT = 1 - pHomeOT;

  // 3) Tipovi
  const x12 = [
    tip("1X2 (reg.)", "1", pHome, tH ?? null),
    tip("1X2 (reg.)", "X", pDraw, tX ?? null),
    tip("1X2 (reg.)", "2", pAway, tA ?? null),
  ];
  const dcMk = find(m, /double chance/i);
  const dc = [
    tip("Dupla šansa", "1X", pHome + pDraw, dcMk?.["Home/Draw"] ?? dcMk?.["1X"] ?? null),
    tip("Dupla šansa", "X2", pAway + pDraw, dcMk?.["Draw/Away"] ?? dcMk?.["X2"] ?? null),
    tip("Dupla šansa", "12", pHome + pAway, dcMk?.["Home/Away"] ?? dcMk?.["12"] ?? null),
  ];
  const mlT = [
    tip("Pobjednik (uklj. OT)", "1", pHomeOT, mlH ?? null),
    tip("Pobjednik (uklj. OT)", "2", pAwayOT, mlA ?? null),
  ];

  const expTotal = total; // tržišna linija već uključuje produžetke
  const tLines = lines.length ? lines : [{ line: Math.round(total) + 0.5, o: 0, u: 0 }];
  const totals: Tip[] = [];
  for (const L of tLines) {
    // mješavina: bez OT (1-pDraw) i s OT (pDraw) — pomak +otPts
    const base = expTotal - pDraw * otPts;
    const pO =
      (1 - pDraw) * (1 - Phi((L.line - base) / sigmaT)) +
      pDraw * (1 - Phi((L.line - base - otPts) / sigmaT));
    totals.push(tip(`Zbroj ${L.line}`, `Više ${L.line}`, pO, L.o || null));
    totals.push(tip(`Zbroj ${L.line}`, `Manje ${L.line}`, 1 - pO, L.u || null));
  }

  const all = [...x12, ...dc, ...mlT, ...totals].filter((t) => t.odd);
  const best =
    [...all]
      .filter((t) => (t.ev ?? -99) > 1.5 && t.prob >= 0.35)
      .sort((a, b) => b.ev! - a.ev!)[0] ?? null;
  const safest =
    [...all]
      .filter((t) => t.odd! >= 1.2 && (t.ev ?? -99) > -4)
      .sort((a, b) => b.prob - a.prob)[0] ?? null;
  if (!best)
    notes.push(
      "Nema tipa s pozitivnom vrijednošću (EV > +1.5%) — profesionalno: preskoči ili mali ulog.",
    );

  const totalPick = pickTotal(totals, lines);

  return {
    mu,
    sigma,
    total,
    sigmaT,
    nba,
    pHome,
    pDraw,
    pAway,
    pHomeOT,
    pAwayOT,
    x12,
    dc,
    ml: mlT,
    totals,
    best,
    safest,
    totalPick,
    notes,
  };
}

/**
 * Obavezan tip zbroja poena (uklj. produžetke): uvijek vraća Više ili Manje.
 * Glavna linija = najbliža 50/50; bira stranu s većom šansom, kod gotovo
 * jednake šanse (<1 pp) prednost ima strana s boljim EV-om.
 */
export function pickTotal(totals: Tip[], lines: { line: number; o: number; u: number }[]): Tip {
  const main = lines.length
    ? [...lines].sort((a, b) => Math.abs(a.o - a.u) - Math.abs(b.o - b.u))[0]!.line
    : Number(totals[0]?.market?.replace(/[^\d.]/g, "") || 160);
  const pair = totals.filter((t) => t.market === `Zbroj ${main}`);
  const o =
    pair.find((t) => t.pick.startsWith("Više")) ?? totals.find((t) => t.pick.startsWith("Više"));
  const u =
    pair.find((t) => t.pick.startsWith("Manje")) ?? totals.find((t) => t.pick.startsWith("Manje"));
  if (!o && !u)
    return (
      totals[0] ?? {
        market: `Zbroj ${main}`,
        pick: `Više ${main}`,
        prob: 0.5,
        fair: 2.0,
        odd: null,
        ev: null,
      }
    );
  if (!o) return u!;
  if (!u) return o;
  if (Math.abs(o.prob - u.prob) < 0.01 && o.ev != null && u.ev != null) return o.ev >= u.ev ? o : u;
  return o.prob >= u.prob ? o : u;
}
