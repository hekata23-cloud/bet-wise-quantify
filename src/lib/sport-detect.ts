// ============================================================
// SPORT-DETECT — automatsko prepoznavanje sporta i tržišta
// iz naziva utakmice, tržišta i visine linije.
// Rješava krivo svrstavanje: "Over 29.5" u jednom poluvremenu
// je rukomet/košarka, NE nogomet.
// ============================================================

import type { KorpaTip, Sport } from "./korpa";

export type { Sport };

/** Engleske etikete za badge (prikaz na listiću). */
export const SPORT_LABEL_EN: Record<Sport, string> = {
  nogomet: "Football",
  "košarka": "Basketball",
  rukomet: "Handball",
};

export const SPORT_BADGE: Record<Sport, string> = {
  nogomet: "⚽ Football",
  "košarka": "🏀 Basketball",
  rukomet: "🤾 Handball",
};

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/,/g, ".").replace(/\s+/g, " ").trim();

/** Izvuci prvu numeričku liniju iz teksta ("Over 29.5" → 29.5). */
export function extractLine(text: string): number | null {
  const m = norm(text).match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** Pokazuje li tekst da se radi o DIJELU utakmice (poluvrijeme, četvrtina...). */
export function isPartialPeriod(text: string): boolean {
  return /(poluvrijem|polu|half|1h|2h|\bht\b|quarter|[cč]etvrtin|period)/i.test(text);
}

/**
 * Prepoznaj sport iz tržišta, tipa i (sekundarno) naziva utakmice/lige.
 * Eksplicitno zadani košarka/rukomet se NE dira — heuristika popravlja
 * samo unose označene kao "nogomet" (najčešći izvor krive klasifikacije).
 *
 * Pravila linija (total/spread):
 *  - "quarter/četvrtina"                       → košarka
 *  - linija ≥ 80 (full-time)                   → košarka
 *  - dio utakmice + linija ≥ 40               → košarka (npr. half 48.5)
 *  - dio utakmice + linija 18–39.5            → rukomet (npr. 2nd Half Over 29.5)
 *  - full-time + linija 40–79.5               → rukomet, osim ako tekst
 *    spominje poene → košarka
 *  - inače                                     → zadani sport (nogomet)
 */
export function detectSport(input: {
  sport?: string;
  utakmica?: string;
  liga?: string;
  trziste?: string;
  tip?: string;
}): Sport {
  const eksplicitni = norm(input.sport ?? "");
  if (eksplicitni.startsWith("košarka") || eksplicitni.startsWith("kosarka") || eksplicitni.startsWith("basket"))
    return "košarka";
  if (eksplicitni.startsWith("rukomet") || eksplicitni.startsWith("handball"))
    return "rukomet";

  const tekst = `${input.trziste ?? ""} ${input.tip ?? ""} ${input.liga ?? ""}`;
  const linija = extractLine(`${input.tip ?? ""} ${input.trziste ?? ""}`);
  const partial = isPartialPeriod(tekst);
  const poeni = /(poen|point|košev|kosev)/i.test(tekst);
  const golovi = /(gol|goal)/i.test(tekst);

  if (/(quarter|[cč]etvrtin)/i.test(tekst)) return "košarka";

  if (linija != null) {
    if (partial) {
      if (linija >= 40) return "košarka";
      if (linija >= 18) return "rukomet";
    } else {
      if (linija >= 80) return "košarka";
      if (linija >= 40) return poeni && !golovi ? "košarka" : "rukomet";
    }
  }
  return "nogomet";
}

/**
 * Puna etiketa selekcije za listić:
 *   "Handball: Helsingborg vs Hallby — 2nd Half Total Over 29.5"
 */
export function formatSelectionLabel(t: Pick<KorpaTip, "sport" | "utakmica" | "trziste" | "tip">): string {
  const sport = detectSport(t);
  const trz = (t.trziste || "").trim();
  const tip = (t.tip || "").trim();
  // izbjegni dupliranje ako tip već sadrži naziv tržišta
  const market =
    trz && tip.toLowerCase().includes(trz.toLowerCase())
      ? tip
      : [trz, tip].filter(Boolean).join(" ");
  return `${SPORT_LABEL_EN[sport]}: ${t.utakmica} — ${market}`;
}
