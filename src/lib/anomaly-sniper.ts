/**
 * ═══════════════════════════════════════════════════════════════════
 * ANOMALY-SNIPER — BTTS & Over 2.5 Anomaly Sniper Engine (v9)
 * ═══════════════════════════════════════════════════════════════════
 * Specijalizirani algoritam za otkrivanje "skrivenih" prolaza na
 * visokim kvotama (2.20 - 2.60) koji prkose klasičnim statistikama.
 *
 * 1. Noise Isolation & True xG Recalibration (PPDA Taktički sudar)
 * 2. Bivariate Frank Copula + Dixon-Coles Low-Score tau korekcija
 * 3. Referee & Penalty Drag Multiplier (sudac sa >0.35 penala / >4.8 kartona)
 * 4. High-Odds Value Filter (Edge >= +8.0% na kvoti >= 2.10)
 * 5. Game-State Hazard Rate (eksplozija golova nakon prvog pogotka)
 * ═══════════════════════════════════════════════════════════════════
 */

import { bttsIzKopule } from "./btts-copula";
import { izgradiGrid, metrikeIzGrida } from "./math-engine";
import { broj, sigurnoLam } from "./safe-math";

export interface SniperMatchInput {
  match: string;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  time?: string;
  fixtureId?: number;
  lambdaHome: number;
  lambdaAway: number;
  ppdaHome?: number | null;
  ppdaAway?: number | null;
  referee?: {
    name?: string;
    penaltiesPerGame?: number;
    yellowCardsPerGame?: number;
  } | null;
  bookieOdds?: {
    over25?: number;
    under25?: number;
    bttsYes?: number;
    bttsNo?: number;
  };
  /** Opcionalni taktički opis ili uočeni izostanci */
  tacticalNotes?: string;
}

export interface AnomalyOddsCell {
  market: "O/U 2.5" | "BTTS";
  tip: "Over 2.5" | "Under 2.5" | "GG" | "NG";
  odd: number;
  prob: number;
  edge: number;
  isHighValue: boolean;
  isGoldenSniper: boolean;
}

export interface SniperAnalysisResult {
  match: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  fixtureId?: number;
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;

  // Izračunate vjerojatnosti modela
  probOver25: number;
  probUnder25: number;
  probBttsYes: number;
  probBttsNo: number;

  // Analitički indikatori
  anomalyScore: number;       // 0 - 100% indeks skrivenog potencijala golova
  hazardRate: number;         // 0 - 100% vjerojatnost otvaranja utakmice nakon 1. gola
  tacticalClash: {
    hasClash: boolean;
    label: string;
    description: string;
  };
  refereeImpact: {
    applied: boolean;
    name?: string;
    penaltiesPerGame?: number;
    yellowCardsPerGame?: number;
    description: string;
  };
  highOddsAlert: boolean;     // P(Over) ili P(BTTS) >= 56% na kvoti >= 2.10
  goldenSniper: boolean;      // Edge >= +8.0% na kvoti >= 2.10

  // Selekcije za tiket
  oddsCells: {
    over25: AnomalyOddsCell;
    under25: AnomalyOddsCell;
    bttsYes: AnomalyOddsCell;
    bttsNo: AnomalyOddsCell;
  };

  reasoningSummary: string;
}

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
}

/** Glavni matematički proračun anomalija */
export function computeSniperAnomaly(input: SniperMatchInput): SniperAnalysisResult {
  let lamH = sigurnoLam(input.lambdaHome, 1.35);
  let lamA = sigurnoLam(input.lambdaAway, 1.15);

  const ppdaH = input.ppdaHome != null && Number.isFinite(input.ppdaHome) ? input.ppdaHome : null;
  const ppdaA = input.ppdaAway != null && Number.isFinite(input.ppdaAway) ? input.ppdaAway : null;

  // A) Taktički PPDA Clash: visoki pritisak obje ekipe (PPDA < 9.0 & < 9.5)
  const hasPpdaClash = ppdaH != null && ppdaA != null && ppdaH < 9.0 && ppdaA < 9.5;
  let tacticalDescription = "Standardni taktički raspored.";
  let tacticalLabel = "Neutralan tempo";

  if (hasPpdaClash) {
    const clashMultiplier = 1.22;
    // Povećavamo očekivane golove za faktor 1.22 bez obzira na prošle serije bunker utakmica
    lamH = Math.min(6.0, lamH * Math.sqrt(clashMultiplier));
    lamA = Math.min(6.0, lamA * Math.sqrt(clashMultiplier));
    tacticalLabel = "Visoki presing (PPDA sudar)";
    tacticalDescription = `Obje momčadi igraju agresivan visoki presing (PPDA ${ppdaH.toFixed(1)} vs ${ppdaA.toFixed(1)}) → taktički sudar generira visoki xG (+22% λ) unatoč prošlim Under nizovima.`;
  } else if ((ppdaH != null && ppdaH < 9.0) || (ppdaA != null && ppdaA < 9.0)) {
    tacticalLabel = "Asimetrični presing";
    tacticalDescription = "Jedna momčad forsira visoki presing protiv dubokog bloka, stvarajući tranzicijske pukotine.";
  }

  // B) Bivarijantna Frank Kopula s Dixon-Coles korekcijom
  const grid = izgradiGrid(lamH, lamA, -0.05);
  const metrike = metrikeIzGrida(grid);
  const copula = bttsIzKopule(lamH, lamA, metrike.btts, 0.08);

  let pBttsYes = copula.btts;
  let pOver25 = metrike.o25;

  // C) Referee & Penalty Drag Multiplier
  const refPens = input.referee?.penaltiesPerGame != null && Number.isFinite(input.referee.penaltiesPerGame)
    ? input.referee.penaltiesPerGame
    : null;
  const refCards = input.referee?.yellowCardsPerGame != null && Number.isFinite(input.referee.yellowCardsPerGame)
    ? input.referee.yellowCardsPerGame
    : null;

  const isStrictRef = (refPens != null && refPens > 0.35) || (refCards != null && refCards > 4.8);
  let refDesc = "Sudac u prosjeku lige.";

  if (isStrictRef) {
    pBttsYes = Math.min(0.96, pBttsYes + 0.055); // +5.5%
    pOver25 = Math.min(0.96, pOver25 + 0.062);   // +6.2%
    refDesc = `Strog sudac (${input.referee?.name ?? "Delegirani sudac"}): ${refPens != null ? `${refPens.toFixed(2)} penala` : ""}${refCards != null ? ` · ${refCards.toFixed(1)} kartona` : ""}/utakmici → +5.5% BTTS i +6.2% Over 2.5 poticaj.`;
  }

  const pBttsNo = clamp(1 - pBttsYes, 0.02, 0.98);
  const pUnder25 = clamp(1 - pOver25, 0.02, 0.98);

  // Game-State Hazard Rate: vjerojatnost otvaranja utakmice nakon prvog gola
  let hazard = 0.45;
  if (hasPpdaClash) hazard += 0.20;
  if (isStrictRef) hazard += 0.08;
  if (Math.abs(lamH - lamA) < 0.3) hazard += 0.07; // izjednačeni rivali
  const hazardRate = clamp(hazard, 0.35, 0.88);

  // Kvote s kladionica ili fer kvote kao sigurni fallback
  const kOver = broj(input.bookieOdds?.over25, 1 / Math.max(0.01, pOver25), 1.05, 50);
  const kUnder = broj(input.bookieOdds?.under25, 1 / Math.max(0.01, pUnder25), 1.05, 50);
  const kBttsYes = broj(input.bookieOdds?.bttsYes, 1 / Math.max(0.01, pBttsYes), 1.05, 50);
  const kBttsNo = broj(input.bookieOdds?.bttsNo, 1 / Math.max(0.01, pBttsNo), 1.05, 50);

  const edgeOver = pOver25 * kOver - 1;
  const edgeUnder = pUnder25 * kUnder - 1;
  const edgeBttsYes = pBttsYes * kBttsYes - 1;
  const edgeBttsNo = pBttsNo * kBttsNo - 1;

  // D) High-Odds Value Filter (P >= 56% na kvoti >= 2.10)
  const highOddsOver = pOver25 >= 0.56 && kOver >= 2.10;
  const highOddsBtts = pBttsYes >= 0.56 && kBttsYes >= 2.10;
  const highOddsAlert = highOddsOver || highOddsBtts;

  // Golden Sniper: Edge >= +8.0% na kvoti >= 2.10
  const goldenOver = kOver >= 2.10 && edgeOver >= 0.08;
  const goldenBtts = kBttsYes >= 2.10 && edgeBttsYes >= 0.08;
  const goldenSniper = goldenOver || goldenBtts;

  // Anomaly Score (0 - 100%)
  let score = 35;
  if (hasPpdaClash) score += 25;
  if (isStrictRef) score += 15;
  if (highOddsAlert) score += 15;
  if (goldenSniper) score += 10;
  score += Math.round(Math.max(0, Math.max(edgeOver, edgeBttsYes)) * 25);
  const anomalyScore = clamp(score, 10, 100);

  const oddsCells = {
    over25: {
      market: "O/U 2.5" as const,
      tip: "Over 2.5" as const,
      odd: kOver,
      prob: pOver25,
      edge: edgeOver,
      isHighValue: highOddsOver,
      isGoldenSniper: goldenOver,
    },
    under25: {
      market: "O/U 2.5" as const,
      tip: "Under 2.5" as const,
      odd: kUnder,
      prob: pUnder25,
      edge: edgeUnder,
      isHighValue: false,
      isGoldenSniper: false,
    },
    bttsYes: {
      market: "BTTS" as const,
      tip: "GG" as const,
      odd: kBttsYes,
      prob: pBttsYes,
      edge: edgeBttsYes,
      isHighValue: highOddsBtts,
      isGoldenSniper: goldenBtts,
    },
    bttsNo: {
      market: "BTTS" as const,
      tip: "NG" as const,
      odd: kBttsNo,
      prob: pBttsNo,
      edge: edgeBttsNo,
      isHighValue: false,
      isGoldenSniper: false,
    },
  };

  const reasoningParts: string[] = [];
  if (goldenSniper) {
    reasoningParts.push(
      `GOLDEN SNIPER DETEKTIRAN: Visoka kvota (${goldenOver ? `Over 2.5 @${kOver.toFixed(2)}` : `GG @${kBttsYes.toFixed(2)}`}) s Edgeom od +${((goldenOver ? edgeOver : edgeBttsYes) * 100).toFixed(1)}%.`
    );
  }
  if (hasPpdaClash) reasoningParts.push(tacticalDescription);
  if (isStrictRef) reasoningParts.push(refDesc);
  reasoningParts.push(
    `Game-State Hazard Rate: ${(hazardRate * 100).toFixed(0)}% šanse za ubrzanje tempa nakon prvog gola.`
  );

  return {
    match: input.match,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    league: input.league ?? "Nogomet",
    time: input.time ?? "Uskoro",
    fixtureId: input.fixtureId,
    lambdaHome: lamH,
    lambdaAway: lamA,
    lambdaTotal: lamH + lamA,
    probOver25: pOver25,
    probUnder25: pUnder25,
    probBttsYes: pBttsYes,
    probBttsNo: pBttsNo,
    anomalyScore,
    hazardRate,
    tacticalClash: {
      hasClash: hasPpdaClash,
      label: tacticalLabel,
      description: tacticalDescription,
    },
    refereeImpact: {
      applied: isStrictRef,
      name: input.referee?.name,
      penaltiesPerGame: refPens ?? undefined,
      yellowCardsPerGame: refCards ?? undefined,
      description: refDesc,
    },
    highOddsAlert,
    goldenSniper,
    oddsCells,
    reasoningSummary: reasoningParts.join(" "),
  };
}

/** Formatirani blok za Luna & Orion sistemski kontekst */
export function formatSniperAnomalyForAI(r: SniperAnalysisResult): string[] {
  const lines: string[] = [];
  lines.push(`ANOMALY SCORE: ${r.anomalyScore}% · Hazard Rate: ${(r.hazardRate * 100).toFixed(0)}% (otvaranje igre nakon 1. gola)`);
  if (r.goldenSniper) {
    lines.push("GOLDEN SNIPER ALERT: Pronađen je skriveni visoki value na kvotama iznad 2.10 s Edge-om >= +8.0%!");
  } else if (r.highOddsAlert) {
    lines.push("HIGH ODDS VALUE ALERT: Model ima >= 56% na visokoj tržišnoj kvoti (>= 2.10).");
  }
  if (r.tacticalClash.hasClash) {
    lines.push(`Taktički sudar: ${r.tacticalClash.description}`);
  }
  if (r.refereeImpact.applied) {
    lines.push(`Sudac: ${r.refereeImpact.description}`);
  }
  lines.push(
    `Model projekcije: Over 2.5 ${(r.probOver25 * 100).toFixed(1)}% (kvota ${r.oddsCells.over25.odd.toFixed(2)}, Edge ${r.oddsCells.over25.edge >= 0 ? "+" : ""}${(r.oddsCells.over25.edge * 100).toFixed(1)}%) | ` +
    `BTTS GG ${(r.probBttsYes * 100).toFixed(1)}% (kvota ${r.oddsCells.bttsYes.odd.toFixed(2)}, Edge ${r.oddsCells.bttsYes.edge >= 0 ? "+" : ""}${(r.oddsCells.bttsYes.edge * 100).toFixed(1)}%)`
  );
  return lines;
}
