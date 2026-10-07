// ══ NAPREDNA FORMULA v13 — BTTS i Over/Under 2.5 ══
// Ručno aktivirana funkcija (Postavke → „Napredna formula: BTTS i 2.5“).
// Kad je uključena, izračun se automatski dodaje u kontekst chat bota,
// pa ga uzima u obzir prilikom donošenja tipa.
import { loadJSON, saveJSON } from "./storage";

export interface GoalFormulaPrefs {
  /** Ručni prekidač — po defaultu isključeno. */
  enabled: boolean;
  /** Prosjek golova koje domaćin zabija po utakmici. */
  homeFor: number;
  /** Prosjek golova koje domaćin prima. */
  homeAgainst: number;
  /** Prosjek golova koje gost zabija. */
  awayFor: number;
  /** Prosjek golova koje gost prima. */
  awayAgainst: number;
  /** Prosjek golova lige po utakmici. */
  leagueAvg: number;
  /** Prednost domaćeg terena (množitelj λ domaćina). */
  homeAdvantage: number;
  /** Dixon-Coles korelacija niskih rezultata (−0.15 … 0.15). */
  rho: number;
  /** Prag sigurnosti (%) ispod kojeg formula savjetuje odustajanje. */
  minConfidence: number;
  /** Kvota za BTTS DA (0 = bez edge računa). */
  oddsBtts: number;
  /** Kvota za Over 2.5 (0 = bez edge računa). */
  oddsOver25: number;
}

export const DEFAULT_GOAL_FORMULA: GoalFormulaPrefs = {
  enabled: false,
  homeFor: 1.6,
  homeAgainst: 1.1,
  awayFor: 1.2,
  awayAgainst: 1.4,
  leagueAvg: 2.7,
  homeAdvantage: 1.12,
  rho: -0.03,
  minConfidence: 58,
  oddsBtts: 0,
  oddsOver25: 0,
};

const GKEY = "andromeda.goalformula.v13";

export function loadGoalFormula(): GoalFormulaPrefs {
  return { ...DEFAULT_GOAL_FORMULA, ...loadJSON<Partial<GoalFormulaPrefs>>(GKEY, {}) };
}
export function saveGoalFormula(p: GoalFormulaPrefs): void {
  saveJSON(GKEY, p);
}

export interface GoalFormulaResult {
  lambdaHome: number;
  lambdaAway: number;
  total: number;
  pBtts: number;
  pOver25: number;
  pUnder25: number;
  pClean: number;
  topPick: string;
  confidence: number;
  skip: boolean;
  edgeBtts: number | null;
  edgeOver: number | null;
}

function pois(l: number, k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

/** Dixon-Coles korekcija za rezultate 0-0, 1-0, 0-1, 1-1. */
function dc(x: number, y: number, lh: number, la: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export function computeGoalFormula(p: GoalFormulaPrefs): GoalFormulaResult {
  const base = Math.max(0.4, p.leagueAvg) / 2;
  const attH = p.homeFor / base;
  const defA = p.awayAgainst / base;
  const attA = p.awayFor / base;
  const defH = p.homeAgainst / base;

  const lh = Math.max(0.15, attH * defA * base * p.homeAdvantage);
  const la = Math.max(0.15, attA * defH * base);

  const MAX = 8;
  let pBtts = 0;
  let pUnder = 0;
  let pClean = 0;
  for (let x = 0; x <= MAX; x++) {
    for (let y = 0; y <= MAX; y++) {
      const pr = pois(lh, x) * pois(la, y) * dc(x, y, lh, la, p.rho);
      if (x > 0 && y > 0) pBtts += pr;
      if (x + y <= 2) pUnder += pr;
      if (x === 0 || y === 0) pClean += pr;
    }
  }
  const norm = pUnder + (1 - pUnder);
  const pOver = Math.min(0.999, Math.max(0.001, 1 - pUnder / norm));
  pBtts = Math.min(0.999, Math.max(0.001, pBtts));

  const cands = [
    { label: "BTTS DA", pr: pBtts },
    { label: "BTTS NE", pr: 1 - pBtts },
    { label: "Over 2.5", pr: pOver },
    { label: "Under 2.5", pr: 1 - pOver },
  ].sort((a, b) => b.pr - a.pr);
  const best = cands[0]!;
  const confidence = Math.round(best.pr * 1000) / 10;

  const edgeBtts = p.oddsBtts > 1 ? Math.round((pBtts * p.oddsBtts - 1) * 1000) / 10 : null;
  const edgeOver = p.oddsOver25 > 1 ? Math.round((pOver * p.oddsOver25 - 1) * 1000) / 10 : null;

  return {
    lambdaHome: Math.round(lh * 100) / 100,
    lambdaAway: Math.round(la * 100) / 100,
    total: Math.round((lh + la) * 100) / 100,
    pBtts: Math.round(pBtts * 1000) / 10,
    pOver25: Math.round(pOver * 1000) / 10,
    pUnder25: Math.round((1 - pOver) * 1000) / 10,
    pClean: Math.round(pClean * 1000) / 10,
    topPick: best.label,
    confidence,
    skip: confidence < p.minConfidence,
    edgeBtts,
    edgeOver,
  };
}

export function goalFormulaActive(p: GoalFormulaPrefs): boolean {
  return p.enabled === true;
}

/** Tekst koji ide u sistemski prompt chat bota. */
export function goalFormulaDirectives(p: GoalFormulaPrefs): string {
  if (!goalFormulaActive(p)) return "";
  const r = computeGoalFormula(p);
  return `

═══ NAPREDNA FORMULA v13 — BTTS i OVER/UNDER 2.5 (korisnik ju je RUČNO uključio) ═══
Korisnički parametri: domaćin zabija ${p.homeFor}, prima ${p.homeAgainst}; gost zabija ${p.awayFor}, prima ${p.awayAgainst}; prosjek lige ${p.leagueAvg}; prednost domaćeg terena ×${p.homeAdvantage}; Dixon-Coles ρ=${p.rho}.
Izračun (Poisson matrica 0–8 s DC korekcijom): λ_dom=${r.lambdaHome}, λ_gost=${r.lambdaAway}, ukupno ${r.total} golova.
P(BTTS DA)=${r.pBtts}% · P(Over 2.5)=${r.pOver25}% · P(Under 2.5)=${r.pUnder25}% · P(bar jedna suha mreža)=${r.pClean}%.
Formula preporučuje: ${r.topPick} sa sigurnošću ${r.confidence}%.${
    r.edgeBtts !== null ? ` Edge BTTS DA: ${r.edgeBtts}%.` : ""
  }${r.edgeOver !== null ? ` Edge Over 2.5: ${r.edgeOver}%.` : ""}
${r.skip ? `UPOZORENJE: sigurnost je ispod korisnikovog praga (${p.minConfidence}%) — jasno reci da je ovo utakmica za preskočiti ili ponudi sigurniju varijantu.` : "OBAVEZNO: ovaj izračun uzmi u obzir kao težak ulaz pri donošenju tipa za BTTS i Over/Under 2.5; ako se tvoja procjena razlikuje više od 10 postotnih bodova, objasni zašto u jednoj rečenici."}
Vrijednosti gore su korisnikovi ručni ulazi — ako u kontekstu postoje stvarni podaci o momčadima, spomeni odstupanje, ali formulu i dalje navedi.`;
}
