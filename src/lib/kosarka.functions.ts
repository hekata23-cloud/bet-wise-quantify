import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** API-Basketball (api-sports.io). Isti ključ kao API-Football, zaseban dnevni limit. */
const BASE = "https://v1.basketball.api-sports.io";
const TZ = "Europe/Zagreb";

export type KosRate = { dayRemaining: number; dayLimit: number; minuteRemaining: number; status: number };

async function call(path: string, apiKey?: string) {
  const rate: KosRate = { dayRemaining: -1, dayLimit: -1, minuteRemaining: -1, status: 0 };
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

export type KosGame = {
  id: number; time: string; status: string; league: string; season: string;
  home: string; away: string;
};

export const getKosGames = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const r = await call(`/games?date=${data.date}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
    const games: KosGame[] = ((r.data as any[]) ?? []).map((g) => ({
      id: Number(g.id),
      time: String(g.date),
      status: String(g.status?.short ?? "NS"),
      league: `${g.country?.name ?? ""} — ${g.league?.name ?? ""}`,
      season: String(g.league?.season ?? ""),
      home: String(g.teams?.home?.name ?? "?"),
      away: String(g.teams?.away?.name ?? "?"),
    }));
    return { error: r.error, rate: r.rate, games };
  });

export type KosMarkets = Record<string, Record<string, number>>;

/** Jedan poziv: /odds?game=ID. Prednost Bet365, inače kladionica s najviše tržišta. */
export const getKosOdds = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive(), apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const r = await call(`/odds?game=${data.id}`, data.apiKey);
    const books: any[] = ((r.data as any[]) ?? []).flatMap((it) => it?.bookmakers ?? []);
    const chosen =
      books.find((b) => /bet ?365/i.test(String(b.name))) ??
      [...books].sort((a, b) => (b.bets?.length ?? 0) - (a.bets?.length ?? 0))[0];
    const markets: KosMarkets = {};
    for (const bet of chosen?.bets ?? []) {
      const m: Record<string, number> = {};
      for (const v of bet.values ?? []) {
        const k = Number(v.odd);
        if (Number.isFinite(k) && k > 1) m[String(v.value).trim()] = k;
      }
      if (Object.keys(m).length) markets[String(bet.name).trim()] = m;
    }
    const error = r.error ?? (Object.keys(markets).length ? null : "Kladionice još nisu objavile kvote za ovu utakmicu.");
    return { error, rate: r.rate, markets, bookmaker: (chosen?.name as string) ?? null };
  });
