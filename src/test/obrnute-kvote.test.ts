import { describe, expect, it } from "vitest";
import { analizirajObrnuto } from "@/lib/obrnute-kvote";
import { pickTotal, type Tip } from "@/lib/kosarka-engine";

describe("obrnute kvote", () => {
  it("flags Manje 2.5 @1.65 as trap when 1X2 implies an open game", () => {
    const r = analizirajObrnuto({ k1: 1.5, kx: 5.0, k2: 6.0, kOver: 2.4, kUnder: 1.65 })!;
    expect(r.signali[0]!.skupa).toBe("Više 2.5");
    expect(r.signali[0]!.razina).not.toBe("OK");
  });
});

describe("košarka obavezan zbroj", () => {
  it("always returns Više or Manje on the main line", () => {
    const t = (pick: string, prob: number): Tip => ({
      market: "Zbroj 220.5",
      pick,
      prob,
      fair: 1 / prob,
      odd: 1.9,
      ev: (prob * 1.9 - 1) * 100,
    });
    const p = pickTotal(
      [t("Više 220.5", 0.53), t("Manje 220.5", 0.47)],
      [{ line: 220.5, o: 1.9, u: 1.9 }],
    );
    expect(p.pick).toBe("Više 220.5");
  });
});
