// football-data.org — besplatan dodatni izvor podataka (10 zahtjeva/min).
// Zove se preko našeg servera (/api/public/football-data) jer taj API
// ne dopušta pozive izravno iz preglednika (CORS → "Failed to fetch").
import { getKey } from "./storage";

const PROXY = "/api/public/football-data";
const CACHE_PREFIX = "tm.fdcache.";
const TTL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 6500; // 10 zahtjeva/min na besplatnom planu
let lastCall = 0;

export class FootballDataError extends Error {}

function cacheGet<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + k);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    return Date.now() - t > TTL_MS ? null : v;
  } catch {
    return null;
  }
}
function cacheSet(k: string, v: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + k, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* pun storage */
  }
}

export async function fdGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getKey("footballData");
  if (!token) throw new FootballDataError("Nedostaje football-data.org ključ.");
  const qs = new URLSearchParams({ path, ...params });
  const cacheKey = qs.toString();
  const hit = cacheGet<T>(cacheKey);
  if (hit) return hit;

  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  let res: Response;
  try {
    res = await fetch(`${PROXY}?${qs.toString()}`, { headers: { "X-Auth-Token": token } });
  } catch (e) {
    throw new FootballDataError(
      `Ne mogu doći do servera (${e instanceof Error ? e.message : "mreža"}). Provjeri internet vezu.`,
    );
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message ?? text.slice(0, 160);
    if (res.status === 400 || res.status === 403)
      throw new FootballDataError(`Ključ odbijen ili nemaš pristup tom resursu: ${msg}`);
    if (res.status === 429) throw new FootballDataError("football-data.org limit (10/min). Pričekaj minutu.");
    throw new FootballDataError(`football-data.org ${res.status}: ${msg}`);
  }
  cacheSet(cacheKey, json);
  return json as T;
}

export interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  competition: { name: string; area?: { name: string } };
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

export async function fdMatchesByDate(isoDate: string): Promise<FDMatch[]> {
  const j = await fdGet<{ matches?: FDMatch[] }>("/matches", { dateFrom: isoDate, dateTo: isoDate });
  return j.matches ?? [];
}

export async function testFootballData(): Promise<{ ok: boolean; msg: string }> {
  try {
    const j = await fdGet<{ competitions?: { name: string }[] }>("/competitions");
    const n = j.competitions?.length ?? 0;
    return { ok: true, msg: `football-data.org radi — dostupno ${n} natjecanja.` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}
