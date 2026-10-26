/**
 * Prediction Integrity Gate
 * Zajednički konzervativni sloj za sve predikcijske kartice.
 *
 * Važno:
 * - Ne stvara novu prognozu i ne povećava vjerojatnosti.
 * - Može samo sniziti prikazanu pouzdanost ili reći PRESKOČI.
 * - Provjerava kvalitetu podataka, tržišnu maržu, EV, stabilnost
 *   i proturječnosti između modela i tržišta.
 */

export type IntegrityStatus = "CERTIFICIRAN" | "OPREZ" | "PRESKOČI";

export type IntegrityInput = {
  /** Vjerojatnost odabranog tipa, u rasponu 0–1. */
  probability: number;

  /** Kvota kladionice za odabrani tip; null ako nije dostupna. */
  odds?: number | null;

  /**
   * Vjerojatnost iste strane prema tržištu bez marže.
   * Primjer: Over 2.5 ima tržišnih 58% nakon de-vig postupka.
   */
  marketProbability?: number | null;

  /** Marža tržišta u postotcima, npr. 6.5 za 6.5%. */
  marginPercent?: number | null;

  /**
   * Kvaliteta ulaznih podataka:
   * 1 = kvote s obje strane + više tržišta + stvarni podaci
   * 0.7 = djelomične kvote ili samo jedan pouzdan izvor
   * 0.45 = model / prosjek lige / ručni nepotpuni unos
   */
  dataQuality?: number;

  /**
   * Neslaganje neovisnih procjena u postotnim bodovima.
   * Primjer: model 62%, tržište 54% -> 8.
   */
  disagreementPoints?: number;

  /**
   * True kad drugi povezani tipovi ruše odabrani tip.
   * Primjer: Over 2.5 kao glavni tip, ali model snažno preferira NG,
   * Under 2.5 i nizak očekivani broj golova.
   */
  contradictory?: boolean;

  /** True ako se za utakmicu koriste samo zadane/prosječne vrijednosti. */
  fallbackModel?: boolean;

  /** Naziv tržišta samo za opis korisniku. */
  market?: string;
};

export type IntegrityResult = {
  status: IntegrityStatus;
  approved: boolean;
  probability: number;
  rawProbability: number;
  fairOdds: number;
  evPercent: number | null;
  score: number;
  reasons: string[];
  label: string;
};

/** Sigurno ograničavanje broja na 0–1. */
const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Izračun tržišne vjerojatnosti iz dvije strane tržišta.
 * Koristi se za O/U, BTTS, pobjednika i slična dvostrana tržišta.
 */
export function noVigProbability(selectedOdd: number, oppositeOdd: number): number | null {
  if (
    !Number.isFinite(selectedOdd) ||
    !Number.isFinite(oppositeOdd) ||
    selectedOdd <= 1 ||
    oppositeOdd <= 1
  ) {
    return null;
  }

  const a = 1 / selectedOdd;
  const b = 1 / oppositeOdd;
  return a / (a + b);
}

/** Marža tržišta za dvije strane, izražena u postotcima. */
export function twoWayMarginPercent(firstOdd: number, secondOdd: number): number | null {
  if (
    !Number.isFinite(firstOdd) ||
    !Number.isFinite(secondOdd) ||
    firstOdd <= 1 ||
    secondOdd <= 1
  ) {
    return null;
  }

  return (1 / firstOdd + 1 / secondOdd - 1) * 100;
}

/**
 * Glavna provjera integriteta.
 * Rezultat nikada ne vraća veću vjerojatnost od one koju je poslao engine.
 */
export function evaluatePredictionIntegrity(input: IntegrityInput): IntegrityResult {
  const rawProbability = clamp01(input.probability);
  const odds = input.odds && Number.isFinite(input.odds) && input.odds > 1 ? input.odds : null;

  // POPRAVAK: Nevaljana tržišna vjerojatnost ne smije se pretvoriti u 0% i lažno stvoriti veliko odstupanje.
  const marketProbability =
    input.marketProbability === null ||
    input.marketProbability === undefined ||
    !Number.isFinite(input.marketProbability)
      ? null
      : clamp01(input.marketProbability);

  const dataQuality = clamp01(input.dataQuality ?? 0.65);
  const disagreement = Math.max(
    0,
    Number.isFinite(input.disagreementPoints)
      ? input.disagreementPoints!
      : marketProbability === null
        ? 0
        : Math.abs(rawProbability - marketProbability) * 100,
  );

  const margin = input.marginPercent ?? null;
  const reasons: string[] = [];

  let score = 100;
  let adjustedProbability = rawProbability;

  // 1. Kvaliteta izvora podataka.
  if (dataQuality < 0.5) {
    score -= 28;
    adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.55;
    reasons.push(
      "Niska kvaliteta ulaznih podataka: procjena koristi prosjek lige, nepotpune kvote ili zamjenski model.",
    );
  } else if (dataQuality < 0.75) {
    score -= 12;
    adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.78;
    reasons.push("Djelomični podaci: pouzdanost je konzervativno smanjena.");
  }

  // 2. Nema stvarnih kvota / radi se o fallback modelu.
  if (input.fallbackModel) {
    score -= 18;
    adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.7;
    reasons.push(
      "Nema dovoljno tržišnih kvota za punu kalibraciju; tip nije certificiran za veći ulog.",
    );
  }

  // 3. Prevelika marža znači da tržište nije dovoljno čisto.
  if (margin !== null && Number.isFinite(margin)) {
    if (margin > 12) {
      score -= 20;
      reasons.push(
        `Marža tržišta je previsoka (${margin.toFixed(1)}%), pa fer procjena nije dovoljno pouzdana.`,
      );
    } else if (margin > 8) {
      score -= 9;
      reasons.push(`Povišena marža tržišta (${margin.toFixed(1)}%) smanjuje kvalitetu kvote.`);
    }
  }

  // 4. Razlika modela i de-vig tržišta.
  if (marketProbability !== null) {
    if (disagreement >= 15) {
      score -= 30;
      adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.55;
      reasons.push(
        `Model i tržište se snažno razilaze (${disagreement.toFixed(1)} postotnih bodova).`,
      );
    } else if (disagreement >= 9) {
      score -= 16;
      adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.72;
      reasons.push(
        `Model i tržište nisu dovoljno usklađeni (${disagreement.toFixed(1)} postotnih bodova).`,
      );
    } else if (disagreement >= 5) {
      score -= 6;
      reasons.push(
        `Postoji umjereno odstupanje modela i tržišta (${disagreement.toFixed(1)} postotnih bodova).`,
      );
    }
  }

  // 5. Logička proturječnost mora srušiti certifikat.
  if (input.contradictory) {
    score -= 35;
    adjustedProbability = 0.5 + (adjustedProbability - 0.5) * 0.5;
    reasons.push("Povezana tržišta daju proturječan signal; glavni tip je blokiran.");
  }

  const evPercent = odds === null ? null : (adjustedProbability * odds - 1) * 100;

  // 6. Negativan EV nije automatska greška modela, ali nije kandidat za tip.
  if (evPercent !== null && evPercent < -4) {
    score -= 18;
    reasons.push(`Kvota je ispod konzervativne fer procjene (EV ${evPercent.toFixed(1)}%).`);
  } else if (evPercent !== null && evPercent < 1) {
    score -= 7;
    reasons.push(
      `Nema dovoljne matematičke prednosti nad kladionicom (EV ${evPercent.toFixed(1)}%).`,
    );
  }

  // 7. Tip blizu 50/50 ne smije se predstavljati kao konkretan siguran signal.
  const certaintyDistance = Math.abs(adjustedProbability - 0.5);
  if (certaintyDistance < 0.035) {
    score -= 25;
    reasons.push("Vjerojatnosti su preblizu 50/50; profesionalni pristup je preskočiti utakmicu.");
  } else if (certaintyDistance < 0.07) {
    score -= 10;
    reasons.push("Signal je slab jer je tržište gotovo uravnoteženo.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  adjustedProbability = clamp01(adjustedProbability);

  const fairOdds = adjustedProbability > 0 ? 1 / adjustedProbability : 99;

  const hardBlock =
    input.contradictory === true ||
    dataQuality < 0.35 ||
    disagreement >= 18 ||
    certaintyDistance < 0.025;

  const approved =
    !hardBlock &&
    score >= 72 &&
    adjustedProbability >= 0.56 &&
    (evPercent === null || evPercent >= 1);

  let status: IntegrityStatus = "PRESKOČI";
  let label = "PRESKOČI — nema dovoljno potvrde";

  if (approved && score >= 86 && adjustedProbability >= 0.62) {
    status = "CERTIFICIRAN";
    label = "CERTIFICIRAN SIGNAL";
  } else if (!hardBlock && score >= 55) {
    status = "OPREZ";
    label = "OPREZ — samo manji ulog ili sigurnija alternativa";
  }

  if (!reasons.length) {
    reasons.push("Podaci, tržišna marža i procjena modela prolaze osnovnu provjeru integriteta.");
  }

  return {
    status,
    approved,
    probability: adjustedProbability,
    rawProbability,
    fairOdds,
    evPercent,
    score,
    reasons,
    label,
  };
}

/**
 * Provjera nogometne konzistentnosti između tipova iz iste matrice.
 * Koristi se na Golovi, BTTS/O-U, Prediktor, HT/FT i Zlatni tip karticama.
 */
export function footballContradiction(input: {
  selected: "OVER_25" | "UNDER_25" | "BTTS_YES" | "BTTS_NO" | "HOME" | "DRAW" | "AWAY";
  over25?: number;
  bttsYes?: number;
  home?: number;
  draw?: number;
  away?: number;
}): boolean {
  const over25 = input.over25;
  const bttsYes = input.bttsYes;
  const home = input.home;
  const draw = input.draw;
  const away = input.away;

  // POPRAVAK: 1X2 vjerojatnosti moraju biti valjane; potpune se moraju zbrajati na 1.
  if (
    [home, draw, away].some(
      (probability) =>
        probability !== undefined &&
        (!Number.isFinite(probability) || probability < 0 || probability > 1),
    )
  ) {
    return true;
  }
  if (
    home !== undefined &&
    draw !== undefined &&
    away !== undefined &&
    Math.abs(home + draw + away - 1) > 0.01
  ) {
    return true;
  }

  if (input.selected === "OVER_25") {
    return (over25 !== undefined && over25 < 0.5) || (bttsYes !== undefined && bttsYes < 0.36);
  }

  if (input.selected === "UNDER_25") {
    return (over25 !== undefined && over25 > 0.5) || (bttsYes !== undefined && bttsYes > 0.72);
  }

  if (input.selected === "BTTS_YES") {
    return (bttsYes !== undefined && bttsYes < 0.5) || (over25 !== undefined && over25 < 0.3);
  }

  if (input.selected === "BTTS_NO") {
    return (bttsYes !== undefined && bttsYes > 0.5) || (over25 !== undefined && over25 > 0.78);
  }

  if (input.selected === "HOME") {
    return home !== undefined && Math.max(draw ?? 0, away ?? 0) > home;
  }

  if (input.selected === "DRAW") {
    return draw !== undefined && Math.max(home ?? 0, away ?? 0) > draw;
  }

  if (input.selected === "AWAY") {
    return away !== undefined && Math.max(home ?? 0, draw ?? 0) > away;
  }

  return false;
}

/**
 * Pomoć za prikaz statusa bez vezanja uz određenu karticu.
 */
export function integrityClass(status: IntegrityStatus): string {
  if (status === "CERTIFICIRAN") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "OPREZ") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }

  return "border-destructive/40 bg-destructive/10 text-destructive";
}
