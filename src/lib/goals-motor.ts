/* ═══════════════════════════════════════════════════════════════════
   GOALS-MOTOR — zajednički "mozak" za BTTS Ultra i 2.5 Pro karticu
   ═══════════════════════════════════════════════════════════════════
   Metodologija (sve u jednom dosljednom modelu, bez "čarobnih brojeva"):

   1) FORMA → očekivani golovi timova (λ domaćin, μ gost)
      napad/obrana svakog tima relativno na ligu (1 = prosječno),
      umnoženo s malom prednošću domaćeg terena (×1.08 / ×0.94).
   2) TRŽIŠTE → implicitni ukupni golovi: iz de-margined parova
      Over/Under 1.5 / 2.5 / 3.5 rješavamo Poissonovu CDF i dobivamo
      λ ukupno kako ga kladionice "vide" (2.5 linija nosi najviše težine).
   3) MJEŠANJE: finalni ukupni golovi = w·λ(tržište) + (1-w)·λ(forma).
      Težina tržištu raste s brojem dostupnih linija i kladionica —
      tržište nije uvijek mjerilo ishoda, ali je najbolji jednostruki
      prediktor kad je likvidno, pa ga nikad ne ignoriramo potpuno.
   4) RAZDVOBA λ domaćin/gost: kalibrira se prema de-margined 1X2
      (gruba pretraga omjera), ne uzalud "po osjećaju".
   5) DIXON-COLES korekcija (rho): golovi nisu nezavisni — 0:0 i 1:1
      su češći, a 0:1/1:0 rjeđi nego što čisti Poisson kaže. Rho se
      fita na tržištu U 1.5 kad je dostupno, inače -0.05.
   6) IZ FINALNE MATRICE rezultata (0..9 × 0..9) dolazi SVIŠTA isto:
      BTTS, Over/Under 1.5/2.5/3.5, 1X2, top rezultati — zato je
      model unutarnje konzistentan (P(Over 2.5) < P(Over 1.5) uvijek).
   7) BTTS i Over 2.5 dobiju mali dodatni "formski" sloj (do 20% težine)
      iz stvarne BTTS/Over forme oba tima — tržišta tu često kasne.
   8) EDGE i KELLY spram stvarnih kvota; ocjena povjerenja (A+..C)
      od uzorka forme, pokrivenosti tržišta i suglasnosti model-tržište.

   Zaštićeni ugovori nema — čisti matematički modul, može se testirati.
   ═══════════════════════════════════════════════════════════════════ */

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
};

export type GoalsIzlaz = {
  lambdaDom: number;
  lambdaGost: number;
  lambdaUkupno: number;
  /** model SAMO iz forme (prije mješanja s tržištem) */
  model: Record<string, number>;
  /** de-margined tržište (samo dostupne stavke) */
  market: Record<string, number>;
  /** finalne vjerojatnosti (grid + formski sloj) */
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
};

const MAX_GOL = 9;
const LIGA_PO_TIMU = 1.35; // prosječno golova po timu po utakmici (≈2.7 ukupno)
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

/** Očekivani golovi timova iz forme (relativne snage × prednost domaćeg terena). */
export function lambdaIzForme(dom: FormaGolovi | null, gost: FormaGolovi | null): { lam: number; mu: number } {
  const napadDom = dom && dom.odigrano > 0 ? dom.postignuti / dom.odigrano : LIGA_PO_TIMU;
  const obranaGost = gost && gost.odigrano > 0 ? gost.primljeni / gost.odigrano : LIGA_PO_TIMU;
  const napadGost = gost && gost.odigrano > 0 ? gost.postignuti / gost.odigrano : LIGA_PO_TIMU;
  const obranaDom = dom && dom.odigrano > 0 ? dom.primljeni / dom.odigrano : LIGA_PO_TIMU;
  const sNapadDom = clamp(napadDom / LIGA_PO_TIMU, 0.35, 2.2);
  const sObranaGost = clamp(obranaGost / LIGA_PO_TIMU, 0.35, 2.2);
  const sNapadGost = clamp(napadGost / LIGA_PO_TIMU, 0.35, 2.2);
  const sObranaDom = clamp(obranaDom / LIGA_PO_TIMU, 0.35, 2.2);
  // multiplikativni (Dixon-Coles stil) pomiješan s prosječnim — inače se
  // dva slaba omjera "kvadriraju" i defenzivni mečevi padnu premalo
  const multDom = sNapadDom * sObranaGost;
  const avgDom = (sNapadDom + sObranaGost) / 2;
  const multGost = sNapadGost * sObranaDom;
  const avgGost = (sNapadGost + sObranaDom) / 2;
  const lam = clamp((0.55 * multDom + 0.45 * avgDom) * LIGA_PO_TIMU * 1.08, 0.25, 4.2);
  const mu = clamp((0.55 * multGost + 0.45 * avgGost) * LIGA_PO_TIMU * 0.94, 0.2, 4.2);
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

  /* 1) forma */
  const dom = ulaz.formaDom;
  const gost = ulaz.formaGost;
  const odDom = dom?.odigrano ?? 0;
  const odGost = gost?.odigrano ?? 0;
  const { lam: lamModel, mu: muModel } = lambdaIzForme(dom, gost);
  if (odDom < 4 || odGost < 4)
    upozorenja.push("Uzorak forme je mali (< 4 utakmice barem jednog tima) — procjena timova manje pouzdana.");
  if (!dom) upozorenja.push("Forma domaćina nije dostupna — uzet ligaški prosjek.");
  if (!gost) upozorenja.push("Forma gosta nije dostupna — uzet ligaški prosjek.");
  if (dom) faktori.push(`Domaćin: ${dom.postignuti}/${dom.odigrano} postignutih, ${dom.primljeni} primljenih u zadnjih ${dom.odigrano}.`);
  if (gost) faktori.push(`Gost: ${gost.postignuti}/${gost.odigrano} postignutih, ${gost.primljeni} primljenih u zadnjih ${gost.odigrano}.`);

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

  /* 7) formski sloj za BTTS i Over 2.5 */
  const model: Record<string, number> = {};
  const mModel = metrikeIzGrida(izgradiGrid(lamModel, muModel, rho));
  model["1"] = mModel.p1;
  model["X"] = mModel.pX;
  model["2"] = mModel.p2;
  model["bttsDa"] = mModel.btts;
  model["o15"] = mModel.o15;
  model["o25"] = mModel.o25;
  model["o35"] = mModel.o35;

  let bttsDa = M.btts;
  const postotakBtts: number[] = [];
  if (dom && dom.odigrano > 0) postotakBtts.push(dom.btts / dom.odigrano);
  if (gost && gost.odigrano > 0) postotakBtts.push(gost.btts / gost.odigrano);
  if (postotakBtts.length === 2) {
    const pf = (postotakBtts[0]! + postotakBtts[1]!) / 2;
    bttsDa = 0.8 * bttsDa + 0.2 * pf;
    faktori.push(`BTTS forma: domaćin ${Math.round(postotakBtts[0]! * 100)}%, gost ${Math.round(postotakBtts[1]! * 100)}% utakmica.`);
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
  const bttsNe = clamp(1 - bttsDa, 0.001, 0.999);
  bttsDa = clamp(bttsDa, 0.001, 0.999);

  const final: Record<string, number> = {
    "1": M.p1, "X": M.pX, "2": M.p2,
    bttsDa, bttsNe,
    o15, o25, o35,
    u15: 1 - o15, u25: 1 - o25, u35: 1 - o35,
  };
  // distribucija ukupnih golova (za 2.5 Pro): g0..g4, g5+
  {
    const pg: number[] = new Array(MAX_GOL + 1).fill(0);
    for (let i = 0; i <= MAX_GOL; i++)
      for (let j = 0; j <= MAX_GOL; j++) pg[i + j]! += G[i]![j]!;
    for (let k = 0; k <= 4; k++) final[`g${k}`] = pg[k]!;
    let g5 = 0;
    for (let k = 5; k <= MAX_GOL; k++) g5 += pg[k]!;
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

  /* povjerenje */
  const linije = ["bttsDa", "o15", "o25", "o35"].filter((k) =>
    kv[k] != null && kv[k === "bttsDa" ? "bttsNe" : `u${k.slice(1)}`] != null,
  ).length;
  const pokrTrz = (linije / 4) * 25;
  const pokrKnj = (clamp(books, 0, 6) / 6) * 25;
  const uzorak = Math.min(odDom, odGost);
  const pokrForma = (clamp(uzorak, 0, 6) / 6) * 25;
  const pokrSugl = suglasnost * 25;
  const povjerenje = Math.round(pokrTrz * 0.3 + pokrKnj * 0.25 + pokrForma * 0.2 + pokrSugl * 0.25);

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
  };
}
