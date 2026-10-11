import { matrix, type Analysis, type Outcome } from "@/lib/zlatni-engine";

export interface EdgeBet {
  fixtureId: number;
  match: string;
  league: string;
  time: string;
  market: string;
  selection: string;
  probability: number;
  fairOdd: number;
  bookmakerOdd: number;
  evPercent: number; // (prob * odd - 1) * 100
  recommendedKellyPercent: number; // Frakcijski 1/4 Kelly
}

export interface TicketRecommendation {
  type: "single" | "double" | "triplet";
  title: string;
  description: string;
  bets: EdgeBet[];
  combinedOdd: number;
  combinedProb: number;
  expectedValuePercent: number;
  recommendedStakePercent: number;
}

/** Računa EV (Expected Value) u postotku: (vjerojatnost * kvota - 1) * 100 */
export function calculateEV(probability: number, odd: number): number {
  return (probability * odd - 1) * 100;
}

/** Frakcijski 1/4 Kelly kriterij (max limit 4% bankrolla radi očuvanja kapitala) */
export function calculateFractionalKelly(probability: number, odd: number): number {
  if (odd <= 1 || probability <= 0) return 0;
  const b = odd - 1;
  const q = 1 - probability;
  const fullKelly = (b * probability - q) / b;
  if (fullKelly <= 0) return 0;
  const quarterKelly = fullKelly * 0.25 * 100;
  return Math.min(Math.round(quarterKelly * 10) / 10, 4.0);
}

/** Izvlači sve oklade s pozitivnim matematičkim očekivanjem iz analize utakmice */
export function extractEdgesFromAnalysis(
  fixtureId: number,
  match: string,
  league: string,
  time: string,
  analysis: Analysis
): EdgeBet[] {
  const edges: EdgeBet[] = [];

  for (const market of analysis.markets) {
    for (const outcome of market.outcomes) {
      if (!outcome.odd || outcome.odd <= 1.05) continue;

      const ev = calculateEV(outcome.p, outcome.odd);
      // Prikazujemo samo tipove koji imaju realnu šansu (>= 33%) i pozitivan EV (>= +1.5%)
      if (ev >= 1.5 && outcome.p >= 0.33) {
        const fairOdd = outcome.p > 0 ? Number((1 / outcome.p).toFixed(2)) : 0;
        const kelly = calculateFractionalKelly(outcome.p, outcome.odd);

        edges.push({
          fixtureId,
          match,
          league,
          time,
          market: market.name,
          selection: outcome.label,
          probability: outcome.p,
          fairOdd,
          bookmakerOdd: outcome.odd,
          evPercent: Math.round(ev * 10) / 10,
          recommendedKellyPercent: kelly,
        });
      }
    }
  }

  // Sortiraj od najvećeg EV prema manjem
  return edges.sort((a, b) => b.evPercent - a.evPercent);
}

/**
 * Monte Carlo simulator & arhitekt tiketa:
 * Bira najbolje nepovezane oklade (različite utakmice) s najvećom matematičkom vrijednošću.
 */
export function buildOptimalTickets(allEdges: EdgeBet[]): TicketRecommendation[] {
  const tickets: TicketRecommendation[] = [];
  if (allEdges.length === 0) return tickets;

  // 1. ZLATNI SINGL DANA (najveći EV s pouzdanošću >= 45%)
  const strongSingles = allEdges.filter((b) => b.probability >= 0.45 && b.evPercent >= 2.5);
  const bestSingle = strongSingles.length > 0 ? strongSingles[0] : allEdges[0];

  if (bestSingle) {
    tickets.push({
      type: "single",
      title: "🎯 Zlatni Singl Dana",
      description: "Oklada s najvećim matematičkim edge-om i najboljim omjerom vrijednosti i rizika.",
      bets: [bestSingle],
      combinedOdd: bestSingle.bookmakerOdd,
      combinedProb: bestSingle.probability,
      expectedValuePercent: bestSingle.evPercent,
      recommendedStakePercent: Math.max(bestSingle.recommendedKellyPercent, 1.0),
    });
  }

  // Pomoćna funkcija: osigurava da svaka oklada na listiću dolazi iz DRUGE utakmice (bez korelacije)
  const getIndependentBets = (candidates: EdgeBet[], count: number): EdgeBet[] => {
    const selected: EdgeBet[] = [];
    const usedFixtures = new Set<number>();

    for (const bet of candidates) {
      if (!usedFixtures.has(bet.fixtureId)) {
        selected.push(bet);
        usedFixtures.add(bet.fixtureId);
        if (selected.length === count) break;
      }
    }
    return selected;
  };

  // 2. SIGURNI DUBL DANA (2 nepovezana tipa sa šansom >= 70%)
  const safeCandidates = allEdges
    .filter((b) => b.probability >= 0.70 && b.bookmakerOdd >= 1.20)
    .sort((a, b) => b.probability - a.probability);

  const safeDoubleBets = getIndependentBets(safeCandidates, 2);
  if (safeDoubleBets.length === 2) {
    const combOdd = Number((safeDoubleBets[0].bookmakerOdd * safeDoubleBets[1].bookmakerOdd).toFixed(2));
    const combProb = safeDoubleBets[0].probability * safeDoubleBets[1].probability;
    const combEV = calculateEV(combProb, combOdd);

    tickets.push({
      type: "double",
      title: "🛡️ Sigurni Dubl Dana",
      description: "Dvije nezavisne oklade s visokom vjerojatnošću prolaza (>70%) i pozitivnom vrijednošću.",
      bets: safeDoubleBets,
      combinedOdd: combOdd,
      combinedProb: combProb,
      expectedValuePercent: Math.round(combEV * 10) / 10,
      recommendedStakePercent: 2.0,
    });
  }

  // 3. VALUE TRIPLEKS (3 nepovezana tipa s kvotama 1.40 - 2.20 i visokim EV)
  const tripletCandidates = allEdges
    .filter((b) => b.bookmakerOdd >= 1.40 && b.bookmakerOdd <= 2.20 && b.evPercent >= 2.0)
    .sort((a, b) => b.evPercent - a.evPercent);

  const tripletBets = getIndependentBets(tripletCandidates, 3);
  if (tripletBets.length === 3) {
    const combOdd = Number(
      (tripletBets[0].bookmakerOdd * tripletBets[1].bookmakerOdd * tripletBets[2].bookmakerOdd).toFixed(2)
    );
    const combProb = tripletBets[0].probability * tripletBets[1].probability * tripletBets[2].probability;
    const combEV = calculateEV(combProb, combOdd);

    tickets.push({
      type: "triplet",
      title: "⚡ Value Tripleks Dana",
      description: "Tri oklade s visokim koeficijentom i dokazanim matematičkim prednostima nad kladionicom.",
      bets: tripletBets,
      combinedOdd: combOdd,
      combinedProb: combProb,
      expectedValuePercent: Math.round(combEV * 10) / 10,
      recommendedStakePercent: 1.0,
    });
  }

  return tickets;
}

/** Formatira listić u lijepi tekst za kopiranje na WhatsApp, Telegram ili bilješke */
export function formatTicketForSharing(ticket: TicketRecommendation): string {
  const lines = [
    `🎟️ ${ticket.title.toUpperCase()}`,
    `${ticket.description}`,
    `----------------------------------`,
  ];

  ticket.bets.forEach((b, i) => {
    lines.push(
      `${i + 1}. ${b.match} (${b.time})`,
      `   Tip: ${b.selection} @ ${b.bookmakerOdd.toFixed(2)} [Fer: ${b.fairOdd.toFixed(2)}]`,
      `   Vjerojatnost: ${(b.probability * 100).toFixed(1)}% | Edge: +${b.evPercent}%`
    );
  });

  lines.push(
    `----------------------------------`,
    `Ukupna kvota: ${ticket.combinedOdd.toFixed(2)}`,
    `Vjerojatnost prolaza: ${(ticket.combinedProb * 100).toFixed(1)}%`,
    `Očekivani ROI (EV): +${ticket.expectedValuePercent}%`,
    `Preporučeni ulog: ${ticket.recommendedStakePercent}% bankrolla`,
    `Generirano: Andromeda AI Tiket Arhitekt`
  );

  return lines.join("\n");
}

