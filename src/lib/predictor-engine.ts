export const OUTCOMES = ["1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const TOP_SCORES = [
  "1:0",
  "2:0",
  "2:1",
  "3:0",
  "3:1",
  "3:2",
  "0:0",
  "1:1",
  "2:2",
  "0:1",
  "0:2",
  "1:2",
  "0:3",
  "1:3",
  "2:3",
] as const;
export type TopScore = (typeof TOP_SCORES)[number];

export type Inputs = {
  ft1: string;
  ftx: string;
  ft2: string;
  ht1: string;
  htx: string;
  ht2: string;
  o25: string;
  u25: string;
  hto05: string;
  htu05: string;
  o15: string;
  u15: string;
  o35: string;
  u35: string;
  bttsYes: string;
  bttsNo: string;
  ft1Open: string;
  book: Record<Outcome, string>;
  bookScores: Record<string, string>;
};

export const emptyInputs = (): Inputs => ({
  ft1: "",
  ftx: "",
  ft2: "",
  ht1: "",
  htx: "",
  ht2: "",
  o25: "",
  u25: "",
  hto05: "",
  htu05: "",
  o15: "",
  u15: "",
  o35: "",
  u35: "",
  bttsYes: "",
  bttsNo: "",
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

  // POPRAVAK: Power de-vig eksponent mora obuhvatiti i visoke kvote i kvote blizu 1.
  let low = 0,
    high = 1,
    k = 1;
  while (odds.reduce((acc, o) => acc + Math.pow(1 / o, high), 0) > 1 && high < 128) high *= 2;
  for (let iter = 0; iter < 48; iter++) {
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

export type Row = {
  outcome: Outcome;
  prob: number;
  fair: number;
  market: number | null;
  value: number | null;
  hasValue: boolean;
};
export type Result = {
  rows: Row[];
  ftMargin: number;
  htMargin: number;
  goalsMargin: number | null;
  concretePick: ConcreteTip;
};

// ═══════════════════════════════════════════════════════════════════════════
// JEDINSTVENI MODEL — sve kartice čitaju iz JEDNE matrice rezultata.
// λ domaćina/gosta fitaju se na SVE unesene kvote (1X2, O/U 1.5/2.5/3.5, GG/NG,
// niske točne rezultate), a udio golova u 1. poluvremenu na HT 1X2 i HT O/U 0.5.
// Zato se kartice više ne mogu međusobno proturječiti (npr. Under 1.5 + Over 2.5).
// ═══════════════════════════════════════════════════════════════════════════

const MAXG = 10;
const FACT = (() => {
  const f = [1];
  for (let k = 1; k <= 25; k++) f[k] = f[k - 1]! * k;
  return f;
})();
// POPRAVAK: Nevažeći λ ili broj golova ne smije proslijediti NaN u matricu rezultata.
const poisson = (k: number, l: number) =>
  !Number.isInteger(k) || k < 0 || !Number.isFinite(l) || l < 0
    ? 0
    : (Math.exp(-l) * l ** k) / FACT[k]!;

function dcTau(h: number, a: number, lH: number, lA: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lH * lA * rho;
  if (h === 0 && a === 1) return 1 + lH * rho;
  if (h === 1 && a === 0) return 1 + lA * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

/** Dixon-Coles matrica 0..10 × 0..10, normalizirana na 1. */
export function scoreMatrix(lH: number, lA: number, rho = -0.06, dc = true): number[][] {
  const g: number[][] = [];
  let s = 0;
  for (let h = 0; h <= MAXG; h++) {
    const row: number[] = [];
    for (let a = 0; a <= MAXG; a++) {
      const p = Math.max(0, poisson(h, lH) * poisson(a, lA) * (dc ? dcTau(h, a, lH, lA, rho) : 1));
      row.push(p);
      s += p;
    }
    g.push(row);
  }
  // POPRAVAK: Degenerirana matrica ne smije se dijeliti s nulom i širiti NaN.
  for (const r of g) for (let a = 0; a <= MAXG; a++) r[a]! /= s || 1;
  return g;
}

const msum = (m: number[][], f: (h: number, a: number) => boolean) => {
  let s = 0;
  for (let h = 0; h < m.length; h++)
    for (let a = 0; a < m[h]!.length; a++) if (f(h, a)) s += m[h]![a]!;
  return s;
};

type Target = { f: (m: number[][]) => number; p: number; w: number };

export type Model = {
  lh: number;
  la: number;
  htShare: number;
  rho: number;
  M: number[][];
  H1: number[][];
  H2: number[][];
  p1: number;
  px: number;
  p2: number;
  ht1: number;
  htx: number;
  ht2: number;
  fitError: number;
  balanced: boolean;
  usedLowScores: boolean;
};

function two(o: number, u: number): number | null {
  if (isNaN(o) || isNaN(u)) return null;
  return devig([o, u]).p[0] ?? null;
}

function fit(targets: Target[], rho: number) {
  // blagi prior (prosjek europskih liga) samo da λ bude jednoznačan kad je malo kvota
  const loss = (lh: number, la: number) => {
    const m = scoreMatrix(lh, la, rho);
    let e = 0.004 * ((lh - 1.45) ** 2 + (la - 1.15) ** 2);
    for (const t of targets) e += t.w * (t.f(m) - t.p) ** 2;
    return e;
  };
  let best = { lh: 1.45, la: 1.15, e: loss(1.45, 1.15) };
  for (let lh = 0.2; lh <= 4.4; lh += 0.15)
    for (let la = 0.2; la <= 4.4; la += 0.15) {
      const e = loss(lh, la);
      if (e < best.e) best = { lh, la, e };
    }
  for (let step = 0.06; step >= 0.004; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dh, da] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
        [step, step],
        [-step, -step],
        [step, -step],
        [-step, step],
      ] as const) {
        const lh = best.lh + dh,
          la = best.la + da;
        if (lh < 0.08 || la < 0.08) continue;
        const e = loss(lh, la);
        if (e < best.e) {
          best = { lh, la, e };
          moved = true;
        }
      }
    }
  }
  const wsum = targets.reduce((s, t) => s + t.w, 0) || 1;
  return { lh: best.lh, la: best.la, err: Math.sqrt(best.e / wsum) };
}

const cache = new Map<string, Model | null>();

/** Gradi (i pamti) jedinstveni model iz unesenih kvota. null = premalo podataka. */
export function buildModel(i: Inputs, sharps = false): Model | null {
  const key = JSON.stringify([i, sharps]);
  if (cache.has(key)) return cache.get(key)!;

  const t: Target[] = [];
  const ft = [n(i.ft1), n(i.ftx), n(i.ft2)];
  let balanced = false;
  if (!ft.some(isNaN)) {
    const [a, b, c] = devig(ft).p as [number, number, number];
    balanced = Math.abs(a - c) < 0.08;
    t.push({ f: (m) => msum(m, (h, x) => h > x), p: a, w: 3 });
    t.push({ f: (m) => msum(m, (h, x) => h === x), p: b, w: 2.5 });
    t.push({ f: (m) => msum(m, (h, x) => h < x), p: c, w: 3 });
  }
  const lines: [string, string, number, number][] = [
    [i.o15, i.u15, 1.5, 1.5],
    [i.o25, i.u25, 2.5, 3],
    [i.o35, i.u35, 3.5, 1.5],
  ];
  for (const [o, u, L, w] of lines) {
    const p = two(n(o), n(u));
    if (p !== null) t.push({ f: (m) => msum(m, (h, a) => h + a > L), p, w });
  }
  const pb = two(n(i.bttsYes), n(i.bttsNo));
  if (pb !== null) t.push({ f: (m) => msum(m, (h, a) => h > 0 && a > 0), p: pb, w: 2 });

  // niski točni rezultati (jednostrane kvote, tipična marža ~18%) — slab signal
  let usedLowScores = false;
  for (const s of ["0:0", "1:0", "0:1", "1:1"]) {
    const o = n(i.bookScores[s] ?? "");
    if (isNaN(o)) continue;
    const [h, a] = s.split(":").map(Number) as [number, number];
    t.push({ f: (m) => m[h]![a]!, p: 1 / o / 1.18, w: 0.6 });
    usedLowScores = true;
  }

  if (t.length === 0) {
    cache.set(key, null);
    return null;
  }

  // Sharps: izjednačene utakmice imaju više neriješenih niskih rezultata (jači DC ρ)
  const rho = sharps && balanced ? -0.1 : -0.06;
  const { lh, la, err } = fit(t, rho);
  const M = scoreMatrix(lh, la, rho);

  // udio golova u 1. poluvremenu (kalibriran na HT 1X2 i HT O/U 0.5)
  const ht = [n(i.ht1), n(i.htx), n(i.ht2)];
  const ht05 = two(n(i.hto05), n(i.htu05));
  const htT: Target[] = [];
  if (!ht.some(isNaN)) {
    const [a, b, c] = devig(ht).p as [number, number, number];
    htT.push({ f: (m) => msum(m, (h, x) => h > x), p: a, w: 2 });
    htT.push({ f: (m) => msum(m, (h, x) => h === x), p: b, w: 3 });
    htT.push({ f: (m) => msum(m, (h, x) => h < x), p: c, w: 2 });
  }
  if (ht05 !== null) htT.push({ f: (m) => 1 - m[0]![0]!, p: ht05, w: 3 });
  let htShare = 0.445;
  if (htT.length) {
    let bestE = Infinity;
    for (let s = 0.34; s <= 0.54; s += 0.0025) {
      const m = scoreMatrix(lh * s, la * s, rho * 0.5);
      const e =
        htT.reduce((acc, x) => acc + x.w * (x.f(m) - x.p) ** 2, 0) + 0.02 * (s - 0.445) ** 2;
      if (e < bestE) {
        bestE = e;
        htShare = s;
      }
    }
  }
  const H1 = scoreMatrix(lh * htShare, la * htShare, rho * 0.5);
  const H2 = scoreMatrix(lh * (1 - htShare), la * (1 - htShare), 0, false);

  const model: Model = {
    lh,
    la,
    htShare,
    rho,
    M,
    H1,
    H2,
    p1: msum(M, (h, a) => h > a),
    px: msum(M, (h, a) => h === a),
    p2: msum(M, (h, a) => h < a),
    ht1: msum(H1, (h, a) => h > a),
    htx: msum(H1, (h, a) => h === a),
    ht2: msum(H1, (h, a) => h < a),
    fitError: err,
    balanced,
    usedLowScores,
  };
  if (cache.size > 50) cache.clear();
  cache.set(key, model);
  return model;
}

const ftSign = (h: number, a: number) => (h > a ? "1" : h === a ? "X" : "2");

/** Vjerojatnosti svih 9 HT/FT ishoda iz konvolucije 1. i 2. poluvremena. */
export function htftProbs(m: Model): Record<Outcome, number> {
  const out = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  // POPRAVAK: Uzimamo sve redove matrica poluvremena umjesto rezanja golova nakon 7.
  for (let a = 0; a < m.H1.length; a++)
    for (let b = 0; b < m.H1[a]!.length; b++) {
      const p1 = m.H1[a]![b]!;
      if (p1 < 1e-9) continue;
      for (let c = 0; c < m.H2.length; c++)
        for (let d = 0; d < m.H2[c]!.length; d++) {
          const k = `${ftSign(a, b)}/${ftSign(a + c, b + d)}` as Outcome;
          out[k] += p1 * m.H2[c]![d]!;
        }
    }
  const s = OUTCOMES.reduce((x, o) => x + out[o], 0);
  // POPRAVAK: Za praznu/degeneriranu matricu izbjegavamo dijeljenje s nulom.
  for (const o of OUTCOMES) out[o] /= s || 1;
  return out;
}

const level = (p: number, hi: number, mid: number): ConfidenceLevel =>
  p >= hi ? "VISOKA SIGURNOST" : p >= mid ? "UMJERENA SIGURNOST" : "SPEKULATIVNO (VALUE)";

const NEED = "Unesite barem tečajeve 1X2 (Kraj) ili Over/Under — model nema podataka.";

// 1. HT/FT Model (9 ishoda)
export function calculate(i: Inputs, sharps = false): Result | { error: string } {
  const ft = [n(i.ft1), n(i.ftx), n(i.ft2)];
  if (ft.some(isNaN)) return { error: "Unesite tečajeve za Kraj (FT 1X2) > 1.00." };
  const m = buildModel(i, sharps);
  if (!m) return { error: NEED };
  const ht = [n(i.ht1), n(i.htx), n(i.ht2)];
  const ftMargin = devig(ft).margin;
  const htMargin = ht.some(isNaN) ? 0 : devig(ht).margin;
  const o25 = n(i.o25),
    u25 = n(i.u25);
  const goalsMargin = !isNaN(o25) && !isNaN(u25) ? devig([o25, u25]).margin : null;

  const probs = htftProbs(m);
  const rows: Row[] = OUTCOMES.map((o) => {
    const prob = probs[o];
    const mk = n(i.book[o]);
    const market = isNaN(mk) ? null : mk;
    const value = market ? prob * market - 1 : null;
    return {
      outcome: o,
      prob,
      fair: 1 / prob,
      market,
      value,
      hasValue: Boolean(value && value > 0),
    };
  });

  // Dosljedan tip: HT dio prati najvjerojatniji ishod poluvremena, FT dio najvjerojatniji
  // konačni ishod (kad su dovoljno jasni) — tako se ne kosi s karticama 1X2 i "X na poluvremenu".
  const ftBest = (
    [
      ["1", m.p1],
      ["X", m.px],
      ["2", m.p2],
    ] as const
  ).reduce((a, b) => (b[1] > a[1] ? b : a));
  const htBest = (
    [
      ["1", m.ht1],
      ["X", m.htx],
      ["2", m.ht2],
    ] as const
  ).reduce((a, b) => (b[1] > a[1] ? b : a));
  let cand = rows;
  if (ftBest[1] >= 0.45) cand = cand.filter((r) => r.outcome.endsWith(ftBest[0]));
  if (htBest[1] >= 0.42) {
    const c2 = cand.filter((r) => r.outcome.startsWith(htBest[0]));
    if (c2.length) cand = c2;
  }
  const best = [...(cand.length ? cand : rows)].sort((a, b) => b.prob - a.prob)[0]!;
  const conf = Math.round(best.prob * 100);

  const concretePick: ConcreteTip = {
    market: "Poluvrijeme / Kraj",
    pick: best.outcome,
    confidenceScore: conf,
    confidenceLevel: level(conf, 45, 30),
    fairOdds: best.fair,
    marketOdds: best.market,
    valueEdge: best.value !== null ? best.value * 100 : null,
    reason: `Iz istog modela (xG ${m.lh.toFixed(2)}–${m.la.toFixed(2)}, ${Math.round(m.htShare * 100)}% golova u 1. pol.) ishod ${best.outcome} ima ${(best.prob * 100).toFixed(1)}% — usklađeno s tipom 1X2 i poluvremena.`,
  };
  return { rows, ftMargin, htMargin, goalsMargin, concretePick };
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
  const m = buildModel(i, sharps);
  if (!m) return { error: NEED };
  const pYes = msum(m.M, (h, a) => h > 0 && a > 0);
  const pNo = 1 - pYes;
  const mYes = n(i.bttsYes),
    mNo = n(i.bttsNo);
  const marketYes = isNaN(mYes) ? null : mYes;
  const marketNo = isNaN(mNo) ? null : mNo;
  const valueYes = marketYes ? pYes * marketYes - 1 : null;
  const valueNo = marketNo ? pNo * marketNo - 1 : null;

  const yes = pYes >= pNo;
  const prob = yes ? pYes : pNo;
  const conf = Math.round(prob * 100);
  const edge = yes ? valueYes : valueNo;
  const concretePick: ConcreteTip = {
    market: "Oba Daju Gol (BTTS)",
    pick: yes ? "DA (Oba daju)" : "NE (Barem jedan ne daje)",
    confidenceScore: conf,
    confidenceLevel: level(conf, 58, 50),
    fairOdds: 1 / prob,
    marketOdds: yes ? marketYes : marketNo,
    valueEdge: edge !== null ? edge * 100 : null,
    reason: yes
      ? `Dixon-Coles matrica (xG: Dom ${m.lh.toFixed(2)}, Gost ${m.la.toFixed(2)}) daje ${(pYes * 100).toFixed(1)}% da obje ekipe zabiju.`
      : `Dixon-Coles matrica (xG: Dom ${m.lh.toFixed(2)}, Gost ${m.la.toFixed(2)}) daje ${(pNo * 100).toFixed(1)}% da barem jedna ekipa ne zabije.`,
  };
  return {
    probYes: pYes,
    probNo: pNo,
    fairYes: 1 / pYes,
    fairNo: 1 / pNo,
    marketYes,
    marketNo,
    valueYes,
    valueNo,
    concretePick,
    explanation: concretePick.reason,
  };
}

// 3. Over/Under (zajednička logika za 1.5 / 2.5 / 3.5)
export type OuResult = {
  probOver: number;
  probUnder: number;
  fairOver: number;
  fairUnder: number;
  marketOver: number | null;
  marketUnder: number | null;
  valueOver: number | null;
  valueUnder: number | null;
  concretePick: ConcreteTip;
  explanation: string;
};
export type Ou35Result = OuResult;

function ouLine(
  i: Inputs,
  L: 2.5 | 3.5,
  oS: string,
  uS: string,
  sharps: boolean,
  hi: number,
): OuResult | { error: string } {
  const m = buildModel(i, sharps);
  if (!m) return { error: NEED };
  const pOver = msum(m.M, (h, a) => h + a > L);
  const pUnder = 1 - pOver;
  const o = n(oS),
    u = n(uS);
  const marketOver = isNaN(o) ? null : o;
  const marketUnder = isNaN(u) ? null : u;
  const valueOver = marketOver ? pOver * marketOver - 1 : null;
  const valueUnder = marketUnder ? pUnder * marketUnder - 1 : null;
  const over = pOver >= pUnder;
  const prob = over ? pOver : pUnder;
  const conf = Math.round(prob * 100);
  const pick = over ? `VIŠE OD ${L} GOLA` : `MANJE OD ${L} GOLA`;
  const edge = over ? valueOver : valueUnder;
  const concretePick: ConcreteTip = {
    market: `Zbroj Golova (${L})`,
    pick,
    confidenceScore: conf,
    confidenceLevel: level(conf, hi, 50),
    fairOdds: 1 / prob,
    marketOdds: over ? marketOver : marketUnder,
    valueEdge: edge !== null ? edge * 100 : null,
    reason: `Očekivano ${(m.lh + m.la).toFixed(2)} gola (Dom ${m.lh.toFixed(2)} + Gost ${m.la.toFixed(2)}) → ${(prob * 100).toFixed(1)}% za ${pick}.`,
  };
  return {
    probOver: pOver,
    probUnder: pUnder,
    fairOver: 1 / pOver,
    fairUnder: 1 / pUnder,
    marketOver,
    marketUnder,
    valueOver,
    valueUnder,
    concretePick,
    explanation: concretePick.reason,
  };
}

export function calculateOu(i: Inputs, sharps = false): OuResult | { error: string } {
  return ouLine(i, 2.5, i.o25, i.u25, sharps, 58);
}

export function calculateOu35(i: Inputs, sharps = false): Ou35Result | { error: string } {
  return ouLine(i, 3.5, i.o35, i.u35, sharps, 62);
}

// 5. X na Poluvremenu (HT Draw)
export type HtDrawResult = {
  probDraw: number;
  probNotDraw: number;
  fairDraw: number;
  fairNotDraw: number;
  marketDraw: number | null;
  marketNotDraw: number | null;
  valueDraw: number | null;
  valueNotDraw: number | null;
  concretePick: ConcreteTip;
  explanation: string;
};

export function calculateHtDraw(i: Inputs, sharps = false): HtDrawResult | { error: string } {
  const m = buildModel(i, sharps);
  if (!m) return { error: "Unesite tečajeve poluvremena (HT) ili kraja (FT)." };
  const pDraw = m.htx;
  const pNotDraw = 1 - pDraw;
  const ht1 = n(i.ht1),
    htx = n(i.htx),
    ht2 = n(i.ht2);
  const marketDraw = isNaN(htx) ? null : htx;
  const marketNotDraw = !isNaN(ht1) && !isNaN(ht2) ? 1 / (1 / ht1 + 1 / ht2) : null;
  const valueDraw = marketDraw ? pDraw * marketDraw - 1 : null;
  const valueNotDraw = marketNotDraw ? pNotDraw * marketNotDraw - 1 : null;

  const draw = pDraw >= pNotDraw;
  const prob = draw ? pDraw : pNotDraw;
  const conf = Math.round(prob * 100);
  const edge = draw ? valueDraw : valueNotDraw;
  const concretePick: ConcreteTip = {
    market: "X na Poluvremenu",
    pick: draw ? "DA (Neriješeno na poluvremenu)" : "NE (Barem jedna ekipa vodi)",
    confidenceScore: conf,
    confidenceLevel: level(conf, 58, 50),
    fairOdds: 1 / prob,
    marketOdds: draw ? marketDraw : marketNotDraw,
    valueEdge: edge !== null ? edge * 100 : null,
    reason: `Očekivano ${((m.lh + m.la) * m.htShare).toFixed(2)} gola do odmora (${Math.round(m.htShare * 100)}% ukupnih) → X na poluvremenu ${(pDraw * 100).toFixed(1)}%.`,
  };
  return {
    probDraw: pDraw,
    probNotDraw: pNotDraw,
    fairDraw: 1 / pDraw,
    fairNotDraw: 1 / pNotDraw,
    marketDraw,
    marketNotDraw,
    valueDraw,
    valueNotDraw,
    concretePick,
    explanation: concretePick.reason,
  };
}

// 6. Točan rezultat
export type ScoreCell = {
  home: number;
  away: number;
  score: string;
  prob: number;
  fair: number;
  market: number | null;
  value: number | null;
  hasValue: boolean;
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

export function calculateCorrectScore(
  i: Inputs,
  sharps = false,
): CorrectScoreResult | { error: string } {
  const m = buildModel(i, sharps);
  if (!m) return { error: "Unesite tečajeve 1X2 za izračun točnog rezultata." };

  const matrix: ScoreCell[][] = [];
  const allScores: ScoreCell[] = [];
  for (let h = 0; h <= 4; h++) {
    const row: ScoreCell[] = [];
    for (let a = 0; a <= 4; a++) {
      const prob = m.M[h]![a]!;
      const score = `${h}:${a}`;
      const o = n(i.bookScores[score] ?? "");
      const market = isNaN(o) ? null : o;
      const value = market ? prob * market - 1 : null;
      const cell: ScoreCell = {
        home: h,
        away: a,
        score,
        prob,
        fair: 1 / prob,
        market,
        value,
        hasValue: Boolean(value && value > 0),
      };
      row.push(cell);
      allScores.push(cell);
    }
    matrix.push(row);
  }
  allScores.sort((a, b) => b.prob - a.prob);
  const top3 = allScores.slice(0, 3);

  // Dosljedan rezultat: mora se slagati s jasnim tipovima ostalih kartica (1X2, 2.5, GG).
  const pO25 = msum(m.M, (h, a) => h + a > 2.5);
  const pGG = msum(m.M, (h, a) => h > 0 && a > 0);
  const ftBest = (
    [
      ["1", m.p1],
      ["X", m.px],
      ["2", m.p2],
    ] as const
  ).reduce((a, b) => (b[1] > a[1] ? b : a));
  const rules: ((c: ScoreCell) => boolean)[] = [];
  if (ftBest[1] >= 0.45) rules.push((c) => ftSign(c.home, c.away) === ftBest[0]);
  if (Math.max(pO25, 1 - pO25) >= 0.58) rules.push((c) => c.home + c.away > 2.5 === pO25 > 0.5);
  if (Math.max(pGG, 1 - pGG) >= 0.58) rules.push((c) => (c.home > 0 && c.away > 0) === pGG > 0.5);
  let pool = allScores;
  for (const r of rules) {
    const next = pool.filter(r);
    if (next.length) pool = next;
  }
  const bestScore = pool[0] ?? allScores[0]!;
  const conf = Math.round(bestScore.prob * 100);
  const total = m.lh + m.la;

  const concretePick: ConcreteTip = {
    market: "Točan Rezultat",
    pick: `Rezultat ${bestScore.score}`,
    confidenceScore: conf,
    confidenceLevel:
      conf >= 14 ? "VISOKA SIGURNOST" : conf >= 9 ? "UMJERENA SIGURNOST" : "SPEKULATIVNO (VALUE)",
    fairOdds: bestScore.fair,
    marketOdds: bestScore.market,
    valueEdge: bestScore.value !== null ? bestScore.value * 100 : null,
    reason: `Najvjerojatniji rezultat usklađen s tipovima 1X2/golova/GG: ${bestScore.score} (${(bestScore.prob * 100).toFixed(1)}%, fer tečaj ${bestScore.fair.toFixed(2)}).`,
  };
  return {
    matrix,
    allScores,
    top3,
    bestScore,
    concretePick,
    lambdaHome: m.lh,
    lambdaAway: m.la,
    totalXG: total,
    explanation: `Dixon-Coles model fitan na sve unesene kvote: xG Domaćin ${m.lh.toFixed(2)}, Gost ${m.la.toFixed(2)} (ukupno ${total.toFixed(2)}). Najvjerojatniji rezultat je ${bestScore.score}.`,
  };
}

// 7. 1.5 Goals Predictor
export type Ou15Result = {
  probOver: number;
  probUnder: number;
  fairOver: number;
  fairUnder: number;
  marketOver: number | null;
  marketUnder: number | null;
  valueOver: number | null;
  valueUnder: number | null;
  isOver: boolean;
  confidence: number;
  csOdds: { "0:0": number | null; "1:0": number | null; "0:1": number | null };
  lowSum: number;
  ruleMet: boolean;
  lowOddsShift: boolean;
  sharpsBuffer: boolean;
  breakdown: string;
};

export function calculateOu15(i: Inputs, sharps = false): Ou15Result | { error: string } {
  const m = buildModel(i, sharps);
  if (!m) return { error: "Unesite Over/Under 1.5 ili 2.5 tečajeve." };
  const pO = msum(m.M, (h, a) => h + a > 1.5);
  const pU = 1 - pO;
  const keys = ["0:0", "1:0", "0:1"] as const;
  const odds = keys.map((k) => n(i.bookScores[k] ?? ""));
  const csOdds = {
    "0:0": isNaN(odds[0]!) ? null : odds[0]!,
    "1:0": isNaN(odds[1]!) ? null : odds[1]!,
    "0:1": isNaN(odds[2]!) ? null : odds[2]!,
  };
  const lowSum = m.M[0]![0]! + m.M[1]![0]! + m.M[0]![1]!;
  const highCount = odds.filter((o) => !isNaN(o) && o >= 10).length;
  const ruleMet = highCount >= 2 && lowSum < 0.25;

  const o15 = n(i.o15),
    u15 = n(i.u15);
  const mO = isNaN(o15) ? null : o15,
    mU = isNaN(u15) ? null : u15;
  const isOver = pO >= pU;
  const f = (x: number | null) => (x ? x.toFixed(2) : "—");
  return {
    probOver: pO,
    probUnder: pU,
    fairOver: 1 / pO,
    fairUnder: 1 / pU,
    marketOver: mO,
    marketUnder: mU,
    valueOver: mO ? pO * mO - 1 : null,
    valueUnder: mU ? pU * mU - 1 : null,
    isOver,
    confidence: Math.round((isOver ? pO : pU) * 100),
    csOdds,
    lowSum,
    ruleMet,
    lowOddsShift: m.usedLowScores,
    sharpsBuffer: sharps && m.balanced,
    breakdown: `Točni rezultati: [0:0 ${f(csOdds["0:0"])} | 1:0 ${f(csOdds["1:0"])} | 0:1 ${f(csOdds["0:1"])}] → ${ruleMet ? "potvrđuju Više 1.5" : "bez dodatne potvrde"} (model Σ 0:0+1:0+0:1 = ${(lowSum * 100).toFixed(1)}%)`,
  };
}

// 8. Dutching kalkulator
export function dutch(stake: number, oddsA: number, oddsB: number) {
  // POPRAVAK: Nulti/nevaljani ulog ili kvote ne smiju proizvesti NaN/Infinity u isplati.
  if (
    !Number.isFinite(stake) ||
    stake <= 0 ||
    !Number.isFinite(oddsA) ||
    oddsA <= 1 ||
    !Number.isFinite(oddsB) ||
    oddsB <= 1
  ) {
    return { sA: 0, sB: 0, profit: 0, roi: 0 };
  }
  const inv = 1 / oddsA + 1 / oddsB;
  const sA = stake / oddsA / inv,
    sB = stake / oddsB / inv;
  const ret = stake / inv;
  return { sA, sB, profit: ret - stake, roi: (ret - stake) / stake };
}
