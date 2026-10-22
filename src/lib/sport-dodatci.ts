// ============================================================
// SPORT-DODATCI.TS — proširena tržišta za Košarka Pro / Rukomet Pro
// 1) Spread / Azijski handicap — normalna distribucija razlike
//    v5: cjelobrojne linije dobivaju PUSH RIZIK % (razlika tačno na
//    liniji → povrat uloga), fer kvote su push-neutralizirane
// 2) Raspad zbroja po četvrtinama (košarka) / poluvremenima (rukomet)
//    — varijanca perioda konzistentno se sabira u varijancu totala
// 3) Tempo (pace) i ratingi napada/obrane — 1.00 = prosjek sporta
// Čiste funkcije, bez API-ja. Tipovi dolaze iz sportovi-motor izlaza.
// ============================================================

export type SportDod = "kosarka" | "rukomet";

const PROSJEK_TIMA: Record<SportDod, number> = { kosarka: 82, rukomet: 28.5 };
const SIGMA_RAZLIKA: Record<SportDod, number> = { kosarka: 12, rukomet: 5.2 };

function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** P(zbroj > linija) uz N(exp, sd). */
export function pOver(exp: number, sd: number, linija: number): number {
  return 1 - phi((linija - exp) / Math.max(0.1, sd));
}

export type HandicapRed = {
  linija: number;       // handicap domaćina (npr. -4.5)
  pDom: number;
  pGost: number;
  pushRizik: number;    // v5: P(razlika tačno na liniji) — samo cjelobrojne
  ferDom: number;       // push-neutralizirana fer kvota (1 + loss/win)
  ferGost: number;
  najbolji: "dom" | "gost";
};

/** 5 ključnih handicap linija oko očekivane razlike — mješavina pola i
 *  pune linije: pune linije nose PUSH RIZIK %, polovične su bez neodlučenih. */
export function handicapRedovi(sport: SportDod, lambdaDom: number, lambdaGost: number): HandicapRed[] {
  const sd = SIGMA_RAZLIKA[sport];
  const d = lambdaDom - lambdaGost;
  const korak = sport === "kosarka" ? 3 : 1;
  const baza = Math.round(d / korak) * korak;
  return [-1.5, -1, -0.5, 0, 0.5].map((o) => {
    const linija = Math.round((baza + o * korak) * 10) / 10;
    const cjelobrojna = Math.abs((linija * 2) % 2) < 1e-9;
    if (cjelobrojna) {
      // win = P(K > L), push = P(K = L) ≈ P(L−0.5 < K < L+0.5), loss = ostatak
      const win = Math.min(0.98, Math.max(0.02, pOver(d, sd, linija + 0.5)));
      const push = Math.min(0.5, Math.max(0.001,
        phi((linija + 0.5 - d) / sd) - phi((linija - 0.5 - d) / sd)));
      const loss = Math.max(0, 1 - win - push);
      return {
        linija,
        pDom: win,
        pGost: loss,
        pushRizik: push,
        ferDom: win > 0 ? 1 + loss / win : Infinity,
        ferGost: loss > 0 ? 1 + win / loss : Infinity,
        najbolji: (win >= loss ? "dom" : "gost") as "dom" | "gost",
      };
    }
    const pDom = Math.min(0.98, Math.max(0.02, pOver(d, sd, linija)));
    const pGost = 1 - pDom;
    return {
      linija,
      pDom,
      pGost,
      pushRizik: 0,
      ferDom: 1 / pDom,
      ferGost: 1 / pGost,
      najbolji: (pDom >= pGost ? "dom" : "gost") as "dom" | "gost",
    };
  });
}

export type RaspadRed = {
  label: string;
  ocekivano: number;    // očekivani zbroj perioda
  linija: number;       // tržišno-realna linija (zaokružena na 0.5)
  pOver: number;        // P(zbroj perioda > linija)
  sd: number;
  tezina: number;
};

const TEZINE: Record<SportDod, { label: string; w: number }[]> = {
  kosarka: [
    { label: "Q1", w: 0.245 },
    { label: "Q2", w: 0.255 },
    { label: "Q3", w: 0.245 },
    { label: "Q4", w: 0.255 },
  ],
  rukomet: [
    { label: "1. poluvrijeme", w: 0.48 },
    { label: "2. poluvrijeme", w: 0.52 },
  ],
};

/** Raspad ukupnog zbroja po periodima + P(over) na zaokruženoj liniji. */
export function raspadPeriodi(sport: SportDod, ukupno: number, sigmaUkupno: number): RaspadRed[] {
  return TEZINE[sport].map(({ label, w }) => {
    const ocekivano = ukupno * w;
    const sd = sigmaUkupno * Math.sqrt(w);
    const linija = Math.round(ocekivano * 2) / 2;
    return { label, ocekivano, linija, pOver: pOver(ocekivano, sd, linija), sd, tezina: w };
  });
}

/** Tempo (pace): 1.00 = prosjek sporta. */
export function tempoIndeks(sport: SportDod, ukupno: number): { indeks: number; prosjek: number; label: string } {
  const prosjek = PROSJEK_TIMA[sport] * 2;
  const indeks = ukupno / prosjek;
  const label = indeks >= 1.05 ? "Brzi tempo" : indeks <= 0.95 ? "Spor tempo" : "Standardan tempo";
  return { indeks, prosjek, label };
}

/** Ratingi napada/obrane — 1.00 = prosjek lige. */
export function timRatingi(sport: SportDod, lambdaDom: number, lambdaGost: number) {
  const avg = PROSJEK_TIMA[sport];
  return {
    napadDom: lambdaDom / avg,    // koliko je napad domaćina jači od prosjeka
    napadGost: lambdaGost / avg,
    obranaDom: lambdaGost / avg,  // koliko će gost postići protiv obrane domaćina
    obranaGost: lambdaDom / avg,
  };
}

export function ratingLabel(x: number, obrana: boolean): string {
  if (obrana) return x <= 0.93 ? "Jaka obrana" : x >= 1.07 ? "Slabija obrana" : "Prosječna obrana";
  return x >= 1.07 ? "Jak napad" : x <= 0.93 ? "Slabiji napad" : "Prosječan napad";
}
