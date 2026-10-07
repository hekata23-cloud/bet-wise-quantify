// src/lib/predictor-bridge.ts
import {
  calculate,
  calculateBtts,
  calculateCorrectScore,
  calculateHtDraw,
  calculateOu,
  calculateOu15,
  calculateOu35,
  emptyInputs,
  type Inputs,
} from "./predictor-engine";

export function loadLastPredictorInputs(): Inputs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("prediktor:last_inputs");
    if (!raw) return null;
    return JSON.parse(raw) as Inputs;
  } catch {
    return null;
  }
}

export function saveLastPredictorInputs(data: Inputs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("prediktor:last_inputs", JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * Generira autoritativni matematički briefing za Lunu na temelju
 * zadnjih aktivnih unosa iz kalkulatora/prediktora.
 */
export function predictorBriefing(): string {
  const inputs = loadLastPredictorInputs();
  if (!inputs) return "";

  // Provjera ima li minimalno unesene FT ili HT tečajeve
  const hasFt = Boolean(inputs.ft1 && inputs.ft2);
  const hasGoals = Boolean(inputs.o25 || inputs.bttsYes || inputs.o15);
  if (!hasFt && !hasGoals) return "";

  const lines: string[] = ["═══ MATEMATIČKI PREDIKTOR (Dixon-Coles & Poisson 5x5) ═══"];

  // 1. Točan rezultat & xG
  const cs = calculateCorrectScore(inputs, true);
  if (!("error" in cs)) {
    lines.push(
      `• Očekivani golovi (xG): Domaćin ${cs.lambdaHome.toFixed(2)} | Gost ${cs.lambdaAway.toFixed(2)} (Ukupno ${cs.totalXG.toFixed(2)})`
    );
    lines.push(
      `• Najvjerojatniji točan rezultat: ${cs.bestScore.score} (${(cs.bestScore.prob * 100).toFixed(1)}%, fer tečaj ${cs.bestScore.fair.toFixed(2)})`
    );
    const top3Str = cs.top3.map((s) => `${s.score} (${(s.prob * 100).toFixed(1)}%)`).join(", ");
    lines.push(`• Top 3 rezultata: ${top3Str}`);
  }

  // 2. BTTS (Oba daju gol)
  const btts = calculateBtts(inputs, true);
  if (!("error" in btts)) {
    lines.push(
      `• BTTS (GG/NG): GG = ${(btts.probYes * 100).toFixed(1)}% | NG = ${(btts.probNo * 100).toFixed(1)}% -> Preporuka: ${btts.concretePick.pick}`
    );
  }

  // 3. Over / Under linije (1.5, 2.5, 3.5)
  const o15 = calculateOu15(inputs, true);
  if (!("error" in o15)) {
    lines.push(
      `• Zbroj 1.5: Više = ${(o15.probOver * 100).toFixed(1)}% | Manje = ${(o15.probUnder * 100).toFixed(1)}%`
    );
  }

  const ou25 = calculateOu(inputs);
  if (!("error" in ou25)) {
    lines.push(
      `• Zbroj 2.5: Više = ${(ou25.probOver * 100).toFixed(1)}% | Manje = ${(ou25.probUnder * 100).toFixed(1)}% -> Preporuka: ${ou25.concretePick.pick}`
    );
  }

  const ou35 = calculateOu35(inputs);
  if (!("error" in ou35)) {
    lines.push(
      `• Zbroj 3.5: Više = ${(ou35.probOver * 100).toFixed(1)}% | Manje = ${(ou35.probUnder * 100).toFixed(1)}%`
    );
  }

  // 4. Poluvrijeme / Kraj (HT/FT)
  const htft = calculate(inputs, true);
  if (!("error" in htft)) {
    lines.push(`• HT/FT Favorit: ${htft.concretePick.pick} (${htft.concretePick.confidenceScore}% sigurnost)`);
  }

  const htd = calculateHtDraw(inputs, true);
  if (!("error" in htd)) {
    lines.push(`• X na poluvremenu (HT Draw): ${(htd.probDraw * 100).toFixed(1)}%`);
  }

  lines.push("Uputa za Lunu: Ovi brojevi su izračunati izravno iz tečajeva utakmice. Obavezno ih uskladi u odgovoru.");
  return lines.join("\n");
}

