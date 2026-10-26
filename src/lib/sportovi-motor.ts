/* ============================================================
   SPORTOVI-MOTOR.TS — analiza za Košarka Pro i Rukomet Pro
   Šta motor radi:
   1) λ (očekivani bodovi/golovi) timova iz forme, s razdvojbom
      doma/u gostima i skupljanjem prema prosjeku sporta kad je
      uzorak mali;
   2) prednost domaćeg terena (košarka ≈ +2.7, rukomet ≈ +1.6);
   3) vjerojatnost pobjede: logistička krivulja nad razlikom λ;
      rukomet ima i NERJEŠENO — p(X) iz rasporeda razlike golova;
   4) Over/Under: očekivani UKUPNI zbroj vs linija;
   5) kalibracija tržištem: de-marginirane kvote miješaju se s modelom;
   6) KONKRETAN TIP: najjači edge preko svih tržišta, EV i 1/4 Kelly.
   ============================================================ */

export type SportUtakmica = {
  id: number;
  sport: "kosarka" | "rukomet";
  datumIso: string;
  pocetakFormatirano: string;
  timestamp: number;
  ligaId: number;
  ligaNaziv: string;
  ligaZemlja: string;
  ligaSezona: string;
  domacinId: number;
  domacinNaziv: string;
  domacinLogo: string | null;
  gostId: number;
  gostNaziv: string;
  gostLogo: string | null;
  statusShort: string;
  statusLong: string;
  rezultatDomacin: number | null;
  rezultatGost: number | null;
  detalji?: Record<string, any>;
};

export type SportUlaz = {
  sport: "kosarka" | "rukomet";
  utakmica?: SportUtakmica;
  kvote: Record<string, number>;
  linija?: number | null;
  linijaKladionice?: number | null;
  linijaDom?: number | null;
  linijaDomKladionice?: number | null;
  linijaGost?: number | null;
  linijaGostKladionice?: number | null;
  formaDom?: SportFormaIzvor | null;
  formaGost?: SportFormaIzvor | null;
  h2hGoloviDom?: number[];
  h2hGoloviGost?: number[];
  brojKladionica?: number;
};

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
    kljuc: string;
    label: string;
    p: number;
    kvota: number | null;
    edge: number;
    ev: number;
    kellyPct: number;
  } | null;
  tipovi: SportTipTrzista[];
  sigmaTim: number;
  povjerenje: number;
  ocjena: string;
  upozorenja: string[];
  faktori: string[];
  bookmaker?: string | null;
};

export type SportTipTrzista = {
  trziste: "1x2" | "ukupno" | "dom" | "gost";
  naslov: string;
  kljuc: string;
  label: string;
  linija: number | null;
  p: number;
  kvota: number | null;
  fer: number;
  edge: number | null;
  izvor: "tržište" | "model";
  vrijednost: boolean;
};

const KONST = {
  kosarka: {
    prosjekTima: 82,
    homeAdv: 2.7,
    sigmaDefault: 20,
    sigmaTim: 12,
    sigmaRazlika: 12,
    k: 0.16,
  },
  rukomet: {
    prosjekTima: 28.5,
    homeAdv: 1.6,
    sigmaDefault: 5.8,
    sigmaDiffDefault: 5.2,
    sigmaTim: 4.2,
    k: 0.13,
  },
} as const;

function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function devigProporcionalno(kvote: Record<string, number>, kljucevi: string[]): Record<string, number> {
  const prisutni = kljucevi.filter((k) => kvote[k] && kvote[k] > 1);
  if (prisutni.length < 2) return {};
  const inv = prisutni.map((k) => 1 / kvote[k]!);
  const suma = inv.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (let i = 0; i < prisutni.length; i++) {
    out[prisutni[i]!] = inv[i]! / suma;
  }
  return out;
}

export function sportAnaliza(ulaz: SportUlaz): SportIzlaz {
  const c = KONST[ulaz.sport];
  const upozorenja: string[] = [];
  const faktori: string[] = [];
  const dom = ulaz.formaDom ?? null;
  const gost = ulaz.formaGost ?? null;

  let baseDom = dom && dom.odigrano >= 3 ? dom.postignuti / dom.odigrano : c.prosjekTima;
  let baseGost = gost && gost.odigrano >= 3 ? gost.postignuti / gost.odigrano : c.prosjekTima;

  const nDom = dom?.odigrano ?? 0;
  const nGost = gost?.odigrano ?? 0;
  const wDom = Math.min(1, nDom / 10);
  const wGost = Math.min(1, nGost / 10);
  baseDom = wDom * baseDom + (1 - wDom) * c.prosjekTima;
  baseGost = wGost * baseGost + (1 - wGost) * c.prosjekTima;

  const lambdaDom = Math.max(1, baseDom + c.homeAdv / 2);
  const lambdaGost = Math.max(1, baseGost - c.homeAdv / 2);
  const ukupnoOcekivano = lambdaDom + lambdaGost;

  const sigmaTim = c.sigmaTim;
  const sigmaUkupno = c.sigmaDefault;
  const diff = lambdaDom - lambdaGost;

  const model: Record<string, number> = {};
  if (ulaz.sport === "kosarka") {
    const p1 = 1 / (1 + Math.exp(-c.k * diff));
    model["1"] = p1;
    model["2"] = 1 - p1;
    const pX = phi(0.5 / ((c as any).sigmaRazlika as number)) - phi(-0.5 / ((c as any).sigmaRazlika as number));
    model["X"] = Math.max(0.04, Math.min(0.12, pX));
  } else {
    const sdDiff = ((c as any).sigmaDiffDefault as number);
    const pX = Math.max(0.07, Math.min(0.13, phi((0.5 - diff) / sdDiff) - phi((-0.5 - diff) / sdDiff)));
    const ostatak = 1 - pX;
    const p1Raw = 1 / (1 + Math.exp(-c.k * diff));
    model["1"] = ostatak * p1Raw;
    model["X"] = pX;
    model["2"] = ostatak * (1 - p1Raw);
  }

  const linija = ulaz.linijaKladionice ?? ulaz.linija ?? null;
  const ld = ulaz.linijaDomKladionice ?? ulaz.linijaDom ?? null;
  const lg = ulaz.linijaGostKladionice ?? ulaz.linijaGost ?? null;

  if (linija != null) {
    const pOver = 1 - phi((linija - ukupnoOcekivano) / sigmaUkupno);
    model["over"] = Math.max(0.05, Math.min(0.95, pOver));
    model["under"] = 1 - model["over"]!;
  }
  if (ld != null) {
    const pOver = 1 - phi((ld - lambdaDom) / sigmaTim);
    model["dom_over"] = Math.max(0.05, Math.min(0.95, pOver));
    model["dom_under"] = 1 - model["dom_over"]!;
  }
  if (lg != null) {
    const pOver = 1 - phi((lg - lambdaGost) / sigmaTim);
    model["gost_over"] = Math.max(0.05, Math.min(0.95, pOver));
    model["gost_under"] = 1 - model["gost_over"]!;
  }

  const market: Record<string, number> = {
    ...devigProporcionalno(ulaz.kvote, ulaz.sport === "rukomet" ? ["1", "X", "2"] : ["1", "2"]),
    ...devigProporcionalno(ulaz.kvote, ["over", "under"]),
    ...devigProporcionalno(ulaz.kvote, ["overDom", "underDom"]),
    ...devigProporcionalno(ulaz.kvote, ["overGost", "underGost"]),
  };

  const knjiga = ulaz.brojKladionica ?? (Object.keys(ulaz.kvote).length > 0 ? 3 : 0);
  const wMarket = knjiga >= 5 ? 0.65 : knjiga >= 2 ? 0.5 : knjiga === 1 ? 0.35 : 0;
  const final: Record<string, number> = {};
  for (const k of Object.keys(model)) {
    const mP = model[k]!;
    const mkP = market[k];
    final[k] = mkP != null ? (1 - wMarket) * mP + wMarket * mkP : mP;
  }

  const fairOdds: Record<string, number> = {};
  const edge: Record<string, number> = {};
  const kelly: Record<string, number> = {};
  for (const k of Object.keys(final)) {
    const p = final[k]!;
    if (p > 0) fairOdds[k] = Math.round((1 / p) * 100) / 100;
    const kv = ulaz.kvote[k];
    if (kv && kv > 1) {
      const e = p * kv - 1;
      edge[k] = e;
      const b = kv - 1;
      const kFrac = b > 0 ? Math.max(0, (b * p - (1 - p)) / b) : 0;
      kelly[k] = Math.round(Math.min(3, (kFrac / 4) * 100) * 10) / 10;
    }
  }

  let topKljuc: string | null = null;
  let maxEdge = -1;
  for (const k of Object.keys(edge)) {
    if (edge[k]! > maxEdge && final[k]! >= 0.35) {
      maxEdge = edge[k]!;
      topKljuc = k;
    }
  }

  // Ako nema value edge-a ≥ 2% ili nema vanjskih kvota, biraj ishod s najvišom vjerojatnošću modela (≥ 50%)
  if (!topKljuc || maxEdge < 0.02) {
    let bestP = -1;
    for (const k of Object.keys(final)) {
      if (final[k]! > bestP) {
        bestP = final[k]!;
        topKljuc = k;
      }
    }
  }

  const tip = topKljuc && final[topKljuc] != null
    ? {
        kljuc: topKljuc,
        label:
          topKljuc === "1"
            ? "Pobjeda domaćina"
            : topKljuc === "2"
            ? "Pobjeda gosta"
            : topKljuc === "X"
            ? "Neriješeno"
            : topKljuc === "over"
            ? `Više od ${linija ?? ""}`
            : topKljuc === "under"
            ? `Manje od ${linija ?? ""}`
            : topKljuc,
        p: final[topKljuc]!,
        kvota: ulaz.kvote[topKljuc] ?? fairOdds[topKljuc] ?? (1 / Math.max(0.01, final[topKljuc]!)),
        edge: edge[topKljuc] ?? 0.02,
        ev: Math.round((edge[topKljuc] ?? 0.02) * 1000) / 10,
        kellyPct: kelly[topKljuc] ?? 1,
      }
    : null;

  const tipovi: SportTipTrzista[] = [];
  const jedinica = ulaz.sport === "kosarka" ? "poena" : "golova";

  const dodajTipTrzista = (
    trziste: "1x2" | "ukupno" | "dom" | "gost",
    naslov: string,
    kljucevi: string[],
    trLinija: number | null,
  ) => {
    let bestK: string | null = null;
    let bestEdge = -Infinity;
    let bestP = -Infinity;

    for (const k of kljucevi) {
      const e = edge[k];
      const p = final[k] ?? 0;
      if (e != null && e >= 0.02 && e > bestEdge) {
        bestEdge = e;
        bestK = k;
      }
      if (p > bestP) {
        bestP = p;
        if (bestK == null) bestK = k;
      }
    }

    if (!bestK) return;
    const p = final[bestK] ?? 0.5;
    const kv = ulaz.kvote[bestK] ?? null;
    const fer = fairOdds[bestK] ?? (p > 0 ? 1 / p : 2);
    const edg = edge[bestK] ?? null;

    let lbl = bestK;
    if (bestK === "1") lbl = "Pobjeda domaćina";
    else if (bestK === "2") lbl = "Pobjeda gosta";
    else if (bestK === "X") lbl = "Neriješeno";
    else if (bestK === "over" || bestK === "dom_over" || bestK === "gost_over") lbl = `Više od ${trLinija ?? ""}`;
    else if (bestK === "under" || bestK === "dom_under" || bestK === "gost_under") lbl = `Manje od ${trLinija ?? ""}`;

    tipovi.push({
      trziste,
      naslov,
      kljuc: bestK,
      label: lbl,
      linija: trLinija,
      p,
      kvota: kv,
      fer,
      edge: edg,
      izvor: kv ? "tržište" : "model",
      vrijednost: edg != null && edg >= 0.02,
    });
  };

  dodajTipTrzista("1x2", ulaz.sport === "kosarka" ? "Pobjednik (uklj. produžetke)" : "Konačni ishod 1 X 2", ulaz.sport === "rukomet" ? ["1", "X", "2"] : ["1", "2"], null);
  dodajTipTrzista("ukupno", `Ukupno ${jedinica}`, ["over", "under"], linija);
  dodajTipTrzista("dom", `Zbroj ${jedinica} domaćina`, ["dom_over", "dom_under"], ld);
  dodajTipTrzista("gost", `Zbroj ${jedinica} gosta`, ["gost_over", "gost_under"], lg);

  const uzorak = Math.min(dom?.odigrano ?? 0, gost?.odigrano ?? 0);
  const povjerenje = Math.round(Math.max(0, Math.min(100, 25 + Math.min(40, uzorak * 4) + Math.min(25, knjiga * 5))));
  const ocjena = povjerenje >= 80 ? "A+" : povjerenje >= 65 ? "A" : povjerenje >= 50 ? "B+" : "B";

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
    tipovi,
    sigmaTim,
    povjerenje,
    ocjena,
    upozorenja,
    faktori,
  };
}

/** Alias za potpunu kompatibilnost sa svim pozivima. */
export const analizirajSportUtakmicu = sportAnaliza;
