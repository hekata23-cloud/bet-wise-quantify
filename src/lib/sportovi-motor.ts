/* ============================================================
   SPORTOVI-MOTOR.TS — analiza za Košarka Pro i Rukomet Pro
   Šta motor radi:
   1) λ (očekivani bodovi/golovi) timova iz forme, s razdvojbom
      doma/u gostima i skupljanjem prema prosjeku sporta kad je
      uzorak mali (šrinkanje — mala serija ne smije visjeti cijeli model);
   2) prednost domaćeg terena iz podataka sporta (košarka ≈ +2.7 boda,
      rukomet ≈ +1.6 gola), upola dodijeljena svakoj strani;
   3) vjerojatnost pobjede: logistička krivulja nad razlikom λ;
      rukomet ima i NERJEŠENO — p(X) iz rasporeda razlike golova;
   4) Over/Under: očekivani UKUPNI zbroj vs linija, s raspršenjem
      (σ) iz stvarnih serija timova, prebačenim na σ sporta kad je
      uzorak malen;  P(over) = 1 − Φ((linija − E)/σ);
   5) kalibracija tržištem: de-marginirane kvote miješaju se s modelom
      (težina tržišta raste s brojem kladionica, pada s veličinom uzorka) —
      motor nikad ne kaže "sigurno", već stavlja model u ravnopravni
      dijalog s novcem na tržištu;
   6) KONKRETAN TIP: najjači edge preko svih tržišta, EV i 1/4 Kelly.
   ============================================================ */

export type SportUlaz = {
  sport: "kosarka" | "rukomet";
  kvote: Record<string, number>;
  linija: number | null;
  formaDom: SportFormaIzvor | null;
  formaGost: SportFormaIzvor | null;
  brojKladionica?: number;
};

/** Minimalni oblik forme koji motor traži (kompatibilno sa SportForma). */
export type SportFormaIzvor = {
  odigrano: number;
  postignuti: number;
  primljeni: number;
  doma: { odigrano: number; postignuti: number; primljeni: number } | null;
  uGostima: { odigrano: number; postignuti: number; primljeni: number } | null;
  ukupnoSd: number;
  razlikaSd: number;
  trend: number;
} | null;

export type SportIzlaz = {
  lambdaDom: number;
  lambdaGost: number;
  ukupnoOcekivano: number;
  sigmaUkupno: number;
  model: Record<string, number>;
  market: Record<string, number>;
  final: Record<string, number>;
  fairOdds: Record<string, number>;
  edge: Record<string, number>;
  kelly: Record<string, number>;
  tip: {
    kljuc: string;      // "1" | "X" | "2" | "over" | "under"
    label: string;
    p: number;
    kvota: number | null;
    edge: number;
    ev: number;
    kellyPct: number;   // % banke (1/4 Kelly, max 3)
  } | null;
  povjerenje: number;
  ocjena: string;
  upozorenja: string[];
  faktori: string[];
};

/** Konstante sporta (iz podataka): prednost domaćih, raspršenja, osjetljivost. */
const KONST = {
  kosarka: {
    prosjekTima: 82,     // tipičan timski broj bodova (za šrinkanje malih uzoraka)
    homeAdv: 2.7,        // bodova prednosti domaćeg terena
    sigmaDefault: 20,    // sd ukupnog zbroja bodova
    k: 0.16,             // logistička osjetljivost na bod razlike
  },
  rukomet: {
    prosjekTima: 28.5,   // tipičan timski broj golova
    homeAdv: 1.6,
    sigmaDefault: 5.8,
    sigmaDiffDefault: 5.2, // sd gol-razlike (za nerješeno)
    k: 0.13,
  },
} as const;

/** Standardna normalna CDF — Φ(x). */
function phi(x: number): number {
  // Abramowitz–Stegun 7.1.26 za erf
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function clamp01(x: number, lo = 0.01, hi = 0.99): number {
  return Math.min(hi, Math.max(lo, x));
}

export function sportAnaliza(ulaz: SportUlaz): SportIzlaz {
  const c = KONST[ulaz.sport];
  const upozorenja: string[] = [];
  const faktori: string[] = [];
  const dom = ulaz.formaDom;
  const gost = ulaz.formaGost;
  const knjiga = Math.max(0, ulaz.brojKladionica ?? 0);

  /* ── 1) λ: napad domaćina protiv obrane gosta, s razdvojbom i šrinkanjem ── */
  const dobarVenue = (f: SportFormaIzvor, venue: "doma" | "uGostima") => {
    const v = f?.[venue];
    return v && v.odigrano >= 3 ? v.postignuti / v.odigrano : null;
  };
  const prosjek = (f: SportFormaIzvor, kljuc: "postignuti" | "primljeni") =>
    f && f.odigrano > 0 ? f[kljuc] / f.odigrano : null;

  const napadDom = dobarVenue(dom, "doma") ?? prosjek(dom, "postignuti") ?? null;
  const obranaDom = dom?.doma && dom.doma.odigrano >= 3 ? dom.doma.primljeni / dom.doma.odigrano : prosjek(dom, "primljeni");
  const napadGost = dobarVenue(gost, "uGostima") ?? prosjek(gost, "postignuti") ?? null;
  const obranaGost = gost?.uGostima && gost.uGostima.odigrano >= 3 ? gost.uGostima.primljeni / gost.uGostima.odigrano : prosjek(gost, "primljeni");

  // sirova procjena = (napad napadača + obrana obranjenog) / 2, pa šrinkanje
  const shrink = (f: SportFormaIzvor, g: SportFormaIzvor) => {
    const n = Math.max(f?.odigrano ?? 0, g?.odigrano ?? 0);
    return n / (n + 6); // 6 = koliko "polutakmica" uzimamo zadržano prema prosjeku
  };
  const w = shrink(dom, gost);
  const sirovaDom = napadDom != null && obranaGost != null ? (napadDom + obranaGost) / 2 : (napadDom ?? obranaGost ?? c.prosjekTima);
  const sirovaGost = napadGost != null && obranaDom != null ? (napadGost + obranaDom) / 2 : (napadGost ?? obranaDom ?? c.prosjekTima);
  /* home advantage vrijedi UVJEK — ne smije nestati kad forma ne postoji:
     λ = (1−w)·prosjek + w·sirova procjena ± homeAdv/2 */
  const lambdaDom = (1 - w) * c.prosjekTima + w * sirovaDom + c.homeAdv / 2;
  const lambdaGost = (1 - w) * c.prosjekTima + w * sirovaGost - c.homeAdv / 2;

  faktori.push(`Očekivani učinak — domaćin λ=${lambdaDom.toFixed(1)}, gost λ=${lambdaGost.toFixed(1)} (${ulaz.sport === "kosarka" ? "bodova" : "golova"}).`);
  if (dom) faktori.push(`Domaćin: ${dom.postignuti}/${dom.odigrano} postignutih, ${dom.primljeni} primljenih u zadnjih ${dom.odigrano}.`);
  if (gost) faktori.push(`Gost: ${gost.postignuti}/${gost.odigrano} postignutih, ${gost.primljeni} primljenih u zadnjih ${gost.odigrano}.`);
  const domaRazd = dom?.doma && dom.doma.odigrano >= 3 ? dom.doma : null;
  const gostRazd = gost?.uGostima && gost.uGostima.odigrano >= 3 ? gost.uGostima : null;
  if (domaRazd) faktori.push(`Domaćin DOMA: ${domaRazd.postignuti}/${domaRazd.odigrano} postignutih, ${domaRazd.primljeni} primljenih.`);
  if (gostRazd) faktori.push(`Gost U GOSTIMA: ${gostRazd.postignuti}/${gostRazd.odigrano} postignutih, ${gostRazd.primljeni} primljenih.`);
  const trendDom = dom && dom.odigrano >= 8 ? dom.trend : null;
  const trendGost = gost && gost.odigrano >= 8 ? gost.trend : null;
  if (trendDom != null && Math.abs(trendDom) > 2) faktori.push(`Domaćin ${trendDom > 0 ? "igra SVE BOLJE" : "pada u formi"} (trend ${trendDom > 0 ? "+" : ""}${trendDom.toFixed(1)} ${ulaz.sport === "kosarka" ? "boda" : "gola"}).`);
  if (trendGost != null && Math.abs(trendGost) > 2) faktori.push(`Gost ${trendGost > 0 ? "igra SVE BOLJE" : "pada u formi"} (trend ${trendGost > 0 ? "+" : ""}${trendGost.toFixed(1)} ${ulaz.sport === "kosarka" ? "boda" : "gola"}).`);
  if (w < 0.45) upozorenja.push("Mali uzorak forme — model je jaka prema prosjeku sporta, povjerenje je niže.");
  if (!dom || !gost) upozorenja.push("Nedostaje forma jednog tima — analiza je djelomična.");

  /* ── 2) model 1X2 ── */
  const model: Record<string, number> = {};
  const diff = lambdaDom - lambdaGost;
  if (ulaz.sport === "kosarka") {
    const p1 = clamp01(sigmoid(c.k * diff));
    model["1"] = p1;
    model["2"] = 1 - p1;
  } else {
    const sdDiff =
      dom && gost && dom.razlikaSd > 0 && gost.razlikaSd > 0
        ? Math.sqrt((dom.razlikaSd * dom.razlikaSd + gost.razlikaSd * gost.razlikaSd) / 2)
        : KONST.rukomet.sigmaDiffDefault;
    const sdUz = Math.max(2.5, Math.min(8, sdDiff));
    const pX = clamp01(2 * phi(0.5 / sdUz) - 1, 0.02, 0.2);
    const s = sigmoid(KONST.rukomet.k * diff);
    model["1"] = (1 - pX) * s;
    model["2"] = (1 - pX) * (1 - s);
    model["X"] = pX;
  }

  /* ── 3) model Over/Under ── */
  const ukupnoOcekivano = lambdaDom + lambdaGost;
  const sdUzorak =
    dom && gost && dom.ukupnoSd > 0 && gost.ukupnoSd > 0
      ? Math.sqrt((dom.ukupnoSd * dom.ukupnoSd + gost.ukupnoSd * gost.ukupnoSd) / 2)
      : 0;
  const wSd = Math.max(dom?.odigrano ?? 0, gost?.odigrano ?? 0) >= 8 ? 1 : 0.5;
  const sigmaUkupno = sdUzorak > 0 ? c.sigmaDefault + wSd * (sdUzorak - c.sigmaDefault) : c.sigmaDefault;
  const linija = ulaz.linija;
  if (linija != null) {
    const over = clamp01(1 - phi((linija - ukupnoOcekivano) / sigmaUkupno), 0.02, 0.98);
    model["over"] = over;
    model["under"] = 1 - over;
    faktori.push(`Očekivani UKUPNI zbroj ${ukupnoOcekivano.toFixed(1)} vs linija ${linija} (raspršenje σ=${sigmaUkupno.toFixed(1)}).`);
  }

  /* ── 4) tržište: de-marginirane kvote ── */
  const kv = ulaz.kvote ?? {};
  const market: Record<string, number> = {};
  if (kv["1"] && kv["2"]) {
    const im1 = 1 / kv["1"];
    const imX = kv["X"] ? 1 / kv["X"] : 0;
    const im2 = 1 / kv["2"];
    const z = im1 + imX + im2;
    market["1"] = im1 / z;
    market["2"] = im2 / z;
    if (imX) market["X"] = imX / z;
  }
  if (kv["over"] && kv["under"]) {
    const imO = 1 / kv["over"];
    const imU = 1 / kv["under"];
    const z = imO + imU;
    market["over"] = imO / z;
    market["under"] = imU / z;
  }

  /* ── 5) final: kalibracija modela tržištem ── */
  const final: Record<string, number> = {};
  const wTrz = Math.min(0.45, 0.15 + 0.05 * knjiga); // više kladionica = više povjerenja u tržište
  for (const k of Object.keys(model)) {
    const m = market[k];
    final[k] = m != null ? clamp01((1 - wTrz) * model[k] + wTrz * m) : clamp01(model[k]);
  }
  // očuvanje zbroja: 1X2 normaliziraj na 1, over+under na 1
  const normiraj = (keys: string[]) => {
    const z = keys.reduce((a, k) => a + (final[k] ?? 0), 0);
    if (z > 0) for (const k of keys) final[k] = (final[k] ?? 0) / z;
  };
  if (final["1"] != null && final["2"] != null) normiraj(final["X"] != null ? ["1", "X", "2"] : ["1", "2"]);
  if (final["over"] != null && final["under"] != null) normiraj(["over", "under"]);

  /* ── 6) fer kvote, edge, Kelly ── */
  const fairOdds: Record<string, number> = {};
  const edge: Record<string, number> = {};
  const kelly: Record<string, number> = {};
  for (const k of Object.keys(final)) {
    fairOdds[k] = 1 / final[k];
    const o = kv[k];
    if (o && o > 1) {
      edge[k] = final[k] * o - 1;
      kelly[k] = edge[k] > 0 ? Math.max(0, Math.min(1, ((final[k] * o - 1) / (o - 1)) / 4)) : 0;
    }
  }

  /* ── 7) KONKRETAN TIP ── */
  const nazivi: Record<string, string> = {
    "1": "Pobjeda domaćina",
    X: "Nerješeno",
    "2": "Pobjeda gosta",
    over: `Over ${linija ?? ""}`.trim(),
    under: `Under ${linija ?? ""}`.trim(),
  };
  let tip: SportIzlaz["tip"] = null;
  const kandidati = Object.keys(edge).filter((k) => edge[k]! >= 0.02 && final[k]! >= 0.05);
  if (kandidati.length) {
    kandidati.sort((a, b) => edge[b]! - edge[a]!);
    const k = kandidati[0]!;
    const o = kv[k]!;
    const kellyPct = Math.max(0, Math.min(3, kelly[k]! * 100));
    tip = {
      kljuc: k,
      label: nazivi[k] ?? k,
      p: final[k]!,
      kvota: o,
      edge: edge[k]!,
      ev: final[k]! * o - 1,
      kellyPct,
    };
  }

  /* ── 8) povjerenje i ocjena ── */
  const uzorak = Math.min(dom?.odigrano ?? 0, gost?.odigrano ?? 0);
  const saglasnost = market["1"] != null && final["1"] != null
    ? 1 - Math.min(1, Math.abs(final["1"]! - market["1"]!) / 0.15)
    : 0.5;
  const povjerenje = Math.round(
    Math.max(0, Math.min(100,
      15 + Math.min(35, uzorak * 3.5) + Math.min(20, knjiga * 4) + (linija != null ? 10 : 0) + 20 * saglasnost * (market["1"] != null ? 1 : 0.5),
    )),
  );
  const ocjena =
    povjerenje >= 80 && tip && tip.edge >= 0.05 ? "A+" :
    povjerenje >= 65 && tip && tip.edge >= 0.03 ? "A" :
    povjerenje >= 50 ? "B+" : "B";
  if (tip && tip.edge < 0.03) upozorenja.push("Edge je mali — tržište i model su vrlo blizu.");
  if (tip && knjiga < 3) upozorenja.push(`Kvota je iz ${knjiga} kladionica — malo knjiga zna i slabije kvote.`);

  return {
    lambdaDom,
    lambdaGost,
    ukupnoOcekivano,
    sigmaUkupno,
    model,
    market,
    final,
    fairOdds,
    edge,
    kelly,
    tip,
    povjerenje,
    ocjena,
    upozorenja,
    faktori,
  };
}
