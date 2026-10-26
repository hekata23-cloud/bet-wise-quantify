/**
 * Radar Insights — Enterprise Precision optional calculation module.
 * Pure TypeScript: no browser, network, React, or external dependencies.
 *
 * IMPORTANT: signals are only applied when the caller supplies real inputs.
 * Defaults never invent league position, derby status, xG splits, travel, or outcomes.
 */

export type EnterpriseSport = "football" | "basketball" | "handball";

export interface MotivationInput {
  sport: EnterpriseSport;
  /** Matchday number from the end of the season, 1 = final matchday. */
  matchdaysRemaining?: number;
  homeInRelegationZone?: boolean;
  awayInRelegationZone?: boolean;
  homeLockedMidTableNoStakes?: boolean;
  awayLockedMidTableNoStakes?: boolean;
  /** Set true only from reliable fixture/rivalry data, never inferred from names alone. */
  isDerby?: boolean;
  /** Optional manually/model-derived motivation values, each 0..10. */
  homeMotivation?: number;
  awayMotivation?: number;
  /** Configurable derby booking uplift. Default is a modest 10%. */
  derbyBookingMultiplier?: number;
}

export interface MotivationResult {
  homeIndex: number;
  awayIndex: number;
  matchIndex: number;
  homePpdaMultiplier: number;
  awayPpdaMultiplier: number;
  homeLambdaDelta: number;
  awayLambdaDelta: number;
  cardsFoulsMultiplier: number;
  derby: boolean;
  /** 0.04 means +4 percentage points of draw probability before renormalization. */
  drawProbabilityDelta: number;
  notes: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number | undefined, fallback = 0) =>
  value != null && Number.isFinite(value) ? value : fallback;

/** Match motivation and phase modifiers. No supplied inputs means neutral outputs. */
export function calculateMotivation(input: MotivationInput): MotivationResult {
  const finalEight =
    input.matchdaysRemaining != null &&
    input.matchdaysRemaining >= 1 &&
    input.matchdaysRemaining <= 8;
  const homeRelegation = Boolean(finalEight && input.homeInRelegationZone);
  const awayRelegation = Boolean(finalEight && input.awayInRelegationZone);
  const homeDeadRubber = Boolean(input.homeLockedMidTableNoStakes);
  const awayDeadRubber = Boolean(input.awayLockedMidTableNoStakes);
  const derby = Boolean(input.isDerby);

  const homeIndex = clamp(
    finite(input.homeMotivation, homeRelegation ? 9 : homeDeadRubber ? 2 : 5),
    0,
    10,
  );
  const awayIndex = clamp(
    finite(input.awayMotivation, awayRelegation ? 9 : awayDeadRubber ? 2 : 5),
    0,
    10,
  );
  const notes: string[] = [];
  if (homeRelegation) notes.push("Home team in relegation battle during final eight matchdays.");
  if (awayRelegation) notes.push("Away team in relegation battle during final eight matchdays.");
  if (homeDeadRubber) notes.push("Home team marked as mid-table with no remaining stakes.");
  if (awayDeadRubber) notes.push("Away team marked as mid-table with no remaining stakes.");
  if (derby)
    notes.push(
      "Fixture marked as derby; draw probability receives +4 percentage points before normalization.",
    );

  return {
    homeIndex,
    awayIndex,
    matchIndex: Math.round(((homeIndex + awayIndex) / 2) * 10) / 10,
    // Lower PPDA denotes more pressing intensity. This is a 8% reduction, not an increase.
    homePpdaMultiplier: homeRelegation ? 0.92 : 1,
    awayPpdaMultiplier: awayRelegation ? 0.92 : 1,
    homeLambdaDelta: homeDeadRubber ? -0.15 : 0,
    awayLambdaDelta: awayDeadRubber ? -0.15 : 0,
    cardsFoulsMultiplier:
      (homeRelegation || awayRelegation ? 1.12 : 1) *
      (derby ? Math.max(1, finite(input.derbyBookingMultiplier, 1.1)) : 1),
    derby,
    drawProbabilityDelta: derby ? 0.04 : 0,
    notes,
  };
}

/** Apply scoring-lambda adjustments without allowing negative or implausible values. */
export function applyMotivationToLambdas(
  homeLambda: number,
  awayLambda: number,
  result: MotivationResult,
): { homeLambda: number; awayLambda: number } {
  return {
    homeLambda: clamp(finite(homeLambda) + result.homeLambdaDelta, 0.05, 10),
    awayLambda: clamp(finite(awayLambda) + result.awayLambdaDelta, 0.05, 10),
  };
}

/** Apply the derby draw uplift and renormalize the 1X2 probabilities. */
export function applyDerbyDrawAdjustment(
  probabilities: { home: number; draw: number; away: number },
  drawDelta: number,
): { home: number; draw: number; away: number } {
  const h = clamp(finite(probabilities.home), 0, 1);
  const d = clamp(finite(probabilities.draw), 0, 1);
  const a = clamp(finite(probabilities.away), 0, 1);
  const total = h + d + a;
  if (total <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  const base = { home: h / total, draw: d / total, away: a / total };
  const newDraw = clamp(base.draw + finite(drawDelta), 0, 1);
  const nonDraw = base.home + base.away;
  if (nonDraw <= 0) return { home: 0, draw: 1, away: 0 };
  const remainder = 1 - newDraw;
  return {
    home: (remainder * base.home) / nonDraw,
    draw: newDraw,
    away: (remainder * base.away) / nonDraw,
  };
}

export interface SetPieceInput {
  totalXg: number;
  setPieceXg: number;
  /** Opponent aerial duel win fraction, 0..1. */
  opponentAerialDuelWinRate?: number;
  /** Opponent set-piece defensive efficiency, 0..1; higher means stronger defense. */
  opponentSetPieceDefensiveEfficiency?: number;
  /** Optional thresholds to adapt to the data provider's definitions. */
  heavySetPieceShareThreshold?: number;
  eliteAerialThreshold?: number;
  eliteSetPieceDefenseThreshold?: number;
}

export interface SetPieceResult {
  openPlayXg: number;
  setPieceXg: number;
  setPieceShare: number;
  eliteAerialDefense: boolean;
  efficiencyDrag: number;
  adjustedSetPieceXg: number;
  adjustedTotalXg: number;
  applied: boolean;
}

/** Split xG and apply the specified 18% set-piece efficiency drag only on a supported matchup. */
export function calculateSetPieceXg(input: SetPieceInput): SetPieceResult {
  const totalXg = Math.max(0, finite(input.totalXg));
  const setPieceXg = clamp(finite(input.setPieceXg), 0, totalXg);
  const openPlayXg = totalXg - setPieceXg;
  const share = totalXg > 0 ? setPieceXg / totalXg : 0;
  const heavyThreshold = clamp(finite(input.heavySetPieceShareThreshold, 0.35), 0, 1);
  const aerialThreshold = clamp(finite(input.eliteAerialThreshold, 0.68), 0, 1);
  const defenseThreshold = clamp(finite(input.eliteSetPieceDefenseThreshold, 0.68), 0, 1);
  const aerial = input.opponentAerialDuelWinRate;
  const efficiency = input.opponentSetPieceDefensiveEfficiency;
  const eliteAerialDefense =
    aerial != null &&
    efficiency != null &&
    Number.isFinite(aerial) &&
    Number.isFinite(efficiency) &&
    aerial >= aerialThreshold &&
    efficiency >= defenseThreshold;
  const applied = share > heavyThreshold && eliteAerialDefense;
  const efficiencyDrag = applied ? 0.18 : 0;
  const adjustedSetPieceXg = setPieceXg * (1 - efficiencyDrag);
  return {
    openPlayXg,
    setPieceXg,
    setPieceShare: share,
    eliteAerialDefense,
    efficiencyDrag,
    adjustedSetPieceXg,
    adjustedTotalXg: openPlayXg + adjustedSetPieceXg,
    applied,
  };
}

export interface TravelInput {
  sport: "basketball" | "handball";
  distanceKm?: number;
  timezoneChanges?: number;
  restHours?: number;
  /** Elevation of venue in meters above sea level. */
  venueAltitudeM?: number;
  /** True when the visiting club is on consecutive road games. */
  backToBackRoadTrip?: boolean;
  /** Optional provider-derived baseline metrics. */
  expectedEfg?: number;
  expectedSecondHalfSaveRate?: number;
  /** Configurable additional relative fatigue; default 1.5% altitude + 1% road B2B. */
  altitudeFatigueRate?: number;
  roadB2bFatigueRate?: number;
}

export interface TravelResult {
  travelDragApplied: boolean;
  altitudeApplied: boolean;
  backToBackRoadApplied: boolean;
  efgPenaltyRate: number;
  secondHalfSavePenaltyRate: number;
  adjustedExpectedEfg: number | null;
  adjustedSecondHalfSaveRate: number | null;
  fatigueMultiplier: number;
  notes: string[];
}

/** Travel/schedule penalty from the supplied away-team itinerary. */
export function calculateTravelFatigue(input: TravelInput): TravelResult {
  const distance = Math.max(0, finite(input.distanceKm));
  const zones = Math.max(0, finite(input.timezoneChanges));
  const rest = input.restHours == null ? Infinity : Math.max(0, finite(input.restHours));
  const travelDragApplied = distance > 1200 || (zones >= 2 && rest < 48);
  const altitudeApplied = finite(input.venueAltitudeM) >= 1800;
  const backToBackRoadApplied = Boolean(input.backToBackRoadTrip);
  const extraFatigue =
    (altitudeApplied ? clamp(finite(input.altitudeFatigueRate, 0.015), 0, 0.1) : 0) +
    (backToBackRoadApplied ? clamp(finite(input.roadB2bFatigueRate, 0.01), 0, 0.1) : 0);
  const efgPenaltyRate =
    input.sport === "basketball" ? (travelDragApplied ? 0.032 : 0) + extraFatigue : 0;
  const secondHalfSavePenaltyRate =
    input.sport === "handball" ? (travelDragApplied ? 0.045 : 0) + extraFatigue : 0;
  const notes: string[] = [];
  if (travelDragApplied)
    notes.push(
      input.sport === "basketball"
        ? "Travel penalty: eFG reduced by 3.2%."
        : "Travel penalty: second-half goalkeeper save rate reduced by 4.5%.",
    );
  if (altitudeApplied)
    notes.push(
      "High-altitude fatigue adjustment applied (default additional 1.5%; configurable assumption).",
    );
  if (backToBackRoadApplied)
    notes.push(
      "Back-to-back road fatigue adjustment applied (default additional 1%; configurable assumption).",
    );
  const adjustedExpectedEfg =
    input.expectedEfg == null ? null : Math.max(0, input.expectedEfg * (1 - efgPenaltyRate));
  const adjustedSecondHalfSaveRate =
    input.expectedSecondHalfSaveRate == null
      ? null
      : clamp(input.expectedSecondHalfSaveRate * (1 - secondHalfSavePenaltyRate), 0, 1);
  return {
    travelDragApplied,
    altitudeApplied,
    backToBackRoadApplied,
    efgPenaltyRate,
    secondHalfSavePenaltyRate,
    adjustedExpectedEfg,
    adjustedSecondHalfSaveRate,
    fatigueMultiplier: 1 - extraFatigue,
    notes,
  };
}

/* ── FINE-GRAINED MATCH EDGE CASES ───────────────────────────────────
   Optional pure functions. They are neutral unless the caller supplies
   measured/localized inputs; thresholds are explicit, not inferred.
*/

export interface CircadianInput {
  /** Local kickoff minute of day, 0..1439. Supply venue-local time. */
  localKickoffMinutes: number;
  /** True only when reliable itinerary data confirms away-team road travel. */
  awayHadRoadTravel?: boolean;
}

export interface CircadianResult {
  earlyKickoffApplied: boolean;
  firstHalfLambdaDelta: number;
  lateNightRoadFatigueApplied: boolean;
  secondHalfDefensiveFatigueRate: number;
  notes: string[];
}

/** Early kickoff is 12:00–13:30 inclusive; late-night road fatigue starts at 21:00. */
export function calculateCircadianAdjustment(input: CircadianInput): CircadianResult {
  const minutes = input.localKickoffMinutes;
  const valid = Number.isFinite(minutes) && minutes >= 0 && minutes < 1440;
  const earlyKickoffApplied = valid && minutes >= 12 * 60 && minutes <= 13 * 60 + 30;
  const lateNightRoadFatigueApplied =
    valid && minutes >= 21 * 60 && Boolean(input.awayHadRoadTravel);
  const notes: string[] = [];
  if (earlyKickoffApplied)
    notes.push("Early local kickoff (12:00–13:30): first-half lambda delta −0.10.");
  if (lateNightRoadFatigueApplied)
    notes.push(
      "Kickoff at/after 21:00 after away-team road travel: second-half defensive fatigue +3.5%.",
    );
  return {
    earlyKickoffApplied,
    firstHalfLambdaDelta: earlyKickoffApplied ? -0.1 : 0,
    lateNightRoadFatigueApplied,
    secondHalfDefensiveFatigueRate: lateNightRoadFatigueApplied ? 0.035 : 0,
    notes,
  };
}

/** Apply the early-kickoff adjustment without allowing a negative first-half lambda. */
export function applyCircadianToFirstHalfLambda(lambdaHT: number, result: CircadianResult): number {
  const base = Number.isFinite(lambdaHT) ? Math.max(0, lambdaHT) : 0;
  return Math.max(0, base + result.firstHalfLambdaDelta);
}

export interface BenchDepthInput {
  homeSubstituteXgContribution: number;
  awaySubstituteXgContribution: number;
  /** Explicit provider/model thresholds in xG; high must be greater than thin. */
  highBenchThresholdXg: number;
  thinBenchThresholdXg: number;
  homeExpectedLateXga?: number;
  awayExpectedLateXga?: number;
}

export interface BenchSideResult {
  substituteXgContribution: number;
  benchClass: "high" | "adequate" | "thin";
  lateGoalLambdaMultiplier: number;
  lateXgaMultiplier: number;
  adjustedLateXga: number | null;
  pressingEfficiencyMaintainedAfter70: boolean;
}

export interface BenchDepthResult {
  home: BenchSideResult;
  away: BenchSideResult;
  notes: string[];
}

/** Compare supplied substitute xG. No player-quality data is guessed. */
export function calculateBenchDepth(input: BenchDepthInput): BenchDepthResult {
  const values = [
    input.homeSubstituteXgContribution,
    input.awaySubstituteXgContribution,
    input.highBenchThresholdXg,
    input.thinBenchThresholdXg,
  ];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    input.highBenchThresholdXg <= input.thinBenchThresholdXg
  ) {
    throw new RangeError(
      "Bench xG values must be finite/non-negative and highBenchThresholdXg must exceed thinBenchThresholdXg.",
    );
  }
  const makeSide = (xg: number, expectedLateXga?: number): BenchSideResult => {
    const benchClass =
      xg >= input.highBenchThresholdXg
        ? "high"
        : xg < input.thinBenchThresholdXg
          ? "thin"
          : "adequate";
    const lateGoalLambdaMultiplier = benchClass === "high" ? 1.12 : 1;
    const lateXgaMultiplier = benchClass === "thin" ? 1.12 : 1;
    const validXga =
      expectedLateXga != null && Number.isFinite(expectedLateXga) && expectedLateXga >= 0;
    return {
      substituteXgContribution: xg,
      benchClass,
      lateGoalLambdaMultiplier,
      lateXgaMultiplier,
      adjustedLateXga: validXga ? expectedLateXga! * lateXgaMultiplier : null,
      pressingEfficiencyMaintainedAfter70: benchClass === "high",
    };
  };
  const home = makeSide(input.homeSubstituteXgContribution, input.homeExpectedLateXga);
  const away = makeSide(input.awaySubstituteXgContribution, input.awayExpectedLateXga);
  const notes = [
    `Bench substitute xG comparison: home ${home.substituteXgContribution.toFixed(2)} (${home.benchClass}), away ${away.substituteXgContribution.toFixed(2)} (${away.benchClass}).`,
  ];
  if (home.benchClass === "high")
    notes.push(
      "Home high-quality bench: maintain late pressing efficiency and apply 1.12 multiplier to supplied 75–90 minute goal lambda.",
    );
  if (away.benchClass === "high")
    notes.push(
      "Away high-quality bench: maintain late pressing efficiency and apply 1.12 multiplier to supplied 75–90 minute goal lambda.",
    );
  if (home.benchClass === "thin")
    notes.push("Home thin bench: apply 1.12 multiplier to supplied late xGA.");
  if (away.benchClass === "thin")
    notes.push("Away thin bench: apply 1.12 multiplier to supplied late xGA.");
  return { home, away, notes };
}

export interface SuspensionPlayerInput {
  playerId: string;
  team: "home" | "away";
  isKeyPlayer: boolean;
  /** Cards remaining before suspension, as defined by the competition rules. */
  yellowsUntilSuspension: number;
  subsequentFixtureIsMajorDerby: boolean;
  expectedFouls: number;
  expectedBookingPoints: number;
}

export interface SuspensionPlayerResult extends SuspensionPlayerInput {
  cautionShieldApplied: boolean;
  adjustedExpectedFouls: number;
  adjustedExpectedBookingPoints: number;
}

/** Applies −18% only for key players one yellow from suspension before a confirmed major derby. */
export function applyDerbySuspensionShield(
  players: SuspensionPlayerInput[],
): SuspensionPlayerResult[] {
  return players.map((player) => {
    const eligible =
      player.isKeyPlayer &&
      player.yellowsUntilSuspension === 1 &&
      player.subsequentFixtureIsMajorDerby;
    const foulBase = Number.isFinite(player.expectedFouls) ? Math.max(0, player.expectedFouls) : 0;
    const bookingBase = Number.isFinite(player.expectedBookingPoints)
      ? Math.max(0, player.expectedBookingPoints)
      : 0;
    const multiplier = eligible ? 0.82 : 1;
    return {
      ...player,
      cautionShieldApplied: eligible,
      adjustedExpectedFouls: foulBase * multiplier,
      adjustedExpectedBookingPoints: bookingBase * multiplier,
    };
  });
}

export interface EdgeCaseMatchSignals {
  circadian?: CircadianResult;
  benchDepth?: BenchDepthResult;
  suspensionShield?: SuspensionPlayerResult[];
}

/** Format only caller-supplied edge-case outputs for the shared AI prompt. */
export function formatEdgeCaseSignals(signals: EdgeCaseMatchSignals): string[] {
  const lines: string[] = [];
  if (signals.circadian) lines.push(...signals.circadian.notes);
  if (signals.benchDepth) lines.push(...signals.benchDepth.notes);
  const shielded = signals.suspensionShield?.filter((player) => player.cautionShieldApplied) ?? [];
  for (const player of shielded) {
    lines.push(
      `Derby suspension caution: key ${player.team} player ${player.playerId} is one yellow from suspension before a confirmed major derby; fouls and booking points reduced 18% (${player.adjustedExpectedFouls.toFixed(2)} expected fouls, ${player.adjustedExpectedBookingPoints.toFixed(2)} booking points).`,
    );
  }
  return lines;
}

export interface CalibrationSample {
  /** Model's original probability, in [0,1]. */
  probability: number;
  /** Settled binary outcome. */
  outcome: 0 | 1;
  /** Keep calibrations separated by market/sport when possible. */
  market?: string;
  settledAt?: number;
}

export interface CalibrationMetrics {
  n: number;
  brier: number | null;
  logLoss: number | null;
  meanPredicted: number | null;
  observedRate: number | null;
  reliabilityGap: number | null;
  calibrated: boolean;
  status: "insufficient-data" | "calibrated" | "needs-review";
}

const validSamples = (samples: CalibrationSample[], market?: string) =>
  samples
    .filter(
      (s) =>
        Number.isFinite(s.probability) &&
        s.probability >= 0 &&
        s.probability <= 1 &&
        (s.outcome === 0 || s.outcome === 1) &&
        (market == null || s.market === market),
    )
    .slice(-500);

/** Brier/log-loss metrics on up to the latest 500 settled outcomes. */
export function calculateCalibrationMetrics(
  samples: CalibrationSample[],
  market?: string,
): CalibrationMetrics {
  const data = validSamples(samples, market);
  const n = data.length;
  if (!n)
    return {
      n: 0,
      brier: null,
      logLoss: null,
      meanPredicted: null,
      observedRate: null,
      reliabilityGap: null,
      calibrated: false,
      status: "insufficient-data",
    };
  const eps = 1e-15;
  const brier = data.reduce((sum, s) => sum + (s.probability - s.outcome) ** 2, 0) / n;
  const logLoss =
    data.reduce((sum, s) => {
      const p = clamp(s.probability, eps, 1 - eps);
      return sum - (s.outcome * Math.log(p) + (1 - s.outcome) * Math.log(1 - p));
    }, 0) / n;
  const meanPredicted = data.reduce((sum, s) => sum + s.probability, 0) / n;
  const observedRate = data.reduce((sum, s) => sum + s.outcome, 0) / n;
  const reliabilityGap = Math.abs(meanPredicted - observedRate);
  // This is a transparent reporting threshold, not a guarantee of future performance.
  const calibrated = n >= 100 && brier < 0.18 && reliabilityGap <= 0.05;
  return {
    n,
    brier,
    logLoss,
    meanPredicted,
    observedRate,
    reliabilityGap,
    calibrated,
    status: n < 100 ? "insufficient-data" : calibrated ? "calibrated" : "needs-review",
  };
}

/**
 * Isotonic-style empirical calibration using pool-adjacent-violators.
 * Requires at least 50 outcomes; otherwise preserves the original probability.
 * Use a single market/sport cohort, not a mixture of unrelated outcomes.
 */
export function calibrateProbability(
  probability: number,
  samples: CalibrationSample[],
  options: { market?: string; minSamples?: number; maxSamples?: number } = {},
): number {
  const p = clamp(finite(probability), 0, 1);
  const data = validSamples(samples, options.market)
    .slice(-(options.maxSamples ?? 500))
    .sort((a, b) => a.probability - b.probability);
  if (data.length < (options.minSamples ?? 50)) return p;
  type Block = { min: number; max: number; n: number; sum: number; mean: number };
  const blocks: Block[] = [];
  for (const sample of data) {
    blocks.push({
      min: sample.probability,
      max: sample.probability,
      n: 1,
      sum: sample.outcome,
      mean: sample.outcome,
    });
    while (
      blocks.length >= 2 &&
      blocks[blocks.length - 2]!.mean > blocks[blocks.length - 1]!.mean
    ) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const merged: Block = {
        min: left.min,
        max: right.max,
        n: left.n + right.n,
        sum: left.sum + right.sum,
        mean: (left.sum + right.sum) / (left.n + right.n),
      };
      blocks.push(merged);
    }
  }
  let best = blocks[0]!;
  let bestDistance = Infinity;
  for (const block of blocks) {
    const distance = p < block.min ? block.min - p : p > block.max ? p - block.max : 0;
    if (distance < bestDistance) {
      best = block;
      bestDistance = distance;
    }
  }
  // Small smoothing avoids returning hard 0/1 from tiny local plateaus.
  return clamp((best.sum + 1) / (best.n + 2), 0.01, 0.99);
}

/** A compact, serializable object intended for the existing Luna/Orion match context. */
export interface EnterpriseMatchSignals {
  edgeCases?: EdgeCaseMatchSignals;
  motivation?: MotivationResult;
  homeSetPieceXg?: SetPieceResult;
  awaySetPieceXg?: SetPieceResult;
  awayTravel?: TravelResult;
  calibration?: CalibrationMetrics;
}

/** Format signals for the shared AI context without asserting absent data. */
export function formatEnterpriseSignals(signals: EnterpriseMatchSignals): string[] {
  const lines: string[] = [];
  if (signals.edgeCases) lines.push(...formatEdgeCaseSignals(signals.edgeCases));
  if (signals.motivation) {
    const m = signals.motivation;
    lines.push(
      `Motivation index (0-10): home ${m.homeIndex.toFixed(1)}, away ${m.awayIndex.toFixed(1)}, match ${m.matchIndex.toFixed(1)}.`,
    );
    if (m.homeLambdaDelta || m.awayLambdaDelta)
      lines.push(
        `Motivation lambda deltas: home ${m.homeLambdaDelta.toFixed(2)}, away ${m.awayLambdaDelta.toFixed(2)}.`,
      );
    if (m.derby)
      lines.push(
        "Derby adjustment active: +4 percentage points to draw before renormalizing 1X2; booking multiplier included.",
      );
    if (m.cardsFoulsMultiplier !== 1)
      lines.push(`Expected cards/fouls multiplier: ${m.cardsFoulsMultiplier.toFixed(3)}.`);
    if (m.homePpdaMultiplier !== 1 || m.awayPpdaMultiplier !== 1)
      lines.push(
        `PPDA multipliers: home ${m.homePpdaMultiplier.toFixed(2)}, away ${m.awayPpdaMultiplier.toFixed(2)} (lower PPDA indicates higher pressing intensity).`,
      );
  }
  for (const [side, xg] of [
    ["Home", signals.homeSetPieceXg],
    ["Away", signals.awaySetPieceXg],
  ] as const) {
    if (xg)
      lines.push(
        `${side} xG split: open play ${xg.openPlayXg.toFixed(2)}, set-piece ${xg.setPieceXg.toFixed(2)} (${(xg.setPieceShare * 100).toFixed(1)}%); adjusted total ${xg.adjustedTotalXg.toFixed(2)}${xg.applied ? " after 18% set-piece efficiency drag" : "; no drag"}.`,
      );
  }
  if (signals.awayTravel) {
    const t = signals.awayTravel;
    if (
      t.efgPenaltyRate ||
      t.secondHalfSavePenaltyRate ||
      t.altitudeApplied ||
      t.backToBackRoadApplied
    )
      lines.push(
        `Away travel/schedule strain: eFG penalty ${(t.efgPenaltyRate * 100).toFixed(1)}%, second-half save-rate penalty ${(t.secondHalfSavePenaltyRate * 100).toFixed(1)}%; ${t.notes.join(" ")}`,
      );
  }
  if (signals.calibration) {
    const c = signals.calibration;
    lines.push(
      `Calibration: ${c.status}, n=${c.n}${c.brier == null ? "" : `, Brier ${c.brier.toFixed(3)}, log-loss ${c.logLoss?.toFixed(3) ?? "—"}`}. Historical metric only; no outcome is guaranteed.`,
    );
  }
  return lines;
}
