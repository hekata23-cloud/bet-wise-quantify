// ============================================================
// LISTICI.TS — Moji listići: spremanje, settlement i analitika (v1)
// Profesionalna pravila isplata (SuperSport stil):
//   • PST/CANC/ABD/SUSP → noga VOID, kvota 1.00, siva ⚪ oznaka;
//     ukupna kvota i isplata se dinamički preračunaju, tiket se NE
//     označava kao izgubljen dok su ostale noge u igri.
//   • Nogomet: sva standardna tržišta na 90 min + nadoknada (score.fulltime).
//   • Košarka: 1X2 i Spread → regularno vrijeme (40/48 min); Moneyline
//     i Total → uključuju produžetak (OT/AOT).
//   • Rukomet: 1X2, AH i Total Goals → striktno 60 minuta regularno.
//   • Cjelobrojne linije (total/HD) → PUSH = povrat uloga na nozi.
// Čista logika — bez API poziva. Pohrana: localStorage.
// ============================================================

import type { KorpaTip } from "./korpa";

export type Sport = "nogomet" | "košarka" | "rukomet";
export type LegStatus = "cekaj" | "dobitna" | "izgubljena" | "void";
export type IshodNoge = "dobitna" | "izgubljena" | "povrat" | "nepoznato";
export type TiketStatus = "aktivno" | "dobitno" | "gubitno" | "povrat";

export interface TiketNoga {
  id: string;
  sport: Sport;
  utakmica: string;      // "Domaćin - Gost"
  liga?: string;
  trziste: string;       // "1X2", "Moneyline", "O/U 2.5", "Spread", "HT/FT"…
  tip: string;           // "1", "Over 2.5", "Domaćin -5.5", "GG"…
  kvota: number;         // ponuđena kvota (> 1)
  vjerojatnost: number;  // modelova procjena (0..1)
  fixtureId?: number;    // API ID utakmice (za automatsku provjeru)
  status: LegStatus;
  napomena?: string;     // npr. "Odgođeno (PST)" ili "Ručno ✓"
  rucno?: boolean;       // istina kad je status postavio korisnik
}

export interface Tiket {
  id: string;
  datum: string;         // ISO — kad je listić odigran
  noge: TiketNoga[];
  ulog: number;          // u novcu
  izvor?: "korpa" | "virtualna"; // virtualna = Virtualna Kladionica (bankroll kredit)
  kreditirano?: boolean; // dobitak/povrat je već uplaćen na bankroll (virtualna)
}

/* ── Prepoznavanje void statusa (API-Football / API-Sports short kodovi) ── */
const VOID_STATUSI = new Set(["PST", "CANC", "ABD", "SUSP", "INT", "POSTP"]);

export function jeVoidStatus(short: string | null | undefined): boolean {
  return short != null && VOID_STATUSI.has(short.toUpperCase());
}

/* ── Klasifikacija tržišta ── */
export type VrstaTrzista = "1x2reg" | "moneyline" | "handicap" | "total" | "timtotal" | "dvostruka" | "htft" | "polu1x2" | "polutotal" | "ostalo";

export function vrstaTrzista(sport: Sport, trziste: string, tip: string): VrstaTrzista {
  const t = trziste.toLowerCase();
  const ti = tip.toLowerCase();
  if (t.includes("moneyline") || t.includes("pobjednik meča") || t.includes("pobjednik meca")) return "moneyline";
  if (t.includes("1x2") || t.includes("1×2") || t.includes("1x2reg")) return "1x2reg";
  if (t.includes("spread") || t.includes("handicap") || t.includes("hendikep") || t.includes("azijski")) return "handicap";
  if (t.includes("ht/ft") || (t.includes("ht") && t.includes("ft"))) return "htft";
  if (t.includes("polu")) return (t.includes("over") || t.includes("under") || ti.includes("over") || ti.includes("under")) ? "polutotal" : "polu1x2";
  if (t.includes("dvostruka") || /^(1x|x2|12)$/.test(ti)) return "dvostruka";
  if (t.includes("timtotal") || t.startsWith("dom") || t.startsWith("gost")) {
    if (t.includes("over") || t.includes("under") || t.includes("ukupno")) return "timtotal";
  }
  if (t.includes("o/u") || t.includes("total") || t.includes("ukupno") || t.includes("golovi") ||
      t.includes("poeni") || t.includes("over") || t.includes("under")) return "total";
  if (ti.startsWith("over") || ti.startsWith("under") || ti.startsWith("više") || ti.startsWith("vise") || ti.startsWith("manje")) return "total";
  if (sport === "košarka" && (t.includes("1") || t.includes("2")) && !t.includes("ht")) return "moneyline";
  return "ostalo";
}

/* ── Izvor rezultata po sportu i tržištu ── */
export interface RezultatUtakmice {
  sport?: Sport;          // opcionalni hint za 3-argumentni evaluator
  status: string;        // API short: "FT", "AET", "AOT", "PST"…
  zavrsena: boolean;
  dom: number | null;        // konačni rezultat (uklj. OT ako je bilo)
  gost: number | null;
  domReg: number | null;     // regularno vrijeme (90'/40-48'/60')
  gostReg: number | null;
  domHT: number | null;
  gostHT: number | null;
}

/** Koje rezultate tržište koristi: "reg" (regularno vrijeme) ili "full" (uklj. OT). */
export function izvorRezultata(sport: Sport, vrsta: VrstaTrzista): "reg" | "full" {
  if (vrsta === "htft" || vrsta === "polu1x2" || vrsta === "polutotal") return "reg";
  if (sport === "nogomet") return "reg";                    // 90' + nadoknada; domReg = fulltime
  // rukomet: 1X2 / AH / Total Goals striktno 60 minuta; "pobjednik meča" uklj. produžetak
  if (sport === "rukomet") return vrsta === "moneyline" ? "full" : "reg";
  // košarka: 1X2 i Spread = regularno; Moneyline i Total = uklj. OT
  return vrsta === "1x2reg" || vrsta === "handicap" ? "reg" : "full";
}

function rezultatZa(sport: Sport, vrsta: VrstaTrzista, r: RezultatUtakmice): { dom: number | null; gost: number | null } {
  const src = izvorRezultata(sport, vrsta);
  if (src === "reg") return { dom: r.domReg, gost: r.gostReg };
  return { dom: r.dom, gost: r.gost };
}

/* ── Parsiranje strana i linija ── */
function strana1x2(tip: string): "1" | "X" | "2" | null {
  const t = tip.toLowerCase().trim();
  if (/^(1|doma[cć]in|dom|home)\b/.test(t) || t === "1") return "1";
  if (/^(2|gost|away)\b/.test(t) || t === "2") return "2";
  if (/^(x|nerije[sš]eno|remi|draw)\b/.test(t) || t === "x") return "X";
  return null;
}

function stranaDvorna(tip: string): "1" | "2" | null {
  const s = strana1x2(tip);
  return s === "1" ? "1" : s === "2" ? "2" : null;
}

/** Over/Under + linija iz tipa ili tržišta. */
function totalIz(tip: string, trziste: string): { over: boolean; linija: number } | null {
  const spoji = `${trziste} ${tip}`.toLowerCase().replace(/,/g, ".");
  const m = spoji.match(/(over|vi[sš]e|manje|under)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (m) {
    const over = m[1] === "over" || m[1] === "više" || m[1] === "vise";
    const linija = Number(m[2]);
    return Number.isFinite(linija) ? { over, linija } : null;
  }
  const lin = spoji.match(/([0-9]+(?:\.[0-9]+)?)\s*(over|under|vi[sš]e|manje)/);
  if (lin) {
    const over = lin[2] === "over" || lin[2] === "više" || lin[2] === "vise";
    return { over, linija: Number(lin[1]) };
  }
  return null;
}

/** Handicap: tim + margina iz tipa ("Domaćin -5.5", "Gost +3.5", "AH -1.5"). */
function handicapIz(tip: string): { tim: "1" | "2"; margina: number } | null {
  const t = tip.toLowerCase().replace(/,/g, ".").replace(/−/g, "-");
  const m = t.match(/(doma[cć]in|dom|home|1|gost|away|2)\s*([+-]?[0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const tim = /dom|home|^1/.test(m[1]) ? "1" : "2";
  const margina = Number(m[2]);
  return Number.isFinite(margina) ? { tim, margina } : null;
}

/* ── Ocjena jedne noge ── */
export function ocijeniNogu(sport: Sport, noga: { trziste: string; tip: string; kvota: number }, r: RezultatUtakmice): IshodNoge {
  if (jeVoidStatus(r.status)) return "povrat"; // PST/CANC/ABD → void neovisno o završetku
  if (!r.zavrsena) return "nepoznato";
  const vrsta = vrstaTrzista(sport, noga.trziste, noga.tip);
  const { dom, gost } = rezultatZa(sport, vrsta, r);
  // poluvrijeme grane ne koriste puni rezultat; reg. grane garantirano imaju brojeve (guard gore)
  const domR = dom ?? 0;
  const gostR = gost ?? 0;
  // poluvrijeme tržišta ocjenjuju se po domHT/gostHT — puni rezultat im nije nužan
  if (vrsta !== "polu1x2" && vrsta !== "polutotal" && (domR == null || gostR == null)) return "nepoznato";
  if (vrsta === "dvostruka") {
    const iz = noga.tip.replace(/\s/g, "").toUpperCase().replace("×", "X");
    const stvarno = domR > gostR ? "1" : domR < gostR ? "2" : "X";
    if (iz === "1X") return stvarno === "2" ? "izgubljena" : "dobitna";
    if (iz === "X2") return stvarno === "1" ? "izgubljena" : "dobitna";
    if (iz === "12") return stvarno === "X" ? "izgubljena" : "dobitna";
    return "nepoznato";
  }
  if (vrsta === "htft") {
    if (r.domHT == null || r.gostHT == null || domR == null || gostR == null) return "nepoznato";
    const m = noga.tip.trim().toUpperCase().match(/^([12X])\/([12X])$/);
    if (!m) return "nepoznato";
    const polu = r.domHT > r.gostHT ? "1" : r.domHT < r.gostHT ? "2" : "X";
    const kraj = domR > gostR ? "1" : domR < gostR ? "2" : "X";
    return m[1] === polu && m[2] === kraj ? "dobitna" : "izgubljena";
  }
  if (vrsta === "polu1x2" || vrsta === "polutotal") {
    if (r.domHT == null || r.gostHT == null) return "nepoznato";
    if (vrsta === "polu1x2") {
      const s = strana1x2(noga.tip);
      if (!s) return "nepoznato";
      const stv = r.domHT > r.gostHT ? "1" : r.domHT < r.gostHT ? "2" : "X";
      return s === stv ? "dobitna" : "izgubljena";
    }
    const tot = totalIz(noga.tip, noga.trziste);
    if (!tot) return "nepoznato";
    const vrijednost = r.domHT + r.gostHT;
    if (vrijednost === tot.linija) return "povrat";
    return (vrijednost > tot.linija) === tot.over ? "dobitna" : "izgubljena";
  }

  if (vrsta === "1x2reg") {
    const s = strana1x2(noga.tip);
    if (!s) return "nepoznato";
    const stvarno = domR > gostR ? "1" : domR < gostR ? "2" : "X";
    return s === stvarno ? "dobitna" : "izgubljena";
  }
  if (vrsta === "moneyline") {
    const s = stranaDvorna(noga.tip);
    if (!s) return "nepoznato";
    const stvarno = domR > gostR ? "1" : domR < gostR ? "2" : null;
    if (stvarno == null) return "izgubljena"; // 2-načina: neriješeno = gubitak (DNB je odvojeno tržište)
    return s === stvarno ? "dobitna" : "izgubljena";
  }
  if (vrsta === "handicap") {
    const h = handicapIz(noga.tip);
    if (!h) return "nepoznato";
    const domH = h.tim === "1" ? domR + h.margina : domR;
    const gostH = h.tim === "2" ? gostR + h.margina : gostR;
    if (domH === gostH) return "povrat"; // cjelobrojna linija → push
    const pobjednik = domH > gostH ? "1" : "2";
    return h.tim === pobjednik ? "dobitna" : "izgubljena";
  }
  if (vrsta === "total" || vrsta === "timtotal") {
    const tot = totalIz(noga.tip, noga.trziste);
    if (!tot) return "nepoznato";
    const vrijednost =
      vrsta === "timtotal"
        ? noga.trziste.toLowerCase().startsWith("domR") ? domR : gostR
        : domR + gostR;
    if (vrijednost === tot.linija) return "povrat"; // push
    const over = vrijednost > tot.linija;
    return over === tot.over ? "dobitna" : "izgubljena";
  }
  // ostalo (BTTS/GG, DNB, SGP…): ocjena po punim regularnim golovima
  const ti = noga.tip.toLowerCase();
  if (/^(gg|btts)/.test(ti)) {
    const da = !ti.includes("ne") && !ti.includes("ng") && !ti.includes("nema");
    const btts = domR > 0 && gostR > 0;
    return da === btts ? "dobitna" : "izgubljena";
  }
  if (ti.includes("dnb") || ti.includes("bez remi")) {
    const s = stranaDvorna(ti.replace(/dnb|bez remi/g, "").trim());
    if (!s) return "nepoznato";
    if (domR === gostR) return "povrat";
    return s === (domR > gostR ? "1" : "2") ? "dobitna" : "izgubljena";
  }
  return "nepoznato"; // HT/FT, SGP, točan rezultat → ručna provjera
}

/**
 * Javno ime evaluatora koje koriste settlement procesi.
 * Prima sport, tržište, odabir i konačan rezultat; vraća dobitna/izgubljena/povrat/nepoznato.
 * Stara ocijeniNogu ostaje kompatibilna za postojeće pozive.
 */
export function evaluateLegOutcome(
  market: string,
  selection: string,
  matchResult: RezultatUtakmice,
  sport?: Sport,
): IshodNoge {
  // Za tržišta koja se dijele među sportovima (npr. 1X2/O-U), pozivatelj
  // treba navesti sport ili ga postaviti u matchResult.sport.
  const inferredSport: Sport = sport ?? matchResult.sport ?? (
    /basket|ko[sš]arka|poen|moneyline|spread/i.test(`${market} ${selection}`)
      ? "košarka"
      : /handball|rukomet/i.test(`${market} ${selection}`)
        ? "rukomet"
        : "nogomet"
  );
  return ocijeniNogu(inferredSport, { trziste: market, tip: selection, kvota: 1 }, matchResult);
}

/* ── Statusi i isplata tiketa ── */
export function efektivnaKvota(noga: TiketNoga): number {
  return noga.status === "void" ? 1 : noga.kvota;
}

export function ukupnaKvotaTiketa(noge: TiketNoga[]): number {
  return noge.reduce((s, n) => s * efektivnaKvota(n), 1);
}

export function statusTiketa(noge: TiketNoga[]): TiketStatus {
  const svi = noge.length > 0 ? noge : [];
  if (svi.length === 0) return "aktivno";
  const imaCekaj = svi.some((n) => n.status === "cekaj");
  const imaGubitak = svi.some((n) => n.status === "izgubljena");
  const sviVoid = svi.every((n) => n.status === "void");
  if (sviVoid) return "povrat";
  if (imaGubitak) return "gubitno";
  if (imaCekaj) return "aktivno";
  return "dobitno"; // sve dobitne i/ili void
}

/** Dinamička isplata: void noga ima kvotu 1.00, dobitni tiket isplaćuje preračunanu kvotu. */
export function isplataTiketa(noge: TiketNoga[], ulog: number): number {
  const st = statusTiketa(noge);
  if (st === "dobitno") return ulog * ukupnaKvotaTiketa(noge);
  if (st === "povrat") return ulog;
  return 0; // gubitno ili aktivno
}

/* ── Analitika "Moji listići" ── */
export interface StatListica {
  odigrani: number;
  dobitni: number;
  izgubljeni: number;
  povrati: number;
  aktivni: number;
  ukupanUlog: number;
  ukupanDobitak: number;
  profit: number;
  roi: number;              // %
  winRate: number;          // %
  najjaciSport: Sport | null;
  najjaciSportProfit: number;
  najvecaKvota: number | null;  // najveća pogođena (settled winning) ukupna kvota
}

export function statistikaListica(tiketi: Tiket[]): StatListica {
  const st: StatListica = {
    odigrani: 0, dobitni: 0, izgubljeni: 0, povrati: 0, aktivni: 0,
    ukupanUlog: 0, ukupanDobitak: 0, profit: 0, roi: 0, winRate: 0,
    najjaciSport: null, najjaciSportProfit: 0, najvecaKvota: null,
  };
  const poSportu = new Map<Sport, number>();
  for (const t of tiketi) {
    if (!t || !Array.isArray(t.noge) || t.noge.length === 0) continue;
    const status = statusTiketa(t.noge);
    const isplata = isplataTiketa(t.noge, t.ulog);
    if (status === "aktivno") { st.aktivni++; continue; }
    st.odigrani++;
    st.ukupanUlog += t.ulog;
    st.ukupanDobitak += isplata;
    if (status === "dobitno") {
      st.dobitni++;
      const kv = ukupnaKvotaTiketa(t.noge);
      if (st.najvecaKvota == null || kv > st.najvecaKvota) st.najvecaKvota = kv;
    } else if (status === "gubitno") st.izgubljeni++;
    else st.povrati++;
    const sport = t.noge[0].sport;
    poSportu.set(sport, (poSportu.get(sport) ?? 0) + (isplata - t.ulog));
  }
  st.profit = st.ukupanDobitak - st.ukupanUlog;
  st.roi = st.ukupanUlog > 0 ? (st.profit / st.ukupanUlog) * 100 : 0;
  st.winRate = st.odigrani > 0 ? (st.dobitni / st.odigrani) * 100 : 0;
  for (const [sport, profit] of poSportu) {
    if (st.najjaciSport == null || profit > st.najjaciSportProfit) {
      st.najjaciSport = sport;
      st.najjaciSportProfit = profit;
    }
  }
  return st;
}

/* ── Noge iz Korpe ── */
export function nogaIzKorpe(t: KorpaTip): TiketNoga {
  return {
    id: t.id,
    sport: t.sport,
    utakmica: t.utakmica,
    liga: t.liga,
    trziste: t.trziste,
    tip: t.tip,
    kvota: t.kvota,
    vjerojatnost: t.vjerojatnost,
    fixtureId: t.fixtureId,
    status: "cekaj",
  };
}

/* ── Pohrana (localStorage, SSR-sigurno) ── */
const KLJUC = "pc.listici.v1";
const MAX = 300;

export function ucitajListice(): Tiket[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(KLJUC);
    const arr = raw ? (JSON.parse(raw) as Tiket[]) : [];
    return Array.isArray(arr)
      ? arr.filter((t) => t && Array.isArray(t.noge) && Number.isFinite(t.ulog) && t.ulog >= 0).slice(0, MAX)
      : [];
  } catch { return []; }
}

function spremi(tiketi: Tiket[]) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KLJUC, JSON.stringify(tiketi.slice(0, MAX)));
      window.dispatchEvent(new CustomEvent("pc:listici"));
    }
  } catch { /* puna memorija — ignoriraj */ }
}

export function spremiListic(noge: TiketNoga[], ulog: number, datum?: string, izvor?: Tiket["izvor"]): Tiket | null {
  const ciste = noge.filter((n) => n && n.kvota > 1 && n.tip && n.utakmica);
  if (ciste.length === 0 || !(ulog > 0)) return null;
  const tiket: Tiket = {
    id: `listic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    datum: datum ?? new Date().toISOString(),
    noge: ciste,
    ulog: Math.max(0, Number(ulog) || 0),
    izvor,
  };
  spremi([tiket, ...ucitajListice()]);
  return tiket;
}

export function azurirajNogu(tiketId: string, nogaId: string, status: LegStatus, napomena?: string, rucno = false) {
  const svi = ucitajListice();
  const t = svi.find((x) => x.id === tiketId);
  if (!t) return;
  const n = t.noge.find((x) => x.id === nogaId);
  if (!n) return;
  n.status = status;
  n.rucno = rucno || n.rucno;
  if (napomena != null) n.napomena = napomena;
  spremi(svi);
}

export function postaviNoguIshod(tiketId: string, nogaId: string, ishod: IshodNoge, napomena?: string) {
  const st: LegStatus = ishod === "dobitna" ? "dobitna" : ishod === "izgubljena" ? "izgubljena" : ishod === "povrat" ? "void" : "cekaj";
  azurirajNogu(tiketId, nogaId, st, napomena, true);
}

export function brisiListic(id: string) {
  spremi(ucitajListice().filter((t) => t.id !== id));
}

export function brisiSveListice() {
  spremi([]);
}

/* ── Fuzzy uparivanje utakmice s fiksaturama API-ja (bez dijakritike) ── */
export function normalizirajIme(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(fc|cf|nk|sc|ac|as|ss|sk|club|team)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface KandidatFiksatura { id: number; dom: string; gost: string; status: string }

/** Vrati fixtureId kandidata čija imena najbolje odgovaraju "Domaćin - Gost". */
export function pogodiFiksaturu(utakmica: string, kandidati: KandidatFiksatura[]): number | null {
  const dijelovi = utakmica.split(/\s*[-—–]\s*/).map(normalizirajIme).filter(Boolean);
  if (dijelovi.length !== 2) return null;
  const [domNorm, gostNorm] = dijelovi;
  let najbolji: { id: number; skor: number } | null = null;
  for (const k of kandidati) {
    const d = normalizirajIme(k.dom);
    const g = normalizirajIme(k.gost);
    const par = (a: string, b: string) => (a === b ? 1 : a.includes(b) || b.includes(a) ? 0.7 : 0);
    const skor = Math.min(par(domNorm, d), par(gostNorm, g));
    if (skor > 0 && (najbolji == null || skor > najbolji.skor)) najbolji = { id: k.id, skor };
  }
  return najbolji && najbolji.skor >= 0.7 ? najbolji.id : null;
}

/* ── Novo-pobjednički tiketi (za konfete i zvuk) ── */
const VIDENO_KEY = "pc.listici.videno.v1";

/** Vrati dobitne tikete koje korisnik još nije "vidio" (prvo otvaranje nakon
 *  nadogradnje ne konfetira stare dobitke — svi postojeći se označe viđenima). */
export function noviDobitniTiketi(tiketi: Tiket[]): Tiket[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(VIDENO_KEY);
    if (raw == null) {
      const svi = tiketi.filter((t) => statusTiketa(t.noge) === "dobitno").map((t) => t.id);
      localStorage.setItem(VIDENO_KEY, JSON.stringify(svi));
      return [];
    }
    const videno = new Set(JSON.parse(raw) as string[]);
    const novi = tiketi.filter((t) => t && statusTiketa(t.noge) === "dobitno" && !videno.has(t.id));
    if (novi.length) {
      for (const t of novi) videno.add(t.id);
      localStorage.setItem(VIDENO_KEY, JSON.stringify([...videno]));
    }
    return novi;
  } catch { return []; }
}

/** Zamijeni cijeli tiket u pohrani (npr. nakon automatskog uparivanja fixtureId-a). */
export function azurirajListic(tiket: Tiket) {
  spremi(ucitajListice().map((t) => (t.id === tiket.id ? tiket : t)));
}
