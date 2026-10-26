import { describe, expect, it } from "vitest";
import {
  evaluatePredictionIntegrity,
  footballContradiction,
  noVigProbability,
  twoWayMarginPercent,
} from "@/lib/prediction-integrity";

describe("prediction integrity gate", () => {
  it("never raises the engine probability", () => {
    const r = evaluatePredictionIntegrity({ probability: 0.8, odds: 1.5, dataQuality: 0.4 });
    expect(r.probability).toBeLessThanOrEqual(0.8);
  });

  it("blocks contradictory picks", () => {
    const r = evaluatePredictionIntegrity({
      probability: 0.7,
      odds: 1.8,
      dataQuality: 1,
      contradictory: true,
    });
    expect(r.status).toBe("PRESKOČI");
    expect(r.approved).toBe(false);
  });

  it("skips near 50/50 picks", () => {
    const r = evaluatePredictionIntegrity({ probability: 0.51, odds: 2.1, dataQuality: 1 });
    expect(r.status).toBe("PRESKOČI");
  });

  it("certifies strong clean value picks", () => {
    const r = evaluatePredictionIntegrity({
      probability: 0.7,
      odds: 1.6,
      marketProbability: 0.67,
      dataQuality: 1,
      marginPercent: 4,
    });
    expect(r.status).toBe("CERTIFICIRAN");
  });

  it("computes no-vig probability and margin", () => {
    expect(noVigProbability(2, 2)).toBeCloseTo(0.5);
    expect(twoWayMarginPercent(1.9, 1.9)).toBeCloseTo(5.26, 1);
  });

  it("flags Over 2.5 when model favours under", () => {
    expect(footballContradiction({ selected: "OVER_25", over25: 0.45 })).toBe(true);
  });
});
