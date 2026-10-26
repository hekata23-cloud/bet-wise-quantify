// ══ SPORTOVI-GUARD v3: zaštita poziva za košarku i rukomet ══
// - svaki sport ima SVOJU bazu i SVOJ dnevni limit (100 poziva, 10/min)
// - precizno razlikuje DNEVNI limit od MINUTNOG (429)
// - H2H podaci se keširaju na 7 dana da se ne troše upiti
// - sigurnosni razmak i automatski retry na minutni limit

import { breakerCheck, breakerRecord, scopeKey } from "./api-breaker.server";

export type GuardResult = {
  error: string | null;
  data: unknown;
  status: number;
  remainingDay: number;
  dayLimit: number;
  remainingMinute: number;
};

export const BAZE: Record<string, string> = {
  kosarka: "https://v1.basketball.api-sports.io",
  rukomet: "https://v1.handball.api-sports.io",
};

const MIN_GAP_MS = 7_000; // 7s razmak = maks ~8 poziva/min, ne prelazi API limit
const MAX_PER_MIN = 9; // sigurna granica ispod limita od 10/min
const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 75_000; // čekaj do 75s na slobodan slot (sprečava RATE_LIMIT)
const RETRY_DELAY_MS = 8_000; // čekaj 8s prije retryja na 429

type Stanje = {
  cache: Map<string, { t: number; ttl: number; v: unknown }>;
  inflight: Map<string, Promise<GuardResult>>;
  stamps: number[];
  lastCallAt: number;
};
const stanja = new Map<string, Stanje>();

function stanje(sport: string): Stanje {
  let s = stanja.get(sport);
  if (!s) {
    s = { cache: new Map(), inflight: new Map(), stamps: [], lastCallAt: 0 };
    stanja.set(sport, s);
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** TTL keša po tipu poziva — štedi besplatne API kvote */
export function defaultTtl(path: string): number {
  const p = (path.split("?")[0] ?? path).replace(/^\//, "/");
  if (p === "/status") return 0;
  if (p === "/games") {
    if (path.includes("date=")) return 10 * 60_000; // raspored dana — 10 minuta
    if (path.includes("h2h=")) return 7 * 24 * 3600_000; // međusobni omjeri — 7 dana (ne troši kvotu!)
    if (path.includes("id=")) return 10 * 60_000; // pojedinačna utakmica — 10 minuta
    return 6 * 3600_000;
  }
  if (p === "/odds") return 15 * 60_000; // kvote — 15 minuta
  if (p === "/standings") return 12 * 3600_000;
  return 30 * 60_000;
}

/** Vrati true ako ima slobodnog slota unutar minute */
async function waitSlot(s: Stanje): Promise<boolean> {
  const now = Date.now();
  while (s.stamps.length && now - s.stamps[0]! > WINDOW_MS) s.stamps.shift();
  if (s.stamps.length >= MAX_PER_MIN) {
    const wait = Math.max(WINDOW_MS - (now - s.stamps[0]!) + 100, 1000);
    if (wait > MAX_WAIT_MS) return false;
    await sleep(wait);
    return waitSlot(s);
  }
  const gap = Date.now() - s.lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  return true;
}

async function guardFetch(sport: string, path: string, apiKey: string): Promise<GuardResult> {
  const meta = (
    status: number,
    remainingDay: number,
    dayLimit: number,
    remainingMinute: number,
  ) => ({
    status,
    remainingDay,
    dayLimit,
    remainingMinute,
  });

  try {
    const s = stanje(`${sport}:${apiKey}`);
    const slot = await waitSlot(s);
    if (!slot) {
      return {
        status: 429,
        remainingDay: -1,
        dayLimit: -1,
        remainingMinute: -1,
        error: "RATE_LIMIT: Previše upita u minuti. Pričekaj 20-ak sekundi.",
        data: null,
      };
    }

    s.lastCallAt = Date.now();
    s.stamps.push(s.lastCallAt);

    const res = await fetch(`${BAZE[sport] ?? BAZE["kosarka"]}${path}`, {
      headers: { "x-apisports-key": apiKey },
    });

    const remainingDay = Number(res.headers.get("x-ratelimit-requests-remaining") ?? -1);
    const dayLimit = Number(res.headers.get("x-ratelimit-requests-limit") ?? -1);
    const remainingMinute = Number(res.headers.get("x-ratelimit-remaining") ?? -1);
    const m = meta(res.status, remainingDay, dayLimit, remainingMinute);

    if (remainingDay === 0) {
      return {
        ...m,
        error:
          "DNEVNI_LIMIT: Potrošen je dnevni limit (100 poziva) za ovaj sport. Obnavlja se u ponoć UTC (01:00/02:00 h).",
        data: null,
      };
    }
    if (res.status === 429) {
      return {
        ...m,
        error: "RATE_LIMIT: API limit u minuti (max 10 upita/min). Pričekaj 30 sekundi.",
        data: null,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ...m,
        error: "ACCOUNT: API ključ nije važeći ili sport nije aktiviran na tvom računu.",
        data: null,
      };
    }
    if (!res.ok) return { ...m, error: `API greška ${res.status}.`, data: null };

    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const errs =
      json.errors &&
      (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors as object).length);

    if (errs) {
      const errObj = typeof json.errors === "object" && json.errors !== null ? json.errors : {};
      const errValues = Object.values(errObj)
        .map((v) => String(v))
        .join(" ");
      const txt = `${JSON.stringify(json.errors)} ${errValues}`;

      // Točna provjera dnevnog vs minutnog limita iz tijela odgovora
      if (/day|daily|100 requests|per day/i.test(errValues)) {
        return {
          ...m,
          error: "DNEVNI_LIMIT: Potrošen je dnevni limit od 100 poziva. Obnavlja se u ponoć UTC.",
          data: null,
        };
      }
      if (/minute|per minute|too many|rate ?limit/i.test(errValues)) {
        return {
          ...m,
          error: "RATE_LIMIT: Dosegnut limit od 10 poziva u minuti. Pričekaj 30 sekundi.",
          data: null,
        };
      }
      if (/suspend|subscription|token|key|plan/i.test(txt)) {
        return { ...m, error: `ACCOUNT: ${errValues || txt}`, data: null };
      }
      return { ...m, error: errValues || txt, data: null };
    }

    return { ...m, error: null, data: json.response };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "nepoznato";
    return {
      status: 0,
      remainingDay: -1,
      dayLimit: -1,
      remainingMinute: -1,
      error: `Mrežna greška: ${msg}`,
      data: null,
    };
  }
}

export async function sportoviGet(
  sport: string,
  path: string,
  opts: { apiKey?: string | null; ttlMs?: number } = {},
): Promise<GuardResult> {
  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey) {
    return {
      error: "Nedostaje API ključ (unesi ga u Postavkama).",
      data: null,
      status: 0,
      remainingDay: -1,
      dayLimit: -1,
      remainingMinute: -1,
    };
  }
  if (!BAZE[sport]) {
    return {
      error: `Nepoznat sport: ${sport}`,
      data: null,
      status: 0,
      remainingDay: -1,
      dayLimit: -1,
      remainingMinute: -1,
    };
  }

  const s = stanje(`${sport}:${apiKey}`);
  const ttl = opts.ttlMs ?? defaultTtl(path);
  const hit = s.cache.get(path);
  if (hit && Date.now() - hit.t <= ttl) {
    return {
      error: null,
      data: hit.v,
      status: 200,
      remainingDay: -1,
      dayLimit: -1,
      remainingMinute: -1,
    };
  }
  const running = s.inflight.get(path);
  if (running) return running;

  const scope = scopeKey(sport, apiKey);
  let blok = breakerCheck(scope);
  if (blok && blok.startsWith("RATE_LIMIT")) {
    const m = blok.match(/još (\d+) s/);
    const sek = m ? Number(m[1]) : 15;
    if (sek <= 15) {
      await sleep(sek * 1000 + 300);
      blok = breakerCheck(scope);
    }
  }
  if (blok) {
    if (hit)
      return {
        error: null,
        data: hit.v,
        status: 200,
        remainingDay: -1,
        dayLimit: -1,
        remainingMinute: -1,
      };
    return {
      error: blok,
      data: null,
      status: 0,
      remainingDay: -1,
      dayLimit: -1,
      remainingMinute: -1,
    };
  }

  const p = (async (): Promise<GuardResult> => {
    let res: GuardResult = await guardFetch(sport, path, apiKey);
    breakerRecord(scope, res);

    // Ponovi samo kod 429 minutnog limita nakon kratke pauze
    if (res.error && res.error.startsWith("RATE_LIMIT") && res.status === 429) {
      await sleep(RETRY_DELAY_MS);
      res = await guardFetch(sport, path, apiKey);
      breakerRecord(scope, res);
    }
    if (res.error === null) {
      s.cache.set(path, { t: Date.now(), ttl, v: res.data });
      return res;
    }
    if (hit) {
      return { ...res, error: null, data: hit.v };
    }
    return res;
  })();

  s.inflight.set(path, p);
  try {
    return await p;
  } finally {
    s.inflight.delete(path);
  }
}

export type Sport = "kosarka" | "rukomet";
export type SportOdgovor = { ok: boolean; data: any; error: string | null; code: string | null };

function kljuc(): string {
  return (process.env.API_SPORTS_KEY ?? process.env.API_FOOTBALL_KEY ?? "").trim();
}

function uOdgovor(r: GuardResult): SportOdgovor {
  const code = r.error ? (r.error.split(":")[0] ?? "ERROR") : null;
  return { ok: r.error === null, data: r.data, error: r.error, code };
}

export async function dohvatiUtakmiceSport(
  sport: Sport,
  date: string,
  apiKey?: string,
): Promise<SportOdgovor> {
  return uOdgovor(
    await sportoviGet(sport, `/games?date=${encodeURIComponent(date)}&timezone=Europe%2FZagreb`, {
      apiKey: apiKey ?? kljuc(),
    }),
  );
}

export async function dohvatiOddsSport(
  sport: Sport,
  gameId: number,
  apiKey?: string,
): Promise<SportOdgovor> {
  return uOdgovor(await sportoviGet(sport, `/odds?game=${gameId}`, { apiKey: apiKey ?? kljuc() }));
}

export async function dohvatiH2HSport(
  sport: Sport,
  homeId: number,
  awayId: number,
  apiKey?: string,
): Promise<SportOdgovor> {
  return uOdgovor(
    await sportoviGet(sport, `/games?h2h=${homeId}-${awayId}`, { apiKey: apiKey ?? kljuc() }),
  );
}

export function statusSportova() {
  return { kljucPostoji: kljuc().length > 0, sportovi: Object.keys(BAZE) };
}
