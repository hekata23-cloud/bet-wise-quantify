import { matrix, type Analysis } from "@/lib/zlatni-engine";

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

  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = m[i]?.[j] ?? 0;
      const total = i + j;

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
    trapWarning = `Kladionica nudi nisku kvotu na Više 2.5 (@${bOver.toFixed(2)}), no xG model pokazuje samo ${(pOver25 * 100).toFixed(0)}% šanse za 3+ gola. Fer kvota je ${fairOver25}. Preporučuje se Manje 2.5!`;
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
      title: "🎯 1X ili X2 uz O/U Ogradu",
      description: `Uravnotežen meč s ukupnim očekivanjem od ${totalXg} gola. Najsigurnija linija: ${totalXg > 2.5 ? "Više 1.5 gola" : "Manje 3.5 gola"}.`,
      combinedProb: Math.max(pOver25, pUnder25),
      fairOdd: Number((1 / Math.max(pOver25, pUnder25)).toFixed(2)),
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

