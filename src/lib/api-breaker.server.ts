// ══ API-BREAKER: osigurač protiv suspenzije API-Sports računa (server-side) ══
// API-Sports suspendira račune koji NASTAVE slati zahtjeve nakon što je dnevni
// limit potrošen ili nakon opetovanih 429 odgovora. Ovaj osigurač:
//   1) pamti zadnji "remaining" iz zaglavlja i STANE kad padne na rezervu,
//   2) nakon 429 drži hlađenje 60 s za SVE pozive tog servisa,
//   3) nakon potrošenog dnevnog limita blokira do ponoći UTC,
//   4) nakon "suspend"/neispravnog ključa blokira pozive (bez hammeringa).
// Scope = servis + kraj ključa, pa nogomet/košarka/rukomet imaju odvojene kvote.

type Stanje = {
  day: string;
  remaining: number;
  cooldownUntil: number;
  blockedUntil: number;
  reason: string | null;
};

export const RESERVE = 5;
const stanja = new Map<string, Stanje>();

const utcDay = () => new Date().toISOString().slice(0, 10);
const nextUtcMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

export function scopeKey(service: string, apiKey: string): string {
  return `${service}:${apiKey.slice(-6)}`;
}

function get(scope: string): Stanje {
  let s = stanja.get(scope);
  if (!s || s.day !== utcDay()) {
    s = { day: utcDay(), remaining: -1, cooldownUntil: 0, blockedUntil: s?.blockedUntil ?? 0, reason: s?.reason ?? null };
    stanja.set(scope, s);
  }
  return s;
}

/** Vrati poruku greške ako se poziv NE smije poslati, inače null. */
export function breakerCheck(scope: string): string | null {
  const s = get(scope);
  const now = Date.now();
  if (s.blockedUntil > now) return s.reason ?? "ACCOUNT: pozivi su privremeno zaustavljeni radi zaštite računa.";
  if (s.cooldownUntil > now)
    return `RATE_LIMIT: hlađenje API-ja još ${Math.ceil((s.cooldownUntil - now) / 1000)} s — zaštita od suspenzije.`;
  if (s.remaining >= 0 && s.remaining <= RESERVE)
    return `DNEVNI_LIMIT: preostalo ${s.remaining} poziva — čuvam rezervu da račun ne bude suspendiran. Obnova u ponoć UTC.`;
  return null;
}

/** Zabilježi ishod poziva. */
export function breakerRecord(scope: string, r: { status: number; remainingDay: number; error: string | null }) {
  const s = get(scope);
  const now = Date.now();
  if (r.remainingDay >= 0) s.remaining = r.remainingDay;
  const err = r.error ?? "";
  if (!err) {
    s.cooldownUntil = 0;
    return;
  }
  if (/DNEVNI_LIMIT|for the day|daily/i.test(err) || r.remainingDay === 0) {
    s.blockedUntil = nextUtcMidnight();
    s.reason = "DNEVNI_LIMIT: dnevni limit je potrošen — pozivi su zaustavljeni do ponoći UTC da račun ne bude suspendiran.";
  } else if (err.startsWith("RATE_LIMIT") || r.status === 429) {
    s.cooldownUntil = now + 60_000;
  } else if (/suspend/i.test(err)) {
    s.blockedUntil = now + 6 * 60 * 60_000;
    s.reason = `ACCOUNT: račun je označen kao suspendiran — pozivi su zaustavljeni. Provjeri dashboard.api-football.com.`;
  } else if (err.startsWith("ACCOUNT")) {
    s.blockedUntil = now + 5 * 60_000;
    s.reason = err;
  }
}
