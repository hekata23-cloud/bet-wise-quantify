/* ═══════════════════════════════════════════════════════════════════
   GOALS-MOTOR — zajednički "mozak" za BTTS Ultra i 2.5 Pro karticu
   ═══════════════════════════════════════════════════════════════════
   v7 — DEEP AUDIT (numericki testirani):
     - EMPIRICAL BAYES shrinkage: forma s < 5 utakmica se smanjuje
       prema STVARNOM prosjeku lige (ne prema tvrdom globalnom 1.35);
       mali uzorak → oznaka + strop povjerenja 55% (bez lažnog
       samopouzdanja na timovima s 1–2 utakmice);
     - BTTS kroz KOPULU: Dixon–Coles (50%) + Bivarijantni Poisson
       (ρ = 0.08, 30%) + Frank kopula (θ fit na korelaciju 0.08, 20%)
       — golovi su pozitivno korelirani kad tim povede;
     - distribucija golova (g0..g4, g5+) obuhvaća i rezultate 10+
       golova ukupno (npr. 5:5, 7:6);
     - P(BTTS) ≤ P(Over 1.5) garancija vrijedi i nakon svih slojeva.

   Metodologija:
    1) FORMA → očekivani golovi timova (λ domaćin, μ gost), EB shrinkage
       prema ligaškom prioru (k = 5)
    2) TRŽIŠTE → implicitni ukupni golovi iz de-margined O/U linija
    3) MJEŠANJE: w·λ(tržište) + (1-w)·λ(forma)
    4) RAZDVOBA λ domaćin/gost kalibrirana de-margined 1X2
    5) DIXON-COLES korekcija (rho), fit na U 1.5
    6) SVI izlazi iz jedne matrice rezultata (0..9 × 0..9)
    7) BTTS i Over 2.5 dobiju mali formsski sloj (do 20% težine)
    8) EDGE i KELLY spram stvarnih kvota; ocjena povjerenja A+..C
   ═══════════════════════════════════════════════════════════════════ */

import { priorZaLigu, shrinkajStopu, jeMaliUzorak, stropPovjerenja, type LigaPrior } from "./eb-shrinkage";
import { bttsIzKopule } from "./btts-copula";
import { kalibrirajGoalsFinal, tezinaKalibracije } from "./global-calibration";

export type FormaGolovi = {
  odigrano: number;
  postignuti: number;
  primljeni: number;
  btts: number;
  over15: number;
  over25: number;
  under35: number;
  penali: number;
};

export type GoalsUlaz = {
  /** kvote iz api-ja: "1","X","2","bttsDa","bttsNe","o15","u15","o25","u25","o35","u35" */
  kvote: Record<string, number>;
  formaDom: FormaGolovi | null;
  formaGost: FormaGolovi | null;
  brojKladionica?: number;
  /** naziv lige — uključuje ligaški Empirical Bayes prior (opcionalno) */
  liga?: string;
};

export type GoalsIzlaz = {
  lambdaDom: number;
  lambdaGost: number;
  lambdaUkupno: number;
  /** model SAMO iz forme (prije mješanja s tržištem) */
  model: Record<string, number>;
  /** de-margined tržište (samo dostupne stavke) */
  market: Record<string, number>;
  /** finalne vjerojatnosti (grid + formsski sloj) */
  final: Record<string, number>;
  /** fer kvota = 1 / vjerojatnost */
  fairOdds: Record<string, number>;
  /** edge = p·kvota − 1 (samo gdje kvota postoji) */
  edge: Record<string, number>;
  /** Kelly ulog udio (0..1), samo pozitivni */
  kelly: Record<string, number>;
  topRezultati: { rezultat: string; p: number }[];
  suglasnost: number;
  povjerenje: number;
  ocjena: "A+" | "A" | "B+" | "B" | "C";
  upozorenja: string[];
  faktori: string[];
  wMarket: number;
  rho: number;
  /** EMPIRICAL BAYES: je li barem jedan tim imao < 5 utakmica u formi? */
  maliUzorak: boolean;
  /** koji ligaški prior je korišten za shrinkage */
  ligaPrior: LigaPrior;
  /** razložba BTTS-a po modelima zavisnosti */
  kopula: { dc: number; bp: number; frank: number; theta: number };
  /** GLOBALNA KALIBRACIJA: log-pool finala s de-margined tržištem (dijagnostika) */
  kalibracija: { primijenjena: boolean; tezina: number; prosjecniPomak: number };
};

const MAX_GOL = 9;
const LIGA_PO_TIMU = 1.34; // rezervni prior kad naziv lige nije prepoznat (≈2.68 ukupno)
function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

/** P(X = k) za Poisson(λ). */
function poissonPmf(k: number, lam: number): number {
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

/** P(X ≤ k) za Poisson(λ) — CDF. */
function poissonKum(k: number, lam: number): number {
  let p = Math.exp(-lam);
  let s = p;
  for (let i = 1; i <= k; i++) {
    p *= lam / i;
    s += p;
  }
  return s;
}

/** Dixon-Coles težina za niske rezultate (rho manji = jače "lijepljenje" 0:0/1:1). */
function dcTezina(x: number, y: number, lam: number, mu: number, rho: number): number {
  if (rho === 0) return 1;
  if (x === 0 && y === 0) return 1 - lam * mu * rho;
  if (x === 0 && y === 1) return 1 + lam * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Matrica vjerojatnosti rezultata, normalizirana na 1. */
function izgradiGrid(lam: number, mu: number, rho: number): number[][] {
  const g: number[][] = [];
  let z = 0;
  for (let i = 0; i <= MAX_GOL; i++) {
    g[i] = [];
    for (let j = 0; j <= MAX_GOL; j++) {
      const v = Math.max(0, poissonPmf(i, lam) * poissonPmf(j, mu) * dcTezina(i, j, lam, mu, rho));
      g[i]![j] = v;
      z += v;
    }
  }
  for (let i = 0; i <= MAX_GOL; i++)
    for (let j = 0; j <= MAX_GOL; j++) g[i]![j] = g[i]![j]! / z;
  return g;
}

type GridMetrike = {
  p1: number; pX: number; p2: number;
  btts: number; o15: number; o25: number; o35: number; nulaNula: number;
};

function metrikeIzGrida(g: number[][]): GridMetrike {
  let p1 = 0, pX = 0, p2 = 0, btts = 0, o15 = 0, o25 = 0, o35 = 0, nulaNula = 0;
  for (let i = 0; i <= MAX_GOL; i++) {
    for (let j = 0; j <= MAX_GOL; j++) {
      const p = g[i]![j]!;
      if (i > j) p1 += p;
      else if (i === j) pX += p;
      else p2 += p;
      if (i > 0 && j > 0) btts += p;
      const uk = i + j;
      if (uk > 1.5) o15 += p;
      if (uk > 2.5) o25 += p;
      if (uk > 3.5) o35 += p;
      if (i === 0 && j === 0) nulaNula += p;
    }
  }
  return { p1, pX, p2, btts, o15, o25, o35, nulaNula };
}

/** Dvoglavi de-margin: vjerojatnosti iz para kvota bez bookmaker marže. */
function deMargin(o: number | undefined, u: number | undefined): { pA: number; pB: number } | null {
  if (o == null || u == null || !(o >= 1.01) || !(u >= 1.01)) return null;
  const a = 1 / o, b = 1 / u;
  return { pA: a / (a + b), pB: b / (a + b) };
}

/** Troglavi de-margin za 1X2. */
function deMargin1x2(k1: number | undefined, kX: number | undefined, k2: number | undefined) {
  if (k1 == null || kX == null || k2 == null || k1 < 1.01 || kX < 1.01 || k2 < 1.01) return null;
  const a = 1 / k1, b = 1 / kX, c = 1 / k2;
  const s = a + b + c;
  return { p1: a / s, pX: b / s, p2: c / s };
}

/** Pronađi λ tako da je P(golova ≤ floor(line)) = 1 − pOver. */
function lambdaIzLinije(line: number, pOver: number): number | null {
  if (!(pOver > 0.001 && pOver < 0.999)) return null;
  const k = Math.floor(line);
  const target = 1 - pOver;
  let lo = 0.05, hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // CDF je opadajuća u λ: ako je CDF veći od cilja, λ je premalen
    if (poissonKum(k, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** EMPIRICAL BAYES: forma s malim uzorkom se smanjuje prema ligaškom prioru.
 *  Vraća NOVU formu s prilagođenim postignutim/primljenim golovima. */
function shrinkajFormu(f: FormaGolovi | null, priorPoTimu: number): FormaGolovi | null {
  if (!f || f.odigrano <= 0) return f;
  const n = f.odigrano;
  const napad = shrinkajStopu(n, f.postignuti / n, priorPoTimu);
  const obrana = shrinkajStopu(n, f.primljeni / n, priorPoTimu);
  return { ...f, postignuti: napad * n, primljeni: obrana * n };
}

/** Očekivani golovi timova iz forme (relativne snage × prednost domaćeg terena).
 *  priorPoTimu: ligaški prosjek golova po timu (Empirical Bayes prior). */
export function lambdaIzForme(
  dom: FormaGolovi | null,
  gost: FormaGolovi | null,
  priorPoTimu: number = LIGA_PO_TIMU,
): { lam: number; mu: number } {
  const napadDom = dom && dom.odigrano > 0 ? dom.postignuti / dom.odigrano : priorPoTimu;
  const obranaGost = gost && gost.odigrano > 0 ? gost.primljeni / gost.odigrano : priorPoTimu;
  const napadGost = gost && gost.odigrano > 0 ? gost.postignuti / gost.odigrano : priorPoTimu;
  const obranaDom = dom && dom.odigrano > 0 ? dom.primljeni / dom.odigrano : priorPoTimu;
  const sNapadDom = clamp(napadDom / priorPoTimu, 0.35, 2.2);
  const sObranaGost = clamp(obranaGost / priorPoTimu, 0.35, 2.2);
  const sNapadGost = clamp(napadGost / priorPoTimu, 0.35, 2.2);
  const sObranaDom = clamp(obranaDom / priorPoTimu, 0.35, 2.2);
  // multiplikativni (Dixon-Coles stil) pomiješan s prosječnim — inače se
  // dva slaba omjera "kvadriraju" i defenzivni mečevi padnu premalo
  const multDom = sNapadDom * sObranaGost;
  const avgDom = (sNapadDom + sObranaGost) / 2;
  const multGost = sNapadGost * sObranaDom;
  const avgGost = (sNapadGost + sObranaDom) / 2;
  const lam = clamp((0.55 * multDom + 0.45 * avgDom) * priorPoTimu * 1.08, 0.25, 4.2);
  const mu = clamp((0.55 * multGost + 0.45 * avgGost) * priorPoTimu * 0.94, 0.2, 4.2);
  return { lam, mu };
}

/** Implicitni ukupni golovi iz tržišta O/U linija (ponderirano, 2.5 linija najveća). */
function lambdaIzTrzista(
  kvote: Record<string, number>,
  brojKladionica: number,
): { lam: number; w: number } | null {
  const linije: Array<[line: number, ovo: string, ono: string, tez: number]> = [
    [2.5, "o25", "u25", 0.5],
    [1.5, "o15", "u15", 0.25],
    [3.5, "o35", "u35", 0.25],
  ];
  let s = 0, w = 0, n = 0;
  for (const [line, ok, uk, tez] of linije) {
    const dm = deMargin(kvote[ok], kvote[uk]);
    if (!dm) continue;
    const lam = lambdaIzLinije(line, dm.pA);
    if (lam == null) continue;
    s += lam * tez;
    w += tez;
    n++;
  }
  if (n === 0 || w === 0) return null;
  const pokrivenostLinija = n / 3;
  const pokrivenostKnjiga = clamp(brojKladionica / 6, 0, 1);
  // težina tržištu: max 0.5; raste s linijama i brojem kladionica
  const wMarket = 0.5 * (0.7 * pokrivenostLinija + 0.3 * pokrivenostKnjiga);
  return { lam: s / w, w: wMarket };
}

/** Razdvoba ukupnih golova: kalibrira omjer λ domaćin/gost prema 1X2 tržištu. */
function kalibrirajRazdobje(
  lamUk: number,
  trziste1x2: { p1: number; pX: number; p2: number } | null,
  bazaRazd: number,
): number {
  if (!trziste1x2) return bazaRazd;
  let best = bazaRazd;
  let bestErr = Infinity;
  for (let r = 0.08; r <= 0.921; r += 0.04) {
    const m = metrikeIzGrida(izgradiGrid(lamUk * r, lamUk * (1 - r), 0));
    const err =
      (m.p1 - trziste1x2.p1) ** 2 +
      (m.pX - trziste1x2.pX) ** 2 +
      (m.p2 - trziste1x2.p2) ** 2;
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best;
}

/** Fit rho na tržištu U 1.5 (P(golova ≤ 1)) kad je dostupno. */
function fitRho(lamH: number, lamA: number, pOver15Market: number | null): number {
  if (pOver15Market == null) return -0.05;
  const target = 1 - pOver15Market;
  let best = -0.05;
  let bestErr = Infinity;
  for (let r = -0.18; r <= 0.181; r += 0.02) {
    const m = metrikeIzGrida(izgradiGrid(lamH, lamA, r));
    const err = Math.abs(1 - m.o15 - target);
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best;
}

function ocjenaIzPovjerenja(p: number): GoalsIzlaz["ocjena"] {
  if (p >= 85) return "A+";
  if (p >= 72) return "A";
  if (p >= 58) return "B+";
  if (p >= 45) return "B";
  return "C";
}

/* ═══════════════ GLAVNI ULAZ ═══════════════ */

export function goalsAnaliza(ulaz: GoalsUlaz): GoalsIzlaz {
  const upozorenja: string[] = [];
  const faktori: string[] = [];
  const kv = ulaz.kvote;
  const books = ulaz.brojKladionica ?? 0;

  /* 0) ligaški prior (Empirical Bayes) */
  const prior = priorZaLigu(ulaz.liga);
  const priorPoTimu = prior.poTimu;

  /* 1) forma → EB shrinkage prema ligaškom prioru */
  const dom = ulaz.formaDom;
  const gost = ulaz.formaGost;
  const domShr = shrinkajFormu(dom, priorPoTimu);
  const gostShr = shrinkajFormu(gost, priorPoTimu);
  const odDom = dom?.odigrano ?? 0;
  const odGost = gost?.odigrano ?? 0;
  const maliUzorak = jeMaliUzorak(Math.min(odDom === 0 ? 0 : odDom, odGost === 0 ? 0 : odGost));
  const { lam: lamModel, mu: muModel } = lambdaIzForme(domShr, gostShr, priorPoTimu);
  if (maliUzorak) {
    upozorenja.push(
      `⚠️ MALI UZORAK (< 5 utakmica barem jednog tima): forma je Empirical Bayes-om smanjena prema ligaškom prosjeku` +
      `${prior.tocna ? ` ("${prior.naziv}", ${prior.ukupno.toFixed(2)} gola)` : ""} — strop povjerenja 55%.`,
    );
  } else if (odDom < 4 || odGost < 4) {
    upozorenja.push("Uzorak forme je mali (< 4 utakmice barem jednog tima) — procjena timova manje pouzdana.");
  }
  if (!dom) upozorenja.push("Forma domaćina nije dostupna — uzet ligaški prosjek.");
  if (!gost) upozorenja.push("Forma gosta nije dostupna — uzet ligaški prosjek.");
  if (dom) faktori.push(`Domaćin: ${dom.postignuti}/${dom.odigrano} postignutih, ${dom.primljeni} primljenih u zadnjih ${dom.odigrano}.`);
  if (gost) faktori.push(`Gost: ${gost.postignuti}/${gost.odigrano} postignutih, ${gost.primljeni} primljenih u zadnjih ${gost.odigrano}.`);
  if (prior.tocna) faktori.push(`Ligaški prior (EB): "${prior.naziv}" — ${prior.ukupno.toFixed(2)} golova ukupno, shrinkage k=5.`);

  /* 2+3) tržište i mješanje ukupnih golova */
  const trz = lambdaIzTrzista(kv, books);
  const wMarket = trz ? trz.w : 0;
  const lambdaUk = trz
    ? wMarket * trz.lam + (1 - wMarket) * (lamModel + muModel)
    : lamModel + muModel;

  const dm1x2 = deMargin1x2(kv["1"], kv["X"], kv["2"]);
  if (!dm1x2) upozorenja.push("Nema potpunog 1X2 tržišta — razdvoba golova je samo iz forme.");
  if (books > 0 && books < 3) upozorenja.push(`Samo ${books} kladionica vraća kvote — tržišni signal slabiji.`);

  /* 4) razdvoba */
  const bazaRazd = lamModel + muModel > 0 ? lamModel / (lamModel + muModel) : 0.55;
  const razd = kalibrirajRazdobje(lambdaUk, dm1x2, bazaRazd);
  const lamH = clamp(lambdaUk * razd, 0.1, 4.5);
  const lamA = clamp(lambdaUk * (1 - razd), 0.1, 4.5);

  /* 5) rho */
  const dmO15 = deMargin(kv["o15"], kv["u15"]);
  const rho = fitRho(lamH, lamA, dmO15 ? dmO15.pA : null);

  /* 6) finalni grid */
  const G = izgradiGrid(lamH, lamA, rho);
  const M = metrikeIzGrida(G);

  /* 7) formsski sloj za BTTS i Over 2.5 */
  const model: Record<string, number> = {};
  const mModel = metrikeIzGrida(izgradiGrid(lamModel, muModel, rho));
  model["1"] = mModel.p1;
  model["X"] = mModel.pX;
  model["2"] = mModel.p2;
  model["o15"] = mModel.o15;
  model["o25"] = mModel.o25;
  model["o35"] = mModel.o35;

  /* BTTS kroz kopulu: DC (50%) + Bivarijantni Poisson ρ=0.08 (30%) + Frank (20%). */
  const kopula = bttsIzKopule(lamH, lamA, M.btts);
  const kopulaModel = bttsIzKopule(lamModel, muModel, mModel.btts);
  model["bttsDa"] = kopulaModel.btts;
  faktori.push(
    `BTTS zavisnost: DC ${(kopula.dc * 100).toFixed(1)}% · BivPois(ρ=0.08) ${(kopula.bp * 100).toFixed(1)}% · ` +
    `Frank(θ=${kopula.theta.toFixed(2)}) ${(kopula.frank * 100).toFixed(1)}% → mješavina ${(kopula.btts * 100).toFixed(1)}%.`,
  );

  let bttsDa = kopula.btts;
  const postotakBtts: number[] = [];
  if (dom && dom.odigrano > 0) postotakBtts.push(dom.btts / dom.odigrano);
  if (gost && gost.odigrano > 0) postotakBtts.push(gost.btts / gost.odigrano);
  if (postotakBtts.length === 2) {
    // EB: udio BTTS-a u formi se također smanjuje prema prioru kad je uzorak mali
    const nZaj = odDom + odGost;
    const pf = shrinkajStopu(nZaj, (postotakBtts[0]! * odDom + postotakBtts[1]! * odGost) / nZaj, kopula.btts);
    bttsDa = 0.8 * bttsDa + 0.2 * pf;
    faktori.push(`BTTS forma: domaćin ${Math.round(postotakBtts[0]! * 100)}%, gost ${Math.round(postotakBtts[1]! * 100)}% utakmica (EB-mješavina ${(pf * 100).toFixed(1)}%).`);
  }

  let o25 = M.o25;
  if (dom && gost && odDom + odGost >= 8) {
    const pf = (dom.over25 + gost.over25) / (odDom + odGost);
    o25 = 0.8 * o25 + 0.2 * pf;
    faktori.push(`Over 2.5 forma oba tima: ${Math.round(pf * 100)}% zajedničkih utakmica.`);
  }
  // redoslijed je uvijek: Over 1.5 >= Over 2.5 >= Over 3.5 (grid to garantira)
  o25 = clamp(o25, M.o35, M.o15);
  const o15 = M.o15;
  const o35 = M.o35;
  // P(BTTS) ≤ P(Over 1.5) matematici mora vrijediti i nakon kopule i formsskog sloja.
  bttsDa = clamp(bttsDa, 0.001, Math.max(0.001, Math.min(0.999, M.o15)));
  const bttsNe = clamp(1 - bttsDa, 0.001, 0.999);

  let final: Record<string, number> = {
    "1": M.p1, "X": M.pX, "2": M.p2,
    bttsDa, bttsNe,
    o15, o25, o35,
    u15: 1 - o15, u25: 1 - o25, u35: 1 - o35,
  };
  // distribucija ukupnih golova (za 2.5 Pro): g0..g4, g5+
  // VAŽNO: polje ide do 2*MAX_GOL jer zbroj golova (i+j) može biti do 18
  // (npr. 5:5, 7:6) — staro polje do 9 ti je rezultate gubilo iz g5+.
  {
    const pg: number[] = new Array(2 * MAX_GOL + 1).fill(0);
    for (let i = 0; i <= MAX_GOL; i++)
      for (let j = 0; j <= MAX_GOL; j++) pg[i + j]! += G[i]![j]!;
    for (let k = 0; k <= 4; k++) final[`g${k}`] = pg[k]!;
    let g5 = 0;
    for (let k = 5; k <= 2 * MAX_GOL; k++) g5 += pg[k]!;
    final["g5+"] = g5;
  }

  /* market (de-margined) za usporedbu i suglasnost */
  const market: Record<string, number> = {};
  const dodajPar = (oKlj: string, uKlj: string, pA: string, pB: string) => {
    const dm = deMargin(kv[oKlj], kv[uKlj]);
    if (dm) {
      market[pA] = dm.pA;
      market[pB] = dm.pB;
    }
  };
  dodajPar("o15", "u15", "o15", "u15");
  dodajPar("o25", "u25", "o25", "u25");
  dodajPar("o35", "u35", "o35", "u35");
  dodajPar("bttsDa", "bttsNe", "bttsDa", "bttsNe");
  if (dm1x2) {
    market["1"] = dm1x2.p1;
    market["X"] = dm1x2.pX;
    market["2"] = dm1x2.p2;
  }

  /* suglasnost model ↔ tržište (na 1/5 razlika preslikano u 0..1) */
  let diffZ = 0, diffN = 0;
  for (const k of ["bttsDa", "o15", "o25", "o35"]) {
    if (market[k] != null && model[k] != null) {
      diffZ += Math.abs(model[k]! - market[k]!);
      diffN++;
    }
  }
  const avgDiff = diffN ? diffZ / diffN : null;
  const suglasnost = avgDiff == null ? 0.5 : clamp(1 - avgDiff * 5, 0, 1);
  if (avgDiff != null && avgDiff > 0.12)
    upozorenja.push("Model i tržište se znatno razilaze — ili tržište ima infu (povrede/postave), ili je kvota iskočila.");

  /* 7b) GLOBALNA KALIBRACIJA — logaritamski pool finala s de-margined tržištem.
     Težina raste s brojem kladionica i pokrivenošću tržišta (max 0.45);
     bez kvota je w = 0 → final ostaje čisto modelno (identitet). */
  const paroviKal = ["o15", "o25", "o35", "bttsDa"].filter((k) =>
    market[k] != null ||
    (k === "bttsDa" ? market["bttsNe"] != null : market[`u${k.slice(1)}`] != null),
  ).length;
  const wKal = tezinaKalibracije(books, paroviKal);
  const kal = kalibrirajGoalsFinal(final, market, wKal);
  if (kal.primijenjena) {
    final = kal.final;
    faktori.push(
      `Globalna kalibracija: final pool-an s de-margined tržištem (težina ${(wKal * 100).toFixed(0)}%), ` +
      `prosječni pomak ${kal.prosjecniPomak.toFixed(1)} pp.`,
    );
    if (kal.prosjecniPomak > 6)
      upozorenja.push(
        `Kalibracija je znatno povukla model prema tržištu (${kal.prosjecniPomak.toFixed(1)} pp) — forma i tržište se razilazu (infu, povrede ili iskočila kvota); tretirajte tipove oprezno.`,
      );
  }

  /* 8) fair kvote, edge, kelly */
  const fairOdds: Record<string, number> = {};
  const edge: Record<string, number> = {};
  const kelly: Record<string, number> = {};
  for (const [k, p] of Object.entries(final)) {
    if (!(p > 0.001)) continue;
    fairOdds[k] = Math.round((1 / p) * 100) / 100;
    const o = kv[k];
    if (o != null && o >= 1.01) {
      const e = p * o - 1;
      edge[k] = Math.round(e * 1000) / 1000;
      if (e > 0) kelly[k] = Math.round(clamp((p * (o - 1) - (1 - p)) / (o - 1), 0, 1) * 1000) / 1000;
    }
  }

  /* povjerenje (s EB stropom za mali uzorak) */
  const linije = ["bttsDa", "o15", "o25", "o35"].filter((k) =>
    kv[k] != null && kv[k === "bttsDa" ? "bttsNe" : `u${k.slice(1)}`] != null,
  ).length;
  const pokrTrz = (linije / 4) * 25;
  const pokrKnj = (clamp(books, 0, 6) / 6) * 25;
  const uzorak = Math.min(odDom, odGost);
  const pokrForma = (clamp(uzorak, 0, 6) / 6) * 25;
  const pokrSugl = suglasnost * 25;
  const povjerenjeSirovo = pokrTrz * 0.3 + pokrKnj * 0.25 + pokrForma * 0.2 + pokrSugl * 0.25;
  const povjerenje = stropPovjerenja(povjerenjeSirovo, maliUzorak);

  /* top rezultati */
  const top: { rezultat: string; p: number }[] = [];
  for (let i = 0; i <= 5; i++)
    for (let j = 0; j <= 5; j++) top.push({ rezultat: `${i}:${j}`, p: G[i]![j]! });
  top.sort((a, b) => b.p - a.p);

  if (books === 0) upozorenja.push("Nema kvota s API-ja — analiza je samo modelna (bez tržišne kalibracije).");
  if (wMarket === 0) upozorenja.push("Nema O/U linija — ukupni golovi su čisto iz forme.");

  return {
    lambdaDom: Math.round(lamH * 100) / 100,
    lambdaGost: Math.round(lamA * 100) / 100,
    lambdaUkupno: Math.round((lamH + lamA) * 100) / 100,
    model,
    market,
    final,
    fairOdds,
    edge,
    kelly,
    topRezultati: top.slice(0, 5),
    suglasnost: Math.round(suglasnost * 100) / 100,
    povjerenje,
    ocjena: ocjenaIzPovjerenja(povjerenje),
    upozorenja,
    faktori,
    wMarket: Math.round(wMarket * 100) / 100,
    rho: Math.round(rho * 1000) / 1000,
    maliUzorak,
    ligaPrior: prior,
    kalibracija: {
      primijenjena: kal.primijenjena,
      tezina: kal.tezina,
      prosjecniPomak: kal.prosjecniPomak,
    },
    kopula: {
      dc: Math.round(kopula.dc * 1000) / 1000,
      bp: Math.round(kopula.bp * 1000) / 1000,
      frank: Math.round(kopula.frank * 1000) / 1000,
      theta: Math.round(kopula.theta * 1000) / 1000,
    },
  };
}
