// ============================================================
// LEAGUE-TIER — Tier 1 / Sve lige / Moji favoriti
// Globalni filter (localStorage + događaj) koji sve kartice mogu čitati.
// ============================================================
import { useEffect, useState } from "react";

export type LigaFilter = "tier1" | "sve" | "favoriti";

const TIER1: RegExp[] = [
  /uefa champions league|liga prvaka/i,
  /^premier league$/i,
  /^la ?liga$/i,
  /^serie a$/i,
  /^bundesliga$/i,
  /^ligue 1$/i,
  /hnl|supersport hnl|prva hnl/i,
  /^nba$/i,
  /euroleague|euroliga/i,
  /uefa europa league/i,
];

export function jeTier1(liga: string): boolean {
  return TIER1.some((r) => r.test(liga.trim()));
}

const K_FILTER = "pc.liga.filter.v1";
const K_FAV = "pc.liga.favoriti.v1";
const EVT = "pc:liga-filter";

export function citajFilter(): LigaFilter {
  try { const v = localStorage.getItem(K_FILTER); return v === "tier1" || v === "favoriti" ? v : "sve"; } catch { return "sve"; }
}
export function citajFavorite(): string[] {
  try { const a = JSON.parse(localStorage.getItem(K_FAV) ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function postaviFilter(f: LigaFilter) {
  try { localStorage.setItem(K_FILTER, f); } catch { /* */ }
  window.dispatchEvent(new CustomEvent(EVT));
}
export function prebaciFavorit(liga: string) {
  const s = new Set(citajFavorite());
  if (s.has(liga)) s.delete(liga); else s.add(liga);
  try { localStorage.setItem(K_FAV, JSON.stringify([...s])); } catch { /* */ }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function prolaziFilter(liga: string, f: LigaFilter, fav: string[]): boolean {
  if (f === "tier1") return jeTier1(liga);
  if (f === "favoriti") return fav.includes(liga);
  return true;
}

/** Hook: trenutni filter + favoriti, sinkronizirano kroz sve kartice. */
export function useLigaFilter() {
  const [f, setF] = useState<LigaFilter>("sve");
  const [fav, setFav] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => { setF(citajFilter()); setFav(citajFavorite()); };
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return { filter: f, favoriti: fav, prolazi: (liga: string) => prolaziFilter(liga, f, fav) };
}

