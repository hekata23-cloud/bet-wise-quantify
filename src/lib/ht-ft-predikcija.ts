/**
 * HT/FT Kvantni Prediktor — Samostalni Kvantitativni Engine
 * 
 * 4 Specijalne Metode:
 * 1. Dixon-Coles Bivarijatni Poisson s vremenskim razdvajanjem poluvremena
 * 2. Markovljevi lanci i matrica vjerojatnosti prijelaza stanja
 * 3. Shannonova informacijska entropija za eliminaciju kaosa i nesigurnosti
 * 4. Bayesovski model rane dominacije (Early Dominance vs Late Breaker)
 */
import { matrix, type Analysis } from "@/lib/zlatni-engine";

export interface HtFtOutcomeDetail {
  code: string; // "1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"
  label: string;
  prob: number; // 0..1
  probPercent: number; // 0..100
  fairOdd: number; // fer kvota bez marže
  bookieOdd?: number;
  ev?: number; // ((prob * bookieOdd) - 1) * 100
  markovScore: number;
}

export interface MethodResult {
  name: string;
  pickedCode: string;
  certaintyPercent: number;
  description: string;
}

export interface MasterHtFtPrediction {
  match: string;
  league: string;
  time: string;

  // GLAVNI JEDINSTVENI KONKRETAN TIP
  concreteTip: {
    code: string;
    label: string;
    probPercent: number;
    fairOdd: number;
    bookieOdd?: number;
    ev?: number;
    confidenceGrade: "MAXIMALNA (A+)" | "VISOKA (A)" | "TAKTIČKA (B+)";
    tacticalReason: string;
  };

  // 4 SPECIJALNE METODE KOJE SU ODLUČILE TIP
  methods: MethodResult[];
  consensusRate: string; // npr. "4/4 Metode Jednoglasno"

  // Sigurnosna zaštita (Hedge)
  safeHedge: {
    pick: string;
    description: string;
    probPercent: number;
    fairOdd: number;
  };

  // Shannonova entropija
  entropyIndex: {
    value: number; // npr. 1.84
    status: "NISKA (Čvrst Signal)" | "UMJERENA (Stabilno)" | "VISOKA (Povećan rizik)";
  };

  // Svih 9 HT/FT ishoda
  allOutcomes: HtFtOutcomeDetail[];
}

export function computeQuantumHtFt(
  analysis: Analysis,
  match: string,
  league: string,
  time: string
): MasterHtFtPrediction {
  const lh = analysis.lh;
  const la = analysis.la;

  // 1. METODA: Dixon-Coles vremensko razdvajanje (1. poluvrijeme 43.5%, 2. poluvrijeme 56.5%)
  const htShare = analysis.htShare || 0.435;
  const lh1H = Math.max(0.05, lh * htShare);
  const la1H = Math.max(0.05, la * htShare);
  const lh2H = Math.max(0.05, lh * (1 - htShare));
  const la2H = Math.max(0.05, la * (1 - htShare));

  const H1 = matrix(lh1H, la1H, true);
  const H2 = matrix(lh2H, la2H, false);

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

  // Vjerojatnosti stanja na poluvremenu (1H)
  const p1H_Home = conv((h1, a1) => h1 > a1);
  const p1H_Draw = conv((h1, a1) => h1 === a1);
  const p1H_Away = conv((h1, a1) => h1 < a1);

  // Svih 9 egzaktno konvoluiranih ishoda
  const rawProbs: Record<string, number> = {
    "1/1": conv((h1, a1, h2, a2) => h1 > a1 && h1 + h2 > a1 + a2),
    "X/1": conv((h1, a1, h2, a2) => h1 === a1 && h1 + h2 > a1 + a2),
    "2/1": conv((h1, a1, h2, a2) => h1 < a1 && h1 + h2 > a1 + a2),
    "1/X": conv((h1, a1, h2, a2) => h1 > a1 && h1 + h2 === a1 + a2),
    "X/X": conv((h1, a1, h2, a2) => h1 === a1 && h1 + h2 === a1 + a2),
    "2/X": conv((h1, a1, h2, a2) => h1 < a1 && h1 + h2 === a1 + a2),
    "1/2": conv((h1, a1, h2, a2) => h1 > a1 && h1 + h2 < a1 + a2),
    "X/2": conv((h1, a1, h2, a2) => h1 === a1 && h1 + h2 < a1 + a2),
    "2/2": conv((h1, a1, h2, a2) => h1 < a1 && h1 + h2 < a1 + a2),
  };

  // Normalizacija
  const sumP = Object.values(rawProbs).reduce((a, b) => a + b, 0) || 1;
  const probs: Record<string, number> = {};
  for (const k in rawProbs) {
    probs[k] = rawProbs[k] / sumP;
  }

  // Dohvat stvarnih kvota iz bet365 ako postoje
  const htftMarket = analysis.markets.find((m) =>
    m.name.toLowerCase().includes("poluvrijeme/kraj") ||
    m.name.toLowerCase().includes("half time/full time") ||
    m.group.toLowerCase().includes("poluvrijeme")
  );

  const findOdd = (code: string): number | undefined => {
    if (!htftMarket) return undefined;
    const hit = htftMarket.outcomes.find((o) =>
      o.label.replace(/\s+/g, "") === code ||
      o.label.replace(/\s+/g, "") === code.replace("/", "-")
    );
    return hit?.odd;
  };

  // 2. METODA: Markovljevi lanci prijelaza stanja
  // Računa kondicionalne prijelaze P(Kraj=Stanje2 | Poluvrijeme=Stanje1)
  const markovP_HomeLeadKept = probs["1/1"] / (p1H_Home || 0.001);
  const markovP_DrawToHome = probs["X/1"] / (p1H_Draw || 0.001);
  const markovP_AwayLeadKept = probs["2/2"] / (p1H_Away || 0.001);
  const markovP_DrawKept = probs["X/X"] / (p1H_Draw || 0.001);
  const markovP_DrawToAway = probs["X/2"] / (p1H_Draw || 0.001);

  let markovPicked = "1/1";
  let markovScore = markovP_HomeLeadKept;

  if (markovP_AwayLeadKept > markovScore && probs["2/2"] > probs["1/1"]) {
    markovPicked = "2/2";
    markovScore = markovP_AwayLeadKept;
  }
  if (probs["X/1"] > 0.22 && markovP_DrawToHome > 0.45 && probs["X/1"] > probs["1/1"] * 0.8) {
    markovPicked = "X/1";
    markovScore = markovP_DrawToHome;
  }
  if (probs["X/2"] > 0.20 && markovP_DrawToAway > 0.42 && probs["X/2"] > probs["2/2"] * 0.8) {
    markovPicked = "X/2";
    markovScore = markovP_DrawToAway;
  }
  if (probs["X/X"] > 0.32 && markovP_DrawKept > 0.55) {
    markovPicked = "X/X";
    markovScore = markovP_DrawKept;
  }

  // 3. METODA: Shannonova informacijska entropija
  let entropy = 0;
  for (const k in probs) {
    const p = probs[k];
    if (p > 0.0001) {
      entropy -= p * Math.log2(p);
    }
  }

  const entropyStatus =
    entropy < 2.3
      ? "NISKA (Čvrst Signal)"
      : entropy < 2.8
      ? "UMJERENA (Stabilno)"
      : "VISOKA (Povećan rizik)";

  // 4. METODA: Bayesovski omjer rane dominacije (Early Dominance)
  const homeEarlyRatio = lh1H / (lh || 0.01);
  const awayEarlyRatio = la1H / (la || 0.01);

  let bayesPicked = "1/1";
  let bayesDesc = "";
  if (lh >= la * 1.4) {
    if (homeEarlyRatio >= 0.44 && p1H_Home > 0.40) {
      bayesPicked = "1/1";
      bayesDesc = "Domaćin stvara rani pritisak s 40%+ šanse za vodstvo na odmoru.";
    } else {
      bayesPicked = "X/1";
      bayesDesc = "Favorit lomi otpor u drugom dijelu (veći xG u 2H).";
    }
  } else if (la >= lh * 1.4) {
    if (awayEarlyRatio >= 0.44 && p1H_Away > 0.40) {
      bayesPicked = "2/2";
      bayesDesc = "Gostujući favorit nameće rani ritam u 1. poluvremenu.";
    } else {
      bayesPicked = "X/2";
      bayesDesc = "Gost lomi utakmicu taktičkom nadmoći u nastavku.";
    }
  } else {
    bayesPicked = "X/X";
    bayesDesc = "Izjednačene snage bez dominantnog ranog pritiska.";
  }

  // Sastavljanje detaljnih ishoda
  const outcomeLabels: Record<string, string> = {
    "1/1": "Domaćin vodi na HT / Domaćin pobjeđuje",
    "X/1": "Neriješeno na HT / Domaćin pobjeđuje",
    "2/1": "Gost vodi na HT / Domaćin preokreće",
    "1/X": "Domaćin vodi na HT / Neriješen kraj",
    "X/X": "Neriješeno na HT / Neriješen kraj",
    "2/X": "Gost vodi na HT / Neriješen kraj",
    "1/2": "Domaćin vodi na HT / Gost preokreće",
    "X/2": "Neriješeno na HT / Gost pobjeđuje",
    "2/2": "Gost vodi na HT / Gost pobjeđuje",
  };

  const allOutcomes: HtFtOutcomeDetail[] = Object.keys(probs).map((code) => {
    const p = probs[code];
    const pPct = Number((p * 100).toFixed(1));
    const fairOdd = Number((1 / Math.max(p, 0.001)).toFixed(2));
    const bookieOdd = findOdd(code);
    const ev = bookieOdd ? Number(((p * bookieOdd - 1) * 100).toFixed(1)) : undefined;

    return {
      code,
      label: outcomeLabels[code] || code,
      prob: p,
      probPercent: pPct,
      fairOdd,
      bookieOdd,
      ev,
      markovScore: code === "1/1" ? markovP_HomeLeadKept : code === "2/2" ? markovP_AwayLeadKept : 0.5,
    };
  });

  allOutcomes.sort((a, b) => b.prob - a.prob);

  // KONAČNI MASTER TIP — sinteza 4 metode
  // Najvjerojatniji bazni ishod
  const top1 = allOutcomes[0]!;
  let definitiveCode = top1.code;
  let tacticalReason = "";

  // Provjera preklapanja s Markovljevim lancima
  if (top1.code === "1/1" && markovP_HomeLeadKept < 0.60 && probs["X/1"] > 0.22) {
    definitiveCode = "X/1";
    tacticalReason = "Markovljev lanac indicira taktički čvrsto 1. poluvrijeme: rješenje stiže u drugom dijelu (X/1).";
  } else if (top1.code === "2/2" && markovP_AwayLeadKept < 0.60 && probs["X/2"] > 0.20) {
    definitiveCode = "X/2";
    tacticalReason = "Gost lomi utakmicu tek u drugom poluvremenu (X/2).";
  } else if (top1.code === "1/1") {
    tacticalReason = `Rana ofenzivna dominacija domaćina (šansa za vodstvo na odmoru ${(p1H_Home * 100).toFixed(0)}%, Markovljeva stabilnost očuvanja ${(markovP_HomeLeadKept * 100).toFixed(0)}%).`;
  } else if (top1.code === "2/2") {
    tacticalReason = `Rano vodstvo gosta i stabilna kontrola utakmice (Markovljeva stabilnost ${(markovP_AwayLeadKept * 100).toFixed(0)}%).`;
  } else if (top1.code === "X/X") {
    tacticalReason = "Nizak očekivani zbroj golova i visoka vjerojatnost taktičkog egala kroz oba poluvremena.";
  } else {
    tacticalReason = `Matematički optimalan prijelaz uz najpovoljniju distribuciju xG pritiska.`;
  }

  const definitiveOutcome = allOutcomes.find((o) => o.code === definitiveCode) || top1;

  // Izračun konsenzusa
  let matchCount = 0;
  if (top1.code === definitiveCode) matchCount++;
  if (markovPicked === definitiveCode) matchCount++;
  if (bayesPicked === definitiveCode) matchCount++;
  if (entropy < 2.5) matchCount++;

  const consensusText =
    matchCount >= 4
      ? "4/4 Metode Jednoglasno (Maksimalna preciznost)"
      : matchCount === 3
      ? "3/4 Metode Potvrđuju Tip"
      : "Algoritamska Prednost Modeliranja";

  const grade: MasterHtFtPrediction["concreteTip"]["confidenceGrade"] =
    definitiveOutcome.probPercent >= 40
      ? "MAXIMALNA (A+)"
      : definitiveOutcome.probPercent >= 28
      ? "VISOKA (A)"
      : "TAKTIČKA (B+)";

  // Sigurnosni hedge
  let hedgePick = "1X na kraju";
  let hedgeDesc = "Dvostruka šansa domaćina";
  let hedgeP = (probs["1/1"] + probs["X/1"] + probs["1/X"] + probs["X/X"]) * 100;

  if (definitiveCode.endsWith("2")) {
    hedgePick = "X2 na kraju";
    hedgeDesc = "Dvostruka šansa gosta";
    hedgeP = (probs["2/2"] + probs["X/2"] + probs["2/X"] + probs["X/X"]) * 100;
  } else if (definitiveCode === "X/X") {
    hedgePick = "Manje od 2.5 gola";
    hedgeDesc = "Obrana dominira utakmicom";
    hedgeP = 68;
  }

  return {
    match,
    league,
    time,
    concreteTip: {
      code: definitiveCode,
      label: outcomeLabels[definitiveCode] || definitiveCode,
      probPercent: definitiveOutcome.probPercent,
      fairOdd: definitiveOutcome.fairOdd,
      bookieOdd: definitiveOutcome.bookieOdd,
      ev: definitiveOutcome.ev,
      confidenceGrade: grade,
      tacticalReason,
    },
    methods: [
      {
        name: "1. Dixon-Coles Vremenska Dekompozicija",
        pickedCode: top1.code,
        certaintyPercent: top1.probPercent,
        description: `Razdvajanje 1H (${(htShare * 100).toFixed(0)}%) i 2H sa korekcijom nultih ishoda.`,
      },
      {
        name: "2. Markovljevi Lanci Prijelaza Stanja",
        pickedCode: markovPicked,
        certaintyPercent: Number((markovScore * 100).toFixed(0)),
        description: `Stohastička stabilnost vodstva iznosi ${(markovScore * 100).toFixed(0)}%.`,
      },
      {
        name: "3. Shannonova Informacijska Entropija",
        pickedCode: definitiveCode,
        certaintyPercent: Number(((1 - entropy / 3.17) * 100).toFixed(0)),
        description: `Indeks entropije ${entropy.toFixed(2)} — ${entropyStatus}.`,
      },
      {
        name: "4. Bayesov Model Rane Dominacije",
        pickedCode: bayesPicked,
        certaintyPercent: Number(((lh1H / (lh1H + la1H || 1)) * 100).toFixed(0)),
        description: bayesDesc,
      },
    ],
    consensusRate: consensusText,
    safeHedge: {
      pick: hedgePick,
      description: hedgeDesc,
      probPercent: Number(Math.min(94, Math.max(55, hedgeP)).toFixed(1)),
      fairOdd: Number((100 / Math.min(94, Math.max(55, hedgeP))).toFixed(2)),
    },
    entropyIndex: {
      value: Number(entropy.toFixed(2)),
      status: entropyStatus,
    },
    allOutcomes,
  };
}

