import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Zlatni tip — API-Football (api-sports.io) pristup.
 * - getZtFixtures: TOČNO 1 poziv = sve utakmice dana.
 * - getZtMatch: bet365 kvote (bookmaker=8) + statistika timova (predictions) = 2 poziva po utakmici.
 * Svaki odgovor vraća stanje limita iz zaglavlja kako bi klijentska zaštita mogla stati na vrijeme.
 */
const BASE = "https://v3.football.api-sports.io";
const TZ = "Europe/Zagreb";
const BET365 = 8;

export type RateInfo = { dayRemaining: number; dayLimit: number; minuteRemaining: number; status: number };
type CallResult = { error: string | null; data: any; rate: RateInfo };

function cleanKey(k?: string | null) {
  const v = (k?.trim() || process.env["API_FOOTBALL_KEY"]?.trim() || "").replace(/^["']|["']$/g, "");
  return v || null;
}

async function call(path: string, apiKey?: string): Promise<CallResult> {
  const rate: RateInfo = { dayRemaining: -1, dayLimit: -1, minuteRemaining: -1, status: 0 };
  const key = cleanKey(apiKey);
  if (!key) return { error: "Nedostaje API-Football ključ (⚙️ Postavke).", data: null, rate };
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
    rate.status = res.status;
    rate.dayRemaining = Number(res.headers.get("x-ratelimit-requests-remaining") ?? -1);
    rate.dayLimit = Number(res.headers.get("x-ratelimit-requests-limit") ?? -1);
    rate.minuteRemaining = Number(res.headers.get("x-ratelimit-remaining") ?? -1);
    if (res.status === 429) return { error: "RATE_LIMIT", data: null, rate };
    if (!res.ok) return { error: `API greška ${res.status}`, data: null, rate };
    const json = (await res.json()) as { errors?: any; response?: any };
    const errs = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length);
    if (errs) {
      const txt = JSON.stringify(json.errors);
      if (/rate ?limit|too many|requests/i.test(txt)) return { error: "RATE_LIMIT", data: null, rate };
      if (/suspend|token|key/i.test(txt)) return { error: `ACCOUNT: ${txt}`, data: null, rate };
      return { error: txt, data: null, rate };
    }
    return { error: null, data: json.response, rate };
  } catch (e: any) {
    return { error: `Mrežna greška: ${e?.message ?? "nepoznato"}`, data: null, rate };
  }
}

export type ZtFixture = {
  id: number;
  time: string;
  status: string;
  league: string;
  leagueId: number;
  season: number;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
};

export const getZtFixtures = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const r = await call(`/fixtures?date=${data.date}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
    const fixtures: ZtFixture[] = ((r.data as any[]) ?? []).map((f) => ({
      id: f.fixture.id,
      time: f.fixture.date,
      status: f.fixture.status?.short ?? "NS",
      league: `${f.league.country} — ${f.league.name}`,
      leagueId: f.league.id,
      season: f.league.season,
      home: f.teams.home.name,
      away: f.teams.away.name,
      homeId: f.teams.home.id,
      awayId: f.teams.away.id,
    }));
    return { error: r.error, rate: r.rate, fixtures };
  });

/** Sve bet365 oklade: { "Goals Over/Under": { "Over 2.5": 1.85, ... }, ... } */
export type Bet365Markets = Record<string, Record<string, number>>;

export type TeamStats = {
  gfHome: number; gaHome: number; gfAway: number; gaAway: number;
  playedHome: number; playedAway: number;
  form: string; // npr. "WWDLW"
  cleanSheets: number; failedToScore: number; played: number;
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function teamStats(t: any): TeamStats | null {
  const l = t?.league;
  if (!l?.goals) return null;
  return {
    gfHome: num(l.goals.for?.average?.home),
    gaHome: num(l.goals.against?.average?.home),
    gfAway: num(l.goals.for?.average?.away),
    gaAway: num(l.goals.against?.average?.away),
    playedHome: num(l.fixtures?.played?.home),
    playedAway: num(l.fixtures?.played?.away),
    form: String(l.form ?? "").slice(-10),
    cleanSheets: num(l.clean_sheet?.total),
    failedToScore: num(l.failed_to_score?.total),
    played: num(l.fixtures?.played?.total),
  };
}

export const getZtMatch = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.number().int().positive(), apiKey: z.string().optional(), lite: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    // Jedan poziv za SVE kladionice: prednost bet365, inače kladionica s najviše tržišta.
    const o = await call(`/odds?fixture=${data.id}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
    if (o.error === "RATE_LIMIT" || o.error?.startsWith("ACCOUNT")) {
      return { error: o.error, statsError: null as string | null, rate: o.rate, markets: {} as Bet365Markets, bookmaker: null as string | null, home: null as TeamStats | null, away: null as TeamStats | null, calls: 1 };
    }
    const books: any[] = ((o.data as any[]) ?? []).flatMap((it) => it?.bookmakers ?? []);
    const chosen =
      books.find((b) => Number(b.id) === BET365) ??
      [...books].sort((a, b) => (b.bets?.length ?? 0) - (a.bets?.length ?? 0))[0];
    const markets: Bet365Markets = {};
    const bookmaker: string | null = chosen?.name ?? null;
    for (const bet of chosen?.bets ?? []) {
      const m: Record<string, number> = {};
      for (const v of bet.values ?? []) {
        const k = Number(v.odd);
        if (Number.isFinite(k) && k > 1) m[String(v.value).trim()] = k;
      }
      if (Object.keys(m).length) markets[String(bet.name).trim()] = m;
    }
    let home: TeamStats | null = null, away: TeamStats | null = null, statsError: string | null = null, rate = o.rate, calls = 1;
    if (!data.lite) {
      const p = await call(`/predictions?fixture=${data.id}`, data.apiKey);
      const pr = ((p.data as any[]) ?? [])[0];
      home = teamStats(pr?.teams?.home);
      away = teamStats(pr?.teams?.away);
      statsError = p.error;
      if (p.rate.dayRemaining >= 0) rate = p.rate;
      calls = 2;
    }
    return {
      error: o.error ?? (Object.keys(markets).length ? null : "Nijedna kladionica (ni bet365) još nije objavila kvote za ovu utakmicu."),
      statsError,
      rate,
      markets,
      bookmaker,
      home,
      away,
      calls,
    };
  });
