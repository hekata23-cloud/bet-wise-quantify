// ══ SPORTOVI-GUARD: zaštita poziva za košarku i rukomet ══
// Ista logika kao api-guard (red + keš + retry + stale rezerva), ali:
//   - svaki sport ima SVOJU bazu (v1.basketball / v1.handball) i SVOJ
//     dnevni limit od 100 besplatnih poziva, pa vode odvojene redove i keševe;
//   - pozivi košarke ne potrošuju kvotu rukometa i obratno;
//   - nogomet (api-guard) je i dalje potpuno nezavisna kvota.
// Poruke grešaka su ugovorene s pozivačima: RATE_LIMIT i "ACCOUNT: ..." — ne mijenjati!

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

const MIN_GAP_MS = 650;          // minimalni razmak između poziva
const MAX_PER_MIN = 8;           // ispod free-limita od 10/min po sportu
const WINDOW_MS = 60_000;
const RETRY_DELAYS = [10_000];   // jedan ponovni pokušaj nakon 10 s na RATE_LIMIT

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
    if (path.includes("date=")) return 5 * 60_000;   // raspored dana — živ podatak
    if (path.includes("id=")) return 10 * 60_000;    // rezultat jedne igre
    return 6 * 60 * 60_000;                          // forma tima — sporo se mijenja
  }
  if (p === "/odds") return 10 * 60_000;             // kvote — dovoljno svježe, štedi kvotu
  if (p === "/standings") return 12 * 60 * 60_000;
  return 30 * 60_000;
}

/** Čekaj slobodan "slot" — razmak između poziva + max po minuti. */
async function waitSlot(s: Stanje): Promise<void> {
  const now = Date.now();
  while (s.stamps.length && now - s.stamps[0]! > WINDOW_MS) s.stamps.shift();
  if (s.stamps.length >= MAX_PER_MIN) {
    const wait = Math.max(WINDOW_MS - (now - s.stamps[0]!) + 50, 1000);
    await sleep(wait);
    return waitSlot(s);
  }
  const gap = Date.now() - s.lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
}

async function guardFetch(sport: string, path: string, apiKey: string): Promise<GuardResult> {
  const meta = (status: number, remainingDay: number, dayLimit: number, remainingMinute: number) => ({
    status, remainingDay, dayLimit, remainingMinute,
  });
  try {
    const s = stanje(sport);
    await waitSlot(s);
    s.lastCallAt = Date.now();
    s.stamps.push(s.lastCallAt);
    const res = await fetch(`${BAZE[sport] ?? BAZE["kosarka"]}${path}`, {
      headers: { "x-apisports-key": apiKey },
    });
    const m = meta(
      res.status,
      Number(res.headers.get("x-ratelimit-requests-remaining") ?? -1),
      Number(res.headers.get("x-ratelimit-requests-limit") ?? -1),
      Number(res.headers.get("x-ratelimit-remaining") ?? -1),
    );
    if (res.status === 429) return { ...m, error: "RATE_LIMIT", data: null };
    if (res.status === 401 || res.status === 403)
      return { ...m, error: "ACCOUNT: API ključ nije važeći ili pretplata za ovaj sport nije aktivna.", data: null };
    if (!res.ok) return { ...m, error: `API greška ${res.status}.`, data: null };

    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const errs = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors as object).length);
    if (errs) {
      const txt = JSON.stringify(json.errors);
      if (/rate ?limit|too many|requests/i.test(txt)) return { ...m, error: "RATE_LIMIT", data: null };
      // API-Sports code 6 / "subscription" / "token" — sport nije besplatno pretplaćen
      if (/subscription|token|key|plan/i.test(txt))
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

  const s = stanje(sport);
  const ttl = opts.ttlMs ?? defaultTtl(path);
  const hit = s.cache.get(path);
  if (hit && Date.now() - hit.t <= ttl) {
    return { error: null, data: hit.v, status: 200, remainingDay: -1, dayLimit: -1, remainingMinute: -1 };
  }
  const running = s.inflight.get(path);
  if (running) return running;

  const p = (async (): Promise<GuardResult> => {
    let res: GuardResult = await guardFetch(sport, path, apiKey);
    if (res.error === "RATE_LIMIT" && RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[0]!);
      res = await guardFetch(sport, path, apiKey);
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
