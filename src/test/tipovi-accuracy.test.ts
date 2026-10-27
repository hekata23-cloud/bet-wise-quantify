import { describe, expect, it } from "vitest";
import { devigPower } from "@/lib/devig-shield";
import { evaluateMatchConfidence } from "@/lib/confidence-score";
import { computeBttsOverAnalysis } from "@/lib/btts-over";
import { analyze, matrix } from "@/lib/zlatni-engine";
import { computeHtFtAnalysis } from "@/lib/ht-ft";
import { analyzeOU, analyzeBTTS } from "@/lib/predictor";

describe("Preciznost tipova i matematička konzistentnost", () => {
  it("devigPower u devig-shield daje vjerojatnosti čiji je zbroj točno 1.0", () => {
    const res = devigPower([1.25, 1.35]);
    expect(res).toHaveLength(2);
    expect(res[0]! + res[1]!).toBeCloseTo(1.0, 6);

    const highMargin = devigPower([1.1, 1.1]);
    expect(highMargin[0]! + highMargin[1]!).toBeCloseTo(1.0, 6);
  });

  it("confidence-score ne aktivira lažni Over kad je k22 nula ili nedostaje", () => {
    // Ako nema k22 (0), ali je adjOverProb nizak (35%), mora dati 2.5 MANJE, a ne 2.5 VIŠE
    const v = evaluateMatchConfidence(0, 2.8, 2.2, 1.0);
    expect(v.primaryMarket).toBe("2.5 MANJE");
  });

  it("btts-over bira ishod s višom vjerojatnošću i ne izvrće 51% u suprotan tip", () => {
    // Kad je pOver25 > pUnder25, odabir mora biti Više 2.5
    const dummyAnalysis = analyze({} as any, { gfHome: 2.1, gaHome: 1.0, playedHome: 10 } as any, { gfAway: 1.8, gaAway: 1.2, playedAway: 10 } as any);
    const bttsOver = computeBttsOverAnalysis(dummyAnalysis, "Dinamo — Hajduk", "HNL", "18:00");

    if (bttsOver.over25Prob >= bttsOver.under25Prob) {
      expect(bttsOver.mainOverUnderTip.pick).toBe("Više 2.5");
      expect(bttsOver.mainOverUnderTip.prob).toBeGreaterThanOrEqual(0.5);
    } else {
      expect(bttsOver.mainOverUnderTip.pick).toBe("Manje 2.5");
      expect(bttsOver.mainOverUnderTip.prob).toBeGreaterThanOrEqual(0.5);
    }

    if (bttsOver.bttsYesProb >= bttsOver.bttsNoProb) {
      expect(bttsOver.mainBttsTip.pick).toBe("Oba daju gol (GG)");
      expect(bttsOver.mainBttsTip.prob).toBeGreaterThanOrEqual(0.5);
    } else {
      expect(bttsOver.mainBttsTip.pick).toBe("Barem jedan NE daje (NG)");
      expect(bttsOver.mainBttsTip.prob).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("zlatni-engine generira golden i safe tip i kada nema vanjskih kvota", () => {
    const analysis = analyze({} as any, { gfHome: 1.8, gaHome: 0.9, playedHome: 12 } as any, { gfAway: 0.9, gaAway: 1.9, playedAway: 12 } as any);
    expect(analysis.safe).not.toBeNull();
    expect(analysis.golden).not.toBeNull();
    expect(analysis.golden?.outcome.p).toBeGreaterThanOrEqual(0.55);
  });

  it("ht-ft odabire gostujućeg favorita (2/2) kad je dominantniji od domaćina", () => {
    // Gost izraziti favorit (npr. Man City u gostima: lh = 0.5, la = 2.4)
    const dummyAnalysis = analyze({} as any, { gfHome: 0.5, gaHome: 2.2, playedHome: 10 } as any, { gfAway: 2.6, gaAway: 0.6, playedAway: 10 } as any);
    const htft = computeHtFtAnalysis(dummyAnalysis, "Luton — Man City", "Premier League", "21:00");
    expect(htft.mainTip.pick).toBe("2/2");
  });

  it("predictor analyzeOU ne ruši Over vjerojatnost kad povijesni prosjek nije unesen", () => {
    const res = analyzeOU({
      homeXG: 2.2,
      awayXG: 1.8,
      line: 2.5,
      homeGoalsAvg: 0,
      awayGoalsAvg: 0,
    });
    // Očekivani golovi = 4.0, tip mora biti Over 2.5 s visokom vjerojatnošću (> 65%)
    expect(res.tip).toBe("Over 2.5");
    expect(res.probOver).toBeGreaterThan(0.65);
  });
});
