/**
 * Pametna zaštita od suspenzije API-Football računa (samo za Zlatni tip).
 * 1. Stvarni dnevni limit iz zaglavlja API-ja + rezerva (nikad do nule).
 * 2. Klizni prozor po minuti (max 8/min, free plan dopušta 10) + min. razmak 7 s.
 * 3. 429 / rate-limit greška → automatsko hlađenje (eksponencijalno: 65 s, 130 s, ...).
 * 4. Greška računa (suspend/key) → potpuna blokada do sutra, bez ponovnih pokušaja.
 * 5. Strujni prekidač: 3 uzastopne greške → pauza 5 min.
 * 6. Cache po danu i deduplikacija: ista utakmica se nikad ne povlači dvaput.
 */
const KEY = "zt.guard.v2";
const CACHE = "zt.cache.v2.";
export const PER_MIN = 8;
export const MIN_GAP = 7000;
export const RESERVE = 5;

type State = {
  day: string;
  used: number;
  dayRemaining: number;
  dayLimit: number;
  stamps: number[];
  cooldownUntil: number;
  strikes429: number;
  errorStreak: number;
  blockedDay: string | null;
  blockedReason: string | null;
};

export const zagrebDay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zagreb" });

export function readState(): State {
  const fresh: State = { day: zagrebDay(), used: 0, dayRemaining: -1, dayLimit: -1, stamps: [], cooldownUntil: 0, strikes429: 0, errorStreak: 0, blockedDay: null, blockedReason: null };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (!s) return fresh;
    if (s.day !== zagrebDay()) return { ...fresh, cooldownUntil: s.cooldownUntil };
    // Stare blokade iz prijašnjih verzija (3×429, token/key greške) više ne vrijede —
    // dnevna blokada ostaje samo uz izričitu suspenziju računa.
    if (s.blockedDay && !/suspend/i.test(s.blockedReason ?? "")) {
      s.blockedDay = null;
      s.blockedReason = null;
    }
    return s;
  } catch {
    return fresh;
  }
}
const write = (s: State) => localStorage.setItem(KEY, JSON.stringify(s));

/** Vraća null ako je poziv dopušten, inače razlog + koliko ms čekati (0 = ne čekati, blokirano). */
export function check(cost: number): { reason: string; waitMs: number } | null {
  const s = readState();
  const now = Date.now();
  if (s.blockedDay === s.day) return { reason: `Račun zaštićen do sutra: ${s.blockedReason}`, waitMs: 0 };
  if (s.dayRemaining >= 0 && s.dayRemaining - cost < RESERVE)
    return { reason: `Preostalo ${s.dayRemaining} kredita — čuvam rezervu od ${RESERVE} da račun ne bude suspendiran.`, waitMs: 0 };
  if (s.cooldownUntil > now) return { reason: "Hlađenje nakon upozorenja API-ja", waitMs: s.cooldownUntil - now };
  const recent = s.stamps.filter((t) => now - t < 60_000);
  if (recent.length + cost > PER_MIN) return { reason: "Limit po minuti", waitMs: 60_000 - (now - recent[0]!) + 500 };
  const last = recent[recent.length - 1] ?? 0;
  if (now - last < MIN_GAP) return { reason: "Razmak između poziva", waitMs: MIN_GAP - (now - last) };
  return null;
}

export function record(cost: number, rate: { dayRemaining: number; dayLimit: number; minuteRemaining: number }, error: string | null) {
  const s = readState();
  const now = Date.now();
  s.used += cost;
  s.stamps = [...s.stamps.filter((t) => now - t < 60_000), ...Array(cost).fill(now)];
  if (rate.dayRemaining >= 0) s.dayRemaining = rate.dayRemaining;
  if (rate.dayLimit > 0) s.dayLimit = rate.dayLimit;
  if (rate.minuteRemaining >= 0 && rate.minuteRemaining <= 1) s.cooldownUntil = Math.max(s.cooldownUntil, now + 61_000);
  if (error === "RATE_LIMIT") {
    s.strikes429 += 1;
    s.cooldownUntil = now + 65_000 * 2 ** (s.strikes429 - 1);
    // Nakon 3 uzastopna 429: pauza 30 min (NE cijeli dan) — minutni limit se sam resetira.
    if (s.strikes429 >= 3) { s.cooldownUntil = now + 30 * 60_000; s.strikes429 = 0; }
  } else if (error?.startsWith("ACCOUNT")) {
    // Potpuna dnevna blokada samo kad API izričito javi suspenziju računa.
    if (/suspend/i.test(error)) {
      s.blockedDay = s.day;
      s.blockedReason = error.replace("ACCOUNT: ", "");
    } else {
      s.cooldownUntil = Math.max(s.cooldownUntil, now + 5 * 60_000);
    }
  } else if (error && !/bet365/.test(error)) {
    s.errorStreak += 1;
    if (s.errorStreak >= 3) { s.cooldownUntil = now + 5 * 60_000; s.errorStreak = 0; }
  } else {
    s.errorStreak = 0;
    s.strikes429 = 0;
  }
  write(s);
}

const inflight = new Map<string, Promise<unknown>>();

/** Izvrši zaštićeni poziv: cache → dedupe → čekanje u redu → poziv → evidencija. */
export async function guarded<T extends { error: string | null; rate: any }>(
  cacheId: string,
  cost: number,
  fn: () => Promise<T>,
  onWait?: (ms: number, reason: string) => void,
  force = false,
): Promise<T> {
  const ck = CACHE + zagrebDay() + "." + cacheId;
  if (!force) {
    const c = localStorage.getItem(ck);
    if (c) return JSON.parse(c) as T;
  }
  if (inflight.has(ck)) return inflight.get(ck) as Promise<T>;
  const job = (async () => {
    for (let i = 0; i < 6; i++) {
      const g = check(cost);
      if (!g) break;
      if (g.waitMs === 0 || g.waitMs > 5 * 60_000) throw new Error(g.reason);
      onWait?.(g.waitMs, g.reason);
      await new Promise((r) => setTimeout(r, g.waitMs));
    }
    const r = await fn();
    record(cost, r.rate, r.error);
    if (!r.error || /bet365/.test(r.error)) {
      try { localStorage.setItem(ck, JSON.stringify(r)); } catch { pruneCache(); }
    }
    return r;
  })();
  inflight.set(ck, job);
  try { return await job; } finally { inflight.delete(ck); }
}

/** Ručno poništi blokadu/hlađenje (npr. korisnik je siguran da je limit prošao). */
export function resetGuard() {
  const s = readState();
  s.blockedDay = null;
  s.blockedReason = null;
  s.cooldownUntil = 0;
  s.strikes429 = 0;
  s.errorStreak = 0;
  s.stamps = [];
  write(s);
}

export function pruneCache() {
  const today = zagrebDay();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE) && !k.startsWith(CACHE + today)) localStorage.removeItem(k);
  }
}

export function getApiKey(): string | undefined {
  const a = localStorage.getItem("kr-football-api-key");
  if (a?.trim()) return a.trim();
  const b = localStorage.getItem("termometar.apifootball");
  if (!b) return undefined;
  try { const j = JSON.parse(b); return typeof j?.key === "string" ? j.key : undefined; } catch { return b.trim() || undefined; }
}
