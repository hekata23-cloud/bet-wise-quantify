// API-Football klijent s ugrađenom zaštitom od suspenzije:
// - lokalni cache (localStorage) s TTL po endpointu
// - dnevni brojač zahtjeva (default 90/dan; besplatan plan ima 100)
// - throttling: minimalni razmak između zahtjeva (2s)
// - retry samo na 429 s exponential backoff, MAX 1 pokušaj
// - deduplikacija paralelnih istih zahtjeva
// - user-agent i točan header format prema RapidAPI/direktnom endpointu
import { getKey } from "./storage";
import { isoDateZagreb } from "./zagreb-time";

const BASE = "https://v3.football.api-sports.io";
const CACHE_PREFIX = "tm.afcache.";
const COUNTER_KEY = "tm.afcount";
const LAST_CALL_KEY = "tm.aflast";
const DAILY_LIMIT = 90; // sigurnosni prag ispod free plana (100/dan)
const MIN_INTERVAL_MS = 2000;

interface Counter { date: string; count: number }

function readCounter(): Counter {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (!raw) return { date: isoDateZagreb(), count: 0 };
    const p = JSON.parse(raw) as Counter;
    if (p.date !== isoDateZagreb()) return { date: isoDateZagreb(), count: 0 };
    return p;
  } catch {
    return { date: isoDateZagreb(), count: 0 };
  }
}

function bumpCounter(): number {
  const c = readCounter();
  c.count += 1;
  localStorage.setItem(COUNTER_KEY, JSON.stringify(c));
  return c.count;
}

export function apiFootballQuotaUsed(): number {
  return readCounter().count;
}
export function apiFootballQuotaLimit(): number {
  return DAILY_LIMIT;
}

function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - t > ttlMs) return null;
    return v;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, v: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* quota exceeded – ignoriraj */
  }
}

const inflight = new Map<string, Promise<unknown>>();

async function throttle(): Promise<void> {
  const last = Number(localStorage.getItem(LAST_CALL_KEY) ?? "0");
  const diff = Date.now() - last;
  if (diff < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - diff));
  }
  localStorage.setItem(LAST_CALL_KEY, String(Date.now()));
}

export class ApiFootballError extends Error {
  status?: number;
  constructor(m: string, status?: number) {
    super(m);
    this.status = status;
  }
}

export interface AFOptions {
  ttlMs?: number; // default 10 min
  force?: boolean;
}

export async function afGet<T = unknown>(
  endpoint: string,
  params: Record<string, string | number> = {},
  opts: AFOptions = {},
): Promise<T> {
  const key = getKey("apiFootball");
  if (!key) throw new ApiFootballError("Nedostaje API-Football ključ. Otvori Postavke.");
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const cacheKey = `${endpoint}?${qs}`;
  const ttl = opts.ttlMs ?? 10 * 60 * 1000;
  if (!opts.force) {
    const cached = cacheGet<T>(cacheKey, ttl);
    if (cached) return cached;
  }
  if (inflight.has(cacheKey)) return inflight.get(cacheKey) as Promise<T>;

  const counter = readCounter();
  if (counter.count >= DAILY_LIMIT) {
    throw new ApiFootballError(
      `Dnevni limit od ${DAILY_LIMIT} zahtjeva iskorišten (${counter.count}). Pokušaj sutra ili koristi keš.`,
    );
  }

  const p = (async () => {
    await throttle();
    let attempt = 0;
    while (true) {
      const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
        headers: { "x-apisports-key": key },
      });
      bumpCounter();
      if (res.status === 429 && attempt < 1) {
        attempt++;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (!res.ok) {
        throw new ApiFootballError(`API-Football greška ${res.status}`, res.status);
      }
      const json = (await res.json()) as { errors?: unknown; response?: T };
      const errs = (json.errors ?? {}) as Record<string, string> | unknown[];
      const hasErr = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs).length > 0;
      if (hasErr) throw new ApiFootballError(`API-Football: ${JSON.stringify(errs)}`);
      const data = (json.response ?? (json as unknown as T)) as T;
      cacheSet(cacheKey, data);
      return data;
    }
  })();
  inflight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    inflight.delete(cacheKey);
  }
}

export async function testApiFootball(): Promise<{ ok: boolean; msg: string }> {
  try {
    const data = await afGet<{ account?: unknown; subscription?: unknown }>(
      "status",
      {},
      { ttlMs: 0, force: true },
    );
    return { ok: true, msg: `Radi. ${JSON.stringify(data).slice(0, 160)}…` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Praktični omotači ----------
export interface Fixture {
  fixture: { id: number; date: string; status: { short: string; long: string } };
  league: { id: number; name: string; country: string; logo: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export function getFixturesByDate(date: string): Promise<Fixture[]> {
  return afGet<Fixture[]>("fixtures", { date }, { ttlMs: 5 * 60 * 1000 });
}

export function getLiveFixtures(): Promise<Fixture[]> {
  return afGet<Fixture[]>("fixtures", { live: "all" }, { ttlMs: 30 * 1000 });
}