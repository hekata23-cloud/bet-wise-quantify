/* ═══════════════════════════════════════════════════════════════════
   SAFE-MATH — neprobojni ulazni sloj za sve motore (v1)
   ═══════════════════════════════════════════════════════════════════
   PROBLEM KOJI RJEŠAVA: API-Football (i ručni unos) šalju brojeve u
   raznim oblicima — "1.45" kao string, { goals: { home: 1, away: 1 } }
   ili { homeGoals: 1 }, null, undefined, pa i NaN. Kad takav podatak
   uđe u Poisson/Skellam/Dean Oliver matematiku, cijeli lanac postane
   NaN i kartica prikaže 0% ili zamrznute postotke.

   RJEŠENJE — jedna knjižnica koju SVI motori koriste na ulazu:
     • broj(v, fallback)  — forsira svaki ulaz u čisti broj
       (string, "1,45" s zarezom, null, undefined, objekt), uz
       fallback i raspon [min, max];
     • golovi(v, fallback, max) — broj, zaokružen na cijele golove;
     • sigurnoLam(v, fallback) — λ mora biti > 0 i < 10, inače fallback;
     • LIGA_PROSJEK_GOLI / KUCNA_PREDNOST — sigurne vrijednosti lige
       kad je podatak fali (npr. 2.65 ligaških golova, 1.15 kućna
       prednost), da predikcija nikad ne padne u NaN ili 0%;
     • UNIVERSAL MATCH CONTEXT — standardizirano sučelje utakmice
       jednako za sve tri sportove i sve kartice: normalizirajKontekst()
       prima sirovi objekt (bilo koji oblik polja) i vraća čist,
       potpuno ispunjen kontekst — nema više "stari/oblik objekta"
       nesuglasja između kartica i motorâ.

   Čiste funkcije, bez API-ja, bez UI-ja, SSR-safe. Ništa ne mijenja
   kad je ulaz već čist broj (identitet na ispravnim podacima).
   ═══════════════════════════════════════════════════════════════════ */

export type SportSvih = "nogomet" | "kosarka" | "rukomet";

/** Sigurne vrijednosti lige kad podatak fali (brojke za održavanje
 *  predikcije u zdravim granicama — NE jamče točnost, samo sprječavaju
 *  NaN i 0% kao posljedicu pokvarenih podataka). */
export const LIGA_PROSJEK_GOLI = 2.65;   // ukupni golovi po meču (nogomet)
export const KUCNA_PREDNOST = 1.15;      // multiplikator kuće (nogomet)
export const KOSE_PROSJEK_TIMA = 4.9;    // korneri po timu
export const PROSJEK_POENI_KOSA = 82;    // košarka po timu
export const PROSJEK_GOLOVI_RUKO = 28.5; // rukomet po timu

/** Parsova li vrijednost u čisti broj (broj ili string, i zarez kao decimalka)? */
export function brojIzUlaza(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    // često: broj u obliku { value: "1.45" } ili { odd: "2.10" }
    const o = v as { value?: unknown; odd?: unknown; home?: unknown; away?: unknown; total?: unknown };
    for (const k of ["value", "odd", "total", "home", "away"] as const) {
      const r = brojIzUlaza(o[k]);
      if (r != null) return r;
    }
  }
  return null;
}

/** Forsiraj ulaz u čisti broj: Math.max(0, parseFloat(val) || 0) + raspon. */
export function broj(v: unknown, fallback = 0, min = 0, max = Number.POSITIVE_INFINITY): number {
  const n = brojIzUlaza(v);
  if (n == null) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, n));
}

/** Broj koji smije biti i negativan (npr. pomaci, linije handicapova). */
export function brojBilo(v: unknown, fallback = 0, min = -1e6, max = 1e6): number {
  const n = brojIzUlaza(v);
  if (n == null) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, n));
}

/** Cijeli broj golova/poena (0..max). */
export function golovi(v: unknown, fallback = 0, max = 15): number {
  return Math.round(broj(v, fallback, 0, max));
}

/** Kvote: smije biti i "2.10" string; vraća null ako nije ispravna kvota. */
export function kvota(v: unknown): number | null {
  const n = brojIzUlaza(v);
  if (n == null || n <= 1.001 || n > 1000) return null;
  return n;
}

/** λ (očekivanje) — mora biti > 0; NaN/0/∞ → sigurna vrijednost. */
export function sigurnoLam(v: unknown, fallback: number): number {
  const n = brojIzUlaza(v);
  if (n == null || !(n > 0.01) || !(n < 10)) return fallback;
  return n;
}

/** Vjerojatnost 0..1 — izvan raspona ili NaN → fallback (default 0.5). */
export function sigurnoP(v: unknown, fallback = 0.5): number {
  const n = brojIzUlaza(v);
  if (n == null || !(n >= 0 && n <= 1)) return fallback;
  return n;
}

/** Postotak 0..100 → 0..1 kad pozivatelj nije siguran u formu ulaza. */
export function postotak(v: unknown, fallback = 0): number {
  const n = brojIzUlaza(v);
  if (n == null) return fallback;
  // ">1" smatramo postotkom (55 → 0.55), "<=1" vjerojatnošću (0.55 → 0.55)
  return n > 1 ? Math.min(1, Math.max(0, n / 100)) : Math.min(1, Math.max(0, n));
}

/** Sigurni λ-ovi iz sirovih vrijednosti: neispravne bacaš na ligaški prior. */
export function sigurneLambde(
  lam: unknown,
  mu: unknown,
  ligaPriorUkupno: number = LIGA_PROSJEK_GOLI,
  kucnaPrednost: number = KUCNA_PREDNOST,
): { lam: number; mu: number } {
  const nulaLiga = Math.max(0.2, (ligaPriorUkupno / 2) * kucnaPrednost);
  const nulaGost = Math.max(0.2, (ligaPriorUkupno / 2) / kucnaPrednost);
  const l = sigurnoLam(lam, nulaLiga);
  const m = sigurnoLam(mu, nulaGost);
  // zaštita od besmislenog para (npr. λ=0.02, μ=8): ukupno mora biti razumno
  const ukupno = l + m;
  if (ukupno > 0.2 && ukupno < 12) return { lam: l, mu: m };
  return { lam: nulaLiga, mu: nulaGost };
}

/** De-vig para uz sigurnosne provjere (kvota string ili broj, bilo koji oblik). */
export function devigPar(o: unknown, u: unknown): { pA: number; pB: number } | null {
  const a = kvota(o), b = kvota(u);
  if (a == null || b == null) return null;
  const ia = 1 / a, ib = 1 / b;
  const s = ia + ib;
  return { pA: ia / s, pB: ib / s };
}

/** De-vig 1X2 uz sigurnosne provjere — null kad ijedna kvota fali. */
export function devig1x2(k1: unknown, kX: unknown, k2: unknown): { p1: number; pX: number; p2: number } | null {
  const a = kvota(k1), b = kvota(kX), c = kvota(k2);
  if (a == null || b == null || c == null) return null;
  const ia = 1 / a, ib = 1 / b, ic = 1 / c;
  const s = ia + ib + ic;
  return { p1: ia / s, pX: ib / s, p2: ic / s };
}

/* ═══════════════════════════════════════════════════════════════════
   UNIVERSAL MATCH CONTEXT
   ═══════════════════════════════════════════════════════════════════ */

export type UniversalMatchContext = {
  sport: SportSvih;
  fixtureId: number | null;
  domacin: string;
  gost: string;
  liga: string | null;
  // ── NOGOMET ──
  homeXG: number;          // xG domaćina (meč), 0 = nepoznato → fallback liga
  awayXG: number;
  homeForm: number;        // prosjek postignutih po meču (forma)
  awayForm: number;
  homeFormN: number;       // broj utakmica forme (uzorka)
  awayFormN: number;
  weatherDrag: number;     // 0 = bez učinka … 1 = maksimalni drag
  refCardsPerGame: number; // kartoni sudca po meču
  refPensPerGame: number;  // penali sudca po meču
  motivationIndex: number; // 0..1 (0.5 = neutralno)
  vjetarKmh: number;       // brzina vjetra (km/h)
  kisa: boolean;           // jaka kiša
  // ── KOŠARKA ──
  homePace: number;        // posjed/90 u indexu (1 = liga)
  awayPace: number;
  homeORtg: number;        // efikasnost napada (index, 100 = liga)
  awayORtg: number;
  homeDRtg: number;        // efikasnost obrane (index, 100 = liga)
  awayDRtg: number;
  b2bFatigue: number;      // 0 = nema back-to-back … 1 = maksimum
  // ── RUKOMET ──
  homeOffenseEff: number;  // efikasnost napada (index, 1 = liga)
  awayOffenseEff: number;
  homeGkSavePct: number;   // % obrana golmana (0..1, 0 = nepoznato)
  awayGkSavePct: number;
  sevenVsSixFactor: number; // 0 = ne igraju 7v6 … 1 = redovito
  // ── OPĆE ──
  brojKladionica: number;
};

export type KontekstUlaz = Partial<{
  sport: string;
  fixtureId: unknown;
  domacin: unknown;
  gost: unknown;
  liga: unknown;
  homeXG: unknown; awayXG: unknown;
  homeForm: unknown; awayForm: unknown;
  homeFormN: unknown; awayFormN: unknown;
  weatherDrag: unknown;
  refCardsPerGame: unknown; refPensPerGame: unknown;
  motivationIndex: unknown;
  vjetarKmh: unknown; kisa: unknown;
  homePace: unknown; awayPace: unknown;
  homeORtg: unknown; awayORtg: unknown; homeDRtg: unknown; awayDRtg: unknown;
  b2bFatigue: unknown;
  homeOffenseEff: unknown; awayOffenseEff: unknown;
  homeGkSavePct: unknown; awayGkSavePct: unknown;
  sevenVsSixFactor: unknown;
  brojKladionica: unknown;
  // tolerirani alternativni nazivi polja (API/ručni oblici):
  homeGoals: unknown; awayGoals: unknown;
  goalsHome: unknown; goalsAway: unknown;
  xgHome: unknown; xgAway: unknown;
  formHome: unknown; formAway: unknown;
  windKmh: unknown; rain: unknown;
  refereeCards: unknown; refereePens: unknown;
  paceHome: unknown; paceAway: unknown;
  ortgHome: unknown; ortgAway: unknown;
  drtgHome: unknown; drtgAway: unknown;
  b2b: unknown;
  sevenVsSix: unknown;
  kladionice: unknown;
}>;

function s(v: unknown, fb = ""): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  return fb;
}

/** Normalizira SIROVI objekt utakmice (bilo koji oblik polja) u čist
 *  UniversalMatchContext. Nikad ne baca — pokvaren/usporen podatak
 *  postaje sigurna vrijednost (0/liga/polu-neutralno). */
export function normalizirajKontekst(ulaz: KontekstUlaz | null | undefined): UniversalMatchContext {
  const u = ulaz ?? {};
  const sportRaw = s(u.sport).toLowerCase();
  const sport: SportSvih =
    sportRaw.startsWith("ko") || sportRaw.startsWith("kos") || sportRaw.includes("basket")
      ? "kosarka"
      : sportRaw.startsWith("ruk") || sportRaw.includes("handball") || sportRaw.includes("hand")
      ? "rukomet"
      : "nogomet";

  // xG: broj ili string; "homeXG" ili "xgHome"
  const xgH = brojIzUlaza(u.homeXG) ?? brojIzUlaza(u.xgHome) ?? 0;
  const xgA = brojIzUlaza(u.awayXG) ?? brojIzUlaza(u.xgAway) ?? 0;

  // forma: prosjek golova — ili prosječan zbroj home/awayGoals kad forma fali
  const fH = brojIzUlaza(u.homeForm) ?? brojIzUlaza(u.formHome) ?? (brojIzUlaza(u.homeGoals) ?? 0);
  const fA = brojIzUlaza(u.awayForm) ?? brojIzUlaza(u.formAway) ?? (brojIzUlaza(u.awayGoals) ?? 0);

  return {
    sport,
    fixtureId: (typeof u.fixtureId === "number" && Number.isFinite(u.fixtureId) && u.fixtureId > 0
      ? Math.round(u.fixtureId) : null),
    domacin: s(u.domacin, "Domaćin"),
    gost: s(u.gost, "Gost"),
    liga: s(u.liga) || null,
    homeXG: Math.max(0, Math.min(6, xgH)),
    awayXG: Math.max(0, Math.min(6, xgA)),
    homeForm: Math.max(0, Math.min(6, fH)),
    awayForm: Math.max(0, Math.min(6, fA)),
    homeFormN: Math.round(broj(u.homeFormN, 0, 0, 60)),
    awayFormN: Math.round(broj(u.awayFormN, 0, 0, 60)),
    weatherDrag: postotak(u.weatherDrag, 0),
    refCardsPerGame: broj(u.refCardsPerGame ?? u.refereeCards, 0, 0, 12),
    refPensPerGame: broj(u.refPensPerGame ?? u.refereePens, 0, 0, 3),
    motivationIndex: postotak(u.motivationIndex, 0.5),
    vjetarKmh: broj(u.vjetarKmh ?? u.windKmh, 0, 0, 200),
    kisa: u.kisa === true || u.rain === true,
    homePace: broj(u.homePace ?? u.paceHome, 1, 0.5, 1.5),
    awayPace: broj(u.awayPace ?? u.paceAway, 1, 0.5, 1.5),
    homeORtg: broj(u.homeORtg ?? u.ortgHome, 100, 60, 140),
    awayORtg: broj(u.awayORtg ?? u.ortgAway, 100, 60, 140),
    homeDRtg: broj(u.homeDRtg ?? u.drtgHome, 100, 60, 140),
    awayDRtg: broj(u.awayDRtg ?? u.drtgAway, 100, 60, 140),
    b2bFatigue: postotak(u.b2bFatigue ?? u.b2b, 0),
    homeOffenseEff: broj(u.homeOffenseEff, 1, 0.5, 1.6),
    awayOffenseEff: broj(u.awayOffenseEff, 1, 0.5, 1.6),
    homeGkSavePct: postotak(u.homeGkSavePct, 0),
    awayGkSavePct: postotak(u.awayGkSavePct, 0),
    sevenVsSixFactor: postotak(u.sevenVsSixFactor ?? u.sevenVsSix, 0),
    brojKladionica: Math.round(broj(u.brojKladionica ?? u.kladionice, 0, 0, 99)),
  };
}

/** Sigurnosni kontekst za nogomet iz forme (fallback kad kartica nema ništa). */
export function kontekstNogometDefault(liga?: string | null): Pick<UniversalMatchContext, "sport" | "liga"> {
  return { sport: "nogomet", liga: liga ?? null };
}
