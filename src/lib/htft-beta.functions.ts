/* ============================================================
   HTFT-BETA.FUNCTIONS.TS — podaci za HT/FT Beta karticu
   Svi pozivi idu kroz api-guard (red + keš + retry + stale).
   Specijalitet: čita i tržište Poluvrijeme/Kraj (HT/FT) koje
   ostale kartice preskaču, te punu formu (golovi po utakmici).
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

export type BetaUtakmica = {
  id: number;
  time: string;
  league: string;
  country: string;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
};

export const getBetaUtakmice = createServerFn({ method: "GET" })
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

/* ---------- Forma jednog tima (zadnjih 5) ---------- */

async function dohvatiFormu(teamId: number, apiKey?: string): Promise<FormaStat | null> {
  const r = await call(`/fixtures?team=${teamId}&last=5`, apiKey);
  if (r.error) return null;
  return izracunajFormu((r.data as any[]) ?? []);
}

/* ---------- HT/FT tržište iz sirovih kvota ----------
   API-Football nudi bet "Half Time/Full Time" (npr. Home/Draw = X/1).
   Uzimamo najvišu dostupnu kvotu po ishodu (najbolja za igrača),
   i po mogućnosti 1X2 prvog poluvremena za kalibraciju HT stanja. */

const MAPA: Record<string, string> = { home: "1", draw: "X", away: "2" };

function parsirajHtFt(bookmakers: any[]) {
  const htft: Record<string, number> = {};
  let ht1x2: { "1"?: number; "X"?: number; "2"?: number } | null = null;
  let izvor: string | null = null;

  for (const bm of bookmakers ?? []) {
    for (const bet of bm?.bets ?? []) {
      const name = String(bet?.name ?? "").toLowerCase();
      const vals = (bet?.values ?? []) as { value: unknown; odd: unknown }[];

      if (/(half time\s*\/\s*full time|ht\/ft|half\/full)/.test(name)) {
        for (const v of vals) {
          const m = String(v.value).trim().match(/^(home|draw|away)\s*\/\s*(home|draw|away)$/i);
          const k = Number(v.odd);
          if (!m || !Number.isFinite(k) || k < 1.01) continue;
          const kod = `${MAPA[m[1]!.toLowerCase()]}/${MAPA[m[2]!.toLowerCase()]}`;
          htft[kod] = Math.max(htft[kod] ?? 0, k); // najviša kvota po ishodu
          if (!izvor) izvor = String(bm?.name ?? "");
        }
      }

      if (!ht1x2 && /(1st half|first half|half time)/.test(name) && /winner|1x2|result/.test(name)) {
        const tmp: { "1"?: number; "X"?: number; "2"?: number } = {};
        for (const v of vals) {
          const s = String(v.value).toLowerCase().trim();
          const k = Number(v.odd);
          if (!Number.isFinite(k) || k < 1.01) continue;
          if (s === "home" || s === "1") tmp["1"] = k;
          if (s === "draw" || s === "x") tmp["X"] = k;
          if (s === "away" || s === "2") tmp["2"] = k;
        }
        if (tmp["1"] && tmp["X"] && tmp["2"]) ht1x2 = tmp;
      }
    }
  }
  return { htft, ht1x2, izvor };
}

/* ---------- Bundle za jednu utakmicu ----------
   Kvote cijele utakmice (kroz sastaviKvote) + HT/FT tržište
   + puna forma oba tima. Do 5 API poziva, ali kroz guard. */

const bundleSchema = z.object({
  id: z.number().int().positive(),
  homeId: z.number().int().positive().optional(),
  awayId: z.number().int().positive().optional(),
  apiKey: z.string().optional(),
});

export type BetaBundle = {
  error: string | null;
  remaining: number;
  kvote: Record<string, number>;
  htft: Record<string, number>;
  ht1x2: { "1"?: number; "X"?: number; "2"?: number } | null;
  htftIzvor: string | null;
  formaDom: FormaStat | null;
  formaGost: FormaStat | null;
  bookmaker: string | null;
  upozorenja: string[];
};

export const getBetaBundle = createServerFn({ method: "POST" })
  .inputValidator((d) => bundleSchema.parse(d))
  .handler(async ({ data }): Promise<BetaBundle> => {
    const bookmakers: any[] = [];
    let error: string | null = null;
    for (let page = 1; page <= 3; page++) {
      const r = await call(`/odds?fixture=${data.id}&page=${page}&timezone=${encodeURIComponent(TZ)}`, data.apiKey);
      if (r.error) { error = r.error; break; }
      const resp = (r.data as any[]) ?? [];
      for (const item of resp) bookmakers.push(...(item?.bookmakers ?? []));
      if (resp.length === 0 || page >= 3) break;
      if (bookmakers.length >= 8) break;
    }

    const kv = sastaviKvote(bookmakers);
    const { htft, ht1x2, izvor } = parsirajHtFt(bookmakers);

    const upozorenja = [...kv.upozorenja];
    if (!error && !Object.keys(kv.odds).length) error = "API nije vratio kvote za ovu utakmicu.";

    const [dom, gos] = await Promise.all([
      data.homeId ? dohvatiFormu(data.homeId, data.apiKey) : Promise.resolve(null),
      data.awayId ? dohvatiFormu(data.awayId, data.apiKey) : Promise.resolve(null),
    ]);
    if (!dom) upozorenja.push("Forma domaćina nije dostupna.");
    if (!gos) upozorenja.push("Forma gosta nije dostupna.");

    // Kvote cijele utakmice u brojevima (KvoteSet oblik)
    const kvote: Record<string, number> = {};
    for (const [k, v] of Object.entries(kv.odds)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1.01) kvote[k] = n;
    }

    return {
      error,
      remaining: 0,
      kvote,
      htft,
      ht1x2,
      htftIzvor: izvor,
      formaDom: dom,
      formaGost: gos,
      bookmaker: kv.bookmaker,
      upozorenja,
    };
  });
