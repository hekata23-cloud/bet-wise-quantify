/* ═══════════════════════════════════════════════════════════════════
   ODDS-TRACKER — historija kvota i CLV indikator (radi u pregledniku)
   ═══════════════════════════════════════════════════════════════════
   Svaki put kad kartica dohvati svježe kvote, panel zapiše snapshot.
   Kasnije:
     • Live Kvote Tracker: usporedba prve i zadnje kvote po tržištu —
       "ide u tvoju korist" ili "protiv tvoje predikcije";
     • CLV (Closing Line Value): jesi li uzeo bolju kvotu nego što je
       bila na kraju (zadnji snimak prije početka = proxy za zatvaranje).
   localStorage ključ: "pc.kvote.v1.{fixtureId}", max 50 snimaka.
   ═══════════════════════════════════════════════════════════════════ */

export type KvotaSnapshot = {
  t: number;              // ms — kad je snimljeno
  kvote: Record<string, number>;
};

const KLJUC = (fixtureId: number) => `pc.kvote.v1.${fixtureId}`;
const MAX_SNIMAKA = 50;
/** Dva snimka u ovom razmaku se dedupliciraju (kvote se ne mijenjaju toliko brzo). */
const MIN_RAZMAK_MS = 10 * 60_000;

function citaj(fixtureId: number): KvotaSnapshot[] {
  try {
    const raw = localStorage.getItem(KLJUC(fixtureId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as KvotaSnapshot[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pisi(fixtureId: number, s: KvotaSnapshot[]) {
  try {
    localStorage.setItem(KLJUC(fixtureId), JSON.stringify(s.slice(-MAX_SNIMAKA)));
  } catch { /* pun localStorage — preskoči */ }
}

/** Zapamti trenutne kvote. Vraća broj snimaka. Duplikat unutar 10 min se ne pamti dvaput. */
export function spremiSnapshot(fixtureId: number, kvote: Record<string, number>): number {
  const postojeci = citaj(fixtureId);
  const sad = Date.now();
  const zadnji = postojeci[postojeci.length - 1];
  if (zadnji && sad - zadnji.t < MIN_RAZMAK_MS) {
    // ažuriraj vrijednosti u zadnjem snimku bez novog zapisa
    zadnji.kvote = { ...kvote };
    pisi(fixtureId, postojeci);
    return postojeci.length;
  }
  postojeci.push({ t: sad, kvote: { ...kvote } });
  pisi(fixtureId, postojeci);
  return postojeci.length;
}

/** Svi snimci za utakmicu (od najstarijeg). */
export function snapshoti(fixtureId: number): KvotaSnapshot[] {
  return citaj(fixtureId);
}

/** Obriši historiju kvota za utakmicu. */
export function brisiTracker(fixtureId: number): void {
  try {
    localStorage.removeItem(KLJUC(fixtureId));
  } catch { /* ignoriraj */ }
}

export type KretanjeKvote = {
  kljuc: string;
  prva: number | null;
  zadnja: number | null;
  deltaPct: number | null;   // npr. +6.2 = kvota je porasla 6.2%
  smjer: "gore" | "dolje" | "isto" | "nema";
  /** Za tvoju stranu: "za tebe" = tržište jače vjeruje u tvoj tip. */
  tumanenje: string;
};

/**
 * Kretanje kvota od prvog do zadnjeg snimka.
 * @param tvojaKljucana ključ tržišta koje je tvoj tip (npr. "bttsDa") —
 *                      utječe na tumačenje smjera.
 */
export function kretanjeKvota(fixtureId: number, tvojaKljucana?: string): KretanjeKvote[] {
  const s = citaj(fixtureId);
  if (s.length < 2) return [];
  const prva = s[0]!.kvote;
  const zadnja = s[s.length - 1]!.kvote;
  const kljucevi = new Set([...Object.keys(prva), ...Object.keys(zadnja)]);
  const out: KretanjeKvote[] = [];
  for (const k of kljucevi) {
    const a = prva[k];
    const b = zadnja[k];
    if (a == null && b == null) continue;
    const delta = a != null && b != null && a > 0 ? Math.round(((b / a - 1) * 100) * 10) / 10 : null;
    const smjer: KretanjeKvote["smjer"] = delta == null ? "nema" : delta > 0.5 ? "gore" : delta < -0.5 ? "dolje" : "isto";
    let tumanenje = "";
    if (smjer === "isto") tumanenje = "Kvota se ne mijenja.";
    else if (k != null && k === tvojaKljucana) {
      tumanenje = smjer === "dolje"
        ? "Tržište ide U TVOJU KORIST — kvota pada, tržište sve više vjeruje u tvoj tip."
        : "Kvota raste — tržište ide PROTIV tvog tipa (ali sada nudi višu kvotu / veću vrijednost).";
    } else {
      tumanenje = smjer === "dolje" ? "Kvota pada." : "Kvota raste.";
    }
    out.push({ kljuc: k, prva: a ?? null, zadnja: b ?? null, deltaPct: delta, smjer, tumanenje });
  }
  return out.sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0));
}

export type ClvIzlaz = {
  postoji: boolean;
  kljuc: string;
  kvotaUzeta: number | null;     // tvoja kvota u trenutku analize
  kvotaZatvaranja: number | null;// zadnja snimljena kvota (proxy za zatvaranje)
  clvPct: number | null;         // + = uzeo bolju kvotu nego zatvaranje
  nSnimaka: number;
  prvoVrijeme: number | null;
  zadnjeVrijeme: number | null;
};

/**
 * CLV za dani ključ tipa. Pozitivan CLV = dobio si bolju kvotu nego što je
 * tržište na kraju ponudilo — dugoročno jedino što dokazuje dobar ulog.
 */
export function clvZaTip(fixtureId: number, kljuc: string): ClvIzlaz {
  const s = citaj(fixtureId);
  const prva = s[0];
  const zadnja = s[s.length - 1];
  const kvotaUzeta = prva?.kvote[kljuc] ?? null;
  const kvotaZatvaranja = zadnja?.kvote[kljuc] ?? null;
  let clvPct: number | null = null;
  if (kvotaUzeta != null && kvotaZatvaranja != null && kvotaZatvaranja > 0) {
    clvPct = Math.round(((kvotaUzeta / kvotaZatvaranja - 1) * 100) * 10) / 10;
  }
  return {
    postoji: s.length >= 2 && clvPct != null,
    kljuc,
    kvotaUzeta,
    kvotaZatvaranja,
    clvPct,
    nSnimaka: s.length,
    prvoVrijeme: prva?.t ?? null,
    zadnjeVrijeme: zadnja?.t ?? null,
  };
}
