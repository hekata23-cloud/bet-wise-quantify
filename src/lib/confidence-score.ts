import { generatePoissonMatrix, type PoissonMatrixResult } from "./poisson-engine";
import { detectAnomalies, type Anomaly } from "./anomaly-detector";

export type UltimateVerdict = {
  score: number; // 0 - 100 Indeks pouzdanosti
  grade: "ELITNI ZICER (A+)" | "VISOKA SIGURNOST (A)" | "DOBAR VALUE (B)" | "PRESKOČI (NO BET)";
  primaryMarket: "2.5 VIŠE" | "2.5 MANJE" | "BTTS DA" | "BTTS NE" | "PRESKOČI";
  alternativeMarket: string;
  reasons: string[];
  poisson: PoissonMatrixResult;
  anomalies: Anomaly[];
};

export function evaluateMatchConfidence(
  k22: number,
  kOver: number,
  kGg: number,
  leagueMultiplier = 1.0
): UltimateVerdict {
  const poisson = generatePoissonMatrix(kOver, kGg, k22);
  const anomalies = detectAnomalies(k22, kOver, kGg);

  // Korigirana vjerojatnost prema ligi
  const adjOverProb = Math.min(90, Math.max(10, poisson.lines.over25 * leagueMultiplier));
  const adjBttsProb = Math.min(90, Math.max(10, poisson.bttsProb * (leagueMultiplier > 1 ? 1.05 : 0.96)));

  let score = 50;
  const reasons: string[] = [];

  // Provjera postojanja stvarnih kvota
  const hasK22 = Number.isFinite(k22) && k22 > 1.05;
  const hasKGg = Number.isFinite(kGg) && kGg > 1.05;

  // Provjera usklađenosti
  const isStrongOver = adjOverProb >= 57 && (!hasK22 || k22 <= 13.5);
  const isStrongUnder = adjOverProb <= 43 && (!hasK22 || k22 >= 13.5);
  const isStrongBttsYes = adjBttsProb >= 56 && (!hasKGg || kGg <= 1.85);
  const isStrongBttsNo = adjBttsProb <= 44 && (!hasKGg || kGg >= 1.95);

  let primaryMarket: UltimateVerdict["primaryMarket"] = "PRESKOČI";
  let alt = "Nema jasne alternative";

  // Bonus je proporcionalan stvarnoj udaljenosti vjerojatnosti od 50% (jača brojka = veći bonus),
  // a ne fiksan iznos koji bi lažno izjednačio 57% i 90% slučaj.
  if (isStrongOver && adjOverProb > 50) {
    score += Math.min(30, (adjOverProb - 50) * 0.8);
    primaryMarket = "2.5 VIŠE";
    alt = isStrongBttsYes ? "BTTS DA (ili 2-3 gola)" : "1X i Over 1.5";
    reasons.push(`Poisson model daje ${adjOverProb.toFixed(1)}% šanse za 3+ gola.`);
    if (hasK22) reasons.push(`Kvota 2:2 (${k22.toFixed(2)}) potvrđuje visok napadački potencijal.`);
  } else if (isStrongUnder && adjOverProb < 50) {
    score += Math.min(30, (50 - adjOverProb) * 0.8);
    primaryMarket = "2.5 MANJE";
    alt = isStrongBttsNo ? "BTTS NE (ili 0-2 gola)" : "Manje 3.5 zicer";
    reasons.push(`Vjerojatnost za 3+ gola je tek ${adjOverProb.toFixed(1)}%.`);
    if (hasK22) reasons.push(`Kvota 2:2 (${k22.toFixed(2)}) odbacuje mogućnost remija s puno golova.`);
  } else if (isStrongBttsYes && adjBttsProb > 50) {
    score += Math.min(22, (adjBttsProb - 50) * 0.7);
    primaryMarket = "BTTS DA";
    alt = "Over 2.5 golova";
    reasons.push(`Dixon-Coles matrica daje ${adjBttsProb.toFixed(1)}% za golove s obje strane.`);
  } else if (isStrongBttsNo && adjBttsProb < 50) {
    score += Math.min(22, (50 - adjBttsProb) * 0.7);
    primaryMarket = "BTTS NE";
    alt = "2.5 MANJE";
    reasons.push(`Samo ${adjBttsProb.toFixed(1)}% vjerojatnosti da oba tima zabiju.`);
  } else {
    score -= 15;
    primaryMarket = "PRESKOČI";
    alt = "Preskočiti ili igrati manji ulog na live klađenju";
    reasons.push("Kvote su u 'sivoj zoni' (oko 50/50). Tržište nema jasnog favorita.");
  }

  // Provjera utjecaja anomalija
  for (const an of anomalies) {
    if (an.title.includes("Skriveni OVER")) {
      score += 10;
      reasons.push(`Detektor anomalija: ${an.title} — veća kvota Over nosi visoku vrijednost.`);
    } else if (an.title.includes("Lažni OVER")) {
      score -= 15;
      reasons.push(`Oprez: ${an.title} — niska kvota je navlakuša, kvote na 2:2 i GG ne prate.`);
    }
  }

  score = Math.max(10, Math.min(98, score));

  let grade: UltimateVerdict["grade"] = "DOBAR VALUE (B)";
  if (score >= 82) grade = "ELITNI ZICER (A+)";
  else if (score >= 68) grade = "VISOKA SIGURNOST (A)";
  else if (score < 45) grade = "PRESKOČI (NO BET)";

  return {
    score,
    grade,
    primaryMarket,
    alternativeMarket: alt,
    reasons,
    poisson,
    anomalies,
  };
}

