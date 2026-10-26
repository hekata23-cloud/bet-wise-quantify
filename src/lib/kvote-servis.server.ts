/**
 * Servis za točno učitavanje kvota potrebnih za sve module i Zlatni tip.
 * - Parsira svaku kladionicu zasebno (1X2, Over/Under, BTTS, točan rezultat, korneri, penal).
 * - Točan rezultat uzima u cijelosti od JEDNE najpotpunije kladionice.
 * - Dvostrana tržišta uzima samo kad postoje OBJE strane kod iste kladionice.
 * - Vraća izvor (kladionicu) za svaku grupu kvota radi provjere.
 */
import {
  MAX_KVOTA_REZULTAT,
  MAX_KVOTA_TRZISTE,
  POTREBNO,
  provjeriDvostrano,
} from "./radar-analitika";

type Par = { a: number; b: number };
type Parsirano = {
  ime: string;
  rezultati: Record<string, number>;
  m1x2?: { home?: number; draw?: number; away?: number };
  btts?: Par; // a = DA, b = NE
  ou: Record<string, Par>; // a = over, b = under
  korneri: Record<string, Par>;
  penal?: { ne?: number; da?: number };
};

const ok = (n: number, max = MAX_KVOTA_TRZISTE) => Number.isFinite(n) && n >= 1.01 && n <= max;
const linija = (n: number) => String(parseFloat(n.toFixed(2)));

function parsirajKladionicu(bm: any): Parsirano {
  const p: Parsirano = { ime: String(bm?.name ?? "nepoznato"), rezultati: {}, ou: {}, korneri: {} };
  for (const bet of bm?.bets ?? []) {
    const name = String(bet?.name ?? "").toLowerCase();
    const id = Number(bet?.id);
    const vals = (bet?.values ?? []) as { value: unknown; odd: unknown }[];
    const isFirstHalf = /1st|first|2nd|second|half/.test(name);
    if (isFirstHalf) continue; // samo cijela utakmica

    if (id === 1 || name === "match winner" || name === "1x2") {
      for (const v of vals) {
        const s = String(v.value).toLowerCase().trim();
        const k = Number(v.odd);
        if (!ok(k)) continue;
        p.m1x2 ??= {};
        if (s === "home" || s === "1") p.m1x2.home = k;
        if (s === "draw" || s === "x") p.m1x2.draw = k;
        if (s === "away" || s === "2") p.m1x2.away = k;
      }
    } else if (id === 10 || name === "exact score" || name === "correct score") {
      for (const v of vals) {
        const m = String(v.value)
          .trim()
          .match(/^(\d+)\s*[:-]\s*(\d+)$/);
        const k = Number(v.odd);
        if (m && ok(k, MAX_KVOTA_REZULTAT)) p.rezultati[`${Number(m[1])}:${Number(m[2])}`] = k;
      }
    } else if (id === 8 || name === "both teams score" || name === "both teams to score") {
      let da = NaN,
        ne = NaN;
      for (const v of vals) {
        const s = String(v.value).toLowerCase().trim();
        if (s === "yes") da = Number(v.odd);
        if (s === "no") ne = Number(v.odd);
      }
      if (ok(da) && ok(ne)) p.btts = { a: da, b: ne };
    } else if (id === 45 || (name.includes("corner") && name.includes("over/under"))) {
      skupiOU(vals, p.korneri);
    } else if (id === 5 || name === "goals over/under") {
      skupiOU(vals, p.ou);
    } else if (name.includes("penalty")) {
      for (const v of vals) {
        const s = String(v.value).toLowerCase().trim();
        const k = Number(v.odd);
        if (!ok(k)) continue;
        p.penal ??= {};
        if (s === "no") p.penal.ne = k;
        if (s === "yes") p.penal.da = k;
      }
    }
  }
  return p;
}

function skupiOU(vals: { value: unknown; odd: unknown }[], cilj: Record<string, Par>) {
  const tmp: Record<string, { o?: number; u?: number }> = {};
  for (const v of vals) {
    const m = String(v.value)
      .trim()
      .match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)$/i);
    const k = Number(v.odd);
    if (!m || !ok(k)) continue;
    const l = linija(parseFloat(m[2]!));
    (tmp[l] ??= {})[m[1]!.toLowerCase() === "over" ? "o" : "u"] = k;
  }
  for (const [l, x] of Object.entries(tmp)) {
    if (x.o && x.u && provjeriDvostrano(x.o, x.u).ok) cilj[l] = { a: x.o, b: x.u };
  }
}

function bodovi(p: Parsirano): number {
  const kljucevi = new Set(
    Object.values(POTREBNO)
      .flatMap((x) => x.kljucevi)
      .filter((k) => k.includes(":")),
  );
  let s = 0;
  kljucevi.forEach((k) => p.rezultati[k] && (s += 2));
  s += Math.min(Object.keys(p.rezultati).length, 25) * 0.2;
  if (p.m1x2?.home && p.m1x2?.draw && p.m1x2?.away) s += 4;
  if (p.btts) s += 3;
  for (const l of ["1.5", "2.5", "3.5"]) if (p.ou[l]) s += 3;
  if (Object.keys(p.korneri).length) s += 3;
  if (p.penal?.ne) s += 3;
  return s;
}

export type KvoteRezultat = {
  odds: Record<string, string>;
  corners: { line: number; over: number; under: number } | null;
  bookmaker: string | null;
  izvori: Record<string, string>;
  upozorenja: string[];
  brojKladionica: number;
};

export function sastaviKvote(bookmakers: any[]): KvoteRezultat {
  const sve = bookmakers.map(parsirajKladionicu).sort((a, b) => bodovi(b) - bodovi(a));
  const odds: Record<string, string> = {};
  const izvori: Record<string, string> = {};
  const upozorenja: string[] = [];
  const primarna = sve[0] ?? null;

  if (!primarna) {
    return {
      odds,
      corners: null,
      bookmaker: null,
      izvori,
      upozorenja: ["API nema kvote ni jedne kladionice za ovu utakmicu."],
      brojKladionica: 0,
    };
  }

  const redoslijed = sve;

  // 1X2 tržište (za Zlatni tip i glavno klađenje)
  const m1x2 = redoslijed.find((p) => p.m1x2?.home && p.m1x2?.draw && p.m1x2?.away);
  if (m1x2?.m1x2) {
    odds["1"] = String(m1x2.m1x2.home);
    odds["X"] = String(m1x2.m1x2.draw);
    odds["2"] = String(m1x2.m1x2.away);
    izvori["1X2"] = m1x2.ime;
  }

  // Točan rezultat: cijeli skup od jedne kladionice s najviše rezultata
  const rez = [...sve].sort(
    (a, b) => Object.keys(b.rezultati).length - Object.keys(a.rezultati).length,
  )[0]!;
  if (Object.keys(rez.rezultati).length) {
    for (const [k, v] of Object.entries(rez.rezultati)) odds[k] = String(v);
    izvori["Točan rezultat"] = rez.ime;
    if (Object.keys(rez.rezultati).length < 12)
      upozorenja.push(
        `Točan rezultat ima samo ${Object.keys(rez.rezultati).length} ponuđenih rezultata.`,
      );
  } else upozorenja.push("Nema tržišta točnog rezultata — indikatori nisu u potpunosti pouzdani.");

  const btts = redoslijed.find((p) => p.btts);
  if (btts) {
    odds["bttsDa"] = String(btts.btts!.a);
    odds["bttsNe"] = String(btts.btts!.b);
    izvori["BTTS"] = btts.ime;
  } else upozorenja.push("Nema potpunog BTTS tržišta (DA i NE).");

  for (const [l, key] of [
    ["1.5", "15"],
    ["2.5", "25"],
    ["3.5", "35"],
  ] as const) {
    const s = redoslijed.find((p) => p.ou[l]);
    if (s) {
      odds[`o${key}`] = String(s.ou[l]!.a);
      odds[`u${key}`] = String(s.ou[l]!.b);
      izvori[`Golovi ${l}`] = s.ime;
    } else upozorenja.push(`Nema potpunog tržišta Više/Manje ${l} gola.`);
  }

  // Korneri
  let bestCorners: { line: number; over: number; under: number } | null = null;
  let minDiff = Infinity;
  for (const p of redoslijed) {
    for (const [lStr, par] of Object.entries(p.korneri)) {
      const diff = Math.abs(par.a - par.b);
      if (diff < minDiff) {
        minDiff = diff;
        bestCorners = { line: parseFloat(lStr), over: par.a, under: par.b };
        izvori["Korneri"] = p.ime;
      }
    }
    if (bestCorners) break;
  }

  const penal = redoslijed.find((p) => p.penal?.ne || p.penal?.da);
  if (penal?.penal?.ne) {
    odds["penalNe"] = String(penal.penal.ne);
    izvori["Kazneni udarac"] = penal.ime;
  }
  if (penal?.penal?.da) odds["penalDa"] = String(penal.penal.da);

  return {
    odds,
    corners: bestCorners,
    bookmaker: primarna.ime,
    izvori,
    upozorenja,
    brojKladionica: sve.length,
  };
}

export type FormaStat = {
  odigrano: number;
  postignuti: number;
  primljeni: number;
  btts: number;
  over15: number;
  over25: number;
  under35: number;
  penali: number;
};

/* ═══════════════ SAFE-MATH PARSING GOLOVA (v7) ═══════════════
   API-Football šalje golove u više oblika: { goals: { home, away } },
   { homeGoals, awayGoals }, { score: { fulltime: { home, away } } },
   pa i kao stringovi ("2"). Ova funkcija u svakom obliku nađe čisti
   broj; neispravan/pokvaren podatak postaje 0 — NIKAD NaN. */
function cistiGol(v: unknown): number {
  let n: number | null = null;
  if (typeof v === "number") n = Number.isFinite(v) ? v : null;
  else if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (/^-?\d+(\.\d+)?$/.test(s)) n = parseFloat(s);
  } else if (typeof v === "object" && v != null) {
    const o = v as Record<string, unknown>;
    if (typeof o.home === "number" && Number.isFinite(o.home)) n = o.home;
    else if (typeof o.away === "number" && Number.isFinite(o.away)) n = o.away;
  }
  if (n == null || n < 0 || n > 30) return 0;
  return Math.round(n);
}

function goloviUtakmice(u: any): { dom: number; gost: number } {
  const gh =
    cistiGol(u?.goals?.home) ||
    cistiGol(u?.homeGoals) ||
    cistiGol(u?.score?.fulltime?.home) ||
    cistiGol(u?.score?.current?.home) ||
    0;
  const ga =
    cistiGol(u?.goals?.away) ||
    cistiGol(u?.awayGoals) ||
    cistiGol(u?.score?.fulltime?.away) ||
    cistiGol(u?.score?.current?.away) ||
    0;
  return { dom: gh, gost: ga };
}

export function izracunajFormu(utakmice: any[]): FormaStat | null {
  const zavrsene = (utakmice || []).filter((u) => {
    const st = u?.fixture?.status?.short;
    return st === "FT" || st === "AET" || st === "PEN";
  });
  if (!zavrsene.length) return null;

  let postignuti = 0,
    primljeni = 0;
  let btts = 0,
    over15 = 0,
    over25 = 0,
    under35 = 0,
    penali = 0;

  for (const u of zavrsene) {
    // SAFE-MATH štit: string golovi ("2"), null i NaN postaju 0.
    const { dom: gh, gost: ga } = goloviUtakmice(u);
    const total = gh + ga;

    postignuti += gh;
    primljeni += ga;

    if (gh > 0 && ga > 0) btts++;
    if (total > 1.5) over15++;
    if (total > 2.5) over25++;
    if (total < 3.5) under35++;

    const events = (u?.events as any[]) || [];
    const imaPenal = events.some((ev) => {
      const type = String(ev?.type || "").toLowerCase();
      const detail = String(ev?.detail || "").toLowerCase();
      return (
        detail.includes("penalty") ||
        detail.includes("pen") ||
        (type === "goal" && detail.includes("penalty"))
      );
    });
    if (imaPenal) penali++;
  }

  return {
    odigrano: zavrsene.length,
    postignuti,
    primljeni,
    btts,
    over15,
    over25,
    under35,
    penali,
  };
}
