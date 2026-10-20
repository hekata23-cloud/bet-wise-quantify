/* ═══════════════════════════════════════════════════════════════════
   KORPA-SMART — Ticket Optimizer s korelacijskim motorom
   ═══════════════════════════════════════════════════════════════════
   Nadograđuje korpa.ts (ne mijenja ga):

     • KORELACIJA: noge iz iste utakmice NISU nezavisne.
         - suprotni ishodi istog tržišta (1 vs 2, O2.5 vs U2.5,
           GG vs NG) su uzajamno isključivi → zajednička vjerojatnost
           max(0, p1 + p2 − 1), često 0 (tiket ne može proći!).
         - ugniježđene linije (O2.5 + O3.5, U3.5 + U2.5) → zajedno
           = min(p) jer je viša linija podskup niže.
         - inače gausovska korelacija ρ (default 0.20):
             p_zajedno = p1·p2 + ρ·√(p1(1−p1)·p2(1−p2))
     • ACCA HAZARD: > 3 noge → upozorenje o varijanci i dugoročnom ROI.
     • BANKROLL MANAGER: preporučeni ulog u novcu (frakcijski Kelly,
       cap 3% banke), svjestan korelacija.
   ═══════════════════════════════════════════════════════════════════ */

import type { KorpaTip } from "./korpa";

export type KorpaGrupa = {
  utakmica: string;
  noge: string[];
  /** zajednička vjerojatnost da SVE noge grupe prođu */
  pZajedno: number;
  /** produkt kvota u grupi */
  kvotaZajedno: number;
  /** true ako grupa sadrži uzajamno isključive noge — tiket ne može proći */
  nemoguca: boolean;
};

export type KorpaSmartIzlaz = {
  n: number;
  kvota: number;
  pNaive: number;         // naivni produkt vjerojatnosti (pretpostavka nezavisnosti)
  pKorigirana: number;    // korelacijski korigirana vjerojatnost
  edgeNaive: number;
  edgeKorigirana: number;
  hazard: boolean;        // > 3 noge
  hazardPoruka: string;
  korelacijaUpozorenje: boolean;
  nemoguceNoge: boolean;  // postoji grupa s uzajamno isključivim nogama
  grupe: KorpaGrupa[];
  kellyPct: number;
  ulogPerc: number;
  ulogIznos: number;
  rizikPerc: number;      // 0..100 vizualni rizik varijance
  isplativo: boolean;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

const norm = (s: string) => s.toLowerCase();

function linijaIzTipa(tip: string): { smjer: "over" | "under" | "drugo"; linija: number | null } {
  const t = norm(tip);
  const m = t.match(/(over|under|o|u)\s*([0-9]+(?:[.,][0-9]+)?)/);
  if (m && m[2]) {
    const broj = Number(m[2].replace(",", "."));
    const smjer = m[1] === "over" || m[1] === "o" ? "over" : "under";
    return { smjer, linija: Number.isFinite(broj) ? broj : null };
  }
  return { smjer: "drugo", linija: null };
}

/** Suprotni ishodi istog tržišta → uzajamno isključivi. */
function suSuprotni(a: KorpaTip, b: KorpaTip): boolean {
  const ta = norm(a.tip), tb = norm(b.tip);
  const la = linijaIzTipa(a.tip), lb = linijaIzTipa(b.tip);
  const isteLinije = la.linija != null && lb.linija != null && Math.abs(la.linija - lb.linija) < 0.01;
  const par: [RegExp, RegExp][] = [
    [/^1$|doma|home/, /^2$|gost|away/],
    [/over|o\d/, /under|u\d/],
    [/da|yes|gg/, /ne|no|ng/],
  ];
  for (const [re1, re2] of par) {
    if ((re1.test(ta) && re2.test(tb)) || (re2.test(ta) && re1.test(tb))) {
      // ali samo ako su na "komplementarnim" tržištima (istog tipa tržišta)
      const ka = norm(a.trziste), kb = norm(b.trziste);
      const istoTrziste =
        (ka.includes("1x2") && kb.includes("1x2")) ||
        (/(o\/u|over|total|gol)/.test(ka) && /(o\/u|over|total|gol)/.test(kb)) ||
        (/(btts|gg)/.test(ka) && /(btts|gg)/.test(kb)) ||
        ka === kb;
      if (istoTrziste && (re1.source !== "over|o\\d" || isteLinije)) return true;
    }
  }
  return false;
}

/** Ugniježđena linija: viša linija je podskup niže (O3.5 ⊂ O2.5; U2.5 ⊂ U1.5). */
function suUgnijezdeni(a: KorpaTip, b: KorpaTip): boolean {
  const la = linijaIzTipa(a.tip), lb = linijaIzTipa(b.tip);
  if (la.smjer === "drugo" || lb.smjer === "drugo") return false;
  if (la.smjer !== lb.smjer || la.linija == null || lb.linija == null) return false;
  return Math.abs(la.linija - lb.linija) > 0.01;
}

/** Zajednička vjerojatnost dvije noge iz iste utakmice. */
export function zajednickaVjerojatnost(a: KorpaTip, b: KorpaTip, rho = 0.2): number {
  const pa = clamp01(a.vjerojatnost), pb = clamp01(b.vjerojatnost);
  if (suSuprotni(a, b)) {
    return Math.max(0, pa + pb - 1);
  }
  if (suUgnijezdeni(a, b)) {
    // "oba prođu" = ishod zadovoljava NIŽU liniju (širu) → min(p)
    return Math.min(pa, pb);
  }
  const korel = pa * pb + rho * Math.sqrt(pa * (1 - pa) * pb * (1 - pb));
  return Math.max(0.001, Math.min(Math.min(pa, pb), korel));
}

/**
 * Glavni proračun. Poziva se umjesto izracunajKorpu kad želiš
 * korelacijski korigirane brojke (korpa.ts se ne mijenja).
 */
export function izracunajKorpuSmart(
  tipovi: KorpaTip[],
  opts: { bankroll?: number; kellyFrac?: number; maxUlogPerc?: number; rho?: number } = {},
): KorpaSmartIzlaz {
  const bankroll = Math.max(0, opts.bankroll ?? 0);
  const kellyFrac = Math.min(1, Math.max(0.05, opts.kellyFrac ?? 0.25));
  const maxUlogPerc = Math.min(10, Math.max(0.5, opts.maxUlogPerc ?? 3));
  const rho = Math.min(0.5, Math.max(0, opts.rho ?? 0.2));

  const prazno: KorpaSmartIzlaz = {
    n: 0, kvota: 1, pNaive: 0, pKorigirana: 0, edgeNaive: 0, edgeKorigirana: 0,
    hazard: false, hazardPoruka: "", korelacijaUpozorenje: false, nemoguceNoge: false,
    grupe: [], kellyPct: 0, ulogPerc: 0, ulogIznos: 0, rizikPerc: 0, isplativo: false,
  };
  if (tipovi.length === 0) return prazno;

  // grupe po utakmici (redoslijed zadrži)
  const mapa = new Map<string, KorpaTip[]>();
  for (const t of tipovi) {
    const arr = mapa.get(t.utakmica) ?? [];
    arr.push(t);
    mapa.set(t.utakmica, arr);
  }

  const grupe: KorpaGrupa[] = [];
  let nemoguceNoge = false;
  let pKorigirana = 1;

  for (const [utakmica, noge] of mapa) {
    let pZajedno = noge[0]!.vjerojatnost;
    let nemoguca = false;
    for (let i = 1; i < noge.length; i++) {
      const j = zajednickaVjerojatnost({ ...noge[i - 1]!, vjerojatnost: pZajedno }, noge[i]!, rho);
      if (j <= 0) {
        nemoguca = true;
        nemoguceNoge = true;
        pZajedno = 0;
        break;
      }
      pZajedno = j;
    }
    pKorigirana *= pZajedno;
    grupe.push({
      utakmica,
      noge: noge.map((n) => `${n.trziste}: ${n.tip}`),
      pZajedno,
      kvotaZajedno: noge.reduce((a, n) => a * Math.max(1, n.kvota), 1),
      nemoguca,
    });
  }

  const kvota = tipovi.reduce((a, t) => a * (t.kvota > 1 ? t.kvota : 1), 1);
  const pNaive = tipovi.reduce((a, t) => a * clamp01(t.vjerojatnost), 1);
  const edgeNaive = kvota * pNaive - 1;
  const edgeKorigirana = kvota * pKorigirana - 1;

  const hazard = tipovi.length > 3;
  const hazardPoruka = hazard
    ? "Accumulator Hazard: visoka varijanca smanjuje dugoročni ROI — razmisli o manjem broju nogu ili manjem ulogu."
    : "";

  const b = kvota - 1;
  const q = 1 - pKorigirana;
  const kelly = b > 0 ? (b * pKorigirana - q) / b : 0;
  const korelacijaUpozorenje = mapa.size < tipovi.length || nemoguceNoge;
  // korelirane grupe dijele sudbinu — Kelly na pola, uz upozorenje
  const kellyEff = korelacijaUpozorenje ? kelly * 0.5 : kelly;

  const ulogPerc = Math.min(maxUlogPerc, Math.max(0, kellyEff) * kellyFrac * 100);
  const ulogIznos = (bankroll * ulogPerc) / 100;

  const q0 = 1 - pKorigirana;
  const stdRet = Math.sqrt(Math.max(0, pKorigirana * q0)) * b;
  const rizikPerc = Math.min(100, Math.round((stdRet / Math.max(0.01, kvota)) * 100));

  return {
    n: tipovi.length,
    kvota,
    pNaive,
    pKorigirana,
    edgeNaive,
    edgeKorigirana,
    hazard,
    hazardPoruka,
    korelacijaUpozorenje,
    nemoguceNoge,
    grupe,
    kellyPct: Math.max(0, kelly) * kellyFrac * 100,
    ulogPerc,
    ulogIznos,
    rizikPerc,
    isplativo: edgeKorigirana > 0 && ulogPerc > 0 && !nemoguceNoge,
  };
}

