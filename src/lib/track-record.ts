/* ============================================================
   TRACK-RECORD.TS — Verified Track Record & Accuracy Log (v1)
   Transparentan pregled svojih tipova: dnevni Win Rate, ROI i
   settled picks. Podaci dolaze iz Dnevnika (localStorage) —
   isti izvor koji kartice upisuju, pa ništa nije ručno kuhano.
   Čista logika, bez API poziva.
   ============================================================ */
import { dnevnikUnosi, type DnevnikUnos } from "@/lib/dnevnik";

export type SportFilter = "sve" | "nogomet" | "kosarka" | "rukomet";

export interface DanStat {
  datum: string;        // YYYY-MM-DD (lokalni dan zapisa tipa)
  igrano: number;       // settled picks (pogodak + promašaj)
  pogodci: number;
  promasaji: number;
  cekaju: number;       // još neprovjereni tipovi tog dana
  winRate: number | null; // 0..1, null ako nema settled
  roi: number | null;     // postotak, null ako nema settled
  profit: number;         // u jedinicama (ulog = 1 po tipu)
}

export interface UkupnoStat {
  igrano: number;
  pogodci: number;
  promasaji: number;
  cekaju: number;
  winRate: number | null;
  roi: number | null;
  profit: number;         // u jedinicama
  staked: number;         // settled broj tipova (ulog 1 po tipu)
}

const danOd = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("sv-SE"); // YYYY-MM-DD lokalno
  } catch {
    return iso.slice(0, 10);
  }
};

/** ROI po tipu: ulog 1 jedinica; pogodak → kvota−1, promašaj → −1, čeka → 0. */
function profitTipa(u: DnevnikUnos): number {
  if (u.status === "pogodak") return u.kvota != null && u.kvota > 1 ? u.kvota - 1 : 0;
  if (u.status === "promasaj") return -1;
  return 0;
}

export function dnevnaStatistika(unosi: DnevnikUnos[] = dnevnikUnosi()): DanStat[] {
  const mapa = new Map<string, { igrano: number; pogodci: number; promasaji: number; cekaju: number; profit: number }>();
  for (const u of unosi) {
    const d = danOd(u.datum);
    const s = mapa.get(d) ?? { igrano: 0, pogodci: 0, promasaji: 0, cekaju: 0, profit: 0 };
    if (u.status === "pogodak") { s.igrano++; s.pogodci++; s.profit += profitTipa(u); }
    else if (u.status === "promasaj") { s.igrano++; s.promasaji++; s.profit += profitTipa(u); }
    else s.cekaju++;
    mapa.set(d, s);
  }
  return Array.from(mapa.entries())
    .map(([datum, s]) => ({
      datum,
      igrano: s.igrano,
      pogodci: s.pogodci,
      promasaji: s.promasaji,
      cekaju: s.cekaju,
      winRate: s.igrano > 0 ? s.pogodci / s.igrano : null,
      roi: s.igrano > 0 ? (s.profit / s.igrano) * 100 : null,
      profit: s.profit,
    }))
    .sort((a, b) => (a.datum < b.datum ? 1 : -1)); // najnoviji prvi
}

export function ukupnaStatistika(unosi: DnevnikUnos[] = dnevnikUnosi()): UkupnoStat {
  let igrano = 0, pogodci = 0, promasaji = 0, cekaju = 0, profit = 0;
  for (const u of unosi) {
    if (u.status === "pogodak") { igrano++; pogodci++; profit += profitTipa(u); }
    else if (u.status === "promasaj") { igrano++; promasaji++; profit += profitTipa(u); }
    else cekaju++;
  }
  return {
    igrano,
    pogodci,
    promasaji,
    cekaju,
    winRate: igrano > 0 ? pogodci / igrano : null,
    roi: igrano > 0 ? (profit / igrano) * 100 : null,
    profit,
    staked: igrano,
  };
}

export function filtriraj(
  unosi: DnevnikUnos[],
  f: { sport?: SportFilter; odDatum?: string; doDatum?: string },
): DnevnikUnos[] {
  return unosi.filter((u) => {
    if (f.sport && f.sport !== "sve" && u.sport !== f.sport) return false;
    const d = danOd(u.datum);
    if (f.odDatum && d < f.odDatum) return false;
    if (f.doDatum && d > f.doDatum) return false;
    return true;
  });
}

export type StatusBadge = "won" | "lost" | "void";

export function badgeZa(u: DnevnikUnos): StatusBadge {
  if (u.status === "pogodak") return "won";
  if (u.status === "promasaj") return "lost";
  return "void"; // čeka — još nije settled
}

export function badgeLabel(s: StatusBadge): string {
  return s === "won" ? "WON" : s === "lost" ? "LOST" : "ČEKA";
}
