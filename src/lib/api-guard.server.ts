// ══ API-GUARD: zajednička zaštita SVIH API-Football poziva (server-side) ══
// Problem koji rješava: besplatni plan ima 10 poziva/min i 100/dan. Kartice
// su odjednom trzale po 3-5 poziva, API je vraćao 429, pa je klik na utakmicu
// "zaglavljavao" pa je trebao treći pokušaj. Ovaj modul za svaki poziv:
//   1) sve pozive stavlja u RED s minimalnim razmakom i max 8/min (ispod limita),
//   2) kešira odgovore — isti path unutar TTL-a = 0 novih poziva,
//   3) na RATE_LIMIT čeka i automatski ponavlja (1 ponovni pokušaj),
//   4) kad API baš ne da podatke, vraća stari (stale) odgovor iz keša umjesto greške,
//   5) vraća podatak o dnevnom i minutnom limitu iz zaglavlja odgovora.
// Poruke grešaka su ugovorene s pozivačima: RATE_LIMIT i "ACCOUNT: ..." — ne mijenjati!

export type GuardResult = {
  error: string | null;
  data: unknown;
  status: number;
  remainingDay: number;
  dayLimit: number;
  remainingMinute: number;
};

import { breakerCheck, breakerRecord, scopeKey } from "./api-breaker.server";

const BASE = "https://v3.football.api-sports.io";
const MIN_GAP_MS = 650;          // minimalni razmak između poziva
const MAX_PER_MIN = 8;           // ispod free-limita od 10/min
const WINDOW_MS = 60_000;
const RETRY_DELAYS = [10_000];   // jedan ponovni pokušaj nakon 10 s na RATE_LIMIT

const cache = new Map<string, { t: number; ttl: number; v: unknown }>();
const inflight = new Map<string, Promise<GuardResult>>();
const stamps: number[] = [];     // pozivi u zadnjoj minuti
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Zadanje TTL-ove po tipu poziva — razumno za free plan. */
export function defaultTtl(path: string): number {
  const p = (path.split("?")[0] ?? path).replace(/^\//, "/");
  if (p === "/status") return 0;
  if (p === "/fixtures") {
    if (path.includes("date=")) return 5 * 60_000;        // raspored dana — živ podatak
    return 6 * 60 * 60_000;                                // forma zadnjih utakmica — sporo se mijenja
  }
  if (p === "/odds") return 10 * 60_000;                   // kvote — dovoljno svježe, štedi kvotu
  if (p === "/teams" || p === "/predictions" || p === "/injuries") return 24 * 60 * 60_000;
  return 30 * 60_000;
}

/** Čekaj slobodan "slot" — razmak između poziva + max po minuti. */
async function waitSlot(): Promise<void> {
  const now = Date.now();
  while (stamps.length && now - stamps[0]! > WINDOW_MS) stamps.shift();
  if (stamps.length >= MAX_PER_MIN) {
    const wait = Math.max(WINDOW_MS - (now - stamps[0]!) + 50, 1000);
    await sleep(wait);
    return waitSlot();
  }
  const gap = Date.now() - lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
}

async function guardFetch(path: string, apiKey: string): Promise<GuardResult> {
  const meta = (status: number, remainingDay: number, dayLimit: number, remainingMinute: number) => ({
    status, remainingDay, dayLimit, remainingMinute,
  });
  try {
    await waitSlot();
    lastCallAt = Date.now();
    stamps.push(lastCallAt);
    const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": apiKey } });
    const m = meta(
      res.status,
      Number(res.headers.get("x-ratelimit-requests-remaining") ?? -1),
      Number(res.headers.get("x-ratelimit-requests-limit") ?? -1),
      Number(res.headers.get("x-ratelimit-remaining") ?? -1),
    );
    if (res.status === 429) return { ...m, error: "RATE_LIMIT", data: null };
    if (res.status === 401 || res.status === 403)
      return { ...m, error: "ACCOUNT: API ključ nije važeći ili pretplata nije aktivna.", data: null };
    if (!res.ok) return { ...m, error: `API greška ${res.status}.`, data: null };

    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const errs = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors as object).length);
    if (errs) {
      const txt = JSON.stringify(json.errors);
      if (/for the day|daily/i.test(txt))
        return { ...m, error: "DNEVNI_LIMIT: potrošen je dnevni limit API-Footballa — obnova u ponoć UTC.", data: null };
      if (/rate ?limit|too many|requests/i.test(txt)) return { ...m, error: "RATE_LIMIT", data: null };
      if (/suspend|token|key/i.test(txt)) return { ...m, error: `ACCOUNT: ${txt}`, data: null };
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
export async function guardGet(
  path: string,
  opts: { apiKey?: string | null; ttlMs?: number } = {},
): Promise<GuardResult> {
  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey)
    return { error: "Nedostaje API ključ (unese ga u Postavkama).", data: null, status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };

  const ttl = opts.ttlMs ?? defaultTtl(path);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t <= ttl) {
    return { error: null, data: hit.v, status: 200, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  }
  const running = inflight.get(path);
  if (running) return running;

  const scope = scopeKey("football", apiKey);
  const blok = breakerCheck(scope);
  if (blok) {
    if (hit) return { error: null, data: hit.v, status: 200, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
    return { error: blok.startsWith("RATE_LIMIT") ? "RATE_LIMIT" : blok, data: null, status: 0, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  }

  const p = (async (): Promise<GuardResult> => {
    let res: GuardResult = await guardFetch(path, apiKey);
    breakerRecord(scope, res);
    if (res.error === "RATE_LIMIT" && RETRY_DELAYS.length && res.remainingDay !== 0) {
      await sleep(RETRY_DELAYS[0]!);
      res = await guardFetch(path, apiKey);
      breakerRecord(scope, res);
    }
    if (res.error === null) {
      cache.set(path, { t: Date.now(), ttl, v: res.data });
      return res;
    }
    // STALE rezerva: stari podatak je bolji od blokade korisnika.
    if (hit) {
      console.warn(`[api-guard] ${path}: ${res.error} — vraćam memorirani podatak.`);
      return { ...res, error: null, data: hit.v };
    }
    return res;
  })();

  inflight.set(path, p);
  try {
    return await p;
  } finally {
    inflight.delete(path);
  }
}
