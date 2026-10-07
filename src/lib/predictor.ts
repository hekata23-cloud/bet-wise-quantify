// Matematički mozak: Poisson, Kelly, indeks slučajnosti, "srce" indeks,
// BTTS/Over-Under/1X2 kalkulacije i još puno metoda za analizu tipova.

// ---------- Osnovne pomoćne funkcije ----------
function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export function impliedProbability(odd: number): number {
  if (!odd || odd <= 1) return 0;
  return 1 / odd;
}

export function removeMargin(odds: number[]): number[] {
  const impls = odds.map(impliedProbability);
  const sum = impls.reduce((a, b) => a + b, 0) || 1;
  return impls.map((p) => p / sum);
}

// ---------- Kelly kriterij ----------
export function kellyStake(prob: number, odd: number): number {
  const b = odd - 1;
  if (b <= 0) return 0;
  const q = 1 - prob;
  const k = (b * prob - q) / b;
  return Math.max(0, Math.min(1, k));
}

// ---------- Value bet ----------
export function edge(prob: number, odd: number): number {
  return prob * odd - 1;
}

// ---------- Poisson matrica gol × gol ----------
export interface ScoreMatrix {
  homeXG: number;
  awayXG: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pBTTS: number;
  pOver05: number;
  pOver15: number;
  pOver25: number;
  pOver35: number;
  pUnder25: number;
  topScores: Array<{ score: string; p: number }>;
  expectedGoals: number;
}

export function scoreMatrix(homeXG: number, awayXG: number, max = 6): ScoreMatrix {
  let pHome = 0, pDraw = 0, pAway = 0, pBTTS = 0;
  let pOver05 = 0, pOver15 = 0, pOver25 = 0, pOver35 = 0;
  const scores: Array<{ score: string; p: number }> = [];
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = poisson(homeXG, h) * poisson(awayXG, a);
      scores.push({ score: `${h}:${a}`, p });
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h > 0 && a > 0) pBTTS += p;
      const t = h + a;
      if (t > 0) pOver05 += p;
      if (t > 1) pOver15 += p;
      if (t > 2) pOver25 += p;
      if (t > 3) pOver35 += p;
    }
  }
  scores.sort((a, b) => b.p - a.p);
  return {
    homeXG,
    awayXG,
    pHome,
    pDraw,
    pAway,
    pBTTS,
    pOver05,
    pOver15,
    pOver25,
    pOver35,
    pUnder25: 1 - pOver25,
    topScores: scores.slice(0, 5),
    expectedGoals: homeXG + awayXG,
  };
}

// ---------- Indeks slučajnosti (koliko su kvote "gužva") ----------
export function randomnessIndex(odd1: number, oddX: number, odd2: number): number {
  // Shannonova entropija na normaliziranim vjerojatnostima, 0..1
  const [p1, pX, p2] = removeMargin([odd1, oddX, odd2]);
  const parts = [p1, pX, p2].filter((p) => p > 0);
  const H = -parts.reduce((s, p) => s + p * Math.log2(p), 0);
  return Math.min(1, H / Math.log2(3));
}

// ---------- "Srce" indeks (fanovska podrška, motivacija) ----------
// 0..100 - subjektivan input pretvoren u ponder
export function srceIndex(input: {
  homeMotivation: number; // 0..10
  awayMotivation: number; // 0..10
  homeForm: number; // 0..10
  awayForm: number; // 0..10
  rivalry: number; // 0..10
  crowd: number; // 0..10 (koliko domaćina gura publika)
}): { home: number; away: number; delta: number } {
  const home =
    input.homeMotivation * 3 + input.homeForm * 2.5 + input.rivalry * 1.5 + input.crowd * 3;
  const away = input.awayMotivation * 3 + input.awayForm * 2.5 + input.rivalry * 1.5;
  return { home, away, delta: home - away };
}

// ---------- BTTS analiza ----------
export interface BTTSAnalysis {
  probYes: number;
  probNo: number;
  tip: "GG" | "NG";
  confidence: number; // 0..100
  color: "success" | "destructive";
  reasons: string[];
}

export function analyzeBTTS(input: {
  homeXG: number;
  awayXG: number;
  homeBTTSRate: number; // 0..1 posljednjih 10
  awayBTTSRate: number; // 0..1 posljednjih 10
  homeScoredRate: number; // 0..1 (koliko utakmica postiže bar 1)
  awayScoredRate: number;
  homeConcededRate: number;
  awayConcededRate: number;
  bttsYesOdd?: number;
  bttsNoOdd?: number;
}): BTTSAnalysis {
  const sm = scoreMatrix(input.homeXG, input.awayXG);
  // Ponderirana kombinacija Poissonove i povijesne stope
  const historical = (input.homeBTTSRate + input.awayBTTSRate) / 2;
  const attackDefense =
    (input.homeScoredRate * input.awayConcededRate +
      input.awayScoredRate * input.homeConcededRate) /
    2;
  const probYes = 0.5 * sm.pBTTS + 0.3 * historical + 0.2 * attackDefense;
  const probNo = 1 - probYes;
  const tip = probYes >= 0.55 ? "GG" : probNo >= 0.55 ? "NG" : probYes >= 0.5 ? "GG" : "NG";
  const confidence = Math.round(Math.max(probYes, probNo) * 100);
  const reasons: string[] = [];
  reasons.push(
    `Poissonov model daje BTTS DA = ${(sm.pBTTS * 100).toFixed(1)}% na temelju xG (${input.homeXG.toFixed(2)} vs ${input.awayXG.toFixed(2)}).`,
  );
  reasons.push(
    `Povijesna stopa BTTS (prosjek oba tima u zadnjih 10) = ${(historical * 100).toFixed(1)}%.`,
  );
  reasons.push(
    `Napad × obrana omjer: domaćin postiže ${(input.homeScoredRate * 100).toFixed(0)}% × gost prima ${(input.awayConcededRate * 100).toFixed(0)}% i obratno.`,
  );
  if (input.bttsYesOdd) {
    const e = edge(probYes, input.bttsYesOdd);
    reasons.push(
      `Value na BTTS DA @ ${input.bttsYesOdd.toFixed(2)}: ${(e * 100).toFixed(1)}% edge, Kelly udio ${(kellyStake(probYes, input.bttsYesOdd) * 100).toFixed(2)}%.`,
    );
  }
  if (input.bttsNoOdd) {
    const e = edge(probNo, input.bttsNoOdd);
    reasons.push(
      `Value na BTTS NE @ ${input.bttsNoOdd.toFixed(2)}: ${(e * 100).toFixed(1)}% edge, Kelly udio ${(kellyStake(probNo, input.bttsNoOdd) * 100).toFixed(2)}%.`,
    );
  }
  return {
    probYes,
    probNo,
    tip,
    confidence,
    color: tip === "GG" ? "success" : "destructive",
    reasons,
  };
}

// ---------- Over/Under analiza ----------
export interface OUAnalysis {
  line: number;
  probOver: number;
  probUnder: number;
  tip: string;
  confidence: number;
  reasons: string[];
}

export function analyzeOU(input: {
  homeXG: number;
  awayXG: number;
  line: number; // npr 2.5
  homeGoalsAvg: number;
  awayGoalsAvg: number;
  overOdd?: number;
  underOdd?: number;
}): OUAnalysis {
  const sm = scoreMatrix(input.homeXG, input.awayXG);
  let poissonProbOver = 0;
  const max = 8;
  for (let h = 0; h <= max; h++)
    for (let a = 0; a <= max; a++)
      if (h + a > input.line) poissonProbOver += poisson(input.homeXG, h) * poisson(input.awayXG, a);
  const historicalAvg = input.homeGoalsAvg + input.awayGoalsAvg;
  const historicalProbOver = historicalAvg > input.line ? 0.5 + Math.min(0.4, (historicalAvg - input.line) * 0.15) : 0.5 - Math.min(0.4, (input.line - historicalAvg) * 0.15);
  const probOver = 0.7 * poissonProbOver + 0.3 * historicalProbOver;
  const probUnder = 1 - probOver;
  const tip = probOver >= 0.55 ? `Over ${input.line}` : probUnder >= 0.55 ? `Under ${input.line}` : probOver >= 0.5 ? `Over ${input.line}` : `Under ${input.line}`;
  const confidence = Math.round(Math.max(probOver, probUnder) * 100);
  const reasons: string[] = [];
  reasons.push(
    `Očekivani ukupan broj golova (xG_home + xG_away) = ${sm.expectedGoals.toFixed(2)}. Linija je ${input.line}.`,
  );
  reasons.push(
    `Poissonova vjerojatnost Over ${input.line} = ${(poissonProbOver * 100).toFixed(1)}%.`,
  );
  reasons.push(
    `Povijesni prosjek golova timova = ${historicalAvg.toFixed(2)} → povijesna vjerojatnost Over ${input.line} = ${(historicalProbOver * 100).toFixed(1)}%.`,
  );
  reasons.push(
    `Najvjerojatniji rezultati: ${sm.topScores.map((s) => `${s.score} (${(s.p * 100).toFixed(1)}%)`).join(", ")}.`,
  );
  if (input.overOdd) {
    const e = edge(probOver, input.overOdd);
    reasons.push(
      `Value Over @ ${input.overOdd.toFixed(2)}: edge ${(e * 100).toFixed(1)}%, Kelly ${(kellyStake(probOver, input.overOdd) * 100).toFixed(2)}%.`,
    );
  }
  if (input.underOdd) {
    const e = edge(probUnder, input.underOdd);
    reasons.push(
      `Value Under @ ${input.underOdd.toFixed(2)}: edge ${(e * 100).toFixed(1)}%, Kelly ${(kellyStake(probUnder, input.underOdd) * 100).toFixed(2)}%.`,
    );
  }
  return { line: input.line, probOver, probUnder, tip, confidence, reasons };
}

// ---------- 1X2 analiza ----------
export interface WDLAnalysis {
  probHome: number;
  probDraw: number;
  probAway: number;
  tip: "1" | "X" | "2";
  confidence: number;
  randomness: number;
  reasons: string[];
}

export function analyzeWDL(input: {
  homeXG: number;
  awayXG: number;
  odd1: number;
  oddX: number;
  odd2: number;
  srce: { home: number; away: number; delta: number };
}): WDLAnalysis {
  const sm = scoreMatrix(input.homeXG, input.awayXG);
  const [mp1, mpX, mp2] = removeMargin([input.odd1, input.oddX, input.odd2]);
  // Kombiniramo Poisson + tržišne implicirane vjerojatnosti (bez marže) + srce
  const srceAdj = Math.max(-0.05, Math.min(0.05, input.srce.delta / 500));
  let pH = 0.5 * sm.pHome + 0.5 * mp1 + srceAdj;
  let pD = 0.5 * sm.pDraw + 0.5 * mpX;
  let pA = 0.5 * sm.pAway + 0.5 * mp2 - srceAdj;
  const s = pH + pD + pA;
  pH /= s; pD /= s; pA /= s;
  const rnd = randomnessIndex(input.odd1, input.oddX, input.odd2);
  const arr: Array<{ k: "1" | "X" | "2"; p: number; odd: number }> = [
    { k: "1", p: pH, odd: input.odd1 },
    { k: "X", p: pD, odd: input.oddX },
    { k: "2", p: pA, odd: input.odd2 },
  ];
  arr.sort((a, b) => b.p - a.p);
  const best = arr[0];
  const reasons: string[] = [];
  reasons.push(
    `Poisson: 1=${(sm.pHome * 100).toFixed(1)}%, X=${(sm.pDraw * 100).toFixed(1)}%, 2=${(sm.pAway * 100).toFixed(1)}%.`,
  );
  reasons.push(
    `Tržišne implicirane vjerojatnosti bez marže: 1=${(mp1 * 100).toFixed(1)}%, X=${(mpX * 100).toFixed(1)}%, 2=${(mp2 * 100).toFixed(1)}%.`,
  );
  reasons.push(
    `Srce indeks: dom ${input.srce.home.toFixed(1)} vs gost ${input.srce.away.toFixed(1)} (delta ${input.srce.delta.toFixed(1)}).`,
  );
  reasons.push(
    `Indeks slučajnosti utakmice: ${(rnd * 100).toFixed(1)}% (viši = veći kaos, oprez s tipom).`,
  );
  reasons.push(
    `Kombinirani model: 1=${(pH * 100).toFixed(1)}%, X=${(pD * 100).toFixed(1)}%, 2=${(pA * 100).toFixed(1)}%.`,
  );
  const e = edge(best.p, best.odd);
  reasons.push(
    `Preporučeni tip ${best.k} @ ${best.odd.toFixed(2)}: edge ${(e * 100).toFixed(1)}%, Kelly ${(kellyStake(best.p, best.odd) * 100).toFixed(2)}%.`,
  );
  return {
    probHome: pH,
    probDraw: pD,
    probAway: pA,
    tip: best.k,
    confidence: Math.round(best.p * 100),
    randomness: rnd,
    reasons,
  };
}

// ---------- HT/FT (Poluvrijeme/Kraj) analiza ----------
// Standardno se ~44% ukupnih golova u prosjeku postiže u prvom poluvremenu.
export interface HTFTAnalysis {
  matrix: Record<string, number>; // "1/1", "1/X", ...
  top: Array<{ combo: string; p: number }>;
  tip: string;
  confidence: number;
  reasons: string[];
}

export function analyzeHTFT(input: {
  homeXG: number;
  awayXG: number;
  htShare?: number; // udio golova u 1. poluvremenu, default 0.44
}): HTFTAnalysis {
  const share = input.htShare ?? 0.44;
  const htH = input.homeXG * share;
  const htA = input.awayXG * share;
  const ftH = input.homeXG * (1 - share);
  const ftA = input.awayXG * (1 - share);

  // Distribucije za oba poluvremena
  const half = (lh: number, la: number) => {
    let p1 = 0, pX = 0, p2 = 0;
    for (let h = 0; h <= 6; h++)
      for (let a = 0; a <= 6; a++) {
        const p = poisson(lh, h) * poisson(la, a);
        if (h > a) p1 += p;
        else if (h === a) pX += p;
        else p2 += p;
      }
    return { p1, pX, p2 };
  };
  const HT = half(htH, htA);
  // Za FT rezultat pretpostavljamo cijelu utakmicu (kao standardni Poisson)
  const FT = half(input.homeXG, input.awayXG);

  // Uvjetne procjene: koristimo približnu nezavisnost poluvremena,
  // pa "1/1" ~ P(HT=1) * P(FT=1 | HT ne mijenja tim). Kao praktičan proxy
  // koristimo P(HT) * P(FT) normalizirano po HT ishodu.
  const combos = ["1", "X", "2"] as const;
  const matrix: Record<string, number> = {};
  for (const ht of combos)
    for (const ft of combos) {
      const pHT = ht === "1" ? HT.p1 : ht === "X" ? HT.pX : HT.p2;
      const pFT = ft === "1" ? FT.p1 : ft === "X" ? FT.pX : FT.p2;
      // Snažna korelacija: HT=1 preferira FT=1; koristimo blagi bonus
      const align = ht === ft ? 1.4 : ht === "X" || ft === "X" ? 1.0 : 0.55;
      matrix[`${ht}/${ft}`] = pHT * pFT * align;
    }
  const sum = Object.values(matrix).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(matrix)) matrix[k] /= sum;

  const sorted = Object.entries(matrix)
    .map(([combo, p]) => ({ combo, p }))
    .sort((a, b) => b.p - a.p);
  const best = sorted[0];
  return {
    matrix,
    top: sorted.slice(0, 5),
    tip: best.combo,
    confidence: Math.round(best.p * 100),
    reasons: [
      `Očekivani xG u 1. poluvremenu: ${htH.toFixed(2)}:${htA.toFixed(2)} (udio ${(share * 100).toFixed(0)}%).`,
      `HT vjerojatnosti: 1=${(HT.p1 * 100).toFixed(1)}%, X=${(HT.pX * 100).toFixed(1)}%, 2=${(HT.p2 * 100).toFixed(1)}%.`,
      `FT vjerojatnosti: 1=${(FT.p1 * 100).toFixed(1)}%, X=${(FT.pX * 100).toFixed(1)}%, 2=${(FT.p2 * 100).toFixed(1)}%.`,
      `Top 3 HT/FT: ${sorted.slice(0, 3).map((x) => `${x.combo} (${(x.p * 100).toFixed(1)}%)`).join(", ")}.`,
      `Napomena: FT xG = ${ftH.toFixed(2)}:${ftA.toFixed(2)}.`,
    ],
  };
}

// ---------- Kornera analiza (Poisson na prosjeku) ----------
export interface CornersAnalysis {
  line: number;
  probOver: number;
  probUnder: number;
  tip: string;
  confidence: number;
  expected: number;
  reasons: string[];
}

export function analyzeCorners(input: {
  homeAvg: number; // prosjek kornera domaćina po utakmici
  awayAvg: number;
  homeConcededAvg: number;
  awayConcededAvg: number;
  line: number; // npr. 9.5
  overOdd?: number;
  underOdd?: number;
}): CornersAnalysis {
  const lamH = (input.homeAvg + input.awayConcededAvg) / 2;
  const lamA = (input.awayAvg + input.homeConcededAvg) / 2;
  const total = lamH + lamA;
  let pOver = 0;
  for (let k = Math.ceil(input.line); k <= 25; k++) pOver += poisson(total, k);
  const pUnder = 1 - pOver;
  const tip = pOver >= 0.5 ? `Over ${input.line}` : `Under ${input.line}`;
  const reasons = [
    `Očekivano kornera: ${total.toFixed(2)} (dom λ=${lamH.toFixed(2)}, gost λ=${lamA.toFixed(2)}).`,
    `Poisson Over ${input.line} = ${(pOver * 100).toFixed(1)}%.`,
  ];
  if (input.overOdd) reasons.push(`Value Over @ ${input.overOdd.toFixed(2)}: edge ${((pOver * input.overOdd - 1) * 100).toFixed(1)}%.`);
  if (input.underOdd) reasons.push(`Value Under @ ${input.underOdd.toFixed(2)}: edge ${((pUnder * input.underOdd - 1) * 100).toFixed(1)}%.`);
  return { line: input.line, probOver: pOver, probUnder: pUnder, tip, confidence: Math.round(Math.max(pOver, pUnder) * 100), expected: total, reasons };
}

// ---------- Kartona analiza ----------
export function analyzeCards(input: {
  homeAvg: number;
  awayAvg: number;
  refereeAvg?: number; // prosjek kartona suca
  line: number; // npr. 3.5
  overOdd?: number;
}): CornersAnalysis {
  const base = (input.homeAvg + input.awayAvg) / 2 + (input.refereeAvg ?? 0) * 0.3;
  const total = Math.max(0.5, base);
  let pOver = 0;
  for (let k = Math.ceil(input.line); k <= 15; k++) pOver += poisson(total, k);
  const pUnder = 1 - pOver;
  const tip = pOver >= 0.5 ? `Over ${input.line} kartona` : `Under ${input.line} kartona`;
  const reasons = [
    `Očekivano kartona: ${total.toFixed(2)}${input.refereeAvg ? ` (sudac dodaje ${(input.refereeAvg * 0.3).toFixed(2)})` : ""}.`,
    `Poisson Over ${input.line} = ${(pOver * 100).toFixed(1)}%.`,
  ];
  if (input.overOdd) reasons.push(`Value Over @ ${input.overOdd.toFixed(2)}: edge ${((pOver * input.overOdd - 1) * 100).toFixed(1)}%.`);
  return { line: input.line, probOver: pOver, probUnder: pUnder, tip, confidence: Math.round(Math.max(pOver, pUnder) * 100), expected: total, reasons };
}

// ---------- Dixon-Coles korekcija za niske rezultate ----------
export function dixonColesTau(h: number, a: number, lh: number, la: number, rho = -0.1): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

// ---------- Monte Carlo simulacija ishoda (N iteracija) ----------
function samplePoisson(lambda: number): number {
  // Knuth algoritam
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export function monteCarlo(homeXG: number, awayXG: number, n = 10000): { pHome: number; pDraw: number; pAway: number; pBTTS: number; pOver25: number } {
  let h = 0, d = 0, a = 0, btts = 0, ov = 0;
  for (let i = 0; i < n; i++) {
    const gh = samplePoisson(homeXG);
    const ga = samplePoisson(awayXG);
    if (gh > ga) h++;
    else if (gh === ga) d++;
    else a++;
    if (gh > 0 && ga > 0) btts++;
    if (gh + ga > 2) ov++;
  }
  return { pHome: h / n, pDraw: d / n, pAway: a / n, pBTTS: btts / n, pOver25: ov / n };
}