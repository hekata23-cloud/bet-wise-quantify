/* ============================================================
   LISTICI.FUNCTIONS.TS — server dohvat statusa i rezultata utakmica
   za poravnanje listića ("Moji listići") i Virtualnu Kladionicu.
   - getStatusUtakmice: status (FT/PST/CANC/ABD/SUSP…), puni i
     regularni rezultat, poluvrijeme — za void i sport-pravila.
   - getFiksatureDana: sve utakmice jednog dana (za uparivanje
     nogu bez fixtureId-a po imenima momčadi i prikaz u Virtualnoj).
   Nogomet preko api-guarda, košarka/rukomet preko sportovi-guarda
   s obaveznim timezone=Europe/Zagreb parametrom.
   Ako API-Sports nema aktiviran sport ili ne vrati utakmice za taj dan,
   automatski se poslužuje reprezentativni virtualni raspored dana,
   pa Virtualna Kladionica UVIJEK ima utakmice i kvote za sva 3 sporta.
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

const TIMOVI_KOSARKA: Array<[string, string]> = [
  ["Real Madrid", "Barcelona"],
  ["Panathinaikos", "Olympiacos"],
  ["Fenerbahce", "Monaco"],
  ["Partizan", "Crvena Zvezda"],
  ["Anadolu Efes", "Maccabi Tel Aviv"],
  ["Milano", "Zalgiris Kaunas"],
  ["Bayern Munich", "Baskonia"],
  ["Virtus Bologna", "Paris Basketball"],
];

const TIMOVI_RUKOMET: Array<[string, string]> = [
  ["Barcelona", "SC Magdeburg"],
  ["Telekom Veszprem", "Paris Saint-Germain"],
  ["THW Kiel", "SG Flensburg-Handewitt"],
  ["Aalborg Handbold", "Vive Kielce"],
  ["Fuchse Berlin", "Dinamo Bucuresti"],
  ["Sporting CP", "OTP Bank - Pick Szeged"],
  ["PPD Zagreb", "Montpellier HB"],
  ["GOG Handbold", "RK Eurofarm Pelister"],
];

const SATI = ["17:30", "18:00", "19:00", "19:45", "20:15", "20:30", "20:45", "21:00"];

function hashDana(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function generirajVirtualniRaspored(sport: "kosarka" | "rukomet", dan: string): KandidatFiksatura[] {
  const parovi = sport === "kosarka" ? TIMOVI_KOSARKA : TIMOVI_RUKOMET;
  const h = hashDana(`${sport}:${dan}`);
  const baseId = sport === "kosarka" ? 9100000 : 9200000;
  const sad = Date.now();

  const rot = h % parovi.length;
  const sortirano = [...parovi.slice(rot), ...parovi.slice(0, rot)].slice(0, 6);

  return sortirano.map(([dom, gost], idx) => {
    const sat = SATI[(idx + (h % SATI.length)) % SATI.length] ?? "19:00";
    const iso = `${dan}T${sat}:00+02:00`;
    const ts = new Date(iso).getTime();
    const zavrsena = Number.isFinite(ts) && ts + 2 * 3600_000 < sad;
    const uzivo = Number.isFinite(ts) && ts <= sad && ts + 2 * 3600_000 >= sad;
    const status = zavrsena ? "FT" : uzivo ? "2H" : "NS";

    return {
      id: baseId + ((h % 10000) * 10) + idx + 1,
      dom,
      gost,
      status,
      vrijeme: iso,
    };
  });
}

export const getStatusUtakmice = createServerFn({ method: "GET" })
  .inputValidator((d) => schemaStatus.parse(d))
  .handler(async ({ data }): Promise<StatusUtakmice> => {
    // Ako je virtualna utakmica (generirana fiksatura), simuliraj deterministički rezultat
    if (data.fixtureId >= 9000000) {
      const isKos = data.sport === "kosarka";
      const s = hashDana(`status:${data.fixtureId}`);
      const dom = isKos ? 75 + (s % 25) : 26 + (s % 12);
      const gost = isKos ? 70 + ((s >> 4) % 25) : 24 + ((s >> 4) % 12);
      const domHT = isKos ? Math.round(dom * 0.48) : Math.round(dom * 0.5);
      const gostHT = isKos ? Math.round(gost * 0.48) : Math.round(gost * 0.5);
      return {
        error: null, status: "FT", zavrsena: true,
        dom, gost, domReg: dom, gostReg: gost, domHT, gostHT,
      };
    }

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
    // ključ s klijenta ili env fallback (podržava API_SPORTS_KEY i API_FOOTBALL_KEY)
    const kljuc = (data.apiKey || process.env["API_SPORTS_KEY"] || process.env["API_FOOTBALL_KEY"] || "").trim().replace(/^["']|["']$/g, "");

    if (data.sport === "kosarka" || data.sport === "rukomet") {
      let apiFiksature: KandidatFiksatura[] = [];
      if (kljuc) {
        try {
          const r: GuardResult = await sportoviGet(
            data.sport,
            `/games?date=${encodeURIComponent(data.dan)}&timezone=Europe%2FZagreb`,
            { apiKey: kljuc, ttlMs: 10 * 60_000 },
          );
          if (!r.error && Array.isArray(r.data)) {
            apiFiksature = (r.data as any[])
              .filter((g) => g?.id != null && g?.teams?.home?.name && g?.teams?.away?.name)
              .map((g) => {
                const v = typeof g?.timestamp === "number" && Number.isFinite(g.timestamp) && g.timestamp > 0
                  ? new Date(g.timestamp * 1000).toISOString()
                  : typeof g?.date === "string" && g.date
                    ? (g.date.includes("T") ? g.date : `${g.date}T${String(g?.time ?? "18:00")}:00Z`)
                    : null;
                return {
                  id: Number(g.id),
                  dom: String(g?.teams?.home?.name ?? ""),
                  gost: String(g?.teams?.away?.name ?? ""),
                  status: String(g?.status?.short ?? "NS"),
                  vrijeme: v,
                };
              });
          }
        } catch {
          // Ako API padne, prelazimo na sigurni virtualni raspored
        }
      }

      // Ako API-Sports ima stvarne utakmice za taj dan, vrati ih
      if (apiFiksature.length > 0) {
        return { error: null, fiksature: apiFiksature };
      }

      // Ako nema ključa, sport nije aktiviran na računu ili API nema utakmica za taj dan:
      // posluži reprezentativni virtualni raspored za Virtualnu Kladionicu
      return {
        error: null,
        fiksature: generirajVirtualniRaspored(data.sport, data.dan),
      };
    }

    // Nogomet — standardni dohvat preko api-guarda
    const r = await guardGet(`/fixtures?date=${data.dan}`, { apiKey: kljuc, ttlMs: 10 * 60_000 });
    if (r.error) {
      // Ako API javi grešku (npr. potrošen limit), vrati grešku kako je i dosad radilo
      return { error: r.error, fiksature: [] };
    }
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
