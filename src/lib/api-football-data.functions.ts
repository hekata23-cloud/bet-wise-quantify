import { createServerFn } from "@tanstack/react-start";
import { guardGet } from "./api-guard.server";

export type FixtureItem = {
  id: number;
  time: string;
  league: string;
  country: string;
  home: string;
  away: string;
};

export type FixturesResult = {
  ok: boolean;
  message?: string | undefined;
  fixtures: FixtureItem[];
  remaining?: number | undefined;
};

export type OddsResult = {
  ok: boolean;
  message?: string | undefined;
  bookmaker?: string | undefined;
  over25?: number | undefined;
  gg?: number | undefined;
  k22Estimated?: boolean | undefined;
  exact?: Record<string, number> | undefined;
  remaining?: number | undefined;
};

const BASE = "https://v3.football.api-sports.io";

async function call(path: string, key: string) {
  // api-guard: red čekanja + keš + retry + stale rezerva — klik na par više ne pada na 429.
  const r = await guardGet(path, { apiKey: key });
  const remaining = r.remainingDay >= 0 ? r.remainingDay : undefined;
  if (r.error === "RATE_LIMIT")
    return { error: "Previše zahtjeva u minuti. Pričekaj 10 sekundi.", remaining };
  if (r.error && r.error.startsWith("ACCOUNT"))
    return { error: "API ključ nije važeći. Provjeri ga u Postavkama.", remaining };
  if (r.error)
    return { error: r.error, remaining };
  return { data: r.data, remaining };
}

function validKey(data: { key?: string }) {
  const key = (data?.key ?? "").trim();
  if (key.length < 10) throw new Error("Nema ključa.");
  return key;
}

// 1 POZIV = SVE LIGE SVIJETA ZA TAJ DAN (TOČNO 1 KREDIT)
export const getFixtures = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; date: string }) => {
    const key = validKey(data);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.date ?? "")) throw new Error("Neispravan datum.");
    return { key, date: data.date };
  })
  .handler(async ({ data }): Promise<FixturesResult> => {
    try {
      // Jedan poziv dohvaća sve lige svijeta za navedeni datum
      const res = await call(`/fixtures?date=${data.date}&timezone=Europe/Zagreb`, data.key);
      if ("error" in res) return { ok: false, message: res.error, fixtures: [], remaining: res.remaining };

      const list = (res.data as Array<{
        fixture: { id: number; date: string; status: { short: string } };
        league: { name: string; country: string };
        teams: { home: { name: string }; away: { name: string } };
      }>) ?? [];

      // Filtriramo nadolazeće utakmice (NS = Not Started, TBD = To Be Defined)
      const fixtures = list
        .filter((f) => f.fixture.status.short === "NS" || f.fixture.status.short === "TBD")
        .map((f) => ({
          id: f.fixture.id,
          time: f.fixture.date,
          league: f.league.name,
          country: f.league.country,
          home: f.teams.home.name,
          away: f.teams.away.name,
        }))
        .sort((a, b) => a.time.localeCompare(b.time));

      return { ok: true, fixtures, remaining: res.remaining };
    } catch {
      return { ok: false, message: "Nije moguće doći do servisa.", fixtures: [] };
    }
  });

// 1 POZIV PO ODABRANOJ UTAKMICI (Automatski vadi kvote ili aproksimira 2:2 ako fali)
export const getFixtureOdds = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; fixture: number }) => {
    const key = validKey(data);
    const fixture = Number(data?.fixture);
    if (!Number.isInteger(fixture) || fixture <= 0) throw new Error("Neispravna utakmica.");
    return { key, fixture };
  })
  .handler(async ({ data }): Promise<OddsResult> => {
    try {
      const res = await call(`/odds?fixture=${data.fixture}`, data.key);
      if ("error" in res) return { ok: false, message: res.error, remaining: res.remaining };

      const entry = (res.data as Array<{
        bookmakers: Array<{
          name: string;
          bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }>;
        }>;
      }>)?.[0];

      if (!entry || !entry.bookmakers?.length) {
        return {
          ok: false,
          message: "Kladionice još nisu objavile kvote za ovaj par.",
          remaining: res.remaining,
        };
      }

      // Tražimo najbolju ponudu među dostupnim kladionicama
      let bestOver: number | undefined;
      let bestGg: number | undefined;
      let exactScores: Record<string, number> = {};
      let chosenBookmaker = entry.bookmakers[0]?.name ?? "Kladionica";

      for (const bm of entry.bookmakers) {
        const find = (name: string) => bm.bets.find((b) => b.name === name);
        const overVal = find("Goals Over/Under")?.values.find((v) => v.value === "Over 2.5");
        const ggVal = find("Both Teams Score")?.values.find((v) => v.value === "Yes");
        const exactBet = find("Exact Score");

        if (overVal) {
          const odd = Number(overVal.odd);
          // POPRAVAK: preskoči nevaljane kvote i zadrži najveću dostupnu ponudu.
          if (Number.isFinite(odd) && odd > 1 && odd > (bestOver ?? 0)) {
            bestOver = odd;
            if (!bestGg) chosenBookmaker = bm.name;
          }
        }
        if (ggVal) {
          const odd = Number(ggVal.odd);
          // POPRAVAK: bira najveću GG kvotu, ne prvu kladionicu u API odgovoru.
          if (Number.isFinite(odd) && odd > 1 && odd > (bestGg ?? 0)) {
            bestGg = odd;
            chosenBookmaker = bm.name;
          }
        }

        if (exactBet && Object.keys(exactScores).length === 0) {
          exactBet.values.forEach((v) => {
            const n = Number(v.odd);
            if (n > 0) exactScores[v.value] = n;
          });
        }
      }

      if (!bestOver && !bestGg) {
        return {
          ok: false,
          message: "Za ovaj par nema dostupnih kvota za Over 2.5 i GG.",
          remaining: res.remaining,
        };
      }

      // Ako kladionica nema točan rezultat 2:2, matematički ga procijeni iz Over 2.5 i GG
      let k22 = exactScores["2:2"];
      let k22Estimated = false;

      if (!k22 && bestOver && bestGg) {
        k22Estimated = true;
        // P(2:2) u prosjeku iznosi oko 12% do 16% vjerojatnosti Over 2.5
        const pOver = 1 / bestOver;
        const pGg = 1 / bestGg;
        const estimatedP22 = (pOver * 0.14 + pGg * 0.12) / 2;
        k22 = Math.round((1 / Math.max(0.04, Math.min(0.12, estimatedP22))) * 10) / 10;
        exactScores["2:2"] = k22;
      }

      return {
        ok: true,
        bookmaker: chosenBookmaker,
        over25: bestOver,
        gg: bestGg,
        k22Estimated,
        exact: exactScores,
        remaining: res.remaining,
      };
    } catch {
      return { ok: false, message: "Greška pri dohvatu kvota." };
    }
  });
