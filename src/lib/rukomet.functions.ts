import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** API-Handball (api-sports.io). Isti ključ, zaseban limit za rukomet. */
const BASE = "https://v1.handball.api-sports.io";
const TZ = "Europe/Zagreb";

export type RukometRate = {
  dayRemaining: number;
  dayLimit: number;
  minuteRemaining: number;
  status: number;
};

async function call(path: string, apiKey?: string) {
  const rate: RukometRate = { dayRemaining: -1, dayLimit: -1, minuteRemaining: -1, status: 0 };
  const key = (apiKey?.trim() || process.env["API_FOOTBALL_KEY"]?.trim() || "").replace(/^["']|["']$/g, "");
  if (!key) return { error: "Nedostaje API ključ (Postavke).", data: null as any, rate };

  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
    rate.status = res.status;
    rate.dayRemaining = Number(res.headers.get("x-ratelimit-requests-remaining") ?? -1);
    rate.dayLimit = Number(res.headers.get("x-ratelimit-requests-limit") ?? -1);
    rate.minuteRemaining = Number(res.headers.get("x-ratelimit-remaining") ?? -1);

    if (res.status === 429) return { error: "RATE_LIMIT", data: null, rate };
    if (!res.ok) return { error: `API greška ${res.status}`, data: null, rate };

    const json = (await res.json()) as { errors?: any; response?: any };
    const n = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length);
    if (n) {
      const txt = JSON.stringify(json.errors);
      if (/rate ?limit|too many|requests/i.test(txt)) return { error: "RATE_LIMIT", data: null, rate };
      if (/suspend|token|key/i.test(txt)) return { error: `ACCOUNT: ${txt}`, data: null, rate };
      return { error: txt, data: null, rate };
    }
    return { error: null as string | null, data: json.response, rate };
  } catch (e: any) {
    return { error: `Mrežna greška: ${e?.message ?? "nepoznato"}`, data: null, rate };
  }
}

export type RukometGame = {
  id: number;
  time: string;
  status: string;
  league: string;
  season: string;
  home: string;
  away: string;
};

export const getRukometGames = createServerFn({ method: "POST" })
  .validator((d: { date: string; apiKey?: string }) =>
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), apiKey: z.string().optional() }).parse(d)
  )
  .handler(async ({ data }) => {
    const r = await call(`/games?date=${data.date}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
    const games: RukometGame[] = ((r.data as any[]) ?? []).map((g) => ({
      id: Number(g.id),
      time: String(g.date || g.time || ""),
      status: String(g.status?.short ?? "NS"),
      league: `${g.country?.name ?? ""} — ${g.league?.name ?? ""}`,
      season: String(g.league?.season ?? ""),
      home: String(g.teams?.home?.name ?? "?"),
      away: String(g.teams?.away?.name ?? "?"),
    }));
    return { error: r.error, rate: r.rate, games };
  });

export type RukometMarkets = Record<string, Record<string, number>>;

/** Dohvat kvota: /odds?game=ID. Podržava i objekt i niz odgovora te spaja sva tržišta. */
export const getRukometOdds = createServerFn({ method: "POST" })
  .validator((d: { id: number; apiKey?: string }) =>
    z.object({ id: z.number().int().positive(), apiKey: z.string().optional() }).parse(d)
  )
  .handler(async ({ data }) => {
    const r = await call(`/odds?game=${data.id}`, data.apiKey);
    const resp = r.data;
    let books: any[] = [];

    if (Array.isArray(resp)) {
      books = resp.flatMap((it) => it?.bookmakers ?? (it?.bets ? [it] : []));
    } else if (resp && typeof resp === "object") {
      if (Array.isArray((resp as any).bookmakers)) {
        books = (resp as any).bookmakers;
      }
    }

    // Sortiraj kladionice po bogatstvu ponude i preferiraj poznatije kladionice
    const sorted = [...books].sort((a, b) => {
      const aP = /bet ?365|1xbet|unibet/i.test(String(a.name)) ? 100 : 0;
      const bP = /bet ?365|1xbet|unibet/i.test(String(b.name)) ? 100 : 0;
      return bP + (b.bets?.length ?? 0) - (aP + (a.bets?.length ?? 0));
    });

    const markets: RukometMarkets = {};
    for (const b of sorted) {
      for (const bet of b?.bets ?? []) {
        const name = String(bet.name).trim();
        if (!markets[name]) {
          const m: Record<string, number> = {};
          for (const v of bet.values ?? []) {
            const k = Number(v.odd);
            if (Number.isFinite(k) && k > 1) m[String(v.value).trim()] = k;
          }
          if (Object.keys(m).length) markets[name] = m;
        }
      }
    }

    const error =
      r.error ?? (Object.keys(markets).length ? null : "Kladionice još nisu objavile kvote za ovu rukometnu utakmicu.");
    return { error, rate: r.rate, markets, bookmaker: (sorted[0]?.name as string) ?? null };
  });

