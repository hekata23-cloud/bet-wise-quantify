// Zaštita od suspenzije API-Football računa:
// 1. Dnevni limit na 75 zahtjeva (ostavlja 25 kredita rezerve ispod free limita od 100)
// 2. Najmanje 6 sekundi pauze između dva zahtjeva (sprječava HTTP 429 Too Many Requests)
// 3. Trajno pamćenje (cache) za taj dan: popis utakmica i povučene kvote se više ne traže s interneta
const GUARD_KEY = "termometar.apiguard";
const CACHE_PREFIX = "termometar.cache.";
export const DAILY_LIMIT = 75;
export const MIN_GAP_MS = 6000; // 6 sekundi garancija protiv suspenzije

type Guard = { day: string; count: number; last: number; remaining?: number | undefined };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function readGuard(): Guard {
  try {
    const g = JSON.parse(localStorage.getItem(GUARD_KEY) ?? "null") as Guard | null;
    if (g && g.day === today()) return g;
  } catch {
    /* ignore */
  }
  return { day: today(), count: 0, last: 0 };
}

export function canCall(): string | null {
  const g = readGuard();
  if (g.count >= DAILY_LIMIT) {
    return `Sigurnosna zaštita: danas je iskorišteno ${g.count}/${DAILY_LIMIT} zahtjeva. Blokirano radi zaštite od gašenja računa.`;
  }
  if (typeof g.remaining === "number" && g.remaining <= 5) {
    return "API-Football javlja da ti je preostalo samo 5 kredita. Zaustavljeno radi zaštite računa.";
  }
  const wait = MIN_GAP_MS - (Date.now() - g.last);
  if (wait > 0) {
    return `Zaštita brzine: pričekaj još ${Math.ceil(wait / 1000)} s prije novog klika (pravilo max 10/min).`;
  }
  return null;
}

export function recordCall(remaining?: number) {
  const g = readGuard();
  const next: Guard = { day: g.day, count: g.count + 1, last: Date.now(), remaining: remaining ?? g.remaining };
  localStorage.setItem(GUARD_KEY, JSON.stringify(next));
}

export function getCache<T>(id: string, maxAgeMs: number): T | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + id) ?? "null") as { at: number; v: T } | null;
    if (raw && Date.now() - raw.at < maxAgeMs) return raw.v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setCache(id: string, value: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ at: Date.now(), v: value }));
  } catch {
    /* pun spremnik — preskoči */
  }
}

