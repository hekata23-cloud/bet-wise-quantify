/* ============================================================
   SPORTOVI.FUNCTIONS.TS — podaci za Košarka Pro i Rukomet Pro
   Izvori: v1.basketball.api-sports.io i v1.handball.api-sports.io
   (isti API-Sports ključ; svaki sport ima zasebnih 100 besplatnih
   poziva dnevno — otvori api-sports.io dashboard i pretplati
   besplatni plan za košarku i rukomet).
   Svi pozivi idu kroz sportovi-guard (red + keš + retry + stale),
   pa ove kartice NE MOGU oboriti dnevni limit.
   Izlaz: kvote (1, X?, 2 + over/under s linijom, MEDIAN konsenzus
   kladionica) + forma zadnjih 10 utakmica s razdvojkom doma/u gostima.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sportoviGet } from "./sportovi-guard.server";

const TZ = "Europe/Zagreb";

export type Sport = "kosarka" | "rukomet";

export type SportUtakmica = {
  id: number;
  time: string;
  league: string;
  country: string;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  leagueId: number;
  season: number;
};

/** Forma tima za košarku/rukomet (zadnjih 10, s razdvojbom i raspršenjem). */
export type SportForma = {
  odigrano: number;
  postignuti: number;   // ukupno postignuto u zadnjih N
  primljeni: number;    // ukupno primljeno u zadnjih N
  doma: { odigrano: number; postignuti: number; primljeni: number } | null;
  uGostima: { odigrano: number; postignuti: number; primljeni: number } | null;
  /** serija zadnjih utakmica (najnovija prva) — za trend i raspršenje */
  lista: { datum: string; doma: boolean; protivnik: string; post: number; prim: number }[];
  /** sd UKUPNOG broja bodova/golova u njegovim utakmicama (za O/U) */
  ukupnoSd: number;
  /** sd gol/bod RAZLIKE u njegovim utakmicama (za pX kod rukometa) */
  razlikaSd: number;
  trend: number; // + = igra bolje nego na početku serije (razlika posljednjih 5 vs prijašnjih)
};

export type SportBundle = {
  error: string | null;
  remaining: number;
  kvote: Record<string, number>;   // "1", "X" (rukomet), "2", "over", "under"
  linija: number | null;           // linija Over/Under (npr. 158.5 ili 55.5)
  knjiga: number;                  // koliko kladionica daje kvote
  formaDom: SportForma | null;
  formaGost: SportForma | null;
  bookmaker: string | null;
  upozorenja: string[];
};

const danjiSchema = z.object({
  sport: z.enum(["kosarka", "rukomet"]),
  date: z.string(),
  apiKey: z.string(),
});
const bundleSchema = z.object({
  sport: z.enum(["kosarka", "rukomet"]),
  id: z.number(),
  homeId: z.number(),
  awayId: z.number(),
  leagueId: z.number(),
  season: z.number(),
  apiKey: z.string(),
});

/** Završene utakmice po sportu (za formu i provjeru tipova). */
export const ZAVRSENE: Record<Sport, string[]> = {
  kosarka: ["FT", "AOT"],           // završeno / nakon produžetka
  rukomet: ["FT", "AOT", "AET"],    // završeno / produžetak / penali
};

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Iz odgovora /games izvuci naš oblik utakmice. */
function ocistiUtakmicu(g: any): SportUtakmica | null {
  const id = Number(g?.id);
  const home = g?.teams?.home?.name;
  const away = g?.teams?.away?.name;
  const leagueId = Number(g?.league?.id);
  if (!id || !home || !away || !leagueId) return null;
  return {
    id,
    time: String(g?.date ?? g?.time ?? ""),
    league: String(g?.league?.name ?? ""),
    country: String(g?.country?.name ?? g?.country ?? ""),
    home,
    away,
    homeId: Number(g?.teams?.home?.id ?? 0),
    awayId: Number(g?.teams?.away?.id ?? 0),
    leagueId,
    season: Number(g?.league?.season ?? 0),
  };
}

/** Rezultat jedne utakmice za formu (po sportu druge su polja). */
function rezultat(g: any, sport: Sport, teamId: number): { post: number; prim: number; doma: boolean } | null {
  let h: unknown;
  let a: unknown;
  if (sport === "kosarka") {
    h = g?.scores?.home?.total;
    a = g?.scores?.away?.total;
  } else {
    h = g?.scores?.home;
    a = g?.scores?.away;
  }
  const hs = Number(h);
  const as = Number(a);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs + as <= 0) return null;
  const doma = Number(g?.teams?.home?.id ?? -1) === teamId;
  return { post: doma ? hs : as, prim: doma ? as : hs, doma };
}

function sdi(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

function formaIzUtakmica(utakmice: any[], sport: Sport, teamId: number, teamName: string): SportForma | null {
  const zavr: { datum: string; doma: boolean; protivnik: string; post: number; prim: number }[] = [];
  for (const g of utakmice) {
    const short = String(g?.status?.short ?? "");
    if (!ZAVRSENE[sport].includes(short)) continue;
    const r = rezultat(g, sport, teamId);
    if (!r) continue;
    zavr.push({
      datum: String(g?.date ?? ""),
      doma: r.doma,
      protivnik: r.doma ? String(g?.teams?.away?.name ?? "") : String(g?.teams?.home?.name ?? ""),
      post: r.post,
      prim: r.prim,
    });
  }
  if (!zavr.length) return null;
  zavr.sort((x, y) => (x.datum < y.datum ? 1 : -1)); // najnovija prva
  const zad = zavr.slice(0, 10);
  const agg = (f: typeof zad) => ({
    odigrano: f.length,
    postignuti: f.reduce((a, b) => a + b.post, 0),
    primljeni: f.reduce((a, b) => a + b.prim, 0),
  });
  const doma = zad.filter((x) => x.doma);
  const uGostima = zad.filter((x) => !x.doma);
  const ukupna = zad.map((x) => x.post + x.prim);
  const razlike = zad.map((x) => x.post - x.prim);
  const pol = Math.min(5, zad.length);
  const novije = zad.slice(0, pol);
  const starije = zad.slice(pol);
  const trend =
    starije.length >= 3
      ? novije.reduce((a, b) => a + (b.post - b.prim), 0) / novije.length -
        starije.reduce((a, b) => a + (b.post - b.prim), 0) / starije.length
      : 0;
  return {
    ...agg(zad),
    doma: doma.length ? agg(doma) : null,
    uGostima: uGostima.length ? agg(uGostima) : null,
    lista: zad,
    ukupnoSd: sdi(ukupna),
    razlikaSd: sdi(razlike),
    trend,
  };
}

/** Kvote: MEDIAN po ishodu preko svih kladionica (otporno na iskočenu kvotu). */
function kvoteIzOdds(oddsResp: any[], sport: Sport): {
  kvote: Record<string, number>;
  linija: number | null;
  knjiga: number;
  bookmaker: string | null;
} {
  const o1: number[] = [];
  const oX: number[] = [];
  const o2: number[] = [];
  const oOver: number[] = [];
  const oUnder: number[] = [];
  const linije: number[] = [];
  let knjiga = 0;
  let bookmaker: string | null = null;

  for (const r of oddsResp ?? []) {
    for (const bk of r?.bookmakers ?? []) {
      let imaWinner = false;
      let imaTotals = false;
      for (const bet of bk?.bets ?? []) {
        const ime = String(bet?.name ?? "").toLowerCase();
        const values: any[] = bet?.values ?? [];
        if (/home\s*\/?\s*away|match\s*winner|1x2|winner\b/.test(ime)) {
          let d1 = 0, dX = 0, d2 = 0;
          for (const v of values) {
            const lab = String(v?.value ?? "").toLowerCase();
            const odd = Number(v?.odd);
            if (!Number.isFinite(odd) || odd <= 1) continue;
            if (/^home$|^1$/.test(lab)) d1 = odd;
            else if (/^draw$|^x$/.test(lab)) dX = odd;
            else if (/^away$|^2$/.test(lab)) d2 = odd;
          }
          if (d1 > 1 && d2 > 1) {
            o1.push(d1);
            o2.push(d2);
            if (dX > 1) oX.push(dX);
            imaWinner = true;
            if (!bookmaker) bookmaker = String(bk?.name ?? "");
          }
        }
        if (/over\s*\/?\s*under|totals?\b|total\s*points?\b|total\s*goals?\b/.test(ime)) {
          let dO = 0, dU = 0, linija: number | null = null;
          for (const v of values) {
            const lab = String(v?.value ?? "").toLowerCase();
            const odd = Number(v?.odd);
            if (!Number.isFinite(odd) || odd <= 1) continue;
            const hc = Number(v?.handicap);
            const izTeksta = Number(String(v?.value ?? "").match(/(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
            const l = Number.isFinite(hc) ? hc : izTeksta;
            if (/^over$|^over\s*[\d.]+/.test(lab)) { dO = odd; if (l != null && Number.isFinite(l)) linija = l; }
            else if (/^under$|^under\s*[\d.]+/.test(lab)) { dU = odd; if (l != null && Number.isFinite(l) && linija == null) linija = l; }
          }
          if (dO > 1 && dU > 1 && linija != null) {
            oOver.push(dO);
            oUnder.push(dU);
            linije.push(linija);
            imaTotals = true;
          }
        }
      }
      if (imaWinner || imaTotals) knjiga++;
    }
  }

  const kvote: Record<string, number> = {};
  if (o1.length) { kvote["1"] = median(o1); kvote["2"] = median(o2); }
  if (oX.length) kvote["X"] = median(oX);
  let linija: number | null = linije.length ? median(linije) : null;
  // košarka: drži se svake linije — ako se linije razlikuju, uzmi median ali
  // upozori motor; rukomet isto (linija 0.5 koraka).
  if (oOver.length && linija != null) { kvote["over"] = median(oOver); kvote["under"] = median(oUnder); }
  if (sport === "rukomet" && linija != null && linija < 20) linija = null; // sumnjivo mala linija → odbaci
  return { kvote, linija, knjiga, bookmaker };
}

export const getSportUtakmice = createServerFn({ method: "GET" })
  .inputValidator((d) => danjiSchema.parse(d))
  .handler(async ({ data }) => {
    const empty = { error: null as string | null, utakmice: [] as SportUtakmica[], remaining: -1 };
    try {
      const r = await sportoviGet(data.sport, `/games?date=${data.date}&timezone=${encodeURIComponent(TZ)}`, {
        apiKey: data.apiKey,
        ttlMs: 5 * 60_000,
      });
      if (r.error) return { ...empty, error: r.error, remaining: r.remainingDay };
      const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
      const utakmice = resp
        .filter((g) => String(g?.status?.short ?? "") === "NS") // samo nadolazeće
        .map(ocistiUtakmicu)
        .filter((u): u is SportUtakmica => u != null)
        .sort((a, b) => (a.time < b.time ? -1 : 1));
      return { ...empty, utakmice, remaining: r.remainingDay };
    } catch (e) {
      return { ...empty, error: e instanceof Error ? e.message : "Greška dohvata" };
    }
  });

export const getSportBundle = createServerFn({ method: "POST" })
  .inputValidator((d) => bundleSchema.parse(d))
  .handler(async ({ data }): Promise<SportBundle> => {
    const upozorenja: string[] = [];
    const out = {
      error: null as string | null,
      remaining: -1,
      kvote: {} as Record<string, number>,
      linija: null as number | null,
      knjiga: 0,
      formaDom: null as SportForma | null,
      formaGost: null as SportForma | null,
      bookmaker: null as string | null,
      upozorenja,
    };

    // 1) forma timova — zadnjih 10 završenih utakmica (keš 6 h)
    const formaZa = async (teamId: number, teamName: string) => {
      const p = `/games?team=${teamId}&season=${data.season}&league=${data.leagueId}`;
      let r = await sportoviGet(data.sport, p, { apiKey: data.apiKey, ttlMs: 6 * 60 * 60_000 });
      if (!r.error && !(Array.isArray(r.data) && r.data.length)) {
        // neke lige/sezoni ne vole league filter — pokušaj bez njega
        r = await sportoviGet(data.sport, `/games?team=${teamId}&season=${data.season}`, {
          apiKey: data.apiKey,
          ttlMs: 6 * 60 * 60_000,
        });
      }
      if (r.error) {
        upozorenja.push(`Forma ${teamName}: ${r.error}`);
        return null;
      }
      const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
      return formaIzUtakmica(resp, data.sport, teamId, teamName);
    };
    out.formaDom = await formaZa(data.homeId, "domaćina");
    out.formaGost = await formaZa(data.awayId, "gosta");
    if (!out.formaDom && !out.formaGost)
      upozorenja.push("Nema dovoljno završenih utakmica za forme — analiza je ograničena.");

    // 2) kvote (keš 10 min)
    const ro = await sportoviGet(data.sport, `/odds?game=${data.id}`, { apiKey: data.apiKey });
    if (ro.error) {
      upozorenja.push(`Kvote: ${ro.error}`);
    } else {
      const resp = Array.isArray(ro.data) ? (ro.data as any[]) : [];
      const k = kvoteIzOdds(resp, data.sport);
      out.kvote = k.kvote;
      out.linija = k.linija;
      out.knjiga = k.knjiga;
      out.bookmaker = k.bookmaker;
      if (!k.knjiga) upozorenja.push("Kladionice još ne daju kvote za ovu utakmicu — analiza je samo iz forme.");
    }
    out.remaining = ro.remainingDay;
    return out;
  });
