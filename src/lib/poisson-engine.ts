// Kompletan dvodimenzionalni Dixon-Coles Poisson model za nogomet.
// Ispravlja korelaciju niskih rezultata (0:0, 1:1, 1:0, 0:1).

export type ScoreProbability = {
  home: number;
  away: number;
  prob: number; // postotak (npr. 8.4%)
  score: string;
};

export type GoalBrackets = {
  zeroOne: number; // 0-1 gol
  twoThree: number; // 2-3 gola
  fourPlus: number; // 4+ golova
};

export type OverUnderLines = {
  over05: number;
  over15: number;
  over25: number;
  over35: number;
};

export type PoissonMatrixResult = {
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
  matrix: number[][]; // 0-6 x 0-6
  topScores: ScoreProbability[];
  brackets: GoalBrackets;
  lines: OverUnderLines;
  bttsProb: number;
  cleanSheetHome: number;
  cleanSheetAway: number;
};

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

// Dixon-Coles korekcija za međuovisnost niskih rezultata
function tauFactor(x: number, y: number, lambdaH: number, lambdaA: number, rho = -0.11): number {
  if (x === 0 && y === 0) return 1 - lambdaH * lambdaA * rho;
  if (x === 0 && y === 1) return 1 + lambdaH * rho;
  if (x === 1 && y === 0) return 1 + lambdaA * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Stabilan numerički rješavač lambde bez mogućnosti divergencije ili NaN
export function solveLambdaFromOver(pOverTarget: number): number {
  const target = Math.min(0.88, Math.max(0.12, pOverTarget));
  let low = 0.5;
  let high = 6.0;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const pUnder = Math.exp(-mid) * (1 + mid + (mid * mid) / 2);
    const pOver = 1 - pUnder;
    if (pOver < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function generatePoissonMatrix(kOver25: number, kGg: number, k22: number): PoissonMatrixResult {
  // 1. Izračun očekivanih ukupnih golova (lambda) iz Over 2.5 kvote
  const pOverClean = Math.min(0.85, Math.max(0.15, 1 / (Math.max(1.05, kOver25) * 1.05)));
  const lambdaTotal = solveLambdaFromOver(pOverClean);

  // 2. Raspodjela na domaćina i gosta iz GG kvote i 2:2
  const pGgClean = Math.min(0.8, Math.max(0.2, 1 / (Math.max(1.05, kGg) * 1.05)));
  const homeRatio = 0.55 - (pGgClean - 0.5) * 0.1;
  const lambdaHome = Math.max(0.4, lambdaTotal * homeRatio);
  const lambdaAway = Math.max(0.4, lambdaTotal * (1 - homeRatio));

  const maxGoals = 6;
  const matrix: number[][] = [];
  const allScores: ScoreProbability[] = [];

  let zeroOne = 0;
  let twoThree = 0;
  let fourPlus = 0;
  let over05 = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;
  let csHome = 0;
  let csAway = 0;

  let sum = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const pBasic = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      const adj = Math.max(0, pBasic * tauFactor(h, a, lambdaHome, lambdaAway));
      row[a] = adj;
      sum += adj;
    }
    matrix[h] = row;
  }

  // Normalizacija na 100%
  for (let h = 0; h <= maxGoals; h++) {
    const row = matrix[h];
    if (!row) continue;
    for (let a = 0; a <= maxGoals; a++) {
      const cell = row[a] ?? 0;
      const p = cell / (sum || 1);
      row[a] = p;
      const total = h + a;

      allScores.push({ home: h, away: a, prob: p * 100, score: `${h}:${a}` });

      if (total <= 1) zeroOne += p;
      else if (total <= 3) twoThree += p;
      else fourPlus += p;

      if (total > 0) over05 += p;
      if (total > 1) over15 += p;
      if (total > 2) over25 += p;
      if (total > 3) over35 += p;

      if (h > 0 && a > 0) btts += p;
      if (a === 0) csHome += p;
      if (h === 0) csAway += p;
    }
  }

  allScores.sort((a, b) => b.prob - a.prob);

  return {
    lambdaHome: Number(lambdaHome.toFixed(2)),
    lambdaAway: Number(lambdaAway.toFixed(2)),
    lambdaTotal: Number(lambdaTotal.toFixed(2)),
    matrix,
    topScores: allScores.slice(0, 4),
    brackets: {
      zeroOne: Number((zeroOne * 100).toFixed(1)),
      twoThree: Number((twoThree * 100).toFixed(1)),
      fourPlus: Number((fourPlus * 100).toFixed(1)),
    },
    lines: {
      over05: Number((over05 * 100).toFixed(1)),
      over15: Number((over15 * 100).toFixed(1)),
      over25: Number((over25 * 100).toFixed(1)),
      over35: Number((over35 * 100).toFixed(1)),
    },
    bttsProb: Number((btts * 100).toFixed(1)),
    cleanSheetHome: Number((csHome * 100).toFixed(1)),
    cleanSheetAway: Number((csAway * 100).toFixed(1)),
  };
}
