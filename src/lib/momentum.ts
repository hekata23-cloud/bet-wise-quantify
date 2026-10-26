// ══ MOMENTUM & FATIGUE ENGINE v1.0 ══

export interface MomentumFactor {
  fatiguePenalty: number; // Postotak smanjenja λ (0.85 = -15%)
  streakRisk: string | null;
  motivationLevel: "VISOKA" | "KRITIČNA" | "OPUŠTENA";
}

/** Računa koliko umor i nizovi utječu na oštrinu tima */
export function calculateMomentum(daysSinceLastMatch: number, currentStreak: number): MomentumFactor {
  let penalty = 1.0;
  let risk: string | null = null;
  let motivation: "VISOKA" | "KRITIČNA" | "OPUŠTENA" = "VISOKA";

  // Analiza umora (Fatigue)
  if (daysSinceLastMatch <= 3) {
    penalty = 0.82; // Veliki pad energije - tim je igrao prije 3 dana
  } else if (daysSinceLastMatch <= 4) {
    penalty = 0.90; // Blagi pad oštrine
  }

  // Regresija prema sredini (Streak Risk)
  if (currentStreak >= 5) {
    risk = "REGRESIJA: Tim ima preko 5 pobjeda u nizu. Statistički je ogroman rizik od remija (X).";
    motivation = "OPUŠTENA"; // Često dolazi do zasićenja
  }

  return {
    fatiguePenalty: penalty,
    streakRisk: risk,
    motivationLevel: motivation
  };
}
