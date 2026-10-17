/* ============================================================
   SPORTOVI FUNCTIONS — TanStack Start server functions za
   Košarku PRO i Rukomet PRO.
   Kvote se filtriraju s apsolutnim prioritetom za Bet365.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import {
  dohvatiUtakmiceSport,
  dohvatiOddsSport,
  dohvatiH2HSport,
  statusSportova,
  type Sport,
} from "./sportovi-guard.server";
import {
  analizirajSportUtakmicu,
  type SportUtakmica,
  type SportIzlaz,
} from "./sportovi-motor";

export type { SportUtakmica, SportIzlaz };

export type SportBundle = {
  kvote: Record<string, number>;
  linija: number | null;
  linijaDom: number | null;
  linijaGost: number | null;
  knjiga: number;
  bookmaker: string | null;
  formaDom: any | null;
  formaGost: any | null;
  error?: string;
  upozorenja: string[];
};

function normalizirajKosarku(raw: any): SportUtakmica | null {
  try {
    const id = Number(raw?.id);
    if (!id) return null;
    const date = String(raw?.date ?? "");
    const time = String(raw?.time ?? "");
    const timestamp = Number(raw?.timestamp ?? 0) * 1000 || (date ? new Date(date).getTime() : Date.now());

    const league = raw?.league ?? {};
    const teams = raw?.teams ?? {};
    const scores = raw?.scores ?? {};
    const status = raw?.status ?? {};

    return {
      id,
      sport: "kosarka",
      datumIso: date || new Date(timestamp).toISOString(),
      pocetakFormatirano: time || (date ? date.slice(11, 16) : "--:--"),
      timestamp,
      ligaId: Number(league?.id ?? 0),
      ligaNaziv: String(league?.name ?? "Košarka"),
      ligaZemlja: String(league?.country?.name ?? league?.country ?? ""),
      ligaSezona: String(league?.season ?? ""),
      domacinId: Number(teams?.home?.id ?? 0),
      domacinNaziv: String(teams?.home?.name ?? "Domaćin"),
      domacinLogo: teams?.home?.logo ?? null,
      gostId: Number(teams?.away?.id ?? 0),
      gostNaziv: String(teams?.away?.name ?? "Gost"),
      gostLogo: teams?.away?.logo ?? null,
      statusShort: String(status?.short ?? "NS"),
      statusLong: String(status?.long ?? ""),
      rezultatDomacin: scores?.home?.total != null ? Number(scores.home.total) : null,
      rezultatGost: scores?.away?.total != null ? Number(scores.away.total) : null,
      detalji: {
        cetvrtineDom: [scores?.home?.quarter_1, scores?.home?.quarter_2, scores?.home?.quarter_3, scores?.home?.quarter_4],
        cetvrtineGost: [scores?.away?.quarter_1, scores?.away?.quarter_2, scores?.away?.quarter_3, scores?.away?.quarter_4],
        produzetakDom: scores?.home?.over_time != null ? Number(scores.home.over_time) : null,
        produzetakGost: scores?.away?.over_time != null ? Number(scores.away.over_time) : null,
      },
    };
  } catch {
    return null;
  }
}

function normalizirajRukomet(raw: any): SportUtakmica | null {
  try {
    const id = Number(raw?.id);
    if (!id) return null;
    const date = String(raw?.date ?? "");
    const time = String(raw?.time ?? "");
    const timestamp = Number(raw?.timestamp ?? 0) * 1000 || (date ? new Date(date).getTime() : Date.now());

    const league = raw?.league ?? {};
    const teams = raw?.teams ?? {};
    const scores = raw?.scores ?? {};
    const periods = raw?.periods ?? {};
    const status = raw?.status ?? {};

    return {
      id,
      sport: "rukomet",
      datumIso: date || new Date(timestamp).toISOString(),
      pocetakFormatirano: time || (date ? date.slice(11, 16) : "--:--"),
      timestamp,
      ligaId: Number(league?.id ?? 0),
      ligaNaziv: String(league?.name ?? "Rukomet"),
      ligaZemlja: String(league?.country?.name ?? league?.country ?? ""),
      ligaSezona: String(league?.season ?? ""),
      domacinId: Number(teams?.home?.id ?? 0),
      domacinNaziv: String(teams?.home?.name ?? "Domaćin"),
      domacinLogo: teams?.home?.logo ?? null,
      gostId: Number(teams?.away?.id ?? 0),
      gostNaziv: String(teams?.away?.name ?? "Gost"),
      gostLogo: teams?.away?.logo ?? null,
      statusShort: String(status?.short ?? "NS"),
      statusLong: String(status?.long ?? ""),
      rezultatDomacin: scores?.home != null ? Number(scores.home) : null,
      rezultatGost: scores?.away != null ? Number(scores.away) : null,
      detalji: {
        poluvrijeme1Dom: periods?.first?.home != null ? Number(periods.first.home) : null,
        poluvrijeme1Gost: periods?.first?.away != null ? Number(periods.first.away) : null,
        poluvrijeme2Dom: periods?.second?.home != null ? Number(periods.second.home) : null,
        poluvrijeme2Gost: periods?.second?.away != null ? Number(periods.second.away) : null,
      },
    };
  } catch {
    return null;
  }
}

function medianBrojeva(arr: number[]): number | null {
  const cisti = arr.filter((x) => Number.isFinite(x) && x > 1).sort((a, b) => a - b);
  if (cisti.length === 0) return null;
  const m = Math.floor(cisti.length / 2);
  const v = cisti.length % 2 === 1 ? cisti[m]! : (cisti[m - 1]! + cisti[m]!) / 2;
  return Math.round(v * 100) / 100;
}

function kategorijaOU(naziv: string): "ukupno" | "domacin" | "gost" | null {
  const s = naziv.toLowerCase();
  if (s.includes("home") || s.includes("doma") || s.includes("team 1") || s.includes("team1")) {
    if (s.includes("over") || s.includes("under") || s.includes("total")) return "domacin";
  }
  if (s.includes("away") || s.includes("gost") || s.includes("team 2") || s.includes("team2")) {
    if (s.includes("over") || s.includes("under") || s.includes("total")) return "gost";
  }
  if (s.includes("over/under") || s.includes("total points") || s.includes("total goals") || s.includes("total") || s.includes("goals over")) {
    return "ukupno";
  }
  return null;
}

function nadjiNajboljuLiniju(values: any[]): { linija: number; over: number; under: number } | null {
  const po = new Map<number, { over?: number; under?: number }>();
  for (const v of values ?? []) {
    const lab = String(v?.value ?? "").toLowerCase().trim();
    const odd = Number(v?.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    const hc = Number(v?.handicap);
    const izTeksta = Number(lab.match(/(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
    const l = Number.isFinite(hc) && hc > 0 ? hc : izTeksta;
    if (!Number.isFinite(l) || l <= 0) continue;
    const e = po.get(l) ?? {};
    if (/^over/.test(lab)) e.over = odd;
    else if (/^under/.test(lab)) e.under = odd;
    else continue;
    po.set(l, e);
  }
  let best: { linija: number; over: number; under: number } | null = null;
  for (const [l, e] of po) {
    if (!e.over || !e.under) continue;
    if (!best || Math.abs(e.over - e.under) < Math.abs(best.over - best.under)) {
      best = { linija: l, over: e.over, under: e.under };
    }
  }
  return best;
}

type TrzisteOU = { over: number[]; under: number[]; linije: number[] };
const noviOU = (): TrzisteOU => ({ over: [], under: [], linije: [] });

function kvoteIzOdds(oddsResp: any[], sport: Sport): {
  kvote: Record<string, number>;
  linija: number | null;
  linijaDom: number | null;
  linijaGost: number | null;
  knjiga: number;
  bookmaker: string | null;
} {
  const ml1: number[] = [];
  const ml2: number[] = [];
  const w1: number[] = [];
  const wX: number[] = [];
  const w2: number[] = [];
  const uk = noviOU();
  const dm = noviOU();
  const gs = noviOU();
  let bookmaker: string | null = null;
  let knjiga = 0;

  // Bet365 ima apsolutnu prednost: ako ga ima, koriste se SAMO njegove kvote.
  const sve: any[] = (oddsResp ?? []).flatMap((it: any) => (Array.isArray(it?.bookmakers) ? it.bookmakers : []));
  const b365 = sve.filter((b) => /bet ?365/i.test(String(b?.name ?? "")));
  const odabrane = b365.length ? b365 : sve;
  if (b365.length) {
    bookmaker = "Bet365";
  }

  for (const bm of odabrane) {
    knjiga++;
    if (!bookmaker && bm?.name) bookmaker = String(bm.name);
    const bets = Array.isArray(bm?.bets) ? bm.bets : [];
    for (const bet of bets) {
      const name = String(bet?.name ?? "").toLowerCase();
      const vals = Array.isArray(bet?.values) ? bet.values : [];
      if (name.includes("quarter") || name.includes("half") || name.includes("period") || name.includes("poluvrijeme") || name.includes("četvrtina") || name.includes("handicap") || name.includes("azijski")) {
        continue;
      }
      if (name === "home/away" || name === "winner" || name === "match winner" || name === "pobjednik") {
        for (const v of vals) {
          const val = String(v?.value ?? "").toLowerCase();
          const odd = Number(v?.odd);
          if (!Number.isFinite(odd) || odd <= 1) continue;
          if (val === "home" || val === "1") ml1.push(odd);
          else if (val === "away" || val === "2") ml2.push(odd);
        }
        continue;
      }
      if (name === "match winner 3-way" || name === "3way result" || name === "1x2" || name === "regular time result") {
        for (const v of vals) {
          const val = String(v?.value ?? "").toLowerCase();
          const odd = Number(v?.odd);
          if (!Number.isFinite(odd) || odd <= 1) continue;
          if (val === "home" || val === "1") w1.push(odd);
          else if (val === "draw" || val === "x" || val === "tie") wX.push(odd);
          else if (val === "away" || val === "2") w2.push(odd);
        }
        continue;
      }
      const kat = kategorijaOU(name);
      if (kat) {
        const l = nadjiNajboljuLiniju(vals);
        if (l) {
          const meta = kat === "domacin" ? dm : kat === "gost" ? gs : uk;
          meta.linije.push(l.linija);
          meta.over.push(l.over);
          meta.under.push(l.under);
        }
      }
    }
  }

  const kvote: Record<string, number> = {};
  const setKv = (k: string, arr: number[]) => {
    const m = medianBrojeva(arr);
    if (m) kvote[k] = m;
  };

  setKv("1", ml1);
  setKv("2", ml2);
  if (!kvote["1"]) setKv("1", w1);
  if (!kvote["2"]) setKv("2", w2);
  setKv("1reg", w1);
  setKv("X", wX);
  setKv("2reg", w2);
  if (sport === "rukomet") {
    if (kvote["1reg"]) kvote["1"] = kvote["1reg"];
    if (kvote["2reg"]) kvote["2"] = kvote["2reg"];
  }

  const medLinUk = medianBrojeva(uk.linije);
  if (medLinUk) {
    setKv("over", uk.over);
    setKv("under", uk.under);
  }
  const medLinDom = medianBrojeva(dm.linije);
  if (medLinDom) {
    setKv("overDom", dm.over);
    setKv("underDom", dm.under);
  }
  const medLinGost = medianBrojeva(gs.linije);
  if (medLinGost) {
    setKv("overGost", gs.over);
    setKv("underGost", gs.under);
  }

  return {
    kvote,
    linija: medLinUk,
    linijaDom: medLinDom,
    linijaGost: medLinGost,
    knjiga,
    bookmaker,
  };
}

export const dohvatiSportUtakmiceServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown): { sport: Sport; date: string; apiKey?: string } => {
    const obj = (d ?? {}) as any;
    const sport: Sport = obj.sport === "rukomet" ? "rukomet" : "kosarka";
    const date = typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)
      ? obj.date
      : new Date().toISOString().slice(0, 10);
    return { sport, date, apiKey: typeof obj.apiKey === "string" ? obj.apiKey.trim() : undefined };
  })
  .handler(async ({ data }) => {
    const res = await dohvatiUtakmiceSport(data.sport, data.date, data.apiKey);
    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code, utakmice: [] };
    }
    const norm = data.sport === "kosarka" ? normalizirajKosarku : normalizirajRukomet;
    const utakmice: SportUtakmica[] = (res.data ?? [])
      .map(norm)
      .filter((u: SportUtakmica | null): u is SportUtakmica => u !== null);

    return {
      ok: true,
      sport: data.sport,
      date: data.date,
      count: utakmice.length,
      utakmice,
    };
  });

export const analizirajSportUtakmicuServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown): { sport: Sport; utakmica: SportUtakmica; apiKey?: string } => {
    const obj = (d ?? {}) as any;
    if (!obj?.utakmica?.id) throw new Error("Nedostaje utakmica");
    const sport: Sport = obj.sport === "rukomet" ? "rukomet" : "kosarka";
    return { sport, utakmica: obj.utakmica, apiKey: typeof obj.apiKey === "string" ? obj.apiKey.trim() : undefined };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; izlaz?: SportIzlaz; error?: string }> => {
    const { sport, utakmica, apiKey } = data;
    const oddsRes = await dohvatiOddsSport(sport, utakmica.id, apiKey);
    const parsed = oddsRes.ok ? kvoteIzOdds(oddsRes.data, sport) : {
      kvote: {},
      linija: null,
      linijaDom: null,
      linijaGost: null,
      knjiga: 0,
      bookmaker: null,
    };

    if (!oddsRes.ok) return { ok: false, error: oddsRes.error ?? "Dohvat kvota nije uspio." };
    if (!Object.keys(parsed.kvote).length)
      return { ok: false, error: "Bet365 i ostale kladionice još nisu objavile kvote za ovu utakmicu — tip bi bio nagađanje, pa ga ne prikazujem." };

    let h2hGoloviDom: number[] = [];
    let h2hGoloviGost: number[] = [];

    // H2H je opcionalan — ako limit nastupi, NE rušimo analizu jer kvote imamo!
    if (utakmica.domacinId && utakmica.gostId) {
      try {
        const h2hRes = await dohvatiH2HSport(sport, utakmica.domacinId, utakmica.gostId, apiKey);
        if (h2hRes.ok && Array.isArray(h2hRes.data)) {
          for (const m of h2hRes.data.slice(0, 10)) {
            const domJePrvi = m?.teams?.home?.id === utakmica.domacinId;
            const dScore = domJePrvi ? m?.scores?.home?.total ?? m?.scores?.home : m?.scores?.away?.total ?? m?.scores?.away;
            const gScore = domJePrvi ? m?.scores?.away?.total ?? m?.scores?.away : m?.scores?.home?.total ?? m?.scores?.home;
            if (dScore != null && gScore != null) {
              h2hGoloviDom.push(Number(dScore));
              h2hGoloviGost.push(Number(gScore));
            }
          }
        }
      } catch {
        // Ignoriraj grešku H2H poziva radi očuvanja analize
      }
    }

    const izlaz = analizirajSportUtakmicu({
      sport,
      utakmica,
      kvote: parsed.kvote,
      linijaKladionice: parsed.linija,
      linijaDomKladionice: parsed.linijaDom,
      linijaGostKladionice: parsed.linijaGost,
      h2hGoloviDom,
      h2hGoloviGost,
    });

    izlaz.bookmaker = parsed.bookmaker;
    return { ok: true, izlaz };
  });

export const getSportUtakmice = dohvatiSportUtakmiceServer;
export const getSportBundle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as any)
  .handler(async ({ data }) => {
    const sport: Sport = data?.sport === "rukomet" ? "rukomet" : "kosarka";
    const id = Number(data?.id);
    const oddsRes = await dohvatiOddsSport(sport, id, typeof data?.apiKey === "string" ? data.apiKey.trim() : undefined);
    const parsed = oddsRes.ok ? kvoteIzOdds(oddsRes.data, sport) : {
      kvote: {},
      linija: null,
      linijaDom: null,
      linijaGost: null,
      knjiga: 0,
      bookmaker: null,
    };
    return {
      kvote: parsed.kvote,
      linija: parsed.linija,
      linijaDom: parsed.linijaDom,
      linijaGost: parsed.linijaGost,
      knjiga: parsed.knjiga,
      bookmaker: parsed.bookmaker,
      formaDom: null,
      formaGost: null,
      upozorenja: oddsRes.error ? [oddsRes.error] : [],
    };
  });

export const statusSportovaServer = createServerFn({ method: "GET" })
  .handler(async () => {
    return statusSportova();
  });


