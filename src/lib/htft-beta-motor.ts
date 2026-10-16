/* ============================================================
   HTFT-BETA-MOTOR.TS — Prijelazni engine za HT/FT Beta karticu
   ============================================================
   Što radi (i zašto je moćniji od običnog HT/FT modela):

   1. OBRNUTO INŽENJERSTVO TRŽIŠTA — iz kvota (1X2, Over 2.5, BTTS)
      računa očekivane golove timova (λ, μ) traženjem najboljeg
      Poisson/Dixon-Coles modela koji rekonstruira tržište.
   2. FORMA kao drugi izvor λ — spaja se s tržištem (tržište teže).
   3. PRIJELAZNI ENGINE — utakmica se dijeli na dva Poisson procesa
      (1. poluvrijeme ~44% golova, 2. ~56%). Drugo poluvrijeme NIJE
      isto za sva stanja: tim koji gubi tlači (λ ↑ do +44%),
      tim koji vodi se drži (λ ↓), kod izjednačeno oba igraju otvoreno.
      To je model prijelaza HT -> FT koji obične matrice nemaju.
   4. KALIBRACIJA — FT raspodjela se meko poravnava s tržišnom 1X2
      (tržište pogriješi rjeđe od modela), pa se vjerodostojnost
      provjerava odstupanjem modela od tržišta.
   5. PRIJELAZNA MATRICA 3×3 — P(završetak | poluvrijeme), dijagonala
      = "držanje", izvan dijagonale = "okretanja/preokreti".

   CISTE FUNKCIJE — ne zove API. Koristi ./matematika.
   ============================================================ */

import { deMargina, kalibriraj } from "./matematika";

const EPS = 1e-9;

/* ---------- Ulazni tipovi ---------- */

export type KvoteSet = {
  "1"?: number; "X"?: number; "2"?: number;
  o15?: number; u15?: number;
  o25?: number; u25?: number;
  o35?: number; u35?: number;
  bttsDa?: number; bttsNe?: number;
};

export type Forma = { odigrano: number; postignuti: number; primljeni: number } | null;

export type Stanje = "1" | "X" | "2";

export type Celija = {
  kod: string;          // "X/1" itd.
  label: string;        // ljudski opis prijelaza
  ht: Stanje;
  ft: Stanje;
  p: number;            // vjerojatnost 0..1
  ferOdd: number;       // 1/p
  ocjena: "A+" | "A" | "B+" | "B";
  prijelazSnaga: number; // P(FT | HT stanje) — koliko je prijelaz "uvjeren"
};

export type PrijelaznaMatrica = Record<Stanje, Record<Stanje, number>>;

export type BetaAnaliza = {
  lam: number;
  mu: number;
  izvorLam: string;
  kvalitetaTrzista: number;   // 0..1, koliko je tržište rekonstruirano
  ht: { p1: number; pX: number; p2: number };
  ft: { p1: number; pX: number; p2: number };
  trziste1x2: { p1: number; pX: number; p2: number } | null;
  odstupanje: number;         // max |model - tržište| u postotnim bodovima
  celije: Celija[];
  prijelazi: PrijelaznaMatrica;
  drzanje: number;            // Σ P(HT=s)·P(FT=s|HT=s) — rezultat se "drži"
  okretanje: number;          // 1 - drzanje
  entropija: number;          // 0..1 (normalizirano na 9 ishoda)
  sigurnosniPar: { kodovi: string[]; p: number } | null;
  upozorenja: string[];
};

/* ---------- Pomoćne matrice ---------- */

function pois(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  let fakt = 1;
  for (let i = 2; i <= k; i++) fakt *= i;
  logP -= Math.log(fakt);
  return Math.exp(logP);
}

function dcTau(h: number, a: number, lam: number, mu: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lam * mu * rho;
  if (h === 0 && a === 1) return 1 + lam * rho;
  if (h === 1 && a === 0) return 1 + mu * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function matrica(lam: number, mu: number, rho: number, N: number): number[][] {
  const m: number[][] = [];
  let z = 0;
  for (let h = 0; h <= N; h++) {
    m[h] = [];
    for (let a = 0; a <= N; a++) {
      const p = pois(h, lam) * pois(a, mu) * dcTau(h, a, lam, mu, rho);
      m[h][a] = Math.max(0, p);
      z += m[h][a];
    }
  }
  for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) m[h][a] /= z || 1;
  return m;
}

function izMatrice(m: number[][]) {
  let p1 = 0, pX = 0, p2 = 0, btts = 0, preko25 = 0;
  const N = m.length - 1;
  for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) {
    const p = m[h][a];
    if (h > a) p1 += p; else if (h === a) pX += p; else p2 += p;
    if (h > 0 && a > 0) btts += p;
    if (h + a > 2.5) preko25 += p;
  }
  return { p1, pX, p2, btts, preko25 };
}

/* ---------- 1. Inverzija tržišta u (λ, μ) ---------- */

export function invertirajTrziste(k: KvoteSet): {
  lam: number; mu: number; kvaliteta: number;
  trziste1x2: { p1: number; pX: number; p2: number } | null;
} | null {
  const m = k["1"] && k["X"] && k["2"] ? deMargina(k["1"], k["X"], k["2"]) : null;
  const o25 = k.o25 && k.u25 ? 1 / k.o25 / (1 / k.o25 + 1 / k.u25) : null;
  const bts = k.bttsDa && k.bttsNe ? 1 / k.bttsDa / (1 / k.bttsDa + 1 / k.bttsNe) : null;
  if (!m && o25 == null && bts == null) return null;

  let best = { lam: 1.4, mu: 1.1, err: Infinity };
  for (let lam = 0.2; lam <= 3.6; lam += 0.05) {
    for (let mu = 0.2; mu <= 3.6; mu += 0.05) {
      const M = matrica(lam, mu, -0.05, 9);
      const t = izMatrice(M);
      let err = 0;
      if (m) err += (t.p1 - m.p1) ** 2 + (t.pX - m.pX) ** 2 + (t.p2 - m.p2) ** 2;
      if (o25 != null) err += 1.5 * (t.preko25 - o25) ** 2;
      if (bts != null) err += t.btts !== bts ? (t.btts - bts) ** 2 : 0;
      if (err < best.err) best = { lam, mu, err };
    }
  }
  return {
    lam: best.lam,
    mu: best.mu,
    kvaliteta: Math.max(0, 1 - Math.sqrt(best.err) * 3),
    trziste1x2: m,
  };
}

/* ---------- 2. λ iz forme (zadnjih 5 utakmica) ---------- */

export function lambdaIzForme(fDom: Forma, fGost: Forma): { lam: number; mu: number } | null {
  if (!fDom || !fGost || fDom.odigrano < 2 || fGost.odigrano < 2) return null;
  const dS = fDom.postignuti / fDom.odigrano;
  const dP = fDom.primljeni / fDom.odigrano;
  const aS = fGost.postignuti / fGost.odigrano;
  const aP = fGost.primljeni / fGost.odigrano;
  const clamp = (x: number) => Math.min(3.5, Math.max(0.15, x));
  return {
    lam: clamp(((dS + aP) / 2) * 1.10),  // blagi domaćinski faktor
    mu: clamp(((aS + dP) / 2) * 0.94),
  };
}

/* ---------- 3. Glavni engine ---------- */

const LABEL: Record<string, string> = {
  "1/1": "Domaćin vodi i drži do kraja",
  "1/X": "Domaćin vodi, gost izjednačuje",
  "1/2": "Domaćin vodi, gost preokreće",
  "X/1": "Neriješeno na odmoru, domaćin odlučuje",
  "X/X": "Neriješeno cijelu utakmicu",
  "X/2": "Neriješeno na odmoru, gost odlučuje",
  "2/1": "Gost vodi, domaćin preokreće",
  "2/X": "Gost vodi, domaćin izjednačuje",
  "2/2": "Gost vodi i drži do kraja",
};

function ocjena(p: number): "A+" | "A" | "B+" | "B" {
  if (p >= 0.30) return "A+";
  if (p >= 0.22) return "A";
  if (p >= 0.15) return "B+";
  return "B";
}

export function betaAnaliza(par: {
  kvote?: KvoteSet | null;
  formaDom?: Forma;
  formaGost?: Forma;
  htShare?: number; // udio golova u 1. poluvremenu, default 0.44
}): BetaAnaliza {
  const upozorenja: string[] = [];
  const share = par.htShare ?? 0.44;

  /* λ i μ — enSEMBLE tržište + forma */
  const trz = par.kvote ? invertirajTrziste(par.kvote) : null;
  const forma = lambdaIzForme(par.formaDom ?? null, par.formaGost ?? null);
  let lam: number, mu: number, izvorLam: string;
  if (trz && forma) {
    lam = trz.lam * 0.62 + forma.lam * 0.38;
    mu = trz.mu * 0.62 + forma.mu * 0.38;
    izvorLam = "Tržište (62%) + forma (38%)";
  } else if (trz) {
    lam = trz.lam; mu = trz.mu; izvorLam = "Tržište (kvote)";
  } else if (forma) {
    lam = forma.lam; mu = forma.mu; izvorLam = "Forma (zadnjih 5)";
    upozorenja.push("Nema dovoljno kvota — očekivani golovi su iz forme, manje pouzdano.");
  } else {
    lam = 1.40; mu = 1.12; izvorLam = "Prosječne vrijednosti";
    upozorenja.push("Nema kvota ni forme — analiza koristi prosjek lige. Slabiji signal.");
  }
  const kvalitetaTrzista = trz?.kvaliteta ?? 0;

  /* Poluvremena */
  const lam1 = lam * share, mu1 = mu * share;
  const lam2 = lam * (1 - share), mu2 = mu * (1 - share);
  const H1 = matrica(lam1, mu1, -0.08, 10);

  /* Prijelazni engine: 2. poluvrijeme ovisi o stanju i razlici golova */
  const zbroj: Record<string, number> = {};
  const T: PrijelaznaMatrica = {
    "1": { "1": EPS, "X": EPS, "2": EPS },
    "X": { "1": EPS, "X": EPS, "2": EPS },
    "2": { "1": EPS, "X": EPS, "2": EPS },
  };
  const stanjeOd = (h: number, a: number): Stanje => (h > a ? "1" : h === a ? "X" : "2");

  for (let h1 = 0; h1 <= 10; h1++) {
    for (let a1 = 0; a1 <= 10; a1++) {
      const pH = H1[h1][a1];
      if (pH < 1e-7) continue;
      const gd = h1 - a1;
      // URGENCIJA: tko gubi, tlači; tko vodi, drži se; izjednačeno = otvoreno
      let l2 = lam2, m2 = mu2;
      if (gd < 0) { l2 *= 1 + 0.22 * Math.min(2, -gd); m2 *= 1 - 0.07 * Math.min(2, -gd); }
      else if (gd > 0) { m2 *= 1 + 0.22 * Math.min(2, gd); l2 *= 1 - 0.07 * Math.min(2, gd); }
      else { l2 *= 1.05; m2 *= 1.05; }
      l2 = Math.min(3.5, l2); m2 = Math.min(3.5, m2);
      const H2 = matrica(l2, m2, 0, 10);
      const hs = stanjeOd(h1, a1);
      for (let h2 = 0; h2 <= 10; h2++) {
        for (let a2 = 0; a2 <= 10; a2++) {
          const p = pH * H2[h2][a2];
          if (p < 1e-9) continue;
          const fs = stanjeOd(h1 + h2, a1 + a2);
          const kod = `${hs}/${fs}`;
          zbroj[kod] = (zbroj[kod] ?? 0) + p;
          T[hs][fs] += p;
        }
      }
    }
  }

  /* Normalizacija + redovi prijelazne matrice */
  const z = Object.values(zbroj).reduce((a, b) => a + b, 0) || 1;
  for (const hs of ["1", "X", "2"] as Stanje[]) {
    const rz = T[hs]["1"] + T[hs]["X"] + T[hs]["2"];
    for (const fs of ["1", "X", "2"] as Stanje[]) {
      T[hs][fs] /= rz || 1;
      zbroj[`${hs}/${fs}`] = (zbroj[`${hs}/${fs}`] ?? 0) / z;
    }
  }

  /* FT raspodjela + kalibracija prema tržištu (meko poravnavanje margina) */
  const ftP = { p1: zbroj["1/1"] + zbroj["X/1"] + zbroj["2/1"],
                pX: zbroj["1/X"] + zbroj["X/X"] + zbroj["2/X"],
                p2: zbroj["1/2"] + zbroj["X/2"] + zbroj["2/2"] };
  let faktor: Record<Stanje, number> = { "1": 1, "X": 1, "2": 1 };
  if (trz?.trziste1x2) {
    const mt = trz.trziste1x2;
    faktor["1"] = kalibriraj(ftP.p1, mt.p1, 1, 2) / (ftP.p1 || EPS);
    faktor["X"] = kalibriraj(ftP.pX, mt.pX, 1, 2) / (ftP.pX || EPS);
    faktor["2"] = kalibriraj(ftP.p2, mt.p2, 1, 2) / (ftP.p2 || EPS);
  }
  for (const hs of ["1", "X", "2"] as Stanje[])
    for (const fs of ["1", "X", "2"] as Stanje[])
      zbroj[`${hs}/${fs}`] *= faktor[fs];
  const z2 = Object.values(zbroj).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(zbroj)) zbroj[k] /= z2;

  const odstupanje = trz?.trziste1x2
    ? Math.max(Math.abs(ftP.p1 - trz.trziste1x2.p1), Math.abs(ftP.pX - trz.trziste1x2.pX), Math.abs(ftP.p2 - trz.trziste1x2.p2)) * 100
    : 0;

  /* Celije */
  const htP = { p1: zbroj["1/1"] + zbroj["1/X"] + zbroj["1/2"],
                pX: zbroj["X/1"] + zbroj["X/X"] + zbroj["X/2"],
                p2: zbroj["2/1"] + zbroj["2/X"] + zbroj["2/2"] };
  const celije: Celija[] = (["1/1","1/X","1/2","X/1","X/X","X/2","2/1","2/X","2/2"] as const).map((kod) => {
    const [hs, fs] = kod.split("/") as [Stanje, Stanje];
    const p = Math.min(0.999, Math.max(EPS, zbroj[kod] ?? EPS));
    return {
      kod, label: LABEL[kod] ?? kod, ht: hs, ft: fs,
      p, ferOdd: 1 / p, ocjena: ocjena(p),
      prijelazSnaga: T[hs][fs],
    };
  });

  /* Entropija (0..1): niska = čvrst signal */
  const H = -celije.reduce((s, c) => s + (c.p > 0 ? c.p * Math.log(c.p) : 0), 0) / Math.log(9);

  const poredane = [...celije].sort((a, b) => b.p - a.p);
  const drzanje = htP.p1 * T["1"]["1"] + htP.pX * T["X"]["X"] + htP.p2 * T["2"]["2"];

  if (odstupanje > 15) upozorenja.push(`Model odskace od tržišta ${odstupanje.toFixed(0)} pb — oprez, moguća premala/velika kvota ili slab model.`);
  if (kvalitetaTrzista > 0 && kvalitetaTrzista < 0.35) upozorenja.push("Tržište se loše rekonstruira iz kvota — podaci nepotpuni.");
  if (H > 0.9) upozorenja.push("Visoka entropija — utakmica je teško predvidiva, razmisli o manjem ulogu.");

  const sigurnosniPar = poredane[0].p < 0.22 && poredane[1]
    ? { kodovi: [poredane[0].kod, poredane[1].kod], p: poredane[0].p + poredane[1].p }
    : null;

  return {
    lam, mu, izvorLam, kvalitetaTrzista,
    ht: htP, ft: { p1: zbroj["1/1"] + zbroj["X/1"] + zbroj["2/1"],
                   pX: zbroj["1/X"] + zbroj["X/X"] + zbroj["2/X"],
                   p2: zbroj["1/2"] + zbroj["X/2"] + zbroj["2/2"] },
    trziste1x2: trz?.trziste1x2 ?? null,
    odstupanje,
    celije, prijelazi: T,
    drzanje, okretanje: 1 - drzanje,
    entropija: H,
    sigurnosniPar, upozorenja,
  };
}
