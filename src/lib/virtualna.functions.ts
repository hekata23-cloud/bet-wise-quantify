// ============================================================
// VIRTUALNA.FUNCTIONS.TS — dohvat KVOTA za Virtualnu Kladionicu
// • Nogomet: API-Football /odds?date=... — JEDAN poziv za cijeli dan
//   (grupno dohvaćanje umjesto poziva po utakmici/tiketu)
// • Košarka / Rukomet: sportovi-guard /odds?date=... (kad API podržava)
// • Keš 12 sati (listići statičnih kvota; nikad ne ponavlja dovršene)
// • Anti-suspenzija: guardGet/sportoviGet već drže dnevni limit, minimalni
//   razmak 2.5s i hlađenje na HTTP 429 (zlatni-guard) — ovdje se samo
//   dohvaća rjeđe (12h keš) i u batchu po danu.
// • Nedostajuće opcije klijent dopuni "model" kvotama (virtualna.ts).
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardGet } from "./api-guard.server";
import { sportoviGet, type GuardResult } from "./sportovi-guard.server";

const schema = z.object({
  sport: z.enum(["nogomet", "kosarka", "rukomet"]),
  dan: z.string(),      // "YYYY-MM-DD" (Zagreb)
  apiKey: z.string(),
});

export type KvoteOpcija = { trziste: string; tip: string; kvota: number };
export type KvoteUtakmice = { fixtureId: number; opcije: KvoteOpcija[] };
export type KvoteDana = { error: string | null; utakmice: KvoteUtakmice[] };

const KEŠ_MS = 12 * 60 * 60 * 1000; // 12 sati — statične pred-utrka kvote

/** Prosjek kvote kroz knjižare (konsenzus). */
function prosjekKvota(vrijednosti: number[]): number | null {
  const ok = vrijednosti.map(Number).filter((x) => Number.isFinite(x) && x > 1 && x < 100);
  if (ok.length === 0) return null;
  return Math.round((ok.reduce((s, x) => s + x, 0) / ok.length) * 100) / 100;
}

/** Mapiraj knjižarevu "bets" listu u naše tržišta (tolerantno, po imenima). */
function mapirajOpcije(bets: Array<{ name?: string; values?: Array<{ value?: string; odd?: string | number }> }>, nogomet: boolean): KvoteOpcija[] {
  const izl: KvoteOpcija[] = [];
  const push = (trziste: string, tip: string, kvota: number | null) => {
    if (kvota != null) izl.push({ trziste, tip, kvota });
  };
  for (const bet of bets ?? []) {
    const ime = String(bet?.name ?? "").toLowerCase();
    const vals = bet?.values ?? [];
    const poValue = (pred: (v: string) => string | null, trziste: string) => {
      for (const v of vals) {
        const vStr = String(v?.value ?? "").trim();
        const tip = pred(vStr);
        if (tip) push(trziste, tip, prosjekKvota([Number(v?.odd)]));
      }
    };
    if (ime.includes("match winner") || ime === "winner") {
      poValue((v) => (/^(home|domaćin|dom)$/i.test(v) ? "1" : /^(away|gost)$/i.test(v) ? "2" : /^(draw|x)$/i.test(v) ? "X" : null), nogomet ? "1X2" : "Moneyline");
      // košarka/rukomet "Match Winner" bez remija → 1X2 X ne postoji; dopusti i kao Moneyline
      if (!nogomet && vals.length === 2) {
        for (const v of vals) {
          const vStr = String(v?.value ?? "").trim();
          const tip = /^(home)$/i.test(vStr) ? "1" : /^(away)$/i.test(vStr) ? "2" : null;
          if (tip) push("Moneyline", tip, prosjekKvota([Number(v?.odd)]));
        }
      }
    } else if (ime.includes("over/under") || ime.includes("total") || ime.includes("goals o/u")) {
      poValue((v) => {
        const m = v.match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)$/i);
        return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : null;
      }, "O/U");
    } else if (ime.includes("both teams") || ime.includes("btts")) {
      poValue((v) => (/^(yes|da)$/i.test(v) ? "GG" : /^(no|ne)$/i.test(v) ? "NG" : null), "BTTS");
    } else if (ime.includes("double chance")) {
      poValue((v) => (/^home\/draw$/i.test(v) ? "1X" : /^draw\/away$/i.test(v) ? "X2" : /^home\/away$/i.test(v) ? "12" : null), "Dvostruka šansa");
    } else if (ime.includes("draw no bet")) {
      poValue((v) => (/^(home)$/i.test(v) ? "DNB 1" : /^(away)$/i.test(v) ? "DNB 2" : null), "DNB");
    } else if (ime.includes("halftime/fulltime") || ime.includes("ht/ft")) {
      poValue((v) => {
        const m = v.match(/^(home|draw|away)\s*\/\s*(home|draw|away)$/i);
        if (!m) return null;
        const s = (x: string) => (/home/i.test(x) ? "1" : /draw/i.test(x) ? "X" : "2");
        return `${s(m[1]!)}/${s(m[2]!)}`;
      }, "HT/FT");
    } else if (ime.includes("handicap") && !nogomet) {
      // API-Basketball / API-Handball: "Home -4.5", "Away +4.5"
      poValue((v) => {
        const m = v.match(/^(home|away)\s*([+-]?[0-9]+(?:\.[0-9]+)?)$/i);
        if (!m) return null;
        return /home/i.test(m[1]!) ? `Domaćin ${m[2]}` : `Gost ${m[2]}`;
      }, "Azijski hendikep");
    }
  }
  // Duplicirane opcije (isti trziste+tip): ostavi prvu
  const vidi = new Set<string>();
  return izl.filter((o) => {
    const k = `${o.trziste}|${o.tip}`;
    if (vidi.has(k)) return false;
    vidi.add(k);
    return true;
  });
}

/** Izvuči bets listu iz API-Sports odgovora (isti oblik za football/basketball/handball odds). */
function izvuciBets(item: unknown): Array<{ name?: string; values?: Array<{ value?: string; odd?: string | number }> }> {
  const x = item as { bookmakers?: Array<{ bets?: unknown }> };
  const izl: Array<{ name?: string; values?: Array<{ value?: string; odd?: string | number }> }> = [];
  for (const bk of x?.bookmakers ?? []) {
    for (const bet of ((bk as { bets?: unknown[] | undefined })?.bets ?? []) as unknown[]) {
      izl.push(bet as { name?: string; values?: Array<{ value?: string; odd?: string | number }> });
    }
  }
  return izl;
}

export const getKvoteDana = createServerFn({ method: "GET" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }): Promise<KvoteDana> => {
    const nista: KvoteDana = { error: null, utakmice: [] };

    if (data.sport !== "nogomet") {
      // košarka / rukomet — vlastita API kvota (kad postoji); greška = tiho → model kvote
      let r: GuardResult;
      try {
        r = await sportoviGet(data.sport, `/odds?date=${data.dan}`, { apiKey: data.apiKey, ttlMs: KEŠ_MS });
      } catch {
        return nista;
      }
      if (r.error) return nista;
      const resp = Array.isArray(r.data) ? (r.data as unknown[]) : [];
      const utakmice: KvoteUtakmice[] = [];
      for (const item of resp) {
        const it = item as { id?: number; fixture?: { id?: number } };
        const fid = Number(it?.id ?? it?.fixture?.id);
        if (!Number.isFinite(fid)) continue;
        const opcije = mapirajOpcije(izvuciBets(item), false);
        if (opcije.length > 0) utakmice.push({ fixtureId: fid, opcije });
      }
      return { error: null, utakmice };
    }

    // nogomet — jedan batch poziv za cijeli dan
    let r: Awaited<ReturnType<typeof guardGet>>;
    try {
      r = await guardGet(`/odds?date=${data.dan}`, { apiKey: data.apiKey, ttlMs: KEŠ_MS });
    } catch {
      return nista;
    }
    if (r.error) return { error: r.error, utakmice: [] };
    const resp = Array.isArray(r.data) ? (r.data as unknown[]) : [];
    const utakmice: KvoteUtakmice[] = [];
    for (const item of resp) {
      const it = item as { fixture?: { id?: number } };
      const fid = Number(it?.fixture?.id);
      if (!Number.isFinite(fid)) continue;
      const opcije = mapirajOpcije(izvuciBets(item), true);
      if (opcije.length > 0) utakmice.push({ fixtureId: fid, opcije });
    }
    return { error: null, utakmice };
  });
