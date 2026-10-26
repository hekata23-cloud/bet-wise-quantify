import { useState } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { getApiKey, guarded, zagrebDay, zaboraviCache } from "@/lib/zlatni-guard";
import { spremiSnapshot } from "@/lib/odds-tracker";
import { plosneKvote, prati } from "@/lib/smart-money";
import { jeTier1 } from "@/lib/league-tier";

export type Markets = Record<string, Record<string, number>>;

export const prevediGresku = (e: string) =>
  e === "RATE_LIMIT" ? "Limit API-ja — pričekaj malo." : e.startsWith("ACCOUNT") ? "Problem s API računom/ključem." : e;

/**
 * Redoslijed skeniranja: prvo top lige (gotovo uvijek imaju kvote), pa ostalo po vremenu.
 * Preskače utakmice koje su već počele.
 */
export function poredajZaSken(lista: ZtFixture[]): ZtFixture[] {
  const sad = Date.now();
  return lista
    .filter((f) => new Date(f.time).getTime() > sad)
    .sort((a, b) => Number(jeTier1(b.league)) - Number(jeTier1(a.league)) || a.time.localeCompare(b.time));
}

/** Popis današnjih utakmica + dohvat kvota kroz postojeći API štit (guarded + dnevni cache). */
export function useUtakmiceDana() {
  const [fx, setFx] = useState<ZtFixture[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const wait = (ms: number, why: string) => setMsg(`Zaštita API-ja: ${why}. Čekam ${Math.ceil(ms / 1000)} s…`);

  const ucitajDan = async (): Promise<boolean> => {
    const apiKey = getApiKey();
    if (!apiKey) { setMsg("Upiši API-Football ključ u Postavkama."); return false; }
    setBusy(true);
    try {
      const r = await guarded("fixtures", 1, () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }), wait);
      if (r.error) { setMsg(prevediGresku(r.error)); return true; }
      const l = r.fixtures.filter((f) => ["NS", "TBD"].includes(f.status)).sort((a, b) => a.time.localeCompare(b.time));
      setFx(l); setMsg(`${l.length} utakmica danas.`);
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusy(false); }
    return true;
  };

  /** cacheKey određuje koliko dugo vrijedi odgovor (isti ključ = besplatno iz cachea). */
  const kvote = async (f: ZtFixture, cacheKey = `lite.${f.id}`): Promise<Markets | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const r = await guarded(cacheKey, 1, () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }), wait);
    const m = (r.markets ?? {}) as Markets;
    if (!Object.keys(m).length) {
      // Prazan odgovor ("kladionica još nije objavila kvote") se prije pamtio CIJELI dan,
      // pa utakmica nikad nije dobila kvote. Sada se zaboravi i kasnije pokuša ponovno.
      zaboraviCache(cacheKey);
      if (r.error && !/bet365/.test(r.error)) setMsg(prevediGresku(r.error));
      return null;
    }
    const flat = plosneKvote(m);
    if (Object.keys(flat).length) {
      spremiSnapshot(f.id, flat);
      prati({ id: f.id, home: f.home, away: f.away, league: f.league, time: f.time });
    }
    return m;
  };

  return { fx, msg, setMsg, busy, setBusy, ucitajDan, kvote };
}
