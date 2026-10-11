import { matrix, type Analysis, type Outcome } from "@/lib/zlatni-engine";

export interface HtFtOutcome {
  code: string; // "1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"
  label: string;
  category: "favorite" | "tactical" | "draw" | "reversal";
  categoryLabel: string;
  prob: number; // 0..1
  probPercent: number; // 0..100
  fairOdd: number; // 1 / prob
  bookieOdd?: number;
  ev?: number; // ((prob * bookieOdd) - 1) * 100
  isValue: boolean;
  isTrap: boolean;
}

export interface HtFtAnalysis {
  match: string;
  league: string;
  time: string;
  lh: number; // FT xG dom
  la: number; // FT xG gost
  lhHt: number; // HT xG dom
  laHt: number; // HT xG gost
  htShare: number; // udio 1. poluvremena (npr. 0.44)

  // Svih 9 HT/FT ishoda
  outcomes: HtFtOutcome[];

  // Poluvrijeme 1X2 vjerojatnosti
  ht1X2: {
    home: number;
    draw: number;
    away: number;
    fairHome: number;
    fairDraw: number;
    fairAway: number;
  };

  // Ključni signali za poluvrijeme
  p00AtHalf: number; // šansa za 0:0 na poluvremenu (ključ za X/1 i X/2)
  pGoalBothHalves: number; // gol u oba poluvremena

  // Glavne preporuke
  mainTip: {
    pick: string;
    description: string;
    prob: number;
    fairOdd: number;
    bookieOdd?: number;
    ev?: number;
    confidence: "Visoka" | "Srednja" | "Rizično";
    reasoning: string;
  };

  sharpValueTip: {
    pick: string;
    description: string;
    prob: number;
    fairOdd: number;
    bookieOdd?: number;
    ev?: number;
    reasoning: string;
  } | null;

  safeHedgeTip: {
    title: string;
    pick: string;
    prob: number;
    fairOdd: number;
    reasoning: string;
  };

  reversalRadar: {
    hasReversalSignal: boolean;
    pick: "2/1" | "1/2" | "Nema signala";
    prob: number;
    fairOdd: number;
    bookieOdd?: number;
    ev?: number;
    recommendedStake: string;
    note: string;
  };
}

export function computeHtFtAnalysis(
  analysis: Analysis,
  match: string,
  league: string,
  time: string
): HtFtAnalysis {
  const lh = analysis.lh;
  const la = analysis.la;
  const htShare = analysis.htShare || 0.445;

  const lhHt = Number((lh * htShare).toFixed(2));
  const laHt = Number((la * htShare).toFixed(2));
  const lh2h = Number((lh * (1 - htShare)).toFixed(2));
  const la2h = Number((la * (1 - htShare)).toFixed(2));

  // Nezavisne matrice za 1H i 2H
  const H1 = matrix(lhHt, laHt, false);
  const H2 = matrix(lh2h, la2h, false);

  const r = (x: number, y: number) => (x > y ? "1" : x === y ? "X" : "2");

  // Konvolucija 1H i 2H golova
  const conv = (fn: (h1: number, a1: number, h2: number, a2: number) => boolean) => {
    let s = 0;
    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6; b++) {
        for (let c = 0; c <= 6; c++) {
          for (let d = 0; d <= 6; d++) {
            if (fn(a, b, c, d)) s += (H1[a]?.[b] ?? 0) * (H2[c]?.[d] ?? 0);
          }
        }
      }
    }
    return s;
  };

  // Izvlačenje stvarnih kvota za Poluvrijeme / Kraj iz API-ja
  const htftMarket = analysis.markets.find((m) => {
    const n = m.name.toLowerCase();
    return n.includes("poluvrijeme / kraj") || n.includes("ht/ft") || n.includes("half time");
  });

  const getBookieOdd = (code: string): number | undefined => {
    if (!htftMarket) return undefined;
    const matchOutcome = htftMarket.outcomes.find(
      (o) => o.label.toUpperCase() === code.toUpperCase()
    );
    return matchOutcome?.odd && matchOutcome.odd > 1 ? matchOutcome.odd : undefined;
  };

  const codes: {
    code: string;
    h: "1" | "X" | "2";
    f: "1" | "X" | "2";
    category: "favorite" | "tactical" | "draw" | "reversal";
    categoryLabel: string;
  }[] = [
    { code: "1/1", h: "1", f: "1", category: "favorite", categoryLabel: "Favoriti" },
    { code: "X/1", h: "X", f: "1", category: "tactical", categoryLabel: "Taktički prijelaz" },
    { code: "2/1", h: "2", f: "1", category: "reversal", categoryLabel: "Veliki preokret" },
    { code: "1/X", h: "1", f: "X", category: "draw", categoryLabel: "Podjela bodova" },
    { code: "X/X", h: "X", f: "X", category: "favorite", categoryLabel: "Favoriti" },
    { code: "2/X", h: "2", f: "X", category: "draw", categoryLabel: "Podjela bodova" },
    { code: "1/2", h: "1", f: "2", category: "reversal", categoryLabel: "Veliki preokret" },
    { code: "X/2", h: "X", f: "2", category: "tactical", categoryLabel: "Taktički prijelaz" },
    { code: "2/2", h: "2", f: "2", category: "favorite", categoryLabel: "Favoriti" },
  ];

  const outcomes: HtFtOutcome[] = codes.map((c) => {
    const p = conv((a, b, c2, d2) => r(a, b) === c.h && r(a + c2, b + d2) === c.f);
    const prob = Math.max(0.001, p);
    const fairOdd = Number((1 / prob).toFixed(2));
    const bookieOdd = getBookieOdd(c.code);
    const ev = bookieOdd ? Number(((prob * bookieOdd - 1) * 100).toFixed(1)) : undefined;

    return {
      code: c.code,
      label: `${c.code} (${c.categoryLabel})`,
      category: c.category,
      categoryLabel: c.categoryLabel,
      prob,
      probPercent: Number((prob * 100).toFixed(1)),
      fairOdd,
      bookieOdd,
      ev,
      isValue: ev !== undefined && ev > 0.5,
      isTrap: ev !== undefined && ev < -6.0 && prob < 0.4,
    };
  });

  // Poluvrijeme 1X2
  let pHt1 = 0,
    pHtX = 0,
    pHt2 = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p = H1[i]?.[j] ?? 0;
      if (i > j) pHt1 += p;
      else if (i === j) pHtX += p;
      else pHt2 += p;
    }
  }

  const p00AtHalf = Number(((H1[0]?.[0] ?? 0) * 100).toFixed(1));
  const pGoalBothHalves = Number(
    (conv((a, b, c, d) => a + b > 0 && c + d > 0) * 100).toFixed(1)
  );

  // 1. GLAVNI TIP: biramo ishod s najboljim omjerom šanse i isplativosti
  const sortedByProb = [...outcomes].sort((a, b) => b.prob - a.prob);
  const highestProb = sortedByProb[0]!;

  let mainTipPick = highestProb;
  let mainReasoning = `Statistički najvjerojatniji ishod s ${highestProb.probPercent}% šanse (fer tečaj ${highestProb.fairOdd.toFixed(2)}).`;

  // Ako favorit ima >45% za 1/1 ili 2/2
  const p11 = outcomes.find((o) => o.code === "1/1")!;
  const pX1 = outcomes.find((o) => o.code === "X/1")!;
  const p22 = outcomes.find((o) => o.code === "2/2")!;
  const pX2 = outcomes.find((o) => o.code === "X/2")!;

  if (p11.prob >= 0.35) {
    mainTipPick = p11;
    mainReasoning = `Domaćin ima dominaciju (xG ${lh}). Vjerojatnost ranog vodstva i sigurne pobjede je ${p11.probPercent}%.`;
  } else if (p22.prob >= 0.35) {
    mainTipPick = p22;
    mainReasoning = `Gost je izraziti favorit (xG ${la}). Vjerojatnost ranog vodstva i pobjede je ${p22.probPercent}%.`;
  } else if (p00AtHalf > 38 && (pX1.prob > 0.22 || pX2.prob > 0.22)) {
    const tacticalPick = pX1.prob > pX2.prob ? pX1 : pX2;
    mainTipPick = tacticalPick;
    mainReasoning = `Visoka šansa čvrstog prvog poluvremena (0:0 šansa ${p00AtHalf}%). Favorit lomi utakmicu u drugom dijelu.`;
  }

  const mainTip = {
    pick: mainTipPick.code,
    description: mainTipPick.categoryLabel,
    prob: mainTipPick.prob,
    fairOdd: mainTipPick.fairOdd,
    bookieOdd: mainTipPick.bookieOdd,
    ev: mainTipPick.ev,
    confidence:
      mainTipPick.prob >= 0.4 ? ("Visoka" as const) : mainTipPick.prob >= 0.25 ? ("Srednja" as const) : ("Rizično" as const),
    reasoning: mainReasoning,
  };

  // 2. SHARP VALUE TIP: ishod s najvećim pozitivnim EV% ili taktički X/1 / X/2
  const valueOutcomes = outcomes.filter((o) => o.ev !== undefined && o.ev > 0).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));

  let sharpValueTip: HtFtAnalysis["sharpValueTip"] = null;
  if (valueOutcomes.length > 0) {
    const bestValue = valueOutcomes[0]!;
    sharpValueTip = {
      pick: bestValue.code,
      description: bestValue.categoryLabel,
      prob: bestValue.prob,
      fairOdd: bestValue.fairOdd,
      bookieOdd: bestValue.bookieOdd,
      ev: bestValue.ev,
      reasoning: `Kladionica nudi kvotu ${bestValue.bookieOdd} dok je matematički fer tečaj ${bestValue.fairOdd}. Prednost: +${bestValue.ev}%.`,
    };
  } else {
    // Ako nema direktnih kvota iz API-ja, biramo taktički prijelaz s najboljim matematičkim omjerom
    const tacticalBest = pX1.prob >= pX2.prob ? pX1 : pX2;
    sharpValueTip = {
      pick: tacticalBest.code,
      description: "Taktički Sharp Prijelaz",
      prob: tacticalBest.prob,
      fairOdd: tacticalBest.fairOdd,
      bookieOdd: undefined,
      ev: undefined,
      reasoning: `Taktički najisplativiji ishod: ${tacticalBest.code} (fer tečaj ${tacticalBest.fairOdd}). Kladionice redovito nude 4.50–6.00 na ovaj tip.`,
    };
  }

  // 3. SIGURNA LINIJA (Hedge / Zaštita)
  let safeTitle = "1X na poluvremenu";
  let safePick = "1X na 1H";
  let safeProb = pHt1 + pHtX;
  let safeReason = "Domaćin ne gubi na poluvremenu.";

  if (pHt2 + pHtX > safeProb) {
    safeTitle = "X2 na poluvremenu";
    safePick = "X2 na 1H";
    safeProb = pHt2 + pHtX;
    safeReason = "Gost ne gubi na poluvremenu.";
  }

  const safeHedgeTip = {
    title: safeTitle,
    pick: safePick,
    prob: safeProb,
    fairOdd: Number((1 / Math.max(0.01, safeProb)).toFixed(2)),
    reasoning: `${safeReason} Matematička sigurnost ${Number((safeProb * 100).toFixed(1))}%.`,
  };

  // 4. RADAR PREOKRETA (2/1 ili 1/2)
  const p21 = outcomes.find((o) => o.code === "2/1")!;
  const p12 = outcomes.find((o) => o.code === "1/2")!;
  const bestReversal = p21.prob >= p12.prob ? p21 : p12;

  let hasReversalSignal = false;
  let recStake = "Izbjegavati (0%)";
  let revNote = "Šansa za preokret je ispod 2.5%. Kladioničarski gledano, ovo je bacanje uloga.";

  if (bestReversal.prob >= 0.035 || (bestReversal.ev !== undefined && bestReversal.ev > 10)) {
    hasReversalSignal = true;
    recStake = "0.5% bankrolla (mikro-ulog)";
    revNote = `Detektirana je povišena šansa za ${bestReversal.code} (${bestReversal.probPercent}%). Vrijedno sitnog uloga na visoku kvotu (~25.00+).`;
  }

  const reversalRadar = {
    hasReversalSignal,
    pick: (hasReversalSignal ? bestReversal.code : "Nema signala") as "2/1" | "1/2" | "Nema signala",
    prob: bestReversal.prob,
    fairOdd: bestReversal.fairOdd,
    bookieOdd: bestReversal.bookieOdd,
    ev: bestReversal.ev,
    recommendedStake: recStake,
    note: revNote,
  };

  return {
    match,
    league,
    time,
    lh,
    la,
    lhHt,
    laHt,
    htShare,
    outcomes,
    ht1X2: {
      home: Number((pHt1 * 100).toFixed(1)),
      draw: Number((pHtX * 100).toFixed(1)),
      away: Number((pHt2 * 100).toFixed(1)),
      fairHome: Number((1 / Math.max(0.01, pHt1)).toFixed(2)),
      fairDraw: Number((1 / Math.max(0.01, pHtX)).toFixed(2)),
      fairAway: Number((1 / Math.max(0.01, pHt2)).toFixed(2)),
    },
    p00AtHalf,
    pGoalBothHalves,
    mainTip,
    sharpValueTip,
    safeHedgeTip,
    reversalRadar,
  };
}

