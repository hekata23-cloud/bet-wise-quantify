/* ═══════════════════════════════════════════════════════════════════
   DEVIG-SHIELD — Sigurnosni štit tržišne marže (v1)
   ═══════════════════════════════════════════════════════════════════
   Tri metode skidanja marže (de-vig):

     1) MULTIPLIKATIVNA (normalized inverse) — brza baza
     2) POWER (logaritamska) — bolja za dvostruka tržišta
        p_i^k normalizirano, k riješen bisekcijom tako da Σp = 1
     3) SHIN (Z. Shin, 1991/92) — modelira insajdersku trgovinu,
        zlatni standard za 1X2; iterativno rješava z

   Plus detekcija distorzije: vig > 7% = tržište teško natovareno
   maržom, a "POOR MARKET PRICE" warning kad je model siguran,
   ali ponuđena cijena ne isplati samostalni ulog (negativan EV).
   ═══════════════════════════════════════════════════════════════════ */

/** Prag vig-a (udio 0..1) iznad kojeg tržište smatramo distorziranim. */
export const VIG_PRAG = 0.07;

export type DevigIzlaz = {
  vig: number;            // ukupna marża (0.05 = 5%)
  distorzija: boolean;    // vig > VIG_PRAG
  fair: number[];         // de-vig vjerojatnosti (zbroj = 1)
  metoda: "shin" | "power" | "multiplikativno";
};

/** 1) Multiplikativno: p_i = (1/o_i) / Σ(1/o). */
export function devigMultiplikativno(odds: number[]): number[] {
  const inv = odds.map((o) => (o > 1 ? 1 / o : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  if (s <= 0) return odds.map(() => 1 / Math.max(1, odds.length));
  return inv.map((x) => x / s);
}

/** 2) Power: rješava k tako da je Σ(1/o_i)^k = 1 (bez normalizacije).
 *  k = 1 → multiplikativno; k > 1 → favoriti dobivaju više (Shin-približno). */
export function devigPower(odds: number[]): number[] {
  const inv = odds.map((o) => (o > 1 ? 1 / o : 1e-9));
  // f(k) = Σ (1/o)^k je opadajuća u k (svaki (1/o) < 1)
  let lo = 0.2, hi = 4;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const zbroj = inv.map((x) => Math.pow(x, mid)).reduce((a, b) => a + b, 0);
    if (zbroj > 1) lo = mid; else hi = mid;
  }
  const k = (lo + hi) / 2;
  return inv.map((x) => Math.pow(x, k));
}

/** 3) Shin: p_i iz kvota modelom insajderske trgovine (iterativno po z). */
export function devigShin(odds: number[]): number[] {
  const n = odds.length;
  const inv = odds.map((o) => (o > 1 ? 1 / o : 0));
  const sInv = inv.reduce((a, b) => a + b, 0);
  if (sInv <= 1 || n < 2) return devigMultiplikativno(odds);
  const pi = inv.map((x) => x / sInv); // bookmaker-implied (s maržom)
  const shinP = (z: number): number[] => {
    // p_i = ( sqrt(z² + 4(1−z)·π_i²/Σπ) − z ) / (2(1−z))
    const sPi = pi.reduce((a, b) => a + b, 0);
    return pi.map((p) => {
      const b = 4 * (1 - z) * p * p / sPi;
      return (Math.sqrt(z * z + b) - z) / (2 * (1 - z));
    });
  };
  let lo = 0.001, hi = 0.3;
  for (let i = 0; i < 80; i++) {
    const z = (lo + hi) / 2;
    const s = shinP(z).reduce((a, b) => a + b, 0);
    if (s > 1) hi = z; else lo = z;
  }
  const p = shinP((lo + hi) / 2);
  const s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / (s || 1));
}

/** Glavni ulaz: analizira tržište, bira metodu i javlja distorziju. */
export function analizaVig(odds: number[]): DevigIzlaz {
  const ciste = odds.filter((o) => o > 1.01 && Number.isFinite(o));
  const inv = ciste.map((o) => 1 / o);
  const vig = inv.reduce((a, b) => a + b, 0) - 1;
  const distorzija = vig > VIG_PRAG;
  let metoda: DevigIzlaz["metoda"];
  let fair: number[];
  if (ciste.length >= 3) {
    metoda = "shin";
    fair = devigShin(ciste);
  } else if (ciste.length === 2) {
    metoda = "power";
    fair = devigPower(ciste);
  } else {
    metoda = "multiplikativno";
    fair = devigMultiplikativno(ciste.length ? ciste : odds);
  }
  return { vig: Math.max(0, vig), distorzija, fair, metoda };
}

/* ── POOR MARKET PRICE ───────────────────────────────────────────── */

export type CijenaUpozorenje = {
  losa: boolean;
  razina: "nema" | "oprez" | "loša";
  poruka: string | null;
  ev: number;
};

/**
 * Model je siguran (p visoka), ali kvota je preniska da isplati
 * samostalni ulog → "POOR MARKET PRICE — DO NOT BET AS SINGLE".
 * Prag: EV < −2% uz p ≥ 50% i kvotu < 1.80 (niska cijena).
 */
export function losaCijena(p: number, odds: number | null | undefined): CijenaUpozorenje {
  if (odds == null || !(odds > 1.01)) {
    return { losa: false, razina: "nema", poruka: null, ev: 0 };
  }
  const ev = p * odds - 1;
  if (p >= 0.5 && ev < -0.02 && odds < 1.8) {
    return {
      losa: true,
      razina: "loša",
      poruka: `POOR MARKET PRICE — DO NOT BET AS SINGLE: model ${Math.round(p * 100)}%, kvota ${odds.toFixed(2)} → EV ${(ev * 100).toFixed(1)}%. Igraj samo u kombinaciji ili preskoči.`,
      ev,
    };
  }
  if (p >= 0.5 && ev < 0) {
    return {
      losa: false,
      razina: "oprez",
      poruka: `Cijena je na rubu: model ${Math.round(p * 100)}%, kvota ${odds.toFixed(2)}, EV ${(ev * 100).toFixed(1)}% — bolja kao noga kombinacije.`,
      ev,
    };
  }
  return { losa: false, razina: "nema", poruka: null, ev };
}

