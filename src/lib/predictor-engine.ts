export const OUTCOMES = ["1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const TOP_SCORES = [
  "1:0", "2:0", "2:1", "3:0", "3:1", "3:2",
  "0:0", "1:1", "2:2",
  "0:1", "0:2", "1:2", "0:3", "1:3", "2:3"
] as const;
export type TopScore = (typeof TOP_SCORES)[number];

export type Inputs = {
  ft1: string; ftx: string; ft2: string;
  ht1: string; htx: string; ht2: string;
  o25: string; u25: string; hto05: string; htu05: string;
  o15: string; u15: string; o35: string; u35: string;
  bttsYes: string; bttsNo: string;
  ft1Open: string;
  book: Record<Outcome, string>;
  bookScores: Record<string, string>;
};

export const emptyInputs = (): Inputs => ({
  ft1: "", ftx: "", ft2: "", ht1: "", htx: "", ht2: "",
  o25: "", u25: "", hto05: "", htu05: "",
  o15: "", u15: "", o35: "", u35: "",
  bttsYes: "", bttsNo: "",
  ft1Open: "",
  book: Object.fromEntries(OUTCOMES.map((o) => [o, ""])) as Record<Outcome, string>,
  bookScores: Object.fromEntries(TOP_SCORES.map((s) => [s, ""])),
});

export const n = (s: string) => {
  const v = parseFloat(String(s).replace(",", "."));
  return isFinite(v) && v > 1 ? v : NaN;
};

// 1. NAPREDNI POWER DEVIGGING (Uklanja Favorite-Longshot Bias)
export function devig(odds: number[]) {
  const imp = odds.map((o) => 1 / o);
  const sum = imp.reduce((a, b) => a + b, 0);
  const margin = (sum - 1) * 100;

  if (odds.length === 0) return { p: [] as unknown as [number, number, number], margin: 0 };

  let low = 0.7, high = 1.6, k = 1.0;
  for (let iter = 0; iter < 16; iter++) {
    k = (low + high) / 2;
    const testSum = odds.reduce((acc, o) => acc + Math.pow(1 / o, k), 0);
    if (testSum > 1.0) low = k;
    else high = k;
  }

  const powerProbs = odds.map((o) => Math.pow(1 / o, k));
  const powerSum = powerProbs.reduce((a, b) => a + b, 0);
  const p = powerProbs.map((val) => val / powerSum) as unknown as [number, number, number];

  return { p, margin };
}

function factorial(num: number): number {
  if (num <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= num; i++) res *= i;
  return res;
}

function poisson(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

// 2. DIXON-COLES TAU FAKTOR
function dixonColesTau(h: number, a: number, lH: number, lA: number, rho = -0.12): number {
  if (h === 0 && a === 0) return 1 - lH * lA * rho;
  if (h === 0 && a === 1) return 1 + lH * rho;
  if (h === 1 && a === 0) return 1 + lA * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1.0;
}

// 3. BIVARIATE POISSON MATRICA
function buildMatrix(lH: number, lA: number, maxH = 4, maxA = 4, rho = -0.12): number[][] {
  const grid: number[][] = [];
  let sum = 0;
  for (let h = 0; h <= maxH; h++) {
    const row: number[] = [];
    grid.push(row);
    for (let a = 0; a <= maxA; a++) {
      const p = Math.max(0, poisson(h, lH) * poisson(a, lA) * dixonColesTau(h, a, lH, lA, rho));
      row.push(p);
      sum += p;
    }
  }
  for (let h = 0; h <= maxH; h++) {
    const r = grid[h];
    if (r) {
      for (let a = 0; a <= maxA; a++) {
        if (r[a] !== undefined) r[a] /= sum;
      }
    }
  }
  return grid;
}

export type ConfidenceLevel = "VISOKA SIGURNOST" | "UMJERENA SIGURNOST" | "SPEKULATIVNO (VALUE)";

export type ConcreteTip = {
  market: string;
  pick: string;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  fairOdds: number;
  marketOdds: number | null;
  valueEdge: number | null;
  reason: string;
};

export type Row = { outcome: Outcome; prob: number; fair: number; market: number | null; value: number | null; hasValue: boolean };
export type Result = {
  rows: Row[];
  ftMargin: number;
  htMargin: number;
  goalsMargin: number | null;
  concretePick: ConcreteTip;
};

// HT/FT Model (9 ishoda)
export function calculate(i: Inputs, sharps = false): Result | { error: string } {
  const ft = [n(i.ft1), n(i.ftx), n(i.ft2)];
  const ht = [n(i.ht1), n(i.htx), n(i.ht2)];
  if ([...ft, ...ht].some(isNaN)) return { error: "Unesite tečajeve za Kraj (FT) i Poluvrijeme (HT) > 1.00." };
  const F = devig(ft), H = devig(ht);
  const [f1, fx, f2] = F.p as [number, number, number], [h1, hx, h2] = H.p as [number, number, number];

  let goalsMargin: number | null = null;
  const o25 = n(i.o25), u25 = n(i.u25), htu = n(i.htu05);
  if (!isNaN(o25) && !isNaN(u25)) goalsMargin = devig([o25, u25]).margin;
  const overOdds = !isNaN(o25) ? o25 : !isNaN(u25) ? 1 / Math.max(0.05, 1 - 1 / u25) : 2;

  const raw: Record<Outcome, number> = {
    "1/1": h1 * 0.85 + f1 * 0.15,
    "X/1": hx * (f1 / (f1 + fx)),
    "2/1": h2 * f1 * (1 / overOdds) * 0.5,
    "1/X": h1 * fx * 0.5,
    "X/X": hx * fx * 1.15,
    "2/X": h2 * fx * 0.5,
    "1/2": h1 * f2 * (1 / overOdds) * 0.5,
    "X/2": hx * (f2 / (f2 + fx)),
    "2/2": h2 * 0.85 + f2 * 0.15,
  };

  const shift = (targets: Partial<Record<Outcome, number>>, pool: Outcome[]) => {
    let delta = 0;
    for (const [o, f] of Object.entries(targets) as [Outcome, number][]) {
      const nv = raw[o] * f; delta += nv - raw[o]; raw[o] = nv;
    }
    const poolSum = pool.reduce((s, o) => s + raw[o], 0);
    if (poolSum <= 0) return;
    const k = Math.max(0.05, (poolSum - delta) / poolSum);
    pool.forEach((o) => (raw[o] *= k));
  };

  if (!isNaN(u25) && !isNaN(htu) && u25 < 1.7 && htu < 2.4) {
    shift({ "X/X": 1.25, "X/1": 1.15, "X/2": 1.15 }, ["1/1", "2/2"]);
  }
  if (!isNaN(o25) && o25 < 1.55) {
    shift({ "X/1": 0.85, "X/X": 0.85, "X/2": 0.85 }, ["1/1", "2/2", "2/1", "1/2"]);
  }

  const o35 = n(i.o35), u35 = n(i.u35);
  if (!isNaN(o35) && o35 < 1.95) {
    raw["1/2"] *= 1.20;
    raw["2/1"] *= 1.20;
  }
  if (!isNaN(u35) && u35 < 1.40) {
    raw["1/2"] *= 0.60;
    raw["2/1"] *= 0.60;
    raw["X/X"] *= 1.20;
    raw["X/1"] *= 1.15;
    raw["X/2"] *= 1.15;
  }

  const [ft1o, , ft2o] = ft as [number, number, number];
  const [ht1o, , ht2o] = ht as [number, number, number];
  const align = (ftO: number, htO: number, win: Outcome, slow: Outcome) => {
    if (ftO < 1.35 && htO > 1.8) {
      const m = raw[win] * 0.1; raw[win] -= m; raw[slow] += m;
    } else if (ftO < 2.0 && htO / ftO <= 1.35) {
      raw[win] *= 1.1;
    }
  };
  align(ft1o, ht1o, "1/1", "X/1");
  align(ft2o, ht2o, "2/2", "X/2");

  if (sharps) {
    const open1 = n(i.ft1Open);
    if (!isNaN(open1) && (open1 - ft1o) / open1 > 0.04) {
      raw["1/1"] *= 1.15;
      raw["X/1"] *= 0.9;
    }
    if (Math.abs(f1 - f2) < 0.08) {
      raw["X/1"] *= 1.12; raw["X/X"] *= 1.12; raw["X/2"] *= 1.12;
      raw["X/X"] *= 1.1; raw["1/1"] *= 1.05; raw["2/2"] *= 1.05;
      raw["2/1"] *= 0.75; raw["1/2"] *= 0.75;
    }
  }

  const total = OUTCOMES.reduce((s, o) => s + raw[o], 0);
  const rows = OUTCOMES.map((o) => {
    const prob = raw[o] / total;
    const m = n(i.book[o]);
    const market = isNaN(m) ? null : m;
    const value = market ? prob * market - 1 : null;
    return { outcome: o, prob, fair: 1 / prob, market, value, hasValue: Boolean(value && value > 0) };
  });

  const sortedByProb = [...rows].sort((a, b) => b.prob - a.prob);
  const best = sortedByProb[0]!;
  const confScore = Math.round(best.prob * 100);
  const level: ConfidenceLevel = confScore >= 45 ? "VISOKA SIGURNOST" : confScore >= 30 ? "UMJERENA SIGURNOST" : "SPEKULATIVNO (VALUE)";

  const concretePick: ConcreteTip = {
    market: "Poluvrijeme / Kraj",
    pick: best.outcome,
    confidenceScore: confScore,
    confidenceLevel: level,
    fairOdds: best.fair,
    marketOdds: best.market,
    valueEdge: best.value ? best.value * 100 : null,
    reason: `Matematički najizgledniji ishod je ${best.outcome} s ${(best.prob * 100).toFixed(1)}% vjerojatnosti.`,
  };

  return { rows, ftMargin: F.margin, htMargin: H.margin, goalsMargin, concretePick };
}

// 2. BTTS Model
export type BttsResult = {
  probYes: number;
  probNo: number;
  fairYes: number;
  fairNo: number;
  marketYes: number | null;
  marketNo: number | null;
  valueYes: number | null;
  valueNo: number | null;
  concretePick: ConcreteTip;
  explanation: string;
};

export function calculateBtts(i: Inputs, sharps = false): BttsResult | { error: string } {
  const ft1 = n(i.ft1), ftx = n(i.ftx), ft2 = n(i.ft2);
  if (isNaN(ft1) || isNaN(ftx) || isNaN(ft2)) {
    return { error: "Unesite tečajeve za Kraj (FT 1X2)." };
  }

  const F = devig([ft1, ftx, ft2]);
  const [p1, px, p2] = F.p;

  let totalXG = 2.70;
  const o25 = n(i.o25), u25 = n(i.u25);
  if (!isNaN(o25) && !isNaN(u25)) {
    const pOver = devig([o25, u25]).p[0];
    totalXG = Math.max(1.5, Math.min(4.2, 2.5 + (pOver - 0.5) * 2.2));
  }

  const strengthH = p1 + px * 0.45;
  const strengthA = p2 + px * 0.45;
  const sumS = strengthH + strengthA;
  const lH = (strengthH / sumS) * totalXG;
  const lA = (strengthA / sumS) * totalXG;

  const grid = buildMatrix(lH, lA, 4, 4, -0.12);
  let pYes = 0;
  for (let h = 1; h <= 4; h++) {
    for (let a = 1; a <= 4; a++) {
      pYes += grid[h]![a]!;
    }
  }

  if (sharps) {
    const o25s = n(i.o25), byS = n(i.bttsYes);
    if (!isNaN(o25s) && !isNaN(byS) && o25s < 1.65 && byS > 1.9) pYes *= 0.85;
  }
  pYes = Math.max(0.1, Math.min(0.9, pYes));
  const pNo = 1 - pYes;

  const mYes = n(i.bttsYes);
  const mNo = n(i.bttsNo);
  const marketYes = isNaN(mYes) ? null : mYes;
  const marketNo = isNaN(mNo) ? null : mNo;

  const valueYes = marketYes ? pYes * marketYes - 1 : null;
  const valueNo = marketNo ? pNo * marketNo - 1 : null;

  const isYesPick = pYes >= pNo;
  const pick = isYesPick ? "DA (Oba daju)" : "NE (Barem jedan ne daje)";
  const prob = isYesPick ? pYes : pNo;
  const fair = 1 / prob;
  const market = isYesPick ? marketYes : marketNo;
  const edge = isYesPick ? (valueYes ? valueYes * 100 : null) : (valueNo ? valueNo * 100 : null);
  const confScore = Math.round(prob * 100);
  const level: ConfidenceLevel = confScore >= 58 ? "VISOKA SIGURNOST" : "UMJERENA SIGURNOST";

  const concretePick: ConcreteTip = {
    market: "Oba Daju Gol (BTTS)",
    pick,
    confidenceScore: confScore,
    confidenceLevel: level,
    fairOdds: fair,
    marketOdds: market,
    valueEdge: edge,
    reason: isYesPick
      ? `Dixon-Coles matrica (xG: Dom ${lH.toFixed(2)}, Gost ${lA.toFixed(2)}) daje ${(pYes * 100).toFixed(1)}% šanse da obje ekipe postižu pogodak.`
      : `Dixon-Coles matrica daje ${(pNo * 100).toFixed(1)}% vjerojatnosti čiste mreže jedne od ekipa.`,
  };

  return {
    probYes: pYes, probNo: pNo, fairYes: 1 / pYes, fairNo: 1 / pNo,
    marketYes, marketNo, valueYes, valueNo,
    concretePick, explanation: concretePick.reason,
  };
}

// 3. Over/Under 2.5 Model
export type OuResult = {
  probOver: number; probUnder: number; fairOver: number; fairUnder: number;
  marketOver: number | null; marketUnder: number | null;
  valueOver: number | null; valueUnder: number | null;
  concretePick: ConcreteTip; explanation: string;
};

export function calculateOu(i: Inputs): OuResult | { error: string } {
  const o25 = n(i.o25), u25 = n(i.u25);
  let pOver = 0.5, pUnder = 0.5;

  if (!isNaN(o25) && !isNaN(u25)) {
    const dev = devig([o25, u25]);
    pOver = dev.p[0];
    pUnder = dev.p[1];
  } else {
    const ft1 = n(i.ft1), ftx = n(i.ftx), ft2 = n(i.ft2);
    if (isNaN(ft1) || isNaN(ftx) || isNaN(ft2)) {
      return { error: "Unesite Over/Under 2.5 ili 1X2." };
    }
    const px = devig([ft1, ftx, ft2]).p[1];
    pUnder = Math.min(0.75, 0.35 + px * 0.7);
    pOver = 1 - pUnder;
  }

  const marketOver = !isNaN(o25) ? o25 : null;
  const marketUnder = !isNaN(u25) ? u25 : null;
  const valueOver = marketOver ? pOver * marketOver - 1 : null;
  const valueUnder = marketUnder ? pUnder * marketUnder - 1 : null;

  const isOverPick = pOver >= pUnder;
  const pick = isOverPick ? "VIŠE OD 2.5 GOLA" : "MANJE OD 2.5 GOLA";
  const prob = isOverPick ? pOver : pUnder;
  const fair = 1 / prob;
  const market = isOverPick ? marketOver : marketUnder;
  const edge = isOverPick ? (valueOver ? valueOver * 100 : null) : (valueUnder ? valueUnder * 100 : null);
  const confScore = Math.round(prob * 100);
  const level: ConfidenceLevel = confScore >= 58 ? "VISOKA SIGURNOST" : "UMJERENA SIGURNOST";

  const concretePick: ConcreteTip = {
    market: "Zbroj Golova (2.5)",
    pick,
    confidenceScore: confScore,
    confidenceLevel: level,
    fairOdds: fair,
    marketOdds: market,
    valueEdge: edge,
    reason: `Matematička gustoća golova daje ${(prob * 100).toFixed(1)}% šanse za opciju ${pick}.`,
  };

  return {
    probOver: pOver, probUnder: pUnder, fairOver: 1 / pOver, fairUnder: 1 / pUnder,
    marketOver, marketUnder, valueOver, valueUnder, concretePick, explanation: concretePick.reason,
  };
}

// 4. Over/Under 3.5 Model
export type Ou35Result = {
  probOver: number; probUnder: number; fairOver: number; fairUnder: number;
  marketOver: number | null; marketUnder: number | null;
  valueOver: number | null; valueUnder: number | null;
  concretePick: ConcreteTip; explanation: string;
};

export function calculateOu35(i: Inputs): Ou35Result | { error: string } {
  const o35 = n(i.o35), u35 = n(i.u35);
  let pOver = 0.32, pUnder = 0.68;

  if (!isNaN(o35) && !isNaN(u35)) {
    const dev = devig([o35, u35]);
    pOver = dev.p[0];
    pUnder = dev.p[1];
  } else {
    const o25 = n(i.o25);
    if (!isNaN(o25)) {
      const pOver25 = 1 / o25;
      pOver = Math.max(0.12, Math.min(0.65, pOver25 * 0.62));
      pUnder = 1 - pOver;
    }
  }

  const marketOver = !isNaN(o35) ? o35 : null;
  const marketUnder = !isNaN(u35) ? u35 : null;
  const valueOver = marketOver ? pOver * marketOver - 1 : null;
  const valueUnder = marketUnder ? pUnder * marketUnder - 1 : null;

  const isOverPick = pOver >= pUnder;
  const pick = isOverPick ? "VIŠE OD 3.5 GOLA" : "MANJE OD 3.5 GOLA";
  const prob = isOverPick ? pOver : pUnder;
  const fair = 1 / prob;
  const market = isOverPick ? marketOver : marketUnder;
  const edge = isOverPick ? (valueOver ? valueOver * 100 : null) : (valueUnder ? valueUnder * 100 : null);
  const confScore = Math.round(prob * 100);
  const level: ConfidenceLevel = confScore >= 62 ? "VISOKA SIGURNOST" : "UMJERENA SIGURNOST";

  const concretePick: ConcreteTip = {
    market: "Zbroj Golova (3.5)",
    pick,
    confidenceScore: confScore,
    confidenceLevel: level,
    fairOdds: fair,
    marketOdds: market,
    valueEdge: edge,
    reason: `Distribucija golova daje ${(prob * 100).toFixed(1)}% vjerojatnosti za ${pick}.`,
  };

  return {
    probOver: pOver, probUnder: pUnder, fairOver: 1 / pOver, fairUnder: 1 / pUnder,
    marketOver, marketUnder, valueOver, valueUnder, concretePick, explanation: concretePick.reason,
  };
}

// 5. X na Poluvremenu (HT Draw)
export type HtDrawResult = {
  probDraw: number; probNotDraw: number; fairDraw: number; fairNotDraw: number;
  marketDraw: number | null; marketNotDraw: number | null;
  valueDraw: number | null; valueNotDraw: number | null;
  concretePick: ConcreteTip; explanation: string;
};

export function calculateHtDraw(i: Inputs, sharps = false): HtDrawResult | { error: string } {
  const ht1 = n(i.ht1), htx = n(i.htx), ht2 = n(i.ht2);
  let pDraw = 0.43;

  if (!isNaN(ht1) && !isNaN(htx) && !isNaN(ht2)) {
    const H = devig([ht1, htx, ht2]);
    pDraw = H.p[1];
  } else {
    const ft1 = n(i.ft1), ftx = n(i.ftx), ft2 = n(i.ft2);
    if (!isNaN(ft1) && !isNaN(ftx) && !isNaN(ft2)) {
      const F = devig([ft1, ftx, ft2]);
      const px = F.p[1];
      const u25 = n(i.u25);
      const isUnder = !isNaN(u25) && u25 < 1.85;
      pDraw = Math.min(0.55, Math.max(0.35, 0.38 + px * 0.25 + (isUnder ? 0.05 : -0.04)));
    } else {
      return { error: "Unesite tečajeve poluvremena (HT) ili kraja (FT)." };
    }
  }

  if (sharps) {
    const a = n(i.ft1), b = n(i.ftx), c = n(i.ft2);
    if (![a, b, c].some(isNaN)) {
      const fp = devig([a, b, c]).p;
      if (Math.abs(fp[0] - fp[2]) < 0.08) pDraw = Math.min(0.75, pDraw * 1.12);
    }
  }
  const pNotDraw = 1 - pDraw;
  const marketDraw = !isNaN(htx) ? htx : null;
  let marketNotDraw: number | null = null;
  if (!isNaN(ht1) && !isNaN(ht2)) {
    marketNotDraw = 1 / (1 / ht1 + 1 / ht2);
  }

  const valueDraw = marketDraw ? pDraw * marketDraw - 1 : null;
  const valueNotDraw = marketNotDraw ? pNotDraw * marketNotDraw - 1 : null;

  const isDrawPick = pDraw >= pNotDraw;
  const pick = isDrawPick ? "DA (Neriješeno na poluvremenu)" : "NE (Barem jedna ekipa vodi)";
  const prob = isDrawPick ? pDraw : pNotDraw;
  const fair = 1 / prob;
  const market = isDrawPick ? marketDraw : marketNotDraw;
  const edge = isDrawPick ? (valueDraw ? valueDraw * 100 : null) : (valueNotDraw ? valueNotDraw * 100 : null);
  const confScore = Math.round(prob * 100);
  const level: ConfidenceLevel = (isDrawPick && confScore >= 45) || confScore >= 58 ? "VISOKA SIGURNOST" : "UMJERENA SIGURNOST";

  const concretePick: ConcreteTip = {
    market: "X na Poluvremenu",
    pick,
    confidenceScore: confScore,
    confidenceLevel: level,
    fairOdds: fair,
    marketOdds: market,
    valueEdge: edge,
    reason: isDrawPick
      ? `HT model projicira ${(pDraw * 100).toFixed(1)}% vjerojatnosti neriješenog ishoda na odmoru (44% vremenska distribucija golova).`
      : `Ofenzivna asimetrija sugerira rano vodstvo jedne od ekipa (${(pNotDraw * 100).toFixed(1)}%).`,
  };

  return {
    probDraw: pDraw, probNotDraw: pNotDraw, fairDraw: 1 / pDraw, fairNotDraw: 1 / pNotDraw,
    marketDraw, marketNotDraw, valueDraw, valueNotDraw, concretePick, explanation: concretePick.reason,
  };
}

// 6. Točan Rezultat s Dixon-Coles Bivariate matricom i 3.5 Tail-End korekcijom
export type ScoreCell = {
  home: number; away: number; score: string; prob: number; fair: number;
  market: number | null; value: number | null; hasValue: boolean;
};

export type CorrectScoreResult = {
  matrix: ScoreCell[][];
  allScores: ScoreCell[];
  top3: ScoreCell[];
  bestScore: ScoreCell;
  concretePick: ConcreteTip;
  lambdaHome: number;
  lambdaAway: number;
  totalXG: number;
  explanation: string;
};

export function calculateCorrectScore(i: Inputs, sharps = false): CorrectScoreResult | { error: string } {
  const ft1 = n(i.ft1), ftx = n(i.ftx), ft2 = n(i.ft2);
  if (isNaN(ft1) || isNaN(ftx) || isNaN(ft2)) {
    return { error: "Unesite tečajeve 1X2 za izračun točnog rezultata." };
  }

  const F = devig([ft1, ftx, ft2]);
  const [p1, px, p2] = F.p;

  let totalXG = 2.70;
  const o25 = n(i.o25), u25 = n(i.u25);
  if (!isNaN(o25) && !isNaN(u25)) {
    const pOver25 = devig([o25, u25]).p[0];
    totalXG = 2.5 + (pOver25 - 0.5) * 2.2;
  }
  const o15 = n(i.o15), u15 = n(i.u15);
  if (!isNaN(o15) && !isNaN(u15)) {
    const pOver15 = devig([o15, u15]).p[0];
    if (pOver15 > 0.8) totalXG += 0.2;
  }
  const o35 = n(i.o35), u35 = n(i.u35);
  let pOver35 = 0.32;
  if (!isNaN(o35) && !isNaN(u35)) {
    pOver35 = devig([o35, u35]).p[0];
    if (pOver35 > 0.45) totalXG += 0.3;
  }
  totalXG = Math.max(1.4, Math.min(4.4, totalXG));

  const strengthH = p1 + px * 0.45;
  const strengthA = p2 + px * 0.45;
  const sumS = strengthH + strengthA;
  const lH = (strengthH / sumS) * totalXG;
  const lA = (strengthA / sumS) * totalXG;

  const rawGrid = buildMatrix(lH, lA, 4, 4, -0.12);

  const get = (h: number, a: number) => rawGrid[h]?.[a] ?? 0;
  const mul = (h: number, a: number, f: number) => {
    const r = rawGrid[h];
    if (r && r[a] !== undefined) r[a] *= f;
  };

  const bYes = n(i.bttsYes), bNo = n(i.bttsNo);
  let pBttsYes = 0.5;
  if (!isNaN(bYes) && !isNaN(bNo)) {
    pBttsYes = devig([bYes, bNo]).p[0];
  } else {
    pBttsYes = (1 - Math.exp(-lH)) * (1 - Math.exp(-lA));
  }

  if (pBttsYes > 0.58) {
    const penalty = Math.max(0.65, 1 - (pBttsYes - 0.5) * 0.7);
    for (let h = 0; h <= 4; h++) {
      for (let a = 0; a <= 4; a++) {
        if (h === 0 || a === 0) mul(h, a, penalty);
        else mul(h, a, 1.12);
      }
    }
  }

  const isHighScoring = pOver35 > 0.50 || (!isNaN(o35) && o35 < 2.00);
  if (isHighScoring) {
    const highScoringPairs: [number, number][] = [[2, 2], [3, 1], [1, 3], [3, 2], [2, 3]];
    for (const [h, a] of highScoringPairs) mul(h, a, 1.20);
  }

  const isDerby = sharps && Math.abs(p1 - p2) < 0.08;
  const isBlowout = sharps && !isNaN(o25) && o25 < 1.65 && !isNaN(bYes) && bYes > 1.9;
  if (isBlowout) {
    const homeFav = p1 >= p2;
    for (let h = 0; h <= 4; h++) for (let a = 0; a <= 4; a++) if (h > 0 && a > 0) mul(h, a, 0.85);
    const cells: [number, number][] = homeFav ? [[3, 0], [4, 0]] : [[0, 3], [0, 4]];
    for (const [h, a] of cells) mul(h, a, 1.6);
  }
  if (isDerby) {
    for (let h = 0; h <= 4; h++) for (let a = 0; a <= 4; a++) if (h + a >= 3) mul(h, a, 0.6);
    for (const [h, a] of [[0, 0], [1, 1], [1, 0], [0, 1]] as [number, number][]) mul(h, a, 1.25);
  }

  let sumGrid = 0;
  for (let h = 0; h <= 4; h++) for (let a = 0; a <= 4; a++) sumGrid += get(h, a);

  const matrix: ScoreCell[][] = [];
  const allScores: ScoreCell[] = [];

  for (let h = 0; h <= 4; h++) {
    const row: ScoreCell[] = [];
    matrix[h] = row;
    for (let a = 0; a <= 4; a++) {
      const prob = get(h, a) / sumGrid;
      const scoreKey = `${h}:${a}`;
      const mOdds = n(i.bookScores[scoreKey] ?? "");
      const market = isNaN(mOdds) ? null : mOdds;
      const value = market ? prob * market - 1 : null;
      const cell: ScoreCell = {
        home: h, away: a, score: scoreKey, prob, fair: 1 / prob,
        market, value, hasValue: Boolean(value && value > 0),
      };
      row[a] = cell;
      allScores.push(cell);
    }
  }

  allScores.sort((a, b) => b.prob - a.prob);
  const top3 = allScores.slice(0, 3);

  const realisticCandidates = allScores.filter((s) => TOP_SCORES.includes(s.score as TopScore));
  let filtered = [...realisticCandidates];

  if (p1 > 0.52) {
    const homeWins = filtered.filter((s) => s.home > s.away);
    if (homeWins.length > 0) filtered = homeWins;
  } else if (p2 > 0.52) {
    const awayWins = filtered.filter((s) => s.away > s.home);
    if (awayWins.length > 0) filtered = awayWins;
  } else if (px > 0.33) {
    const draws = filtered.filter((s) => s.home === s.away);
    if (draws.length > 0) filtered = draws;
  }

  if (!isNaN(u25) && u25 < 1.70) {
    const underScores = filtered.filter((s) => s.home + s.away <= 2);
    if (underScores.length > 0) filtered = underScores;
  } else if (!isNaN(o25) && o25 < 1.65) {
    const overScores = filtered.filter((s) => s.home + s.away >= 3);
    if (overScores.length > 0) filtered = overScores;
  }

  if (isDerby) {
    const lock = realisticCandidates.filter((s) => ["0:0", "1:1", "1:0", "0:1"].includes(s.score));
    if (lock.length) filtered = lock;
  } else if (isBlowout) {
    const bl = allScores.filter((s) => (p1 >= p2 ? ["3:0", "4:0", "2:0"] : ["0:3", "0:4", "0:2"]).includes(s.score));
    if (bl.length) filtered = bl;
  }
  filtered.sort((a, b) => b.prob - a.prob);
  const bestScore = (filtered[0] || realisticCandidates[0] || allScores[0])!;
  const confScore = Math.round(bestScore.prob * 100);

  const concretePick: ConcreteTip = {
    market: "Točan Rezultat",
    pick: `Rezultat ${bestScore.score}`,
    confidenceScore: confScore,
    confidenceLevel: confScore >= 16 ? "VISOKA SIGURNOST" : "UMJERENA SIGURNOST",
    fairOdds: bestScore.fair,
    marketOdds: bestScore.market,
    valueEdge: bestScore.value ? bestScore.value * 100 : null,
    reason: `Dixon-Coles Bivariate model izdvaja ${bestScore.score} kao najvjerodostojniji ishod (${(bestScore.prob * 100).toFixed(1)}%, fer tečaj ${bestScore.fair.toFixed(2)}).`,
  };

  const exp = `Dixon-Coles model projicira xG: Domaćin ${lH.toFixed(2)}, Gost ${lA.toFixed(2)} (Ukupno ${totalXG.toFixed(2)}). Najvjerojatniji ishod je ${bestScore.score}.`;

  return {
    matrix, allScores, top3, bestScore, concretePick,
    lambdaHome: lH, lambdaAway: lA, totalXG, explanation: exp,
  };
}

// 7. 1.5 Goals Predictor
export type Ou15Result = {
  probOver: number; probUnder: number; fairOver: number; fairUnder: number;
  marketOver: number | null; marketUnder: number | null;
  valueOver: number | null; valueUnder: number | null;
  isOver: boolean; confidence: number;
  csOdds: { "0:0": number | null; "1:0": number | null; "0:1": number | null };
  lowSum: number; ruleMet: boolean; lowOddsShift: boolean; sharpsBuffer: boolean;
  breakdown: string;
};

export function calculateOu15(i: Inputs, sharps = false): Ou15Result | { error: string } {
  const o15 = n(i.o15), u15 = n(i.u15);
  const ft1 = n(i.ft1), ftx = n(i.ftx), ft2 = n(i.ft2);
  let pOver: number;
  if (!isNaN(o15) && !isNaN(u15)) pOver = devig([o15, u15]).p[0] ?? 0.75;
  else if (!isNaN(n(i.o25)) && !isNaN(n(i.u25))) pOver = Math.min(0.92, (devig([n(i.o25), n(i.u25)]).p[0] ?? 0.5) * 0.6 + 0.42);
  else if (![ft1, ftx, ft2].some(isNaN)) pOver = 0.74;
  else return { error: "Unesite Over/Under 1.5 ili 2.5 tečajeve." };

  const keys = ["0:0", "1:0", "0:1"] as const;
  const odds = keys.map((k) => n(i.bookScores[k] ?? ""));
  const csOdds = { "0:0": isNaN(odds[0]!) ? null : odds[0]!, "1:0": isNaN(odds[1]!) ? null : odds[1]!, "0:1": isNaN(odds[2]!) ? null : odds[2]! };

  let lowSum = 0;
  const cs = calculateCorrectScore(i, sharps);
  if (!("error" in cs)) {
    lowSum = cs.allScores.filter((c) => (keys as readonly string[]).includes(c.score)).reduce((a, c) => a + c.prob, 0);
  } else {
    lowSum = odds.reduce((a, o) => a + (isNaN(o) ? 0 : 1 / o), 0) / 1.15;
  }

  const highCount = odds.filter((o) => !isNaN(o) && o >= 10).length;
  const lowCount = odds.filter((o) => !isNaN(o) && o < 7.5).length;
  const ruleMet = highCount >= 2 && lowSum < 0.25;
  if (ruleMet) pOver *= 1.15;
  let pUnder = 1 - Math.min(0.97, pOver);
  const lowOddsShift = lowCount > 0;
  if (lowOddsShift) pUnder *= 1 + 0.25 * lowCount;

  let sharpsBuffer = false;
  if (sharps && ![ft1, ftx, ft2].some(isNaN)) {
    const fp = devig([ft1, ftx, ft2]).p;
    if (Math.abs((fp[0] ?? 0) - (fp[2] ?? 0)) < 0.08) { pUnder *= 1.05; sharpsBuffer = true; }
  }
  const tot = Math.min(0.97, pOver) + pUnder;
  const pO = Math.min(0.97, pOver) / tot, pU = pUnder / tot;

  const mO = isNaN(o15) ? null : o15, mU = isNaN(u15) ? null : u15;
  const isOver = pO >= pU;
  const f = (x: number | null) => (x ? x.toFixed(2) : "—");
  return {
    probOver: pO, probUnder: pU, fairOver: 1 / pO, fairUnder: 1 / pU,
    marketOver: mO, marketUnder: mU,
    valueOver: mO ? pO * mO - 1 : null, valueUnder: mU ? pU * mU - 1 : null,
    isOver, confidence: Math.round((isOver ? pO : pU) * 100),
    csOdds, lowSum, ruleMet, lowOddsShift, sharpsBuffer,
    breakdown: `Correct Score Trigger: [0:0 Odds: ${f(csOdds["0:0"])} | 1:0 Odds: ${f(csOdds["1:0"])} | 0:1 Odds: ${f(csOdds["0:1"])}] -> ${ruleMet ? "Ispunjeno" : "Nije ispunjeno"} (Σ niskih = ${(lowSum * 100).toFixed(1)}%)`,
  };
}

// 8. Dutching kalkulator
export function dutch(stake: number, oddsA: number, oddsB: number) {
  const inv = 1 / oddsA + 1 / oddsB;
  const sA = (stake / oddsA) / inv, sB = (stake / oddsB) / inv;
  const ret = stake / inv;
  return { sA, sB, profit: ret - stake, roi: (ret - stake) / stake };
}

