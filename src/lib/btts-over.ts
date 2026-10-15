import { matrix, type Analysis } from "@/lib/zlatni-engine";

export interface AsianGoalLine {
  line: string;
  type: "standard" | "asian_full" | "asian_split";
  overProb: number;
  underProb: number;
  fairOver: number;
  fairUnder: number;
  description: string;
  isRecommended?: boolean;
}

export interface WinnerBttsCombo {
  key: string;
  label: string;
  shortLabel: string;
  prob: number;
  fairOdd: number;
  tag: string;
}

export interface FirstHalfDynamics {
  lambda1H: number;
  over05Prob: number;
  fairOver05: number;
  over15Prob: number;
  fairOver15: number;
  oneToTwoGoalsProb: number;
  fairOneToTwo: number;
  moreGoals2HProb: number;
  fairMoreGoals2H: number;
  firstHalfCleanSheetProb: number;
}

export interface BttsOverAnalysis {
  match: string;
  league: string;
  time: string;
  lh: number; // xG domaći
  la: number; // xG gost
  totalXg: number;

  // Over/Under 2.5
  over25Prob: number;
  under25Prob: number;
  fairOver25: number;
  fairUnder25: number;
  bookieOver25?: number;
  bookieUnder25?: number;
  over25Ev?: number;
  under25Ev?: number;

  // BTTS (GG / NG)
  bttsYesProb: number;
  bttsNoProb: number;
  fairBttsYes: number;
  fairBttsNo: number;
  bookieBttsYes?: number;
  bookieBttsNo?: number;
  bttsYesEv?: number;
  bttsNoEv?: number;

  // 1. Azijske linije golova
  asianLines: AsianGoalLine[];

  // 2. Pobjednik + BTTS / Win to Nil
  combos: WinnerBttsCombo[];
  topCombo: WinnerBttsCombo;

  // 3. Dinamika 1. poluvremena
  firstHalf: FirstHalfDynamics;

  // 4 Kvadranta korelacije
  quadrants: {
    ggAndOver: { prob: number; label: "GG & Više 2.5" };
    ngAndUnder: { prob: number; label: "NG & Manje 2.5" };
    ggAndUnder: { prob: number; label: "GG & Manje 2.5 (1:1)" };
    ngAndOver: { prob: number; label: "NG & Više 2.5 (Jednostrano)" };
  };

  // Vjerojatnosti po točnom broju golova
  goalDistribution: { goals: string; prob: number }[];

  // Clean sheet (bez primljenog gola)
  homeCleanSheet: number;
  awayCleanSheet: number;

  // Konkretne profesionalne preporuke
  mainOverUnderTip: {
    pick: "Više 2.5" | "Manje 2.5";
    prob: number;
    fairOdd: number;
    odd?: number;
    ev?: number;
    confidence: "Visoka" | "Srednja" | "Rizično";
    reasoning: string;
  };

  mainBttsTip: {
    pick: "Oba daju gol (GG)" | "Barem jedan NE daje (NG)";
    prob: number;
    fairOdd: number;
    odd?: number;
    ev?: number;
    confidence: "Visoka" | "Srednja" | "Rizično";
    reasoning: string;
  };

  sharpComboTip: {
    title: string;
    description: string;
    combinedProb: number;
    fairOdd: number;
  };

  trapWarning: string | null;
}

export function computeBttsOverAnalysis(
  analysis: Analysis,
  match: string,
  league: string,
  time: string
): BttsOverAnalysis {
  const lh = analysis.lh;
  const la = analysis.la;
  const totalXg = Number((lh + la).toFixed(2));
  const m = matrix(lh, la, true);

  // Izračun 2.5 Over/Under iz matrice
  let pOver25 = 0;
  let pUnder25 = 0;
  let pBttsYes = 0;
  let pBttsNo = 0;

  // 4 Kvadranta
  let pGgOver = 0;
  let pNgUnder = 0;
  let pGgUnder = 0;
  let pNgOver = 0;

  // Distribucija golova
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4Plus = 0;
  let homeClean = 0, awayClean = 0;

  // 1 & GG, 1 & NG, X & GG, 2 & GG, 2 & NG
  let p1AndGg = 0;
  let p1AndNg = 0;
  let pXAndGg = 0;
  let p2AndGg = 0;
  let p2AndNg = 0;

  // Za azijske linije
  let pTotal0 = 0, pTotal1 = 0, pTotal2 = 0, pTotal3 = 0, pTotal4 = 0;

  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = m[i]?.[j] ?? 0;
      const total = i + j;

      if (total === 0) pTotal0 += p;
      else if (total === 1) pTotal1 += p;
      else if (total === 2) pTotal2 += p;
      else if (total === 3) pTotal3 += p;
      else if (total === 4) pTotal4 += p;

      if (total > 2.5) pOver25 += p;
      else pUnder25 += p;

      const isGG = i > 0 && j > 0;
      if (isGG) pBttsYes += p;
      else pBttsNo += p;

      // Kvadranti
      if (isGG && total > 2.5) pGgOver += p;
      else if (!isGG && total <= 2.5) pNgUnder += p;
      else if (isGG && total <= 2.5) pGgUnder += p;
      else if (!isGG && total > 2.5) pNgOver += p;

      // Pobjednik + GG / NG
      if (i > j && isGG) p1AndGg += p;
      if (i > j && !isGG) p1AndNg += p;
      if (i === j && isGG) pXAndGg += p;
      if (j > i && isGG) p2AndGg += p;
      if (j > i && !isGG) p2AndNg += p;

      // Golovi
      if (total === 0) p0 += p;
      else if (total === 1) p1 += p;
      else if (total === 2) p2 += p;
      else if (total === 3) p3 += p;
      else p4Plus += p;

      // Clean sheet
      if (j === 0) homeClean += p;
      if (i === 0) awayClean += p;
    }
  }

  // Azijske linije golova proračun
  const pOver15 = 1 - (pTotal0 + pTotal1);
  const pUnder15 = pTotal0 + pTotal1;

  const pOver20Win = 1 - (pTotal0 + pTotal1 + pTotal2);
  const pOver20Push = pTotal2;
  const pUnder20Win = pTotal0 + pTotal1;

  const pOver30Win = 1 - (pTotal0 + pTotal1 + pTotal2 + pTotal3);
  const pOver30Push = pTotal3;
  const pUnder30Win = pTotal0 + pTotal1 + pTotal2;

  const pOver35 = 1 - (pTotal0 + pTotal1 + pTotal2 + pTotal3);
  const pUnder35 = 1 - pOver35;

  // Egzaktne no-vig azijske fer kvote s uvažavanjem povrata uloga (push)
  const fairOver20 = (1 - pOver20Push) / Math.max(pOver20Win, 0.01);
  const fairUnder20 = (1 - pOver20Push) / Math.max(pUnder20Win, 0.01);

  // Azijski 2.25: split (pola 2.0, pola 2.5)
  const fairOver225 = (1 - 0.5 * pTotal2) / Math.max(pOver25, 0.01);
  const fairUnder225 = (1 - 0.5 * pTotal2) / Math.max(pUnder20Win + 0.5 * pTotal2, 0.01);

  // Azijski 2.75: split (pola 2.5, pola 3.0)
  const fairOver275 = (1 - 0.5 * pTotal3) / Math.max(pOver30Win + 0.5 * pTotal3, 0.01);
  const fairUnder275 = (1 - 0.5 * pTotal3) / Math.max(pUnder25, 0.01);

  // Azijski 3.0: full push na točno 3 gola
  const fairOver30 = (1 - pOver30Push) / Math.max(pOver30Win, 0.01);
  const fairUnder30 = (1 - pOver30Push) / Math.max(pUnder30Win, 0.01);

  const asianLines: AsianGoalLine[] = [
    {
      line: "Više / Manje 1.5",
      type: "standard",
      overProb: Number(pOver15.toFixed(3)),
      underProb: Number(pUnder15.toFixed(3)),
      fairOver: Number((1 / Math.max(pOver15, 0.01)).toFixed(2)),
      fairUnder: Number((1 / Math.max(pUnder15, 0.01)).toFixed(2)),
      description: "Standardna linija za sigurne tikete (2+ gola).",
      isRecommended: totalXg >= 2.4 && pOver15 >= 0.78,
    },
    {
      line: "Azijski 2.0 (Povrat na 2)",
      type: "asian_full",
      overProb: Number(pOver20Win.toFixed(3)),
      underProb: Number(pUnder20Win.toFixed(3)),
      fairOver: Number(fairOver20.toFixed(2)),
      fairUnder: Number(fairUnder20.toFixed(2)),
      description: "Ako padnu točno 2 gola: puni povrat uloga (kvota 1.00). Nema pada na 1:1 ili 2:0!",
      isRecommended: totalXg >= 2.1 && totalXg <= 2.8,
    },
    {
      line: "Azijski 2.25",
      type: "asian_split",
      overProb: Number(((pOver20Win + pOver25) / 2).toFixed(3)),
      underProb: Number(((pUnder20Win + pUnder25) / 2).toFixed(3)),
      fairOver: Number(fairOver225.toFixed(2)),
      fairUnder: Number(fairUnder225.toFixed(2)),
      description: "Pola uloga na 2.0, pola na 2.5. Na točno 2 gola gubi se samo pola uloga.",
      isRecommended: false,
    },
    {
      line: "Više / Manje 2.5",
      type: "standard",
      overProb: Number(pOver25.toFixed(3)),
      underProb: Number(pUnder25.toFixed(3)),
      fairOver: Number((1 / Math.max(pOver25, 0.01)).toFixed(2)),
      fairUnder: Number((1 / Math.max(pUnder25, 0.01)).toFixed(2)),
      description: "Klasična svjetska granica (3+ gola).",
      isRecommended: pOver25 >= 0.62 || pUnder25 >= 0.62,
    },
    {
      line: "Azijski 2.75",
      type: "asian_split",
      overProb: Number(((pOver25 + pOver30Win) / 2).toFixed(3)),
      underProb: Number(((pUnder25 + pUnder30Win) / 2).toFixed(3)),
      fairOver: Number(fairOver275.toFixed(2)),
      fairUnder: Number(fairUnder275.toFixed(2)),
      description: "Na točno 3 gola: pola dobitak, pola povrat uloga (zaštita za Over).",
      isRecommended: totalXg >= 2.9,
    },
    {
      line: "Azijski 3.0 (Povrat na 3)",
      type: "asian_full",
      overProb: Number(pOver30Win.toFixed(3)),
      underProb: Number(pUnder30Win.toFixed(3)),
      fairOver: Number(fairOver30.toFixed(2)),
      fairUnder: Number(fairUnder30.toFixed(2)),
      description: "Na točno 3 gola: povrat uloga.",
      isRecommended: false,
    },
    {
      line: "Više / Manje 3.5",
      type: "standard",
      overProb: Number(pOver35.toFixed(3)),
      underProb: Number(pUnder35.toFixed(3)),
      fairOver: Number((1 / Math.max(pOver35, 0.01)).toFixed(2)),
      fairUnder: Number((1 / Math.max(pUnder35, 0.01)).toFixed(2)),
      description: "Granica za utakmice izrazito ofenzivnih momčadi (4+ gola).",
      isRecommended: totalXg >= 3.4,
    },
  ];

  // Pobjednik + GG / Win to Nil kombinacije
  const combos: WinnerBttsCombo[] = [
    {
      key: "1_gg",
      label: "1 & GG (Domaćin pobjeđuje i oba daju)",
      shortLabel: "1 & GG",
      prob: Number(p1AndGg.toFixed(3)),
      fairOdd: Number((1 / Math.max(p1AndGg, 0.01)).toFixed(2)),
      tag: "Visoka kvota",
    },
    {
      key: "1_ng",
      label: "1 & NG (Domaćin pobjeđuje bez primljenog gola)",
      shortLabel: "1 & NG (Win to Nil)",
      prob: Number(p1AndNg.toFixed(3)),
      fairOdd: Number((1 / Math.max(p1AndNg, 0.01)).toFixed(2)),
      tag: "Obrana",
    },
    {
      key: "x_gg",
      label: "X & GG (Neriješeno uz pogotke obiju ekipa)",
      shortLabel: "X & GG",
      prob: Number(pXAndGg.toFixed(3)),
      fairOdd: Number((1 / Math.max(pXAndGg, 0.01)).toFixed(2)),
      tag: "Vrijednost",
    },
    {
      key: "2_gg",
      label: "2 & GG (Gost pobjeđuje i oba daju)",
      shortLabel: "2 & GG",
      prob: Number(p2AndGg.toFixed(3)),
      fairOdd: Number((1 / Math.max(p2AndGg, 0.01)).toFixed(2)),
      tag: "Visoka kvota",
    },
    {
      key: "2_ng",
      label: "2 & NG (Gost pobjeđuje bez primljenog gola)",
      shortLabel: "2 & NG (Win to Nil)",
      prob: Number(p2AndNg.toFixed(3)),
      fairOdd: Number((1 / Math.max(p2AndNg, 0.01)).toFixed(2)),
      tag: "Obrana",
    },
  ];

  // Odaberi najbolji combo
  const sortedCombos = [...combos].sort((a, b) => b.prob - a.prob);
  const topCombo = sortedCombos[0];

  // POPRAVAK: koristite HT udio i pri nuli; zadana vrijednost samo za nevaljan unos.
  const htShare = Number.isFinite(analysis.htShare) && analysis.htShare >= 0 && analysis.htShare <= 1
    ? analysis.htShare
    : 0.44;
  const lambda1H = Number(((lh + la) * htShare).toFixed(2));
  const p1H0 = Math.exp(-lambda1H);
  const p1H1 = Math.exp(-lambda1H) * lambda1H;
  const p1H2 = (Math.exp(-lambda1H) * Math.pow(lambda1H, 2)) / 2;

  const over05Prob = Number((1 - p1H0).toFixed(3));
  const over15Prob = Number((1 - (p1H0 + p1H1)).toFixed(3));
  const oneToTwoGoalsProb = Number((p1H1 + p1H2).toFixed(3));
  // POPRAVAK: izračunajte P(golova u 2H > golova u 1H) iz dvije Poissonove raspodjele.
  const lambda2H = (lh + la) * (1 - htShare);
  let moreGoals2H = 0;
  for (let firstHalfGoals = 0; firstHalfGoals <= 20; firstHalfGoals++) {
    let secondHalfGreater = 0;
    for (let secondHalfGoals = firstHalfGoals + 1; secondHalfGoals <= 20; secondHalfGoals++) {
      let factorial = 1;
      for (let goal = 2; goal <= secondHalfGoals; goal++) factorial *= goal;
      secondHalfGreater += Math.exp(-lambda2H) * Math.pow(lambda2H, secondHalfGoals) / factorial;
    }
    let firstHalfFactorial = 1;
    for (let goal = 2; goal <= firstHalfGoals; goal++) firstHalfFactorial *= goal;
    const firstHalfProbability = Math.exp(-lambda1H) * Math.pow(lambda1H, firstHalfGoals) / firstHalfFactorial;
    moreGoals2H += firstHalfProbability * secondHalfGreater;
  }
  const moreGoals2HProb = Number(moreGoals2H.toFixed(3));

  const firstHalf: FirstHalfDynamics = {
    lambda1H,
    over05Prob,
    fairOver05: Number((1 / Math.max(over05Prob, 0.01)).toFixed(2)),
    over15Prob,
    fairOver15: Number((1 / Math.max(over15Prob, 0.01)).toFixed(2)),
    oneToTwoGoalsProb,
    fairOneToTwo: Number((1 / Math.max(oneToTwoGoalsProb, 0.01)).toFixed(2)),
    moreGoals2HProb,
    fairMoreGoals2H: Number((1 / Math.max(moreGoals2HProb, 0.01)).toFixed(2)),
    firstHalfCleanSheetProb: Number(p1H0.toFixed(3)),
  };

  // Dohvati stvarne kvote iz analysis.markets ako postoje
  let bOver: number | undefined;
  let bUnder: number | undefined;
  let bGg: number | undefined;
  let bNg: number | undefined;

  for (const mk of analysis.markets) {
    const n = mk.name.toLowerCase();
    if (n.includes("goals over/under") || n.includes("ukupno golova")) {
      for (const o of mk.outcomes) {
        if (o.label.toLowerCase().includes("over 2.5") || o.label.toLowerCase().includes("više 2.5")) {
          bOver = o.odd;
        } else if (o.label.toLowerCase().includes("under 2.5") || o.label.toLowerCase().includes("manje 2.5")) {
          bUnder = o.odd;
        }
      }
    }
    if (n.includes("both teams to score") || n.includes("oba daju gol")) {
      for (const o of mk.outcomes) {
        if (o.label.toLowerCase() === "yes" || o.label.toLowerCase() === "gg" || o.label.toLowerCase() === "da") {
          bGg = o.odd;
        } else if (o.label.toLowerCase() === "no" || o.label.toLowerCase() === "ng" || o.label.toLowerCase() === "ne") {
          bNg = o.odd;
        }
      }
    }
  }

  const fairOver25 = Number((1 / Math.max(pOver25, 0.01)).toFixed(2));
  const fairUnder25 = Number((1 / Math.max(pUnder25, 0.01)).toFixed(2));
  const fairBttsYes = Number((1 / Math.max(pBttsYes, 0.01)).toFixed(2));
  const fairBttsNo = Number((1 / Math.max(pBttsNo, 0.01)).toFixed(2));

  const over25Ev = bOver ? Number(((pOver25 * bOver - 1) * 100).toFixed(1)) : undefined;
  const under25Ev = bUnder ? Number(((pUnder25 * bUnder - 1) * 100).toFixed(1)) : undefined;
  const bttsYesEv = bGg ? Number(((pBttsYes * bGg - 1) * 100).toFixed(1)) : undefined;
  const bttsNoEv = bNg ? Number(((pBttsNo * bNg - 1) * 100).toFixed(1)) : undefined;

  // Glavni O/U tip
  const isOverPick = pOver25 >= 0.52;
  const mainOUPick = isOverPick ? ("Više 2.5" as const) : ("Manje 2.5" as const);
  const mainOUProb = isOverPick ? pOver25 : pUnder25;
  const mainOUOdd = isOverPick ? bOver : bUnder;
  const mainOUEv = isOverPick ? over25Ev : under25Ev;

  // Glavni BTTS tip
  const isGgPick = pBttsYes >= 0.52;
  const mainBttsPick = isGgPick ? ("Oba daju gol (GG)" as const) : ("Barem jedan NE daje (NG)" as const);
  const mainBttsProb = isGgPick ? pBttsYes : pBttsNo;
  const mainBttsOdd = isGgPick ? bGg : bNg;
  const mainBttsEv = isGgPick ? bttsYesEv : bttsNoEv;

  // Detektor kladioničarskih zamki
  let trapWarning: string | null = null;
  if (bOver && over25Ev !== undefined && over25Ev < -5.0 && pOver25 < 0.52) {
    trapWarning = `Kladionica nudi nisku kvotu na Više 2.5 (@${bOver.toFixed(2)}), no xG model pokazuje samo ${(pOver25 * 100).toFixed(0)}% šanse za 3+ gola. Fer kvota je ${fairOver25}. Preporučuje se zaštita na Manje 2.5 ili Azijski 2.0!`;
  } else if (bGg && bttsYesEv !== undefined && bttsYesEv < -5.0 && pBttsYes < 0.50) {
    trapWarning = `Popularna oklada na GG ima nepovoljnu maržu kladionice (kvota @${bGg.toFixed(2)} naspram fer ${fairBttsYes}). Vjerojatnost za čistu mrežu barem jednog tima je ${(pBttsNo * 100).toFixed(0)}%!`;
  }

  // Sharp Combo
  let sharpCombo: { title: string; description: string; combinedProb: number; fairOdd: number };
  if (pGgOver >= 0.38) {
    sharpCombo = {
      title: "🔥 GG & Više 2.5 Gola",
      description: "Oba tima imaju visok ofenzivni xG. Vjerojatnost otvorenog susreta s 3+ gola i pogocima obje ekipe.",
      combinedProb: pGgOver,
      fairOdd: Number((1 / pGgOver).toFixed(2)),
    };
  } else if (pNgUnder >= 0.38) {
    sharpCombo = {
      title: "🛡️ NG & Manje 2.5 Gola",
      description: "Čvrsta utakmica s naglaskom na obranu. Visoka vjerojatnost rezultata 0:0, 1:0 ili 2:0.",
      combinedProb: pNgUnder,
      fairOdd: Number((1 / pNgUnder).toFixed(2)),
    };
  } else {
    sharpCombo = {
      title: `🎯 ${topCombo.shortLabel}`,
      description: `Uravnotežen meč s ukupnim očekivanjem od ${totalXg} gola. Najisplativija kombinacija: ${topCombo.label}.`,
      combinedProb: topCombo.prob,
      fairOdd: topCombo.fairOdd,
    };
  }

  return {
    match,
    league,
    time,
    lh,
    la,
    totalXg,
    over25Prob: pOver25,
    under25Prob: pUnder25,
    fairOver25,
    fairUnder25,
    bookieOver25: bOver,
    bookieUnder25: bUnder,
    over25Ev,
    under25Ev,
    bttsYesProb: pBttsYes,
    bttsNoProb: pBttsNo,
    fairBttsYes,
    fairBttsNo,
    bookieBttsYes: bGg,
    bookieBttsNo: bNg,
    bttsYesEv,
    bttsNoEv,
    asianLines,
    combos,
    topCombo,
    firstHalf,
    quadrants: {
      ggAndOver: { prob: pGgOver, label: "GG & Više 2.5" },
      ngAndUnder: { prob: pNgUnder, label: "NG & Manje 2.5" },
      ggAndUnder: { prob: pGgUnder, label: "GG & Manje 2.5 (1:1)" },
      ngAndOver: { prob: pNgOver, label: "NG & Više 2.5 (Jednostrano)" },
    },
    goalDistribution: [
      { goals: "0 golova", prob: p0 },
      { goals: "1 gol", prob: p1 },
      { goals: "2 gola", prob: p2 },
      { goals: "3 gola", prob: p3 },
      { goals: "4+ gola", prob: p4Plus },
    ],
    homeCleanSheet: homeClean,
    awayCleanSheet: awayClean,
    mainOverUnderTip: {
      pick: mainOUPick,
      prob: mainOUProb,
      fairOdd: isOverPick ? fairOver25 : fairUnder25,
      odd: mainOUOdd,
      ev: mainOUEv,
      confidence: mainOUProb >= 0.65 ? "Visoka" : mainOUProb >= 0.55 ? "Srednja" : "Rizično",
      reasoning: `Ukupni procijenjeni xG susreta iznosi ${totalXg} gola. Model daje ${(mainOUProb * 100).toFixed(1)}% vjerojatnosti za ${mainOUPick}.`,
    },
    mainBttsTip: {
      pick: mainBttsPick,
      prob: mainBttsProb,
      fairOdd: isGgPick ? fairBttsYes : fairBttsNo,
      odd: mainBttsOdd,
      ev: mainBttsEv,
      confidence: mainBttsProb >= 0.65 ? "Visoka" : mainBttsProb >= 0.55 ? "Srednja" : "Rizično",
      reasoning: `Ofenzivni potencijal: Domaćin xG ${lh.toFixed(2)}, Gost xG ${la.toFixed(2)}. Šansa da oba tima zabiju: ${(pBttsYes * 100).toFixed(1)}%.`,
    },
    sharpComboTip: sharpCombo,
    trapWarning,
  };
}


