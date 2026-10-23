/* ============================================================
   LISTICI.FUNCTIONS.TS — server dohvat statusa i rezultata utakmica
   za poravnanje listića ("Moji listići").
   - getStatusUtakmice: status (FT/PST/CANC/ABD/SUSP…), puni i
     regularni rezultat, poluvrijeme — za void i sport-pravila.
   - getFiksatureDana: sve utakmice jednog dana (za uparivanje
     nogu bez fixtureId-a po imenima momčadi).
   Nogomet preko api-guarda, košarka/rukomet preko sportovi-guarda.
   Rezultat se kešira 10 minuta da provjera ne troši pozive uzalud.
   KLJUČ: prvo ključ s klijenta; ako nema, pokušaj poslužiteljev env
   ključ (API_FOOTBALL_KEY) — kartice rade i bez unesenog ključa kad
   poslužitelj ima ključ; inače jasan "Nedostaje API ključ" error.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardGet } from "./api-guard.server";
import { sportoviGet, type GuardResult } from "./sportovi-guard.server";

const schemaStatus = z.object({
  sport: z.enum(["nogomet", "kosarka", "rukomet"]),
  fixtureId: z.number(),
  apiKey: z.string(),
});

const schemaDan = z.object({
  sport: z.enum(["nogomet", "kosarka", "rukomet"]),
  dan: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  apiKey: z.string(),
});

export type StatusUtakmice = {
  error: string | null;
  status: string;        // API short: "FT", "AET", "PEN", "AOT", "PST", "CANC", "ABD", "SUSP", "NS"…
  zavrsena: boolean;     // utakmica gotova (FT/AET/PEN/AOT)
  dom: number | null;    // konačni rezultat (uklj. produžetke ako je bilo)
  gost: number | null;
  domReg: number | null; // regularno vrijeme (90' / 40-48' / 60')
  gostReg: number | null;
  domHT: number | null;
  gostHT: number | null;
};

export type KandidatFiksatura = { id: number; dom: string; gost: string; status: string; vrijeme?: string | null };
export type FiksatureDana = { error: string | null; fiksature: KandidatFiksatura[] };

const ZAVRSENI_FOOTBALL = ["FT", "AET", "PEN"];
const ZAVRSENI_SPORTOVI = ["FT", "AOT", "AET"];

const fin = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const nista: StatusUtakmice = {
  error: null, status: "", zavrsena: false,
  dom: null, gost: null, domReg: null, gostReg: null, domHT: null, gostHT: null,
};

export const getStatusUtakmice = createServerFn({ method: "GET" })
  .inputValidator((d) => schemaStatus.parse(d))
  .handler(async ({ data }): Promise<StatusUtakmice> => {
    if (data.sport === "kosarka" || data.sport === "rukomet") {
      const r: GuardResult = await sportoviGet(data.sport, `/games?id=${data.fixtureId}`, {
        apiKey: data.apiKey,
        ttlMs: 10 * 60_000,
      });
      if (r.error) return { ...nista, error: r.error };
      const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
      const g = resp[0];
      if (!g) return nista;
      const short = String(g?.status?.short ?? "");
      const kos = data.sport === "kosarka";
      const dom = kos ? fin(g?.scores?.home?.total) : fin(g?.scores?.home);
      const gost = kos ? fin(g?.scores?.away?.total) : fin(g?.scores?.away);

      let domReg: number | null = null;
      let gostReg: number | null = null;
      if (kos) {
        const q = [1, 2, 3, 4].map((i) => ({
          h: fin(g?.scores?.home?.[`quarter_${i}`]),
          a: fin(g?.scores?.away?.[`quarter_${i}`]),
        }));
        if (q.every((x) => x.h != null)) domReg = q.reduce((s, x) => s + (x.h ?? 0), 0);
        if (q.every((x) => x.a != null)) gostReg = q.reduce((s, x) => s + (x.a ?? 0), 0);
        if (domReg == null) {
          const ot = fin(g?.scores?.home?.over_time);
          if (dom != null && ot != null) domReg = dom - ot;
        }
        if (gostReg == null) {
          const ot = fin(g?.scores?.away?.over_time);
          if (gost != null && ot != null) gostReg = gost - ot;
        }
      } else {
        const fh = fin(g?.periods?.first?.home);
        const fa = fin(g?.periods?.first?.away);
        const sh = fin(g?.periods?.second?.home);
        const sa = fin(g?.periods?.second?.away);
        if (fh != null && sh != null) domReg = fh + sh;
        if (fa != null && sa != null) gostReg = fa + sa;
        if (domReg == null) domReg = dom; // rukomet: scores je već 60-minuta rezultat
        if (gostReg == null) gostReg = gost;
      }

      let domHT: number | null = null;
      let gostHT: number | null = null;
      if (kos) {
        const q1h = fin(g?.scores?.home?.quarter_1);
        const q2h = fin(g?.scores?.home?.quarter_2);
        const q1a = fin(g?.scores?.away?.quarter_1);
        const q2a = fin(g?.scores?.away?.quarter_2);
        if (q1h != null && q2h != null) domHT = q1h + q2h;
        if (q1a != null && q2a != null) gostHT = q1a + q2a;
      } else {
        domHT = fin(g?.periods?.first?.home);
        gostHT = fin(g?.periods?.first?.away);
      }

      return {
        error: null, status: short, zavrsena: ZAVRSENI_SPORTOVI.includes(short),
        dom, gost, domReg, gostReg, domHT, gostHT,
      };
    }

    // nogomet — football kvota, api-guard
    const r = await guardGet(`/fixtures?id=${data.fixtureId}`, { apiKey: data.apiKey, ttlMs: 10 * 60_000 });
    if (r.error) return { ...nista, error: r.error };
    const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
    const f = resp[0];
    if (!f) return nista;
    const short = String(f?.fixture?.status?.short ?? f?.status?.short ?? "");
    const dom = fin(f?.goals?.home);
    const gost = fin(f?.goals?.away);
    // 90-minuta rezultat: score.fulltime (AET/PEN utakmice imaju produžetak u goals)
    const dom90 = fin(f?.score?.fulltime?.home) ?? dom;
    const gost90 = fin(f?.score?.fulltime?.away) ?? gost;
    return {
      error: null, status: short, zavrsena: ZAVRSENI_FOOTBALL.includes(short),
      dom, gost,
      domReg: dom90, gostReg: gost90,
      domHT: fin(f?.score?.halftime?.home),
      gostHT: fin(f?.score?.halftime?.away),
    };
  });

export const getFiksatureDana = createServerFn({ method: "GET" })
  .inputValidator((d) => schemaDan.parse(d))
  .handler(async ({ data }): Promise<FiksatureDana> => {
    // ključ s klijenta ili env fallback — kartice rade i bez unesenog ključa
    const kljuc = (data.apiKey || process.env["API_FOOTBALL_KEY"] || "").trim().replace(/^["']|["']$/g, "");
    if (data.sport === "kosarka" || data.sport === "rukomet") {
      const r: GuardResult = await sportoviGet(data.sport, `/games?date=${data.dan}`, {
        apiKey: kljuc,
        ttlMs: 10 * 60_000,
      });
      if (r.error) return { error: r.error, fiksature: [] };
      const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
      return {
        error: null,
        fiksature: resp
          .filter((g) => g?.id != null)
          .map((g) => ({
            id: Number(g.id),
            dom: String(g?.teams?.home?.name ?? ""),
            gost: String(g?.teams?.away?.name ?? ""),
            status: String(g?.status?.short ?? ""),
            vrijeme: typeof g?.timestamp === "number" && Number.isFinite(g.timestamp)
              ? new Date(g.timestamp * 1000).toISOString()
              : g?.date && g?.time ? `${String(g.date)}T${String(g.time)}:00Z` : null,
          })),
      };
    }
    const r = await guardGet(`/fixtures?date=${data.dan}`, { apiKey: kljuc, ttlMs: 10 * 60_000 });
    if (r.error) return { error: r.error, fiksature: [] };
    const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
    return {
      error: null,
      fiksature: resp
        .filter((f) => f?.fixture?.id != null)
        .map((f) => ({
          id: Number(f.fixture.id),
          dom: String(f?.teams?.home?.name ?? ""),
          gost: String(f?.teams?.away?.name ?? ""),
          status: String(f?.fixture?.status?.short ?? f?.status?.short ?? ""),
          vrijeme: String(f?.fixture?.date ?? "") || null,
        })),
    };
  });
