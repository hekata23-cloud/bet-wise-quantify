// ============================================================
// KORPA.TS — Bet Slip / Tiket motor (Andromeda AI) — v3
// Kombinirana kvota, EV, varijanca/rizik, frakcijski Kelly.
// NOVO v3: TICKET VARIANCE SCORE — kombinirana Shannon entropija
//          svih noga (Low / Balanced / High Variance) + upozorenje
//          na remi/push noga ("Consider DNB or Asian lines").
// NOVO v2: High Variance Warning događaj kad model noga ima
//          < 55% vjerojatnosti (Korpa.tsx prikazuje toast).
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
    return Array.isArray(arr) ? arr.filter((t) => t && typeof t.id === "string" && Number.isFinite(t.kvota) && t.kvota > 1 && Number.isFinite(t.vjerojatnost) && t.vjerojatnost > 0 && t.vjerojatnost <= 1).slice(0, 15) : [];
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
  // BET SLIP INTELLIGENCE: noga s < 55% win rate → modal/toast upozorenje
  if (k < 0.55) {
    window.dispatchEvent(
      new CustomEvent("andromeda:korpa-upozorenje", {
        detail: {
          poruka: `High Variance Warning: "${tip.tip}" (${tip.utakmica}) ima ${Math.round(k * 100)}% win rate — manje od 55%. Preporuka: paraj samo sa sigurnim nogama ili smanji ulog.`,
        },
      }),
    );
  }
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
  /** v3: TICKET VARIANCE SCORE (Shannon entropija) */
  varijanca: VarijansaTiketa;
}

export function izracunajKorpu(
  tipovi: KorpaTip[],
  opts: { bankroll?: number; kellyFrac?: number; maxUlogPerc?: number } = {},
): IzracunKorpe {
  const bankrollRaw = Number(opts.bankroll ?? 0);
  const kellyRaw = Number(opts.kellyFrac ?? 0.25);
  const maxRaw = Number(opts.maxUlogPerc ?? 3);
  const bankroll = Number.isFinite(bankrollRaw) ? Math.max(0, bankrollRaw) : 0;
  const kellyFrac = Number.isFinite(kellyRaw) ? Math.min(1, Math.max(0.05, kellyRaw)) : 0.25;
  const maxUlogPerc = Number.isFinite(maxRaw) ? Math.min(10, Math.max(0.5, maxRaw)) : 3;
  const safeTips = tipovi.filter((t) => t && Number.isFinite(t.kvota) && t.kvota > 1 && Number.isFinite(t.vjerojatnost) && t.vjerojatnost >= 0 && t.vjerojatnost <= 1);
  const n = safeTips.length;
  const prazno: IzracunKorpe = {
    n: 0, kvota: 1, vjerojatnost: 0, edge: 0, kelly: 0, ulogPerc: 0, ulogIznos: 0,
    stdRet: 0, rizikPerc: 0, jedinstvenihUtakmica: 0, korelacijaUpozorenje: false, isplativo: false,
    varijanca: varijancaTiketa([]),
  };
  if (n === 0) return prazno;

  const kvota = safeTips.reduce((a, t) => Math.min(1e12, a * t.kvota), 1);
  const p = safeTips.reduce((a, t) => a * clamp01(t.vjerojatnost), 1);
  const edge = kvota * p - 1;

  const b = kvota - 1;
  const q = 1 - p;
  const kelly = b > 0 ? (b * p - q) / b : 0;

  const jedinstvenihUtakmica = new Set(safeTips.map((t) => t.utakmica)).size;
  const korelacijaUpozorenje = jedinstvenihUtakmica < n;
  // Korelirane noge (isti par dvaput) dijele sudbinu — Kelly ide na pola.
  const kellyEff = korelacijaUpozorenje ? kelly * 0.5 : kelly;

  const ulogPerc = Math.min(maxUlogPerc, Math.max(0, kellyEff) * kellyFrac * 100);
  const ulogIznosRaw = (bankroll * ulogPerc) / 100;
  const ulogIznos = Number.isFinite(ulogIznosRaw) ? ulogIznosRaw : 0;

  const stdRetRaw = Math.sqrt(p * q) * b;
  const stdRet = Number.isFinite(stdRetRaw) ? stdRetRaw : 0;
  const rizikPerc = Math.min(100, Math.round((stdRet / Math.max(0.01, kvota)) * 100));

  return {
    n, kvota, vjerojatnost: p, edge, kelly,
    ulogPerc, ulogIznos, stdRet, rizikPerc,
    jedinstvenihUtakmica, korelacijaUpozorenje,
    isplativo: edge > 0 && ulogPerc > 0,
    varijanca: varijancaTiketa(safeTips),
  };
}

export function korpaBroj(): number {
  return loadKorpa().length;
}

/* ── TICKET VARIANCE SCORE (v3) — Shannon entropija tiketa ─────────
   Svaka noga je Bernoulli(p) → binarna entropija
       H(p) = −p·ln p − (1−p)·ln(1−p)   (u natsima, 0..ln 2)
   Normalizirana na 0..1 dijeljenjem s ln 2. Tiket score = prosjek
   svih noga: 1.00 znači "novčić" (maksimalna varijanca), 0 znači
   sigurnu nogu. Granice: > 0.90 VISOKA, ≥ 0.75 BALANSIRANA, inače NISKA. */

export type VarijansaRazina = "niska" | "balansirana" | "visoka";

export interface VarijansaTiketa {
  razina: VarijansaRazina;
  /** prosječna normalizirana entropija noga (0..1) */
  entropija: number;
  /** broj noga s visokom rizikom remi/push ishoda */
  remiPushNoge: number;
  /** jedno-rečična preporuka kad n ≥ 3 i postoji remi/push noga */
  upozorenje: string | null;
}

const LN2 = Math.LN2;

/** Binarna Shannon entropija, normalizirana na 0..1 (0·ln0 = 0). */
export function entropijaNozice(p: number): number {
  const x = clamp01(p);
  const h = x <= 0 || x >= 1
    ? 0
    : -x * Math.log(x) - (1 - x) * Math.log(1 - x);
  return h / LN2;
}

const REMI_TRZISTA = /1x2|ht\/ft|htft|remi|draw/i;
const REMI_TIP = /(^|\/)x(\/|$)|remi|draw/i;
const PUSH_TRZISTA = /o\/u|total|spread|handicap|ah\b|korner|karton/i;
const CELBROJ_LINIJA = /(?:^|[^\d.])([+-]?\d+)(?:\s|$|[^.\d])/;

/** Noga s materijalnim rizikom remija (1X2/HT/FT) ili pusha
 *  (cjelobrojna AH/total/spread linija — kvota vraćena, ne izgubljena,
 *  ali tiket pada). */
export function nogaRemiIliPush(t: KorpaTip): boolean {
  const trz = t.trziste || "";
  const tip = t.tip || "";
  if (REMI_TRZISTA.test(trz) && REMI_TIP.test(tip)) return true;
  if (PUSH_TRZISTA.test(trz)) {
    const m = tip.match(CELBROJ_LINIJA);
    if (m && !tip.includes(".")) {
      // "Over 2" / "Domaćin -1" / "Više od 9" → cjelobrojna linija
      if (/[+-]?\d/.test(m[1]!)) return true;
    }
  }
  return false;
}

/** Ticket Variance Score cijelog tiketa. */
export function varijancaTiketa(tipovi: KorpaTip[]): VarijansaTiketa {
  const n = tipovi.length;
  if (n === 0)
    return { razina: "niska", entropija: 0, remiPushNoge: 0, upozorenje: null };
  const ent = tipovi.reduce((a, t) => a + entropijaNozice(t.vjerojatnost), 0) / n;
  const razina: VarijansaRazina = ent > 0.9 ? "visoka" : ent >= 0.75 ? "balansirana" : "niska";
  const remiPush = tipovi.filter(nogaRemiIliPush);
  let upozorenje: string | null = null;
  if (n >= 3 && remiPush.length > 0) {
    const najlosija = remiPush.reduce((a, b) => (b.vjerojatnost < a.vjerojatnost ? b : a));
    upozorenje =
      `Variance warning: visoka vjerojatnost remi/push ishoda na selekciji "${najlosija.tip}" (${najlosija.utakmica}). Razmotri DNB (Draw No Bet) ili azijske linije.`;
  }
  return {
    razina,
    entropija: Math.round(ent * 1000) / 1000,
    remiPushNoge: remiPush.length,
    upozorenje,
  };
}
