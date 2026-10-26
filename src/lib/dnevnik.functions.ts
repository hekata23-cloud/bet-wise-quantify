/* ============================================================
   DNEVNIK.FUNCTIONS.TS (v3) — dohvat STVARNOG rezultata utakmice
   za provjeru tipova. Nogomet ide preko api-guarda (football kvota),
   košarka i rukomet preko sportovi-guarda (svaki sport svoju kvotu).
   NOVO u v3: vraća i REGULARNI rezultat (domReg/gostReg):
   - košarka: zbroj 4 četvrtine (bez produžetaka)
   - rukomet: 1. + 2. poluvrijeme (60 minuta, bez produžetaka)
   - nogomet: konačni rezultat = regularni rezultat
   Time se tip "X (4 četvrtine)" i rukometni 1X2 u regularnom vremenu
   ocjenjuju TOČNO i kad utakmica ide u produžetke.
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
  domHT: number | null;   // poluvrijeme (nogomet) ili 1. pola (sportovi)
  gostHT: number | null;
  domReg: number | null;  // regularni rezultat (bez produžetaka)
  gostReg: number | null;
};

const ZAVRSENI_FOOTBALL = ["FT", "AET", "PEN"];
const ZAVRSENI_SPORTOVI = ["FT", "AOT", "AET"];

const fin = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

export const getRezultat = createServerFn({ method: "GET" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }): Promise<RezultatUtakmice> => {
    const nista: RezultatUtakmice = {
      error: null, zavrsena: false,
      dom: null, gost: null, domHT: null, gostHT: null, domReg: null, gostReg: null,
    };

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
      const dom = kos
        ? fin(g?.scores?.home?.total)
        : fin(g?.scores?.home);
      const gost = kos
        ? fin(g?.scores?.away?.total)
        : fin(g?.scores?.away);

      // regularni rezultat
      let domReg: number | null = null;
      let gostReg: number | null = null;
      if (kos) {
        const q = [1, 2, 3, 4].map((i) => ({
          h: fin(g?.scores?.home?.[`quarter_${i}`]),
          a: fin(g?.scores?.away?.[`quarter_${i}`]),
        }));
        if (q.every((x) => x.h != null)) domReg = q.reduce((s, x) => s + (x.h ?? 0), 0);
        if (q.every((x) => x.a != null)) gostReg = q.reduce((s, x) => s + (x.a ?? 0), 0);
        // rezervna računica: ukupno minus produžetak
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
        // rukomet: ako periodi nedostaju, scores je 60-minuta rezultat
        if (domReg == null) domReg = dom;
        if (gostReg == null) gostReg = gost;
      }

      // poluvrijeme
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
        const fh = fin(g?.periods?.first?.home);
        const fa = fin(g?.periods?.first?.away);
        domHT = fh;
        gostHT = fa;
      }

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
    const dom = fin(f?.goals?.home);
    const gost = fin(f?.goals?.away);
    const domHT = fin(f?.score?.halftime?.home);
    const gostHT = fin(f?.score?.halftime?.away);
    return {
      error: null,
      zavrsena: true,
      dom,
      gost,
      domHT,
      gostHT,
      domReg: dom,   // nogomet: konačni rezultat je ujedno i regularni za 1X2 tipove
      gostReg: gost,
    };
  });

