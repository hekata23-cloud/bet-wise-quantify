// ============================================================
// BET-SLIP-MATH — čisti matematički indikatori rizika za listić.
// EV klasifikacija, prag visoke varijance (Shannon entropija),
// potencijalni povrat. Bez DOM-a / API-ja — lako testirati.
// ============================================================

export type EvStatus = "pozitivan" | "neutralan" | "negativan";

/** EV prag: ispod ±2% smatramo "neutralnim" (nema realne vrijednosti). */
export const EV_NEUTRAL_PRAG = 0.02;

/** Zeleno ako je EV pozitivan, sivo oko nule, crveno ako je negativan. */
export function evStatus(edge: number): EvStatus {
  if (!Number.isFinite(edge)) return "neutralan";
  if (edge > EV_NEUTRAL_PRAG) return "pozitivan";
  if (edge < -EV_NEUTRAL_PRAG) return "negativan";
  return "neutralan";
}

/**
 * Prag visoke varijance: normalizirana Shannon entropija ≥ 0.9
 * znači da je tiket gotovo 50/50 bacanje novčića.
 */
export const VISOKA_VARIJANCA_PRAG = 0.9;

export function visokaVarijanca(entropija: number): boolean {
  return Number.isFinite(entropija) && entropija >= VISOKA_VARIJANCA_PRAG;
}

/** Potencijalni povrat = ulog × kombinirana kvota (0 kad unos nije valjan). */
export function potentialReturn(stake: number, odds: number): number {
  if (!Number.isFinite(stake) || !Number.isFinite(odds) || stake <= 0 || odds <= 1) return 0;
  return stake * odds;
}
