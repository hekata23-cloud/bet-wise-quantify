// Napredni Value Bet Engine za nogometna tržišta golova.
// Uspoređuje realne vjerojatnosti modela s kvotama kladionice
// i pronalazi oklade s pozitivnom očekivanom vrijednošću (Positive EV).

export type MarketValue = {
  market: "2.5 VIŠE" | "2.5 MANJE" | "BTTS DA" | "BTTS NE";
  bookieOdd: number;
  fairOdd: number; // Pravedna kvota po modelu (1 / pReal)
  modelProb: number; // Postotak vjerojatnosti po modelu (npr. 58.4%)
  ev: number; // Expected value u postotku (npr. +8.5% ili -4.2%)
  edge: number; // Prednost nad kladionicom u postotnim bodovima
  isRecommended: boolean;
  status: "ODLIČAN VALUE" | "DOBAR VALUE" | "FER KVOTA" | "ZAMKA (NEGATIVAN VALUE)";
};

export type ValueScanResult = {
  bestValue: MarketValue | null;
  worstTrap: MarketValue | null;
  allMarkets: MarketValue[];
  summary: string;
};

export function scanAllMarketValues(
  kOver25: number,
  kUnder25: number,
  kGg: number,
  kNg: number,
  modelProbOver25: number, // 0.0 do 1.0
  modelProbGg: number, // 0.0 do 1.0
): ValueScanResult {
  const pOver = Math.max(0.05, Math.min(0.95, modelProbOver25));
  const pUnder = 1 - pOver;
  const pGg = Math.max(0.05, Math.min(0.95, modelProbGg));
  const pNg = 1 - pGg;

  const marketsData: {
    market: MarketValue["market"];
    bookieOdd: number;
    prob: number;
  }[] = [
    { market: "2.5 VIŠE", bookieOdd: kOver25, prob: pOver },
    { market: "2.5 MANJE", bookieOdd: kUnder25, prob: pUnder },
    { market: "BTTS DA", bookieOdd: kGg, prob: pGg },
    { market: "BTTS NE", bookieOdd: kNg, prob: pNg },
  ];

  // POPRAVAK: izostavi nevaljane decimalne kvote kako ne bi stvarale beskonačan ili neskladni EV.
  const allMarkets: MarketValue[] = marketsData
    .filter((item) => Number.isFinite(item.bookieOdd) && item.bookieOdd > 1)
    .map((item) => {
      const bookieImplied = 1 / item.bookieOdd;
      const evRaw = item.prob * item.bookieOdd - 1;
      const ev = Number((evRaw * 100).toFixed(1));
      const edge = Number(((item.prob - bookieImplied) * 100).toFixed(1));
      const fairOdd = Number((1 / item.prob).toFixed(2));

      let status: MarketValue["status"] = "FER KVOTA";
      let isRecommended = false;

      if (ev >= 7.0) {
        status = "ODLIČAN VALUE";
        isRecommended = true;
      } else if (ev >= 2.5) {
        status = "DOBAR VALUE";
        isRecommended = true;
      } else if (ev <= -5.0) {
        status = "ZAMKA (NEGATIVAN VALUE)";
      }

      return {
        market: item.market,
        bookieOdd: Number(item.bookieOdd.toFixed(2)),
        fairOdd,
        modelProb: Number((item.prob * 100).toFixed(1)),
        ev,
        edge,
        isRecommended,
        status,
      };
    });

  // Sortiraj po najvećem EV
  const sorted = [...allMarkets].sort((a, b) => b.ev - a.ev);
  const bestCandidate = sorted[0];
  const best = bestCandidate && bestCandidate.ev > 2.0 ? bestCandidate : null;
  const worstCandidate = sorted[sorted.length - 1];
  const worst = worstCandidate && worstCandidate.ev < -4.0 ? worstCandidate : null;

  let summary = "";
  if (best) {
    summary = `Pronađena je matematička prednost na tržištu ${best.market}. Kladionica nudi kvotu ${best.bookieOdd.toFixed(2)}, dok model smatra da bi fer kvota trebala biti ${best.fairOdd.toFixed(2)}. Očekivani plus je +${best.ev}%.`;
  } else {
    summary =
      "Kladionica je kvote postavila vrlo precizno. Niti jedno tržište ne nudi dovoljnu matematičku prednost za dugoročni profit.";
  }

  return {
    bestValue: best,
    worstTrap: worst,
    allMarkets,
    summary,
  };
}
