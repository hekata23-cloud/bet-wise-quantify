// ============================================================
// KORPA.TS — Bet Slip / Tiket motor (Andromeda AI)
// Kombinirana kvota, EV, varijanca/rizik, frakcijski Kelly.
// Čista logika — ne zove API. Pohrana: localStorage.
// ============================================================

export type Sport = "nogomet" | "košarka" | "rukomet";

export interface KorpaTip {
  id: string;            // jedinstveno: sport|utakmica|trziste|tip
  sport: Sport;
  utakmica: string;      // "Domaćin - Gost"
  liga?: string;
  trziste: string;       // "1X2", "BTTS", "O/U 2.5", "HT/FT", "Moneyline", "Spread", "Total"...
  tip: string;           // "GG", "Over 2.5", "1/1", "Domaćin -5.5"...
  kvota: number;         // > 1
  vjerojatnost: number;  // 0..1 — koliko model vjeruje
  dodano?: number;
}

const KORPA_KEY = "andromeda.korpa";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

export function loadKorpa(): KorpaTip[] {
  try {
    const raw = localStorage.getItem(KORPA_KEY);
    const arr = raw ? (JSON.parse(raw) as KorpaTip[]) : [];
    return Array.isArray(arr) ? arr.filter((t) => t && t.id && t.kvota > 1) : [];
  } catch {
    return [];
  }
}

function spremiKorpu(tipovi: KorpaTip[]) {
  try {
    localStorage.setItem(KORPA_KEY, JSON.stringify(tipovi.slice(0, 15)));
  } catch {
    /* puna memorija — ignoriraj */
  }
  window.dispatchEvent(new CustomEvent("andromeda:korpa"));
}

export function dodajUKorpu(tip: Omit<KorpaTip, "dodano">) {
  const k = clamp01(tip.vjerojatnost);
  if (!(tip.kvota > 1) || k <= 0) return;
  const arr = loadKorpa();
  if (arr.some((t) => t.id === tip.id)) return; // već je u korpi
  arr.push({ ...tip, id: tip.id, vjerojatnost: k, dodano: Date.now() });
  spremiKorpu(arr);
}

export function ukloniIzKorpe(id: string) {
  spremiKorpu(loadKorpa().filter((t) => t.id !== id));
}

export function ocistiKorpu() {
  spremiKorpu([]);
}

export interface IzracunKorpe {
  n: number;
  kvota: number;          // kombinirana kvota
  vjerojatnost: number;   // kombinirana vjerojatnost modela
  edge: number;           // kvota*vjer - 1 (očekivani povrat na 1 jedinicu)
  kelly: number;          // puna Kelly frakcija
  ulogPerc: number;       // preporučeni ulog u % bankrolla (frakcijski, cap 3%)
  ulogIznos: number;      // u novcu
  stdRet: number;         // std. dev. povrata po jedinici uloga
  rizikPerc: number;      // 0..100 vizualni rizik
  jedinstvenihUtakmica: number;
  korelacijaUpozorenje: boolean;
  isplativo: boolean;
}

export function izracunajKorpu(
  tipovi: KorpaTip[],
  opts: { bankroll?: number; kellyFrac?: number; maxUlogPerc?: number } = {},
): IzracunKorpe {
  const bankroll = Math.max(0, opts.bankroll ?? 0);
  const kellyFrac = Math.min(1, Math.max(0.05, opts.kellyFrac ?? 0.25));
  const maxUlogPerc = Math.min(10, Math.max(0.5, opts.maxUlogPerc ?? 3));
  const n = tipovi.length;
  const prazno: IzracunKorpe = {
    n: 0, kvota: 1, vjerojatnost: 0, edge: 0, kelly: 0, ulogPerc: 0, ulogIznos: 0,
    stdRet: 0, rizikPerc: 0, jedinstvenihUtakmica: 0, korelacijaUpozorenje: false, isplativo: false,
  };
  if (n === 0) return prazno;

  const kvota = tipovi.reduce((a, t) => a * (t.kvota > 1 ? t.kvota : 1), 1);
  const p = tipovi.reduce((a, t) => a * clamp01(t.vjerojatnost), 1);
  const edge = kvota * p - 1;

  const b = kvota - 1;
  const q = 1 - p;
  const kelly = b > 0 ? (b * p - q) / b : 0;

  const jedinstvenihUtakmica = new Set(tipovi.map((t) => t.utakmica)).size;
  const korelacijaUpozorenje = jedinstvenihUtakmica < n;
  // Korelirane noge (isti par dvaput) dijele sudbinu — Kelly ide na pola.
  const kellyEff = korelacijaUpozorenje ? kelly * 0.5 : kelly;

  const ulogPerc = Math.min(maxUlogPerc, Math.max(0, kellyEff) * kellyFrac * 100);
  const ulogIznos = (bankroll * ulogPerc) / 100;

  const stdRet = Math.sqrt(p * q) * b;
  const rizikPerc = Math.min(100, Math.round((stdRet / Math.max(0.01, kvota)) * 100));

  return {
    n, kvota, vjerojatnost: p, edge, kelly,
    ulogPerc, ulogIznos, stdRet, rizikPerc,
    jedinstvenihUtakmica, korelacijaUpozorenje,
    isplativo: edge > 0 && ulogPerc > 0,
  };
}

export function korpaBroj(): number {
  return loadKorpa().length;
}

