// ============================================================
// SMART-MONEY — Radar pametnog novca / Dropping Odds
// Čita snimke kvota iz odds-trackera (localStorage) i traži pad
// kvote ≥ 8% unutar zadnjih 12 h. Ako SARP model (Poisson iz 1X2)
// daje vjerojatnost ≥ tržišnoj i EV ≥ 0 → SHARP CONSENSUS VERIFIED.
// ============================================================

import type { KvotaSnapshot } from "./odds-tracker";

export const PAD_PRAG_PCT = 8;
export const PROZOR_MS = 12 * 3600_000;

export interface PadKvote {
  kljuc: string;
  otvaranje: number;   // najviša kvota u prozoru prije pada
  sada: number;
  padPct: number;      // npr. 17.2 = kvota je pala 17.2%
  minuta: number;      // koliko je trajao pad
}

/** Najveći pad po ključu tržišta unutar prozora. */
export function padoviKvota(snimci: KvotaSnapshot[], sad = Date.now(), prag = PAD_PRAG_PCT): PadKvote[] {
  const u = snimci.filter((s) => sad - s.t <= PROZOR_MS).sort((a, b) => a.t - b.t);
  if (u.length < 2) return [];
  const zadnji = u[u.length - 1]!;
  const out: PadKvote[] = [];
  for (const [k, sada] of Object.entries(zadnji.kvote)) {
    if (!(sada > 1)) continue;
    let max = 0, tMax = zadnji.t;
    for (const s of u.slice(0, -1)) { const v = s.kvote[k]; if (v != null && v > max) { max = v; tMax = s.t; } }
    if (max <= 1) continue;
    const padPct = Math.round(((max - sada) / max) * 1000) / 10;
    if (padPct >= prag) out.push({ kljuc: k, otvaranje: max, sada, padPct, minuta: Math.round((zadnji.t - tMax) / 60000) });
  }
  return out.sort((a, b) => b.padPct - a.padPct);
}

/** Model se slaže s padom kad je p_model ≥ 1/kvota otvaranja i EV na trenutnoj kvoti ≥ 0. */
export function sharpConsensus(pModel: number, otvaranje: number, sada: number): { slaze: boolean; ev: number } {
  const ev = pModel * sada - 1;
  return { slaze: pModel >= 1 / otvaranje && ev >= 0, ev };
}

/* ── meta podaci o praćenim utakmicama ── */
const META = "pc.kvote.meta.v1";
export interface PracenaUtakmica { id: number; home: string; away: string; league: string; time: string }

export function citajPracene(): PracenaUtakmica[] {
  try { const a = JSON.parse(localStorage.getItem(META) ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function prati(u: PracenaUtakmica) {
  const sve = citajPracene().filter((x) => x.id !== u.id && Date.now() - new Date(x.time).getTime() < 2 * 86400_000);
  sve.push(u);
  try { localStorage.setItem(META, JSON.stringify(sve.slice(-200))); } catch { /* pun */ }
}

/** Plosnati ključevi kvota iz API-Football tržišta (bet365 struktura). */
export function plosneKvote(markets: Record<string, Record<string, number>>): Record<string, number> {
  const g = (re: RegExp) => Object.entries(markets).find(([k]) => re.test(k))?.[1] ?? {};
  const w = g(/^match winner$/i), ou = g(/^goals over\/under$/i), bt = g(/^both teams (to )?score$/i), dnb = g(/^home\/away$/i);
  const out: Record<string, number> = {};
  const put = (k: string, v?: number) => { if (v && v > 1) out[k] = v; };
  put("1", w["Home"]); put("X", w["Draw"]); put("2", w["Away"]);
  put("Over 2.5", ou["Over 2.5"]); put("Under 2.5", ou["Under 2.5"]);
  put("GG", bt["Yes"]); put("NG", bt["No"]);
  put("DNB 1", dnb["Home"]); put("DNB 2", dnb["Away"]);
  return out;
}
