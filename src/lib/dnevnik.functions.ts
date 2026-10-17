/* ============================================================
   DNEVNIK.FUNCTIONS.TS (v2) — dohvat STVARNOG rezultata utakmice
   za provjeru tipova. Nogomet ide preko api-guarda (football kvota),
   košarka i rukomet preko sportovi-guarda (svaki sport svoju kvotu).
   Rezultat se kešira 10 minuta da provjera ne troši pozive uzalud.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardGet } from "./api-guard.server";
import { sportoviGet, type GuardResult } from "./sportovi-guard.server";

const schema = z.object({
  sport: z.enum(["nogomet", "kosarka", "rukomet"]).optional(),
  fixtureId: z.number(),
  apiKey: z.string(),
});

export type RezultatUtakmice = {
  error: string | null;
  zavrsena: boolean;
  dom: number | null;
  gost: number | null;
  domHT: number | null;  // poluvrijeme (nogomet) ili 1. pola (sportovi)
  gostHT: number | null;
  domReg: number | null; // regularno vrijeme (bez produžetaka)
  gostReg: number | null;
};

const ZAVRSENI_FOOTBALL = ["FT", "AET", "PEN"];
const ZAVRSENI_SPORTOVI = ["FT", "AOT", "AET"];

export const getRezultat = createServerFn({ method: "GET" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }): Promise<RezultatUtakmice> => {
    const nista: RezultatUtakmice = { error: null, zavrsena: false, dom: null, gost: null, domHT: null, gostHT: null, domReg: null, gostReg: null };

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
      if (!ZAVRSENI_SPORTOVI.includes(short)) return nista;
      const kos = data.sport === "kosarka";
      const dom = Number(kos ? g?.scores?.home?.total : g?.scores?.home);
      const gost = Number(kos ? g?.scores?.away?.total : g?.scores?.away);
      let domHT: number | null = null;
      let gostHT: number | null = null;
      let domReg: number | null = null;
      let gostReg: number | null = null;
      const zbroj = (xs: unknown[]) => {
        const n = xs.map((x) => Number(x));
        return n.every((x) => Number.isFinite(x)) ? n.reduce((a, b) => a + b, 0) : null;
      };
      if (kos) {
        const h = g?.scores?.home ?? {}, a = g?.scores?.away ?? {};
        domReg = zbroj([h.quarter_1, h.quarter_2, h.quarter_3, h.quarter_4]);
        gostReg = zbroj([a.quarter_1, a.quarter_2, a.quarter_3, a.quarter_4]);
        const q1h = Number(g?.scores?.home?.quarter_1 ?? NaN);
        const q2h = Number(g?.scores?.home?.quarter_2 ?? NaN);
        const q1a = Number(g?.scores?.away?.quarter_1 ?? NaN);
        const q2a = Number(g?.scores?.away?.quarter_2 ?? NaN);
        if (Number.isFinite(q1h) && Number.isFinite(q2h)) domHT = q1h + q2h;
        if (Number.isFinite(q1a) && Number.isFinite(q2a)) gostHT = q1a + q2a;
      } else {
        const fh = Number(g?.periods?.first?.home ?? NaN);
        const fa = Number(g?.periods?.first?.away ?? NaN);
        if (Number.isFinite(fh)) domHT = fh;
        if (Number.isFinite(fa)) gostHT = fa;
        domReg = zbroj([g?.periods?.first?.home, g?.periods?.second?.home]);
        gostReg = zbroj([g?.periods?.first?.away, g?.periods?.second?.away]);
      }
      if (!Number.isFinite(dom) || !Number.isFinite(gost)) return nista;
      return { error: null, zavrsena: true, dom, gost, domHT, gostHT, domReg, gostReg };
    }

    // nogomet — ista logika kao prije (football kvota, api-guard)
    const r = await guardGet(`/fixtures?id=${data.fixtureId}`, { apiKey: data.apiKey, ttlMs: 10 * 60_000 });
    if (r.error) return { ...nista, error: r.error };
    const resp = Array.isArray(r.data) ? (r.data as any[]) : [];
    const f = resp[0];
    if (!f) return nista;
    const short = String(f?.status?.short ?? "");
    if (!ZAVRSENI_FOOTBALL.includes(short)) return nista;
    const dom = Number(f?.goals?.home ?? NaN);
    const gost = Number(f?.goals?.away ?? NaN);
    const domHT = Number(f?.score?.halftime?.home ?? NaN);
    const gostHT = Number(f?.score?.halftime?.away ?? NaN);
    return {
      error: null,
      zavrsena: true,
      dom: Number.isFinite(dom) ? dom : null,
      gost: Number.isFinite(gost) ? gost : null,
      domHT: Number.isFinite(domHT) ? domHT : null,
      gostHT: Number.isFinite(gostHT) ? gostHT : null,
      domReg: null,
      gostReg: null,
    };
  });
