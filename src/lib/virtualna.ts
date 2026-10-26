// ============================================================
// VIRTUALNA.TSX — Virtualna Kladionica: čista logika (bez UI-a)
// • Bankroll: virtuelni euri, start €10.000, neograničeno dodavanje/reset
// • Listić do 30 nogu (nogomet + košarka + rukomet na jednom listiću)
// • Katalog tržišta po sportu (SuperSport stil: 1X2, DC, O/U, BTTS, DNB,
//   HT/FT, Moneyline, AH, totali, 1. poluvrijeme)
// • Kvote: sinteza iz transparentnog modela (marža 5,5%) — svaka utakmica
//   deterministički generira iste kvote (seed = fixtureId)
// • Zagreb vrijeme: "DD.MM.YYYY. HH:mm"
// • Orion analiza: kombinirana vjerojatnost, najveći rizik, Kelly ulog
// • Poravnanje na postojeći settlement motor (listici.ts): void 1.00,
//   nogomet 90', košarka reg/OT, rukomet 60'
// ============================================================
import {
  spremiListic,
  statusTiketa,
  isplataTiketa,
  type Sport,
  type TiketNoga,
  type Tiket,
} from "./listici";

/* ── Zagreb vrijeme ── */
export const TZ = "Europe/Zagreb";

/** "DD.MM.YYYY. HH:mm" u Europe/Zagreb zoni (npr. "24.10.2026. 18:00"). */
export function formatZagrebStamp(d: Date): string {
  const p = new Intl.DateTimeFormat("hr-HR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const vr = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${vr("day")}.${vr("month")}.${vr("year")}. ${vr("hour")}:${vr("minute")}`;
}

/** Formatira ISO string / unix sekunde u Zagreb oznaku; null kad ulaz nije prepoznat. */
export function formatZagrebIzUlaza(ulaz: string | number | null | undefined): string | null {
  if (ulaz == null || ulaz === "") return null;
  if (typeof ulaz === "number") {
    const d = new Date(ulaz * 1000);
    return Number.isFinite(d.getTime()) ? formatZagrebStamp(d) : null;
  }
  const s = String(ulaz).trim();
  // "HH:MM" samostalno (API-Basketball time bez timestampa) → prikaži kao što jest
  if (/^[0-9]{1,2}:[0-9]{2}$/.test(s)) return s;
  const d = new Date(
    s.endsWith("Z") || s.includes("T") || s.includes(" ") ? s.replace(" ", "T") : `${s}`,
  );
  if (Number.isFinite(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) return formatZagrebStamp(d);
  return null;
}

/** Danas (Zagreb) kao "YYYY-MM-DD". */
export function danasZagreb(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

/* ── Bankroll — virtuelni euri ── */
export const POCETNI_BANKROLL = 10000;

export interface Transakcija {
  id: string;
  ts: number;
  tip: "ulog" | "dobitak" | "povrat" | "dodano" | "reset";
  opis: string;
  iznos: number; // pozitivno = prihod, negativno = rashod
  stanje: number; // stanje nakon transakcije
}

interface BankrollPohrana {
  stanje: number;
  transakcije: Transakcija[];
}
const BK = "pc.virtualna.bankroll.v1";

function citajBankroll(): BankrollPohrana {
  if (typeof window === "undefined") return { stanje: POCETNI_BANKROLL, transakcije: [] };
  try {
    const raw = window.localStorage.getItem(BK);
    if (raw) {
      const p = JSON.parse(raw) as BankrollPohrana;
      if (typeof p.stanje === "number" && Array.isArray(p.transakcije)) return p;
    }
  } catch {
    /* oštećena pohrana → reset */
  }
  return { stanje: POCETNI_BANKROLL, transakcije: [] };
}

function pisiBankroll(p: BankrollPohrana): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BK, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

export function bankroll(): number {
  return Math.max(0, Math.round(citajBankroll().stanje * 100) / 100);
}

export function transakcije(): Transakcija[] {
  return citajBankroll().transakcije;
}

function dodajTransakciju(tip: Transakcija["tip"], opis: string, iznos: number): number {
  const p = citajBankroll();
  const stanje = Math.max(0, Math.round((p.stanje + iznos) * 100) / 100);
  const t: Transakcija = {
    id: `t${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    ts: Date.now(),
    tip,
    opis,
    iznos,
    stanje,
  };
  pisiBankroll({ stanje, transakcije: [t, ...p.transakcije].slice(0, 100) });
  return stanje;
}

/** Dodaj virtuelne eure (neograničeno — "Dodaj još eura"). Vraća novo stanje. */
export function dodajEure(iznos: number, opis = "Dodano"): number {
  const i = Math.round(Math.abs(iznos) * 100) / 100;
  if (i <= 0) return bankroll();
  return dodajTransakciju("dodano", opis, i);
}

/** Reset na početno stanje (zadano €10.000). Vraća novo stanje. */
export function resetBankroll(novoStanje = POCETNI_BANKROLL): number {
  const s = Math.max(0, Math.round(novoStanje * 100) / 100);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        BK,
        JSON.stringify({
          stanje: s,
          transakcije: [
            {
              id: `t${Date.now()}`,
              ts: Date.now(),
              tip: "reset",
              opis: "Reset bankrolla",
              iznos: 0,
              stanje: s,
            } as Transakcija,
          ],
        }),
      );
    } catch {
      /* quota */
    }
  }
  return s;
}

/** Skini ulog (poziv prije "Uplati listić"). Vraća novo stanje ili null kad nema sredstava. */
export function skiniUlog(iznos: number, opis: string): number | null {
  const i = Math.round(iznos * 100) / 100;
  if (!(i > 0)) return null;
  if (i > bankroll() + 1e-9) return null;
  return dodajTransakciju("ulog", opis, -i);
}

/** Kreditiraj dobitak/povrat nakon poravnanja listića. Vraća novo stanje. */
export function isplatiDobitak(iznos: number, opis: string, povrat = false): number {
  const i = Math.round(Math.max(0, iznos) * 100) / 100;
  if (i <= 0) return bankroll();
  return dodajTransakciju(povrat ? "povrat" : "dobitak", opis, i);
}

/* ── Listić (slip) — do 30 nogu ── */
export const MAX_NOGU = 30;

export type { Sport } from "./listici";

export interface SlipNoga {
  id: string; // "f{fixtureId}-{tip}" ili uuid
  sport: Sport;
  fixtureId?: number;
  utakmica: string; // "Domaćin - Gost"
  liga?: string;
  trziste: string; // "1X2", "O/U", "BTTS", "DNB", "HT/FT", "Moneyline", "Azijski hendikep", "1. poluvrijeme"…
  tip: string; // "1", "Over 2.5", "GG", "DNB 1", "1/1", "Domaćin -4.5"…
  label: string; // kratka oznaka gumba ("1X", "GG", "O2.5"…)
  kvota: number;
  vjerojatnost: number; // modelova p (0..1)
  izvorKvote: "api" | "model";
  datum?: string; // ISO vrijeme početka
}

const SLIP = "pc.virtualna.slip.v1";

export function ucitajSlip(): SlipNoga[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SLIP);
    const n = raw ? (JSON.parse(raw) as SlipNoga[]) : null;
    return Array.isArray(n) ? n.slice(0, MAX_NOGU) : [];
  } catch {
    return [];
  }
}

function pisiSlip(noge: SlipNoga[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SLIP, JSON.stringify(noge));
  } catch {
    /* quota */
  }
}

export function noguNaSlipu(): number {
  return ucitajSlip().length;
}

export function jeNaSlipu(sport: Sport, trziste: string, tip: string, fixtureId?: number): boolean {
  return ucitajSlip().some(
    (n) =>
      n.sport === sport &&
      n.trziste === trziste &&
      n.tip === tip &&
      (n.fixtureId ?? null) === (fixtureId ?? null),
  );
}

export function dodajNaSlip(noga: SlipNoga): { ok: boolean; razlog?: string } {
  const noge = ucitajSlip();
  if (noge.length >= MAX_NOGU)
    return { ok: false, razlog: `Listić je pun (${MAX_NOGU} noga) — ukloni jednu da dodaš novu.` };
  const dup = noge.find(
    (n) =>
      n.sport === noga.sport &&
      n.trziste === noga.trziste &&
      n.tip === noga.tip &&
      (n.fixtureId ?? null) === (noga.fixtureId ?? null),
  );
  if (dup) return { ok: false, razlog: "Odabir je već na listiću." };
  pisiSlip([...noge, noga]);
  return { ok: true };
}

export function ukloniSSlipa(id: string): void {
  pisiSlip(ucitajSlip().filter((n) => n.id !== id));
}

export function ocistiSlip(): void {
  pisiSlip([]);
}

/** Ukupna kvota = umnožak kvota svih nogu (void kasnije ide kao 1.00 kroz settlement motor). */
export function ukupnaKvotaSlipa(noge: SlipNoga[]): number {
  return noge.reduce((s, n) => s * (Number.isFinite(n.kvota) && n.kvota > 1 ? n.kvota : 1), 1);
}

/** Moguća isplata: ulog × ukupna kvota. Gubitak isplaćuje €0.00 (settlement motor). */
export function mogucaIsplata(ulog: number, noge: Array<Pick<SlipNoga, "kvota">>): number {
  const kvota = noge.reduce(
    (s, n) => s * (Number.isFinite(n.kvota) && n.kvota > 1 ? n.kvota : 1),
    1,
  );
  return Math.round(ulog * kvota * 100) / 100;
}

/* ── Katalog tržišta po sportu ── */
export interface PonudaTrzista {
  grupa: string;
  trziste: string;
  tip: string;
  label: string;
  linija?: number; // za O/U i AH generiranje
  strana?: "1" | "X" | "2" | "over" | "under";
}

const OU_NOGOMET: number[] = [0.5, 1.5, 2.5, 3.5];
const HTFT: Array<[string, string]> = [
  ["1/1", "1/1"],
  ["X/1", "X/1"],
  ["2/1", "2/1"],
  ["1/X", "1/X"],
  ["X/X", "X/X"],
  ["2/X", "2/X"],
  ["1/2", "1/2"],
  ["X/2", "X/2"],
  ["2/2", "2/2"],
];

export function trzistaZaSport(sport: Sport): PonudaTrzista[] {
  const p: PonudaTrzista[] = [];
  if (sport === "nogomet") {
    p.push({ grupa: "1X2", trziste: "1X2", tip: "1", label: "1", strana: "1" });
    p.push({ grupa: "1X2", trziste: "1X2", tip: "X", label: "X", strana: "X" });
    p.push({ grupa: "1X2", trziste: "1X2", tip: "2", label: "2", strana: "2" });
    for (const [tip, label] of [
      ["1X", "1X"],
      ["X2", "X2"],
      ["12", "12"],
    ] as const)
      p.push({ grupa: "Dvostruka šansa", trziste: "Dvostruka šansa", tip, label });
    for (const l of OU_NOGOMET) {
      p.push({
        grupa: "Golovi O/U",
        trziste: "O/U",
        tip: `Over ${l}`,
        label: `O${l}`,
        linija: l,
        strana: "over",
      });
      p.push({
        grupa: "Golovi O/U",
        trziste: "O/U",
        tip: `Under ${l}`,
        label: `U${l}`,
        linija: l,
        strana: "under",
      });
    }
    p.push({ grupa: "BTTS", trziste: "BTTS", tip: "GG", label: "GG" });
    p.push({ grupa: "BTTS", trziste: "BTTS", tip: "NG", label: "NG" });
    p.push({ grupa: "DNB", trziste: "DNB", tip: "DNB 1", label: "DNB 1" });
    p.push({ grupa: "DNB", trziste: "DNB", tip: "DNB 2", label: "DNB 2" });
    for (const [tip, label] of HTFT) p.push({ grupa: "HT/FT", trziste: "HT/FT", tip, label });
  } else if (sport === "košarka") {
    p.push({
      grupa: "Pobjednik (uklj. OT)",
      trziste: "Moneyline",
      tip: "1",
      label: "1",
      strana: "1",
    });
    p.push({
      grupa: "Pobjednik (uklj. OT)",
      trziste: "Moneyline",
      tip: "2",
      label: "2",
      strana: "2",
    });
    p.push({ grupa: "Regularno 1X2", trziste: "1X2", tip: "1", label: "R1", strana: "1" });
    p.push({ grupa: "Regularno 1X2", trziste: "1X2", tip: "X", label: "RX", strana: "X" });
    p.push({ grupa: "Regularno 1X2", trziste: "1X2", tip: "2", label: "R2", strana: "2" });
    for (const l of [-7.5, -3.5, 3.5, 7.5]) {
      p.push({
        grupa: "Azijski hendikep",
        trziste: "Azijski hendikep",
        tip: l < 0 ? `Domaćin ${l}` : `Gost +${l}`,
        label: l < 0 ? `D${l}` : `G+${l}`,
        linija: l,
      });
    }
    for (const l of [150.5, 165.5, 180.5]) {
      p.push({
        grupa: "Total poena",
        trziste: "O/U",
        tip: `Over ${l}`,
        label: `O${l}`,
        linija: l,
        strana: "over",
      });
      p.push({
        grupa: "Total poena",
        trziste: "O/U",
        tip: `Under ${l}`,
        label: `U${l}`,
        linija: l,
        strana: "under",
      });
    }
  } else {
    p.push({ grupa: "1X2 (60')", trziste: "1X2", tip: "1", label: "1", strana: "1" });
    p.push({ grupa: "1X2 (60')", trziste: "1X2", tip: "X", label: "X", strana: "X" });
    p.push({ grupa: "1X2 (60')", trziste: "1X2", tip: "2", label: "2", strana: "2" });
    for (const l of [-3.5, -1.5, 1.5, 3.5]) {
      p.push({
        grupa: "Azijski hendikep",
        trziste: "Azijski hendikep",
        tip: l < 0 ? `Domaćin ${l}` : `Gost +${l}`,
        label: l < 0 ? `D${l}` : `G+${l}`,
        linija: l,
      });
    }
    for (const l of [50.5, 55.5, 60.5]) {
      p.push({
        grupa: "Total golova",
        trziste: "O/U",
        tip: `Over ${l}`,
        label: `O${l}`,
        linija: l,
        strana: "over",
      });
      p.push({
        grupa: "Total golova",
        trziste: "O/U",
        tip: `Under ${l}`,
        label: `U${l}`,
        linija: l,
        strana: "under",
      });
    }
    p.push({
      grupa: "1. poluvrijeme",
      trziste: "1. poluvrijeme",
      tip: "1",
      label: "1H-1",
      strana: "1",
    });
    p.push({
      grupa: "1. poluvrijeme",
      trziste: "1. poluvrijeme",
      tip: "X",
      label: "1H-X",
      strana: "X",
    });
    p.push({
      grupa: "1. poluvrijeme",
      trziste: "1. poluvrijeme",
      tip: "2",
      label: "1H-2",
      strana: "2",
    });
    p.push({
      grupa: "O/U 1. poluvrijeme",
      trziste: "O/U 1. poluvrijeme",
      tip: "Over 25.5",
      label: "1H-O",
      linija: 25.5,
      strana: "over",
    });
    p.push({
      grupa: "O/U 1. poluvrijeme",
      trziste: "O/U 1. poluvrijeme",
      tip: "Under 25.5",
      label: "1H-U",
      linija: 25.5,
      strana: "under",
    });
  }
  return p;
}

/* ── Sinteza kvota (deterministički "virtualni" model, marža 5,5%) ── */
export const MARZA = 0.055;

/** Deterministički rng (mulberry32) — ista utakmica = iste kvote. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalna CDF (Abramowitz–Stegun erf aproksimacija). */
export function fi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const pv =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - pv : pv;
}

function poissonKum(kMax: number, lambda: number): number {
  let p = Math.exp(-lambda),
    kum = p,
    ter = p;
  for (let k = 1; k <= kMax; k++) {
    ter = (ter * lambda) / k;
    kum += ter;
  }
  return Math.min(1, Math.max(0, kum));
}

export interface Ponuda {
  trziste: string;
  tip: string;
  label: string;
  kvota: number;
  vjerojatnost: number;
  izvorKvote: "model";
}

function kvotaIzP(p: number): { kvota: number; p: number } {
  const pc = Math.min(0.97, Math.max(0.02, p));
  return {
    kvota: Math.min(50, Math.max(1.01, Math.round((1 / pc) * (1 - MARZA) * 100) / 100)),
    p: pc,
  };
}

/**
 * Generiraj kompletne "virtualne" kvote za jednu utakmicu.
 * Isti fixtureId uvijek daje iste kvote (determinizam), razumne vjerojatnosti
 * (domaći predznak, log-normalna varijanca) i maržu 5,5% raspoređenu na sve opcije.
 */
export function virtualneKvote(sport: Sport, fixtureId: number, ekstraSeed = 0): Ponuda[] {
  const r = rng((fixtureId + 1) * 7919 + ekstraSeed);
  const iz = (s: number, d: number) => s + (r() * 2 - 1) * d;
  const izl: Ponuda[] = [];

  if (sport === "nogomet") {
    const p1 = Math.min(0.72, Math.max(0.2, iz(0.44, 0.13)));
    const pX = Math.min(0.36, Math.max(0.12, iz(0.25, 0.05)));
    const p2 = Math.max(0.04, 1 - p1 - pX);
    const lamba = Math.max(1.6, iz(2.65, 0.5));
    const domUdio = 0.5 + (p1 - p2) * 0.25;
    const lDom = Math.max(0.3, lamba * domUdio);
    const lGost = Math.max(0.3, lamba - lDom);
    for (const t of trzistaZaSport(sport)) {
      let p: number;
      if (t.strana === "1") p = p1;
      else if (t.strana === "X") p = pX;
      else if (t.strana === "2") p = p2;
      else if (t.tip === "1X") p = p1 + pX;
      else if (t.tip === "X2") p = pX + p2;
      else if (t.tip === "12") p = p1 + p2;
      else if (t.tip === "GG") p = (1 - Math.exp(-lDom)) * (1 - Math.exp(-lGost));
      else if (t.tip === "NG") p = 1 - (1 - Math.exp(-lDom)) * (1 - Math.exp(-lGost));
      else if (t.tip === "DNB 1") p = p1 / (p1 + p2);
      else if (t.tip === "DNB 2") p = p2 / (p1 + p2);
      else if (t.tip.startsWith("1/")) {
        // HT/FT: HT ~ 45% golova
        const poluDom = Math.exp(-lDom * 0.45) * 0.45 * lDom;
        const poluGost = Math.exp(-lGost * 0.45) * 0.45 * lGost;
        const ph1 = poluDom / (poluDom + poluGost + 0.5);
        const kome = t.tip.slice(2);
        const pk1 = kome === "1" ? p1 : kome === "2" ? p2 : pX;
        p = ph1 * pk1 * 0.85; // kondicionirano — uvijek realno niske kvote na HT/FT
      } else if (t.tip.startsWith("X/")) {
        const poluDom = Math.exp(-lDom * 0.45) * 0.45 * lDom;
        const poluGost = Math.exp(-lGost * 0.45) * 0.45 * lGost;
        const phx = Math.exp(-0.45 * (lDom + lGost)) * 3;
        const pk = t.tip.slice(2) === "1" ? p1 : t.tip.slice(2) === "2" ? p2 : pX;
        p = phx * pk * 0.85;
      } else if (t.tip.startsWith("2/")) {
        const poluDom = Math.exp(-lDom * 0.45) * 0.45 * lDom;
        const poluGost = Math.exp(-lGost * 0.45) * 0.45 * lGost;
        const ph2 = poluGost / (poluDom + poluGost + 0.5);
        const pkome = t.tip.slice(2) === "1" ? p1 : t.tip.slice(2) === "2" ? p2 : pX;
        p = ph2 * pkome * 0.85;
      } else if (t.linija != null) {
        const kum = poissonKum(Math.floor(t.linija), lDom + lGost);
        p = t.strana === "over" ? 1 - kum : kum;
      } else continue;
      const k = kvotaIzP(p);
      izl.push({
        trziste: t.trziste,
        tip: t.tip,
        label: t.label,
        kvota: k.kvota,
        vjerojatnost: k.p,
        izvorKvote: "model",
      });
    }
  } else if (sport === "košarka") {
    const margina = iz(3, 7); // domaći +3 ± 7
    const sig = 11;
    const total = Math.max(190, iz(216, 9));
    for (const t of trzistaZaSport(sport)) {
      let p: number;
      if (t.trziste === "Moneyline") p = fi(margina / sig);
      else if (t.strana === "1")
        p = fi(margina / (sig * Math.sqrt(0.92))); // ~reg bez OT
      else if (t.strana === "X") p = 0.008;
      else if (t.strana === "2") p = 1 - fi(margina / (sig * Math.sqrt(0.92))) - 0.008;
      else if (t.linija != null && t.trziste === "Azijski hendikep") {
        // linija < 0 → domaćin daje; u modelu: domH = margina + linija
        p = fi((margina + t.linija) / sig);
      } else if (t.linija != null) {
        const pv = fi((total + (t.strana === "over" ? 0 : 0) - t.linija) / (sig * 0.7));
        p = t.strana === "over" ? pv : 1 - pv;
      } else continue;
      const k = kvotaIzP(p);
      izl.push({
        trziste: t.trziste,
        tip: t.tip,
        label: t.label,
        kvota: k.kvota,
        vjerojatnost: k.p,
        izvorKvote: "model",
      });
    }
  } else {
    const margina = iz(2.5, 6);
    const sig = 6;
    const total = Math.max(45, iz(56.5, 5));
    for (const t of trzistaZaSport(sport)) {
      let p: number;
      if (t.strana === "1") p = fi(margina / sig);
      else if (t.strana === "X") p = 0.13;
      else if (t.strana === "2") p = 1 - fi(margina / sig) - 0.13;
      else if (t.linija != null && t.trziste === "Azijski hendikep")
        p = fi((margina + t.linija) / sig);
      else if (t.linija != null && t.trziste === "O/U") {
        const pv = fi((total - t.linija) / (sig * 0.55));
        p = t.strana === "over" ? pv : 1 - pv;
      } else if (t.trziste === "1. poluvrijeme") {
        const sn: string = t.strana ?? "";
        if (sn === "1") p = fi((margina * 0.42) / (sig * 0.6));
        else if (sn === "X") p = 0.28;
        else p = 1 - fi((margina * 0.42) / (sig * 0.6)) - 0.28;
      } else if (t.linija != null && t.trziste === "O/U 1. poluvrijeme") {
        const pv = fi((total * 0.44 - t.linija) / (sig * 0.4));
        p = t.strana === "over" ? pv : 1 - pv;
      } else continue;
      const k = kvotaIzP(p);
      izl.push({
        trziste: t.trziste,
        tip: t.tip,
        label: t.label,
        kvota: k.kvota,
        vjerojatnost: k.p,
        izvorKvote: "model",
      });
    }
  }
  return izl;
}

/* ── Orion analiza listića ── */
export interface AnalizaSlipa {
  brojNogu: number;
  kombiniranaVjerojatnost: number; // 0..1 — produkt p svih nogu
  ukupnaKvota: number;
  najveciRizik: SlipNoga | null; // noga s najmanjom p
  rizikVjerojatnost: number;
  kellyUdio: number; // puni Kelly (0..1)
  preporuceniUlog: number; // 1/4 Kelly × bankroll, ograničeno na bankroll
  prosjecnaVjerojatnost: number;
}

export function analizirajSlip(noge: SlipNoga[], trenutniBankroll: number): AnalizaSlipa {
  const n = noge.length;
  const ukupnaKvota = ukupnaKvotaSlipa(noge);
  if (n === 0) {
    return {
      brojNogu: 0,
      kombiniranaVjerojatnost: 0,
      ukupnaKvota: 1,
      najveciRizik: null,
      rizikVjerojatnost: 0,
      kellyUdio: 0,
      preporuceniUlog: 0,
      prosjecnaVjerojatnost: 0,
    };
  }
  const komb = noge.reduce((s, x) => s * Math.min(0.99, Math.max(0.01, x.vjerojatnost)), 1);
  const naj = noge.reduce((m, x) => (x.vjerojatnost < m.vjerojatnost ? x : m), noge[0]!);
  const b = ukupnaKvota - 1;
  const kelly = b > 0 ? (komb * (b + 1) - 1) / b : 0;
  const kvart = Math.max(0, kelly / 4);
  return {
    brojNogu: n,
    kombiniranaVjerojatnost: komb,
    ukupnaKvota,
    najveciRizik: naj,
    rizikVjerojatnost: naj.vjerojatnost,
    kellyUdio: kelly,
    preporuceniUlog: Math.min(trenutniBankroll, Math.round(kvart * trenutniBankroll * 100) / 100),
    prosjecnaVjerojatnost: noge.reduce((s, x) => s + x.vjerojatnost, 0) / n,
  };
}

/* ── Poravnanje na settlement motor (listici.ts) ── */
export function nogaIzSlipa(n: SlipNoga): TiketNoga {
  return {
    id: n.id,
    sport: n.sport,
    utakmica: n.utakmica,
    liga: n.liga,
    trziste: n.trziste,
    tip: n.tip,
    kvota: n.kvota,
    vjerojatnost: n.vjerojatnost,
    fixtureId: n.fixtureId,
    status: "cekaj",
  };
}

/**
 * Uplati virtualni listić: skida ulog s bankrolla, sprema tiket (izvor "virtualna")
 * u postojeću "Moji listići" pohranu i čisti listić. Vraća tiket ili grešku.
 */
export function uplatiVirtualniListic(
  noge: SlipNoga[],
  ulog: number,
): { ok: true; tiket: Tiket; novoStanje: number } | { ok: false; razlog: string } {
  if (noge.length === 0) return { ok: false, razlog: "Listić je prazan." };
  if (noge.length > MAX_NOGU)
    return { ok: false, razlog: `Maksimalno ${MAX_NOGU} nogu po listiću.` };
  if (!(ulog > 0)) return { ok: false, razlog: "Unesi ulog veći od €0." };
  const novoStanjeUloga = skiniUlog(ulog, `Ulog — listić (${noge.length} nogu)`);
  if (novoStanjeUloga == null)
    return { ok: false, razlog: "Nedovoljno virtuelnih eura na bankrollu." };
  const tiket = spremiListic(noge.map(nogaIzSlipa), ulog, undefined, "virtualna");
  if (!tiket) {
    // vrati ulog — tiket nije spremljen
    isplatiDobitak(ulog, "Povrat uloga (tiket nije spremljen)", true);
    return { ok: false, razlog: "Spremanje tiketa nije uspjelo." };
  }
  ocistiSlip();
  return { ok: true, tiket, novoStanje: novoStanjeUloga };
}

/** Kreditiraj poravnati virtualni tiket (dobitak ili povrat). Idempotentno po kreditirano oznaci. */
export function kreditirajVirtualniTiket(tiket: Tiket): Tiket {
  if (tiket.izvor !== "virtualna" || tiket.kreditirano) return tiket;
  const st = statusTiketa(tiket.noge);
  if (st !== "dobitno" && st !== "povrat") return tiket;
  const isplata = isplataTiketa(tiket.noge, tiket.ulog);
  if (!(isplata > 0)) return tiket;
  isplatiDobitak(isplata, `Dobitak — listić (${tiket.noge.length} nogu)`, st === "povrat");
  return { ...tiket, kreditirano: true };
}
