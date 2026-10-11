import { describe, it, expect } from "vitest";
import { asianHandicap, arbitrage, oneXtwo } from "./pro-alati";

describe("pro-alati", () => {
  it("AH 0 (DNB): push jednak vjerojatnosti remija", () => {
    const r = asianHandicap(1.5, 1.1, 0);
    expect(r.push).toBeCloseTo(oneXtwo(1.5, 1.1).d, 6);
  });
  it("surebet kad je zbroj 1/kvota < 1", () => {
    expect(arbitrage([2.1, 2.1], 100).surebet).toBe(true);
    expect(arbitrage([1.9, 1.9], 100).surebet).toBe(false);
  });
});
