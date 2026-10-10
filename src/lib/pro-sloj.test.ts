import { describe, it, expect } from "vitest";
import { powerDevig, pinnacleCompare, oddsMovement, calibrate } from "./pro-sloj";

describe("pro-sloj", () => {
  it("de-vig vjerojatnosti zbrajaju 1", () => {
    const p = powerDevig([2.1, 3.4, 3.6]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("value tek iznad 2% prednosti", () => {
    const r = pinnacleCompare([2.0, 2.0], [2.2, 1.8]);
    expect(r[0].value).toBe(true);
    expect(r[1].value).toBe(false);
  });
  it("steam kad vjerojatnost naraste ≥3 boda", () => {
    expect(oddsMovement([2.2, 3.3, 3.4], [1.9, 3.6, 4.0])[0].signal).toBe("steam");
  });
  it("kalibracija povlači prema 50%", () => {
    expect(calibrate(0.8, 0.5)).toBeCloseTo(0.65, 6);
  });
});
