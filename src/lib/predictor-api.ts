import { emptyInputs, TOP_SCORES, type Inputs, type Outcome } from "./predictor-engine";

const TTL = 24 * 60 * 60 * 1000;

export class LimitError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "LimitError";
  }
}

export function getZagrebDate(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zagreb",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatZagrebTime(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("hr-HR", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "--:--";
  }
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem("cache:" + key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > TTL) return null;
    return d as T;
  } catch {
    return null;
  }
}

function cacheSet(key: string, d: unknown) {
  try {
    localStorage.setItem("cache:" + key, JSON.stringify({ t: Date.now(), d }));
  } catch {
    /* Memorija puna */
  }
}

export function cacheAny<T>(key: string): T | null {
  try {
    const r = localStorage.getItem("cache:" + key);
    return r ? (JSON.parse(r).d as T) : null;
  } catch {
    return null;
  }
}

export type Keys = {
  football: string;
  odds: string;
  sport: string;
};

export type Fixture = {
  id: number;
  home: string;
  away: string;
  league: string;
  time: string;
  status: string;
};

function getFootballApiConfig(key: string): { baseUrl: string; headers: Record<string, string> } {
  const cleanKey = key.trim();
  const isRapid = cleanKey.length > 40;

  if (isRapid) {
    return {
      baseUrl: "https://api-football-v1.p.rapidapi.com/v3",
      headers: {
        "X-RapidAPI-Key": cleanKey,
        "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
      },
    };
  }

  return {
    baseUrl: "https://v3.football.api-sports.io",
    headers: {
      "x-apisports-key": cleanKey,
    },
  };
}

async function getJson(url: string, headers: Record<string, string>, key: string, force = false) {
  if (!force) {
    const cached = cacheGet<any>(key);
    if (cached) return { data: cached, cached: true };
  }

  const res = await fetch(url, { headers });

  if (res.status === 429) {
    throw new LimitError(429, "Dosegnut je limit API zahtjeva (429). Račun je zaštićen prebacivanjem na memoriju.");
  }
  if (res.status === 403 || res.status === 401) {
    throw new LimitError(res.status, "Nevažeći API ključ ili pretplata nije aktivirana (403/401).");
  }
  if (!res.ok) {
    throw new Error(`HTTP greška poslužitelja: ${res.status}`);
  }

  const data = await res.json();
  if (data?.errors && Object.keys(data.errors).length > 0) {
    const errMsg = typeof data.errors === "object" ? Object.values(data.errors).join(", ") : String(data.errors);
    if (errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("requests")) {
      throw new LimitError(429, errMsg);
    }
  }

  cacheSet(key, data);
  return { data, cached: false };
}

export async function fetchFixtures(keys: Keys, force = false) {
  if (!keys.football?.trim()) throw new Error("API ključ nije unesen.");

  const zagrebDate = getZagrebDate();
  const config = getFootballApiConfig(keys.football);
  const cacheKey = `fixtures:${zagrebDate}`;

  const { data, cached } = await getJson(
    `${config.baseUrl}/fixtures?date=${zagrebDate}&timezone=Europe/Zagreb`,
    config.headers,
    cacheKey,
    force
  );

  const rawList = data?.response ?? [];
  const list: Fixture[] = rawList.map((f: any) => ({
    id: f.fixture.id,
    home: f.teams.home.name,
    away: f.teams.away.name,
    league: `${f.league.country ? f.league.country + " · " : ""}${f.league.name}`,
    time: f.fixture.date,
    status: f.fixture.status.short || "NS",
  }));

  return { list, cached, date: zagrebDate };
}

const htftMap: Record<string, Outcome> = {
  "Home/Home": "1/1",
  "Draw/Home": "X/1",
  "Away/Home": "2/1",
  "Home/Draw": "1/X",
  "Draw/Draw": "X/X",
  "Away/Draw": "2/X",
  "Home/Away": "1/2",
  "Draw/Away": "X/2",
  "Away/Away": "2/2",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const fmt = (x: any) => (x && !isNaN(Number(x)) ? String(Number(x).toFixed(2)) : "");

export async function fetchMatchOdds(keys: Keys, fx: Fixture, force = false) {
  const inp: Inputs = emptyInputs();
  let cached = true;

  if (keys.football?.trim()) {
    try {
      const config = getFootballApiConfig(keys.football);
      const af = await getJson(
        `${config.baseUrl}/odds?fixture=${fx.id}&timezone=Europe/Zagreb`,
        config.headers,
        `afodds:${fx.id}`,
        force
      );
      cached &&= af.cached;

      const allBms = af.data.response?.[0]?.bookmakers ?? [];
      const PREFERRED_IDS = [8, 4, 11, 3, 6];
      const bms = [...allBms].sort((a: any, b: any) => {
        const rankA = PREFERRED_IDS.indexOf(a.id);
        const rankB = PREFERRED_IDS.indexOf(b.id);
        const scoreA = rankA === -1 ? 999 : rankA;
        const scoreB = rankB === -1 ? 999 : rankB;
        return scoreA - scoreB;
      });

      const pick = (name: string) => {
        for (const b of bms) {
          const bet = b.bets.find((x: any) => x.name === name);
          if (bet) return bet.values as any[];
        }
        return null;
      };
      const v = (vals: any[] | null, label: string) => fmt(vals?.find((x) => x.value === label)?.odd);

      const mw = pick("Match Winner");
      inp.ft1 = v(mw, "Home");
      inp.ftx = v(mw, "Draw");
      inp.ft2 = v(mw, "Away");

      const fh = pick("First Half Winner");
      inp.ht1 = v(fh, "Home");
      inp.htx = v(fh, "Draw");
      inp.ht2 = v(fh, "Away");

      const ou = pick("Goals Over/Under");
      inp.o15 = v(ou, "Over 1.5");
      inp.u15 = v(ou, "Under 1.5");
      inp.o25 = v(ou, "Over 2.5");
      inp.u25 = v(ou, "Under 2.5");
      inp.o35 = v(ou, "Over 3.5");
      inp.u35 = v(ou, "Under 3.5");

      const ouh = pick("Goals Over/Under First Half");
      inp.hto05 = v(ouh, "Over 0.5");
      inp.htu05 = v(ouh, "Under 0.5");

      const btts = pick("Both Teams Score");
      inp.bttsYes = v(btts, "Yes");
      inp.bttsNo = v(btts, "No");

      const hf = pick("HT/FT Double");
      hf?.forEach((x) => {
        const o = htftMap[x.value];
        if (o) inp.book[o] = fmt(x.odd);
      });

      const cs = pick("Exact Score");
      if (cs) {
        TOP_SCORES.forEach((s) => {
          const val = v(cs, s);
          if (val) inp.bookScores[s] = val;
        });
      }
    } catch (e) {
      if (e instanceof LimitError && e.statusCode === 429) throw e;
    }
  }

  if (keys.odds?.trim() && keys.sport) {
    try {
      const od = await getJson(
        `https://api.the-odds-api.com/v4/sports/${keys.sport}/odds?apiKey=${keys.odds.trim()}&regions=eu&markets=h2h,totals&oddsFormat=decimal`,
        {},
        `oddsapi:${keys.sport}`,
        force
      );
      cached &&= od.cached;

      const ev = (od.data as any[]).find((e) => {
        const h = norm(e.home_team), a = norm(e.away_team);
        const H = norm(fx.home), A = norm(fx.away);
        return (h.includes(H) || H.includes(h)) && (a.includes(A) || A.includes(a));
      });

      if (ev) {
        const preferredOddsKeys = ["pinnacle", "betfair_ex_eu", "bet365", "unibet_eu"];
        const bk = ev.bookmakers.sort((a: any, b: any) => {
          const rankA = preferredOddsKeys.indexOf(a.key);
          const rankB = preferredOddsKeys.indexOf(b.key);
          return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
        })[0] ?? ev.bookmakers[0];

        const h2h = bk?.markets.find((m: any) => m.key === "h2h")?.outcomes ?? [];
        const g = (name: string) => fmt(h2h.find((o: any) => o.name === name)?.price);
        if (h2h.length) {
          inp.ft1 = g(ev.home_team) || inp.ft1;
          inp.ftx = g("Draw") || inp.ftx;
          inp.ft2 = g(ev.away_team) || inp.ft2;
        }

        const tot = bk?.markets.find((m: any) => m.key === "totals")?.outcomes ?? [];
        const o25 = tot.find((x: any) => x.name === "Over" && x.point === 2.5);
        const u25 = tot.find((x: any) => x.name === "Under" && x.point === 2.5);
        if (o25 && u25) {
          inp.o25 = fmt(o25.price);
          inp.u25 = fmt(u25.price);
        }

        const o35 = tot.find((x: any) => x.name === "Over" && x.point === 3.5);
        const u35 = tot.find((x: any) => x.name === "Under" && x.point === 3.5);
        if (o35 && u35) {
          inp.o35 = fmt(o35.price);
          inp.u35 = fmt(u35.price);
        }

        const o15 = tot.find((x: any) => x.name === "Over" && x.point === 1.5);
        const u15 = tot.find((x: any) => x.name === "Under" && x.point === 1.5);
        if (o15 && u15) {
          inp.o15 = fmt(o15.price);
          inp.u15 = fmt(u15.price);
        }
      }
    } catch {
      /* Ignorirati grešku vanjskog servisa */
    }
  }

  return { inputs: inp, cached };
}


