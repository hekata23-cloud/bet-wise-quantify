import { describe, expect, it } from "vitest";
import { scoreMatrix, marketProbs, devigPower as devigPower2 } from "@/lib/accuracy";
import { devigPower, devigMultiplicative } from "@/lib/formulas";

describe("Dixon-Coles korekcija (accuracy)", () => {
  it("pozitivan tau povećava remi u odnosu na neovisni Poisson", () => {
    const dc = marketProbs(scoreMatrix(1.5, 1.2, 0.08, 0));
    const ind = marketProbs(scoreMatrix(1.5, 1.2, 0, 0));
    expect(dc.draw).toBeGreaterThan(ind.draw);
  });
  it("matrica je normalizirana na 1", () => {
    const sum = scoreMatrix(1.5, 1.2)
      .m.flat()
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});

describe("de-vig", () => {
  it("power 3-way zbroji se na 1 i za vrlo visoku maržu", () => {
    const p = devigPower([1.1, 1.1, 1.1]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("multiplikativni zbroj je 1", () => {
    expect(devigMultiplicative([2, 3.4, 3.8]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("2-way power zbroj je 1", () => {
    const [a, b] = devigPower2(1.8, 2.1);
    expect(a + b).toBeCloseTo(1, 9);
  });
});
