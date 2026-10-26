/**
 * Pametna zaštita od suspenzije API-Football računa (Zlatni tip & Pro Sharp).
 * 1. Stvarni dnevni limit iz zaglavlja API-ja + minimalna rezerva.
 * 2. Brzo hlađenje: 10-15s na rate-limit, nikad 5 ili 30 minuta blokade.
 * 3. Minimalni razmak smanjen na 2.5s (umjesto 7s).
 * 4. Automatski pronalazi ključ u svim postavkama aplikacije.
 */
const KEY = "zt.guard.v2";
const CACHE = "zt.cache.v2.";
export const PER_MIN = 10;
export const MIN_GAP = 2500;
export const RESERVE = 2;

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
  const fresh: State = {
    day: zagrebDay(),
    used: 0,
    dayRemaining: -1,
    dayLimit: -1,
    stamps: [],
    cooldownUntil: 0,
    strikes429: 0,
    errorStreak: 0,
    blockedDay: null,
    blockedReason: null,
  };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    if (!s) return fresh;
    if (s.day !== zagrebDay()) return { ...fresh };
    
    // Ukloni stare zaostale blokade duže od 30 sekundi
    const now = Date.now();
    if (s.cooldownUntil > now + 30_000) {
      s.cooldownUntil = now + 10_000;
    }
    if (s.blockedDay && !/suspend/i.test(s.blockedReason ?? "")) {
      s.blockedDay = null;
      s.blockedReason = null;
    }
    return s;
  } catch {
    return fresh;
  }
}

const write = (s: State) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

export function check(cost: number): { reason: string; waitMs: number } | null {
  const s = readState();
  const now = Date.now();
  if (s.blockedDay === s.day) {
    return { reason: `Račun zaštićen: ${s.blockedReason}`, waitMs: 0 };
  }
  if (s.dayRemaining >= 0 && s.dayRemaining - cost < RESERVE) {
    return { reason: `Preostalo ${s.dayRemaining} kredita — čuvam rezervu od ${RESERVE} kredita.`, waitMs: 0 };
  }
  if (s.cooldownUntil > now) {
    const wait = Math.min(s.cooldownUntil - now, 15_000);
    return { reason: "Kratka pauza (hlađenje API-ja)", waitMs: wait };
  }
  const recent = s.stamps.filter((t) => now - t < 60_000);
  if (recent.length + cost > PER_MIN) {
    const wait = Math.min(60_000 - (now - recent[0]!) + 500, 15_000);
    return { reason: "Limit po minuti", waitMs: wait };
  }
  const last = recent[recent.length - 1] ?? 0;
  if (now - last < MIN_GAP) {
    return { reason: "Razmak između poziva", waitMs: MIN_GAP - (now - last) };
  }
  return null;
}

export function record(cost: number, rate: { dayRemaining: number; dayLimit: number; minuteRemaining: number }, error: string | null) {
  const s = readState();
  const now = Date.now();
  s.used += cost;
  s.stamps = [...s.stamps.filter((t) => now - t < 60_000), ...Array(cost).fill(now)];
  if (rate.dayRemaining >= 0) s.dayRemaining = rate.dayRemaining;
  if (rate.dayLimit > 0) s.dayLimit = rate.dayLimit;

  if (error === "RATE_LIMIT") {
    s.strikes429 += 1;
    s.cooldownUntil = now + 15_000; // maksimalno 15 sekundi pauze
  } else if (error?.startsWith("ACCOUNT")) {
    if (/suspend/i.test(error)) {
      s.blockedDay = s.day;
      s.blockedReason = error.replace("ACCOUNT: ", "");
    } else {
      s.cooldownUntil = now + 10_000;
    }
  } else if (error && !/bet365/.test(error)) {
    s.errorStreak += 1;
    if (s.errorStreak >= 5) {
      s.cooldownUntil = now + 10_000;
      s.errorStreak = 0;
    }
  } else {
    s.errorStreak = 0;
    s.strikes429 = 0;
    s.cooldownUntil = 0;
  }
  write(s);
}

const inflight = new Map<string, Promise<unknown>>();

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
    for (let i = 0; i < 4; i++) {
      const g = check(cost);
      if (!g) break;
      if (g.waitMs === 0 || g.waitMs > 20_000) {
        throw new Error(g.reason);
      }
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

/** Obriši jedan dnevni cache zapis (npr. utakmica još nema kvote — pokušaj kasnije ponovno). */
export function zaboraviCache(cacheId: string) {
  try { localStorage.removeItem(CACHE + zagrebDay() + "." + cacheId); } catch { /* */ }
}

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
  if (typeof window === "undefined") return undefined;

  // 1. Postavke (/postavke)
  const mainKey = localStorage.getItem("tm.key.apiFootball");
  if (mainKey && mainKey.trim()) return mainKey.trim().replace(/^["']|["']$/g, "");

  // 2. Termometar / Over-Under (/over-under/postavke)
  const b = localStorage.getItem("termometar.apifootball");
  if (b) {
    try {
      const j = JSON.parse(b);
      if (typeof j?.key === "string" && j.key.trim()) return j.key.trim().replace(/^["']|["']$/g, "");
    } catch {
      if (b.trim()) return b.trim().replace(/^["']|["']$/g, "");
    }
  }

  // 3. Prediktor (/prediktor)
  const h = localStorage.getItem("htft:keys");
  if (h) {
    try {
      const j = JSON.parse(h);
      if (typeof j?.football === "string" && j.football.trim()) return j.football.trim().replace(/^["']|["']$/g, "");
    } catch {}
  }

  // 4. Stari ključ
  const a = localStorage.getItem("kr-football-api-key");
  if (a && a.trim()) return a.trim().replace(/^["']|["']$/g, "");

  return undefined;
}
