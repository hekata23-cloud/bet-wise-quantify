import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardGet } from "./api-guard.server";

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
  // api-guard: red čekanja + keš + retry + stale rezerva. Poruke RATE_LIMIT i
  // "ACCOUNT: ..." ostaju identične — klijentska logika na njih pazi.
  const r = await guardGet(path, { apiKey: key });
  return {
    error: r.error,
    data: r.data,
    rate: {
      dayRemaining: r.remainingDay,
      dayLimit: r.dayLimit,
      minuteRemaining: r.remainingMinute,
      status: r.status,
    },
  };
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

export type PaExtra = {
  minute: number; status: string; goalsH: number; goalsA: number;
  shotsOnH: number; shotsOnA: number; shotsH: number; shotsA: number;
  cornersH: number; cornersA: number; yellowH: number; yellowA: number;
  lineupsReady: boolean;
  injuries: { team: "home" | "away"; player: string; reason: string }[];
};

/** Pro Alati: 2 poziva — /fixtures?id (status, statistika, postave) + /injuries?fixture. */
export const getPaExtra = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive(), homeId: z.number().int(), apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const f = await call(`/fixtures?id=${data.id}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
    if (f.error === "RATE_LIMIT" || f.error?.startsWith("ACCOUNT")) return { error: f.error, rate: f.rate, extra: null as PaExtra | null };
    const fx = ((f.data as any[]) ?? [])[0];
    const st = (side: number, type: string) => num(((fx?.statistics?.[side]?.statistics ?? []) as any[]).find((s) => s.type === type)?.value);
    const i = await call(`/injuries?fixture=${data.id}`, data.apiKey);
    const extra: PaExtra = {
      minute: num(fx?.fixture?.status?.elapsed), status: fx?.fixture?.status?.short ?? "NS",
      goalsH: num(fx?.goals?.home), goalsA: num(fx?.goals?.away),
      shotsOnH: st(0, "Shots on Goal"), shotsOnA: st(1, "Shots on Goal"),
      shotsH: st(0, "Total Shots"), shotsA: st(1, "Total Shots"),
      cornersH: st(0, "Corner Kicks"), cornersA: st(1, "Corner Kicks"),
      yellowH: st(0, "Yellow Cards"), yellowA: st(1, "Yellow Cards"),
      lineupsReady: ((fx?.lineups as any[]) ?? []).length > 0,
      injuries: ((i.data as any[]) ?? []).map((x) => ({
        team: Number(x?.team?.id) === data.homeId ? "home" as const : "away" as const,
        player: String(x?.player?.name ?? "?"), reason: String(x?.player?.reason ?? x?.player?.type ?? ""),
      })),
    };
    return { error: f.error, rate: i.rate.dayRemaining >= 0 ? i.rate : f.rate, extra };
  });
