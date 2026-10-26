// ═══ FAKTOR SREĆE — mjerenje sreće/peha i korekcija svih kartica i botova ═══
// Sreća se mjeri kao razlika stvarnih golova i očekivanih golova (xG), plus
// PDO (postotak realizacije + postotak obrana). Sreća se s vremenom vraća
// prema prosjeku, pa "sretna" momčad realno vrijedi manje nego što pokazuje
// tablica, a "nesretna" više.
//
// Samostalna datoteka: nema ovisnosti. Kartice pozivaju primijeniFaktorSrece(),
// a chat botovi (Luna, Orion) dobivaju uputaFaktoraSreceZaBotove().

export interface LuckMetrics {
  /** Zabijeni golovi u zadnjih N utakmica */
  golovi: number;
  /** Očekivani golovi (xG) u istim utakmicama */
  xg: number;
  /** Primljeni golovi */
  primljeni: number;
  /** Očekivani primljeni golovi (xGA) */
  xga: number;
  /** Broj utakmica u uzorku */
  utakmice: number;
  /** Opcionalno: PDO (npr. 100 = prosjek, 108 = jako sretni) */
  pdo?: number;
}

export interface LuckFactorResult {
  /** −100 (ekstreman peh) … 0 (neutralno) … +100 (ekstremna sreća) */
  dom: number;
  gost: number;
  /** Razlika dom − gost: pozitivno = domaćin je sretniji */
  razlika: number;
  oznakaDom: string;
  oznakaGost: string;
  opis: string;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Ocjena sreće jedne momčadi (−100…+100). */
export function ocjenaSrece(m: LuckMetrics): number {
  const n = Math.max(1, m.utakmice);
  const napad = (m.golovi - m.xg) / n; // + = zabija više nego zaslužuje
  const obrana = (m.xga - m.primljeni) / n; // + = prima manje nego zaslužuje
  let s = (napad + obrana) * 60; // 0.5 gola/utakmici viška ≈ +30
  if (typeof m.pdo === "number") s += (m.pdo - 100) * 4;
  // mali uzorak = manje povjerenja
  s *= Math.min(1, n / 8);
  return Math.round(clamp(s, -100, 100));
}

export function oznaka(s: number): string {
  if (s >= 40) return "Jako sretni";
  if (s >= 15) return "Sretni";
  if (s <= -40) return "Jako nesretni";
  if (s <= -15) return "Nesretni";
  return "Neutralno";
}

export function izracunajFaktorSrece(dom: LuckMetrics, gost: LuckMetrics): LuckFactorResult {
  const d = ocjenaSrece(dom);
  const g = ocjenaSrece(gost);
  const razlika = d - g;
  let opis = "Obje momčadi igraju otprilike prema zasluženom — nema korekcije.";
  if (razlika >= 15) opis = "Domaćin je imao više sreće od gosta — realna snaga domaćina je niža od forme.";
  else if (razlika <= -15) opis = "Gost je imao više sreće od domaćina — realna snaga gosta je niža od forme.";
  return { dom: d, gost: g, razlika, oznakaDom: oznaka(d), oznakaGost: oznaka(g), opis };
}

export type Strana = "dom" | "gost" | "golovi" | "neutralno";

/**
 * Korekcija vjerojatnosti za bilo koju karticu.
 * - "dom"/"gost": tip na pobjedu/hendikep te strane (sretna strana gubi do 8 pb)
 * - "golovi": Over/BTTS — ako su obje sretne u napadu, golova realno manje
 * - "neutralno": samo blago sužavanje prema 50% kad je sreće puno
 */
export function primijeniFaktorSrece(p: number, f: LuckFactorResult, strana: Strana): number {
  const MAX = 0.08;
  let pomak = 0;
  if (strana === "dom") pomak = (-f.razlika / 100) * MAX;
  else if (strana === "gost") pomak = (f.razlika / 100) * MAX;
  else if (strana === "golovi") pomak = (-(f.dom + f.gost) / 200) * MAX * 0.6;
  else pomak = (0.5 - p) * (Math.abs(f.razlika) / 100) * 0.2;
  return Math.round(clamp(p + pomak, 0.01, 0.99) * 1000) / 1000;
}

/** Uputa koja se dodaje sistemskom promptu Lune i Oriona. */
export function uputaFaktoraSreceZaBotove(f?: LuckFactorResult): string {
  const osnova = `\n\n═══ FAKTOR SREĆE ═══
Uvijek procijeni sreću obje momčadi: golovi − xG, primljeni − xGA i PDO. Sreća se vraća prema prosjeku: sretnoj momčadi smanji sigurnost do 8 postotnih bodova, nesretnoj je povećaj. U svakom odgovoru o utakmici dodaj redak:
"FAKTOR SREĆE: Domaćin [ocjena] | Gost [ocjena] | [jedna rečenica što to znači za tip]".`;
  if (!f) return osnova;
  return `${osnova}
Izračunato za ovu utakmicu: Domaćin ${f.dom > 0 ? "+" : ""}${f.dom} (${f.oznakaDom}), Gost ${f.gost > 0 ? "+" : ""}${f.gost} (${f.oznakaGost}). ${f.opis}`;
}
