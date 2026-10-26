/**
 * Zaštita API-Basketball računa (zaseban dnevni limit od API-Football).
 * Dnevni cache, razmak 2.5 s, max 8 poziva/min, kratko hlađenje 15 s na 429,
 * rezerva kredita i trajna blokada samo kod suspenzije.
 */
const KEY = "kos.guard.v1";
const CACHE = "kos.cache.v1.";
const PER_MIN = 8;
const MIN_GAP = 2500;
const RESERVE = 3;

type State = { day: string; used: number; dayRemaining: number; stamps: number[]; cooldownUntil: number; blocked: string | null };

export const zagrebDay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zagreb" });

export function readKosState(): State {
  const fresh: State = { day: zagrebDay(), used: 0, dayRemaining: -1, stamps: [], cooldownUntil: 0, blocked: null };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (!s || s.day !== fresh.day) return fresh;
    return s;
  } catch {
    return fresh;
  }
}
const write = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

function check(): { reason: string; waitMs: number } | null {
  const s = readKosState();
  const now = Date.now();
  if (s.blocked) return { reason: `Račun zaštićen: ${s.blocked}`, waitMs: 0 };
  if (s.dayRemaining >= 0 && s.dayRemaining - 1 < RESERVE)
    return { reason: `Preostalo ${s.dayRemaining} kredita — čuvam rezervu.`, waitMs: 0 };
  if (s.cooldownUntil > now) return { reason: "Hlađenje API-ja", waitMs: Math.min(s.cooldownUntil - now, 15_000) };
  const recent = s.stamps.filter((t) => now - t < 60_000);
  if (recent.length + 1 > PER_MIN) return { reason: "Limit po minuti", waitMs: Math.min(60_000 - (now - recent[0]!) + 500, 15_000) };
  const last = recent[recent.length - 1] ?? 0;
  if (now - last < MIN_GAP) return { reason: "Razmak između poziva", waitMs: MIN_GAP - (now - last) };
  return null;
}

function record(rate: { dayRemaining: number }, error: string | null) {
  const s = readKosState();
  const now = Date.now();
  s.used += 1;
  s.stamps = [...s.stamps.filter((t) => now - t < 60_000), now];
  if (rate.dayRemaining >= 0) s.dayRemaining = rate.dayRemaining;
  if (error === "RATE_LIMIT") s.cooldownUntil = now + 15_000;
  else if (error?.startsWith("ACCOUNT")) {
    if (/suspend/i.test(error)) s.blocked = error.replace("ACCOUNT: ", "");
    else s.cooldownUntil = now + 10_000;
  } else s.cooldownUntil = 0;
  write(s);
}

const inflight = new Map<string, Promise<unknown>>();

export async function kosGuarded<T extends { error: string | null; rate: any }>(
  id: string, fn: () => Promise<T>, onWait?: (ms: number, reason: string) => void, force = false,
): Promise<T> {
  const ck = CACHE + zagrebDay() + "." + id;
  if (!force) {
    const c = localStorage.getItem(ck);
    if (c) return JSON.parse(c) as T;
  }
  if (inflight.has(ck)) return inflight.get(ck) as Promise<T>;
  const job = (async () => {
    for (let i = 0; i < 4; i++) {
      const g = check();
      if (!g) break;
      if (g.waitMs === 0) throw new Error(g.reason);
      onWait?.(g.waitMs, g.reason);
      await new Promise((r) => setTimeout(r, g.waitMs));
    }
    const r = await fn();
    record(r.rate, r.error);
    if (!r.error) {
      try { localStorage.setItem(ck, JSON.stringify(r)); } catch { pruneKos(); }
    }
    return r;
  })();
  inflight.set(ck, job);
  try { return await job; } finally { inflight.delete(ck); }
}

export function resetKosGuard() {
  const s = readKosState();
  s.blocked = null; s.cooldownUntil = 0; s.stamps = [];
  write(s);
}

function pruneKos() {
  const today = zagrebDay();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE) && !k.startsWith(CACHE + today)) localStorage.removeItem(k);
  }
}
