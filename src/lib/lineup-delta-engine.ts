// ============================================================
// LINEUP-DELTA-ENGINE.TS — SARP Brain v4.0 + Titan Protokol v10
// T-45 Min Recalibration Engine
// ============================================================

export interface CoreContributor {
  id?: number;
  name: string;
  role: "GK" | "CB" | "STRIKER";
  importance: number; // 0..1
}

export interface TeamLineupInput {
  teamName: string;
  startXI: { id?: number; name: string; position?: string }[];
  primaryGoalkeeper?: string;
  keyCenterBacks?: string[];
  primaryStriker?: string;
}

export interface LineupDeltaResult {
  hasLineupAlert: boolean;
  defensiveRotationDetected: boolean;
  primaryStrikerBenched: boolean;
  bttsProbabilityBoost: number; // npr. +0.068 (+6.8%)
  over25ProbabilityBoost: number; // npr. +0.074 (+7.4%)
  lambdaAttackDelta: number; // npr. -0.18
  recalibratedBttsYes: number;
  recalibratedOver25: number;
  recalibratedLambdaHome: number;
  recalibratedLambdaAway: number;
  badgeLabel: string | null;
  alertNotes: string[];
}

/**
 * Uspoređuje objavljene postave (T-45 minuta) s ključnim igračima tima.
 * Ako fali startni golman ili ključni stoper:
 *   - BTTS YES skače za +6.8% (+0.068)
 *   - Over 2.5 skače za +7.4% (+0.074)
 *   - Badge: "LINEUP ALERT: DEFENSIVE ROTATION DETECTED"
 * Ako fali prvi strijelac tima:
 *   - lambda_attack se smanjuje za -0.18
 */
export function evaluateLineupDelta(params: {
  home: TeamLineupInput;
  away: TeamLineupInput;
  baselineBttsYes: number;
  baselineOver25: number;
  baselineLambdaHome: number;
  baselineLambdaAway: number;
}): LineupDeltaResult {
  const {
    home,
    away,
    baselineBttsYes,
    baselineOver25,
    baselineLambdaHome,
    baselineLambdaAway,
  } = params;

  const notes: string[] = [];
  let defensiveRotationDetected = false;
  let primaryStrikerBenched = false;
  let lambdaHomeDelta = 0;
  let lambdaAwayDelta = 0;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const isPlayerInLineup = (lineup: TeamLineupInput, targetName?: string) => {
    if (!targetName || !lineup.startXI || lineup.startXI.length === 0) return true;
    const targetNorm = normalize(targetName);
    return lineup.startXI.some((p) => {
      const pNorm = normalize(p.name);
      return pNorm.includes(targetNorm) || targetNorm.includes(pNorm);
    });
  };

  // 1. Provjera domaće obrane (GK i CB)
  if (home.primaryGoalkeeper && !isPlayerInLineup(home, home.primaryGoalkeeper)) {
    defensiveRotationDetected = true;
    notes.push(`[${home.teamName}] Startni vratar (${home.primaryGoalkeeper}) odmara ili je izostao.`);
  }

  if (home.keyCenterBacks && home.keyCenterBacks.length > 0) {
    for (const cb of home.keyCenterBacks) {
      if (!isPlayerInLineup(home, cb)) {
        defensiveRotationDetected = true;
        notes.push(`[${home.teamName}] Ključni obrambeni stoper (${cb}) nije u početnom sastavu.`);
      }
    }
  }

  // 2. Provjera gostujuće obrane (GK i CB)
  if (away.primaryGoalkeeper && !isPlayerInLineup(away, away.primaryGoalkeeper)) {
    defensiveRotationDetected = true;
    notes.push(`[${away.teamName}] Startni vratar (${away.primaryGoalkeeper}) odmara ili je izostao.`);
  }

  if (away.keyCenterBacks && away.keyCenterBacks.length > 0) {
    for (const cb of away.keyCenterBacks) {
      if (!isPlayerInLineup(away, cb)) {
        defensiveRotationDetected = true;
        notes.push(`[${away.teamName}] Ključni obrambeni stoper (${cb}) nije u početnom sastavu.`);
      }
    }
  }

  // 3. Provjera prvih strijelaca (lambda attack -0.18)
  if (home.primaryStriker && !isPlayerInLineup(home, home.primaryStriker)) {
    primaryStrikerBenched = true;
    lambdaHomeDelta -= 0.18;
    notes.push(`[${home.teamName}] Glavni strijelac (${home.primaryStriker}) na klupi — napadački λ korigiran (-0.18).`);
  }

  if (away.primaryStriker && !isPlayerInLineup(away, away.primaryStriker)) {
    primaryStrikerBenched = true;
    lambdaAwayDelta -= 0.18;
    notes.push(`[${away.teamName}] Glavni strijelac (${away.primaryStriker}) na klupi — napadački λ korigiran (-0.18).`);
  }

  // Izračun buster koeficijenata
  const bttsBoost = defensiveRotationDetected ? 0.068 : 0;
  const over25Boost = defensiveRotationDetected ? 0.074 : 0;

  const clamp = (v: number, min = 0.01, max = 0.99) => Math.max(min, Math.min(max, v));

  const recalibratedBttsYes = clamp(baselineBttsYes + bttsBoost);
  const recalibratedOver25 = clamp(baselineOver25 + over25Boost);
  const recalibratedLambdaHome = Math.max(0.2, baselineLambdaHome + lambdaHomeDelta);
  const recalibratedLambdaAway = Math.max(0.2, baselineLambdaAway + lambdaAwayDelta);

  const hasLineupAlert = defensiveRotationDetected || primaryStrikerBenched;
  const badgeLabel = defensiveRotationDetected
    ? "LINEUP ALERT: DEFENSIVE ROTATION DETECTED"
    : primaryStrikerBenched
      ? "LINEUP ALERT: STRIKER BENCHED"
      : null;

  return {
    hasLineupAlert,
    defensiveRotationDetected,
    primaryStrikerBenched,
    bttsProbabilityBoost: bttsBoost,
    over25ProbabilityBoost: over25Boost,
    lambdaAttackDelta: lambdaHomeDelta + lambdaAwayDelta,
    recalibratedBttsYes,
    recalibratedOver25,
    recalibratedLambdaHome,
    recalibratedLambdaAway,
    badgeLabel,
    alertNotes: notes,
  };
}
