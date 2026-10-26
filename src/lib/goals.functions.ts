/* ============================================================
   GOALS.FUNCTIONS.TS — podaci za BTTS Ultra i 2.5 Pro karticu
   Svi pozivi idu kroz api-guard (red + keš + retry + stale),
   pa ove dvije kartice NE MOGU oboriti dnevni limit Football API-ja.
   Izlaz: kvote (1X2, BTTS, O/U 1.5/2.5/3.5) + MEDIAN konsenzus svih
   kladionica (otporniji na iskočenu kvotu jedne knjige) + forma.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardGet } from "./api-guard.server";
import { sastaviKvote, izracunajFormu, type FormaStat } from "./kvote-servis.server";

const TZ = "Europe/Zagreb";

function resolveKey(clientKey?: string | null): string | null {
  const k = clientKey?.trim() || process.env["API_FOOTBALL_KEY"]?.trim() || null;
  if (!k) return null;
  return k.replace(/^["']|["']$/g, "").trim();
}

async function call(path: string, clientKey?: string | null) {
  const key = resolveKey(clientKey);
  if (!key) {
    return { error: "Nedostaje API ključ. Unesi ga u Postavkama (⚙️).", data: null as unknown, remaining: -1 };
  }
  const r = await guardGet(path, { apiKey: key });
  const error = r.error === "RATE_LIMIT"
    ? "Privremeni limit API-ja (10 poziva/min) — pričekaj minutu pa probaj opet."
    : r.error;
  return { error, data: r.data, remaining: r.remainingDay };
}

/* ---------- Utakmice po danu (1 API poziv za cijeli dan) ---------- */

const danjiSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  apiKey: z.string().optional(),
});

export type GoalsUtakmica = {
  id: number;
  time: string;
  league: string;
  country: string;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
};

export const getGoalsUtakmice = createServerFn({ method: "GET" })
  .inputValidator((d) => danjiSchema.parse(d))
  .handler(async ({ data }) => {
    const r = await call(
      `/fixtures?date=${data.date}&timezone=${encodeURIComponent(TZ)}`,
      data.apiKey,
    );
    const list = ((r.data as any[]) ?? [])
      .filter((f) => ["NS", "TBD"].includes(f?.fixture?.status?.short))
      .map((f) => ({
        id: f.fixture.id as number,
        time: f.fixture.date as string,
        league: f.league?.name as string,
        country: f.league?.country as string,
        home: f.teams?.home?.name as string,
        away: f.teams?.away?.name as string,
        homeId: f.teams?.home?.id as number,
        awayId: f.teams?.away?.id as number,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
    return { error: r.error, remaining: r.remaining ?? -1, utakmice: list };
  });

/* ---------- Konsenzus: MEDIAN kvota po tržištu preko SVIH kladionica.
   SastaviKvote uzima jednu najpotpuniju knjigu; median preko svih je
   otporan na iskočenu/staru kvotu jedne kladionice. Samo cijela utakmica. */

type Par = { da?: number; ne?: number };

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function parsirajKonsenzus(bookmakers: any[]) {
  const btts: Par[] = [];
  const ou: Record<string, { o: number[]; u: number[] }> = { "1.5": { o: [], u: [] }, "2.5": { o: [], u: [] }, "3.5": { o: [], u: [] } };
  const m1x2: { home: number[]; draw: number[]; away: number[] } = { home: [], draw: [], away: [] };

  for (const bm of bookmakers ?? []) {
    for (const bet of bm?.bets ?? []) {
      const id = Number(bet?.id);
      const name = String(bet?.name ?? "").toLowerCase();
      if (/1st|first|2nd|second|half/.test(name)) continue; // samo cijela utakmica
      const vals = (bet?.values ?? []) as { value: unknown; odd: unknown }[];

      if (id === 8 || name === "both teams score" || name === "both teams to score") {
        const p: Par = {};
        for (const v of vals) {
          const s = String(v.value).toLowerCase().trim();
          const k = Number(v.odd);
          if (!Number.isFinite(k) || k < 1.01) continue;
          if (s === "yes") p.da = k;
          if (s === "no") p.ne = k;
        }
        if (p.da && p.ne) btts.push(p);
      } else if (id === 5 || name === "goals over/under") {
        const tmp: Record<string, { o?: number; u?: number }> = {};
        for (const v of vals) {
          const m = String(v.value).trim().match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)$/i);
          const k = Number(v.odd);
          if (!m || !Number.isFinite(k) || k < 1.01) continue;
          (tmp[parseFloat(m[2]!).toFixed(2)] ??= {})[m[1]!.toLowerCase() === "over" ? "o" : "u"] = k;
        }
        for (const [l, x] of Object.entries(tmp)) {
          const kl = l in ou ? l : null;
          if (kl && x.o && x.u) {
            ou[kl]!.o.push(x.o);
            ou[kl]!.u.push(x.u);
          }
        }
      } else if (id === 1 || name === "match winner" || name === "1x2") {
        for (const v of vals) {
          const s = String(v.value).toLowerCase().trim();
          const k = Number(v.odd);
          if (!Number.isFinite(k) || k < 1.01) continue;
          if (s === "home" || s === "1") m1x2.home.push(k);
          if (s === "draw" || s === "x") m1x2.draw.push(k);
          if (s === "away" || s === "2") m1x2.away.push(k);
        }
      }
    }
  }

  const konz: Record<string, number> = {};
  const bttsDa = mediana(btts.map((p) => p.da!));
  const bttsNe = mediana(btts.map((p) => p.ne!));
  if (bttsDa) konz["bttsDa"] = bttsDa;
  if (bttsNe) konz["bttsNe"] = bttsNe;
  for (const l of ["1.5", "2.5", "3.5"]) {
    const o = mediana(ou[l]!.o);
    const u = mediana(ou[l]!.u);
    if (o) konz[`o${l.replace(".", "")}`] = o;
    if (u) konz[`u${l.replace(".", "")}`] = u;
  }
  const h = mediana(m1x2.home), x = mediana(m1x2.draw), a = mediana(m1x2.away);
  if (h) konz["1"] = h;
  if (x) konz["X"] = x;
  if (a) konz["2"] = a;
  return { konsenzus: konz, knjigaBtts: btts.length, knjigaOu: Object.values(ou).filter((v) => v.o.length && v.u.length).length };
}

/* ---------- Forma jednog tima (zadnjih 6 — kroz guard, keširano 6 h) ---------- */

async function dohvatiFormu(teamId: number, apiKey?: string): Promise<FormaStat | null> {
  const r = await call(`/fixtures?team=${teamId}&last=6`, apiKey);
  if (r.error) return null;
  return izracunajFormu((r.data as any[]) ?? []);
}

/* ---------- Bundle za jednu utakmicu ---------- */

const bundleSchema = z.object({
  id: z.number().int().positive(),
  homeId: z.number().int().positive().optional(),
  awayId: z.number().int().positive().optional(),
  apiKey: z.string().optional(),
});

export type GoalsBundle = {
  error: string | null;
  remaining: number;
  kvote: Record<string, number>;
  konsenzus: Record<string, number>;
  knjigaBtts: number;
  knjigaOu: number;
  formaDom: FormaStat | null;
  formaGost: FormaStat | null;
  bookmaker: string | null;
  upozorenja: string[];
};

export const getGoalsBundle = createServerFn({ method: "POST" })
  .inputValidator((d) => bundleSchema.parse(d))
  .handler(async ({ data }): Promise<GoalsBundle> => {
    const bookmakers: any[] = [];
    let error: string | null = null;
    for (let page = 1; page <= 1; page++) {
      const r = await call(`/odds?fixture=${data.id}&page=${page}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
      if (r.error) { error = r.error; break; }
      const resp = (r.data as any[]) ?? [];
      for (const item of resp) bookmakers.push(...(item?.bookmakers ?? []));
      if (resp.length === 0 || page >= 3) break;
      if (bookmakers.length >= 8) break;
    }

    const kv = sastaviKvote(bookmakers);
    const { konsenzus, knjigaBtts, knjigaOu } = parsirajKonsenzus(bookmakers);

    const upozorenja = [...kv.upozorenja];
    if (!error && !Object.keys(kv.odds).length && !Object.keys(konsenzus).length)
      error = "API nije vratio kvote za ovu utakmicu.";

    const [dom, gos] = await Promise.all([
      data.homeId ? dohvatiFormu(data.homeId, data.apiKey) : Promise.resolve(null),
      data.awayId ? dohvatiFormu(data.awayId, data.apiKey) : Promise.resolve(null),
    ]);
    if (!dom) upozorenja.push("Forma domaćina nije dostupna.");
    if (!gos) upozorenja.push("Forma gosta nije dostupna.");

    const kvote: Record<string, number> = {};
    for (const [k, v] of Object.entries(kv.odds)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1.01) kvote[k] = n;
    }
    // konsenzus dopuni ono što primarni set nema (ne mijenja postojeće)
    for (const [k, v] of Object.entries(konsenzus)) {
      if (!(k in kvote)) kvote[k] = v;
    }

    return {
      error,
      remaining: 0,
      kvote,
      konsenzus,
      knjigaBtts,
      knjigaOu,
      formaDom: dom,
      formaGost: gos,
      bookmaker: kv.bookmaker,
      upozorenja,
    };
  });
