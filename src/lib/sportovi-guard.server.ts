// ══ SPORTOVI-GUARD v2: zaštita poziva za košarku i rukomet ══
// Ista logika kao api-guard (red + keš + retry + stale rezerva), ali:
//   - svaki sport ima SVOJU bazu (v1.basketball / v1.handball) i SVOJ
//     dnevni limit od 100 besplatnih poziva, pa vode odvojene redove i keševe;
//   - pozivi košarke ne potrošuju kvotu rukometa i obratno;
//   - nogomet (api-guard) je i dalje potpuno nezavisna kvota.
// v2 popravke:
//   - razlikuje DNEVNI limit (potrošen — ništa ne pomaže do sutra) od
//     MINUTNOG limita (429 — čekanje pomaže) i daje jasnu poruku;
//   - fail-fast: ako bi čekanje u redu predugo trajalo (serverless timeout!),
//     vrati grešku odmah umjesto da funkcija biva ubijena u pola posla;
//   - jedan kratak retry (4 s) na minurni limit; na dnevni se NE pokušava ponovo.
// Poruke grešaka: RATE_LIMIT, DNEVNI_LIMIT, "ACCOUNT: ..." — čitljive izravno u UI.

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

const MIN_GAP_MS = 400;          // minimalni razmak između poziva
const MAX_PER_MIN = 6;           // ispod free-limita od 10/min po sportu
const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 6_000;       // čekanje dulje od ovoga = fail fast (serverless timeout)
const RETRY_DELAY_MS = 4_000;    // jedan kratak ponovni pokušaj na minurni RATE_LIMIT

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

/** Zadanje TTL-ove po tipu poziva — razumno za besplatne planove. */
export function defaultTtl(path: string): number {
  const p = (path.split("?")[0] ?? path).replace(/^\//, "/");
  if (p === "/status") return 0;
  if (p === "/games") {
    if (path.includes("date=")) return 10 * 60_000;   // raspored dana — živ podatak, ali štedi kvotu
    if (path.includes("id=")) return 10 * 60_000;     // rezultat jedne igre
    return 6 * 60 * 60_000;                           // forma tima — sporo se mijenja
  }
  if (p === "/odds") return 10 * 60_000;              // kvote — dovoljno svježe, štedi kvotu
  if (p === "/standings") return 12 * 60 * 60_000;
  return 30 * 60_000;
}

/** Vrati true ako je dobio slot; false ako bi čekanje bilo predugo (fail fast). */
async function waitSlot(s: Stanje): Promise<boolean> {
  const now = Date.now();
  while (s.stamps.length && now - s.stamps[0]! > WINDOW_MS) s.stamps.shift();
  if (s.stamps.length >= MAX_PER_MIN) {
    const wait = Math.max(WINDOW_MS - (now - s.stamps[0]!) + 50, 1000);
    if (wait > MAX_WAIT_MS) return false;
    await sleep(wait);
    return waitSlot(s);
  }
  const gap = Date.now() - s.lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  return true;
}

async function guardFetch(sport: string, path: string, apiKey: string): Promise<GuardResult> {
  const meta = (status: number, remainingDay: number, dayLimit: number, remainingMinute: number) => ({
    status, remainingDay, dayLimit, remainingMinute,
  });
  try {
    const s = stanje(`${sport}:${apiKey}`);
    const slot = await waitSlot(s);
    if (!slot) {
      // Predugo bi se čekalo — vrti u pola posla je gori od brze, jasne greške.
      return {
        status: 429, remainingDay: -1, dayLimit: -1, remainingMinute: -1,
        error: "RATE_LIMIT: red za pozive je trenutačno pun — pričekaj minutu pa klikni Učitaj.",
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

    if (remainingDay === 0)
      return { ...m, error: "DNEVNI_LIMIT: potrošen je dnevni limit besplatnih poziva za ovaj sport — obnavlja se ponoć UTC. Do tada kartica radi s keširanim podacima.", data: null };
    if (res.status === 429)
      return { ...m, error: "RATE_LIMIT: API je odbio poziv (limit u minuti) — pričekaj minutu pa klikni Učitaj.", data: null };
    if (res.status === 401 || res.status === 403)
      return { ...m, error: "ACCOUNT: API ključ nije važeći ili pretplata za ovaj sport nije aktivna.", data: null };
    if (!res.ok) return { ...m, error: `API greška ${res.status}.`, data: null };

    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const errs = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors as object).length);
    if (errs) {
      const txt = JSON.stringify(json.errors);
      if (/for the day|daily/i.test(txt))
        return { ...m, error: "DNEVNI_LIMIT: potrošen je dnevni limit besplatnih poziva za ovaj sport — obnavlja se ponoć UTC.", data: null };
      if (/rate ?limit|too many|requests/i.test(txt))
        return { ...m, error: "RATE_LIMIT: API je odbio poziv (limit u minuti) — pričekaj minutu pa klikni Učitaj.", data: null };
      // API-Sports code 6 / "subscription" / "token" — sport nije besplatno pretplaćen
      if (/suspend|subscription|token|key|plan/i.test(txt))
        return { ...m, error: `ACCOUNT: ${txt}`, data: null };
      return { ...m, error: txt, data: null };
    }
    return { ...m, error: null, data: json.response };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "nepoznato";
    return { status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1, error: `Mrežna greška: ${msg}`, data: null };
  }
}

/**
 * Glavni ulaz. Vrati podatke s kešom, redom čekanja, retry-jem i stale rezervom.
 * error je null i kad je poslužen stale podatak — pozivač dobije podatke umjesto blokade.
 */
export async function sportoviGet(
  sport: string,
  path: string,
  opts: { apiKey?: string | null; ttlMs?: number } = {},
): Promise<GuardResult> {
  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey)
    return { error: "Nedostaje API ključ (unese ga u Postavkama).", data: null, status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  if (!BAZE[sport])
    return { error: `Nepoznat sport: ${sport}`, data: null, status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };

  const s = stanje(`${sport}:${apiKey}`);
  const ttl = opts.ttlMs ?? defaultTtl(path);
  const hit = s.cache.get(path);
  if (hit && Date.now() - hit.t <= ttl) {
    return { error: null, data: hit.v, status: 200, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  }
  const running = s.inflight.get(path);
  if (running) return running;

  const scope = scopeKey(sport, apiKey);
  const blok = breakerCheck(scope);
  if (blok) {
    if (hit) return { error: null, data: hit.v, status: 200, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
    return { error: blok, data: null, status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  }

  const p = (async (): Promise<GuardResult> => {
    let res: GuardResult = await guardFetch(sport, path, apiKey);
    breakerRecord(scope, res);
    // Retry SAMO na minurni RATE_LIMIT — dnevni limit se ne oporavlja čekanjem.
    if (res.error && res.error.startsWith("RATE_LIMIT") && res.status === 429) {
      await sleep(RETRY_DELAY_MS);
      res = await guardFetch(sport, path, apiKey);
      breakerRecord(scope, res);
    }
    if (res.error === null) {
      s.cache.set(path, { t: Date.now(), ttl, v: res.data });
      return res;
    }
    // STALE rezerva: stari podatak je bolji od blokade korisnika.
    if (hit) {
      console.warn(`[sportovi-guard] ${sport}${path}: ${res.error} — vraćam memorirani podatak.`);
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

// ── Pomoćni ulazi za Košarku PRO / Rukomet PRO ──
export type Sport = "kosarka" | "rukomet";
export type SportOdgovor = { ok: boolean; data: any; error: string | null; code: string | null };

function kljuc(): string {
  return (process.env.API_SPORTS_KEY ?? process.env.API_FOOTBALL_KEY ?? "").trim();
}
function uOdgovor(r: GuardResult): SportOdgovor {
  const code = r.error ? (r.error.split(":")[0] ?? "ERROR") : null;
  return { ok: r.error === null, data: r.data, error: r.error, code };
}
export async function dohvatiUtakmiceSport(sport: Sport, date: string, apiKey?: string): Promise<SportOdgovor> {
  return uOdgovor(await sportoviGet(sport, `/games?date=${encodeURIComponent(date)}`, { apiKey: apiKey ?? kljuc() }));
}
export async function dohvatiOddsSport(sport: Sport, gameId: number, apiKey?: string): Promise<SportOdgovor> {
  return uOdgovor(await sportoviGet(sport, `/odds?game=${gameId}`, { apiKey: apiKey ?? kljuc() }));
}
export async function dohvatiH2HSport(sport: Sport, homeId: number, awayId: number, apiKey?: string): Promise<SportOdgovor> {
  return uOdgovor(await sportoviGet(sport, `/games?h2h=${homeId}-${awayId}`, { apiKey: apiKey ?? kljuc() }));
}
export function statusSportova() {
  return { kljucPostoji: kljuc().length > 0, sportovi: Object.keys(BAZE) };
}
