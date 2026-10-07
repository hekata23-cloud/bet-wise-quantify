// ═══ SNAJPER MOTOR v9 — filtri za BTTS i Over/Under (ručna aktivacija) ═══
// Sve je po defaultu isključeno. Svaki filtar ima vlastite prekidače po tržištu
// i zajedničke pragove/korektore. Aktivni filtri idu u Lunin sistemski prompt.
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

export type SniperId =
  | "threshold"
  | "marketGuard"
  | "ladder"
  | "dataGate"
  | "streakBreaker"
  | "contextLambda"
  | "stakeDiscipline"
  | "correlationGuard"
  | "timeWindows"
  | "opponentQuality";

export interface SniperFilter {
  id: SniperId;
  title: string;
  claim: string;
  desc: string;
  markets: Market[];
}

export const SNIPER_FILTERS: SniperFilter[] = [
  {
    id: "threshold",
    title: "v9 · SNAJPER PRAG (bez tipa ako nije siguran)",
    claim: "Tip se daje samo iznad praga vjerojatnosti i praga vrijednosti.",
    desc: "Ako kalibrirana vjerojatnost padne ispod praga ili edge (p × kvota − 1) ispod minimuma, Luna NE daje tip nego jasno kaže 'PRESKAČEM' i objasni što nedostaje. Ovo je jedini pouzdan način da BTTS i Over 2.5 prestanu padati na 50/50 utakmicama.",
    markets: ["btts", "ou25", "htgoals"],
  },
  {
    id: "marketGuard",
    title: "v9 · ČUVAR TRŽIŠTA (sharp de-vig kontrola)",
    claim: "Model se uspoređuje s poštenom kvotom; veliko odstupanje = alarm.",
    desc: "Kvota se očisti od marže (Shin/power/proporcionalno), pa se model spoji s tržištem u logit prostoru. Ako model odstupa više od dopuštenog broja postotnih bodova, sigurnost se reže — tržište je u prosjeku pametnije od jedne procjene.",
    markets: ["btts", "ou25", "1x2", "htgoals"],
  },
  {
    id: "ladder",
    title: "v9 · LJESTVICA LINIJA (Over 1.5 / 2.5 / 3.5, GG/NG)",
    claim: "Bira liniju koja stvarno prolazi, ne onu koju si pitao.",
    desc: "Izračuna se cijela ljestvica iz matrice rezultata. Ako Over 2.5 ima 54%, a Over 1.5 78%, Luna preporuči Over 1.5 kao glavni tip i navede zašto je 2.5 preriskantan. Isto za GG → 'GG ili Over 2.5' i NG → Under 3.5.",
    markets: ["ou25", "btts", "htgoals"],
  },
  {
    id: "dataGate",
    title: "v9 · KAPIJA PODATAKA (bez izmišljanja)",
    claim: "Bez minimalnog seta stvarnih podataka nema tipa s visokom sigurnošću.",
    desc: "Traži xG/prosjek golova oba tima, formu zadnjih 5 i barem jednu kvotu. Ako fali, sigurnost se automatski ograničava (cap) i Luna mora napisati koji podatak nedostaje umjesto da ga izmisli.",
    markets: ["btts", "ou25", "1x2", "htft", "htx", "htgoals", "opce"],
  },
  {
    id: "streakBreaker",
    title: "v9 · LOMILAC SERIJA (regresija prema sredini)",
    claim: "Kažnjava tipove naslonjene na kratke serije (npr. '5 puta zaredom GG').",
    desc: "Serija od 4-6 utakmica je statistički šum. Procjena iz serije se povlači prema prosjeku lige, a sigurnost se smanjuje za zadani postotak. Ovo najviše spašava BTTS tipove.",
    markets: ["btts", "ou25", "1x2", "htgoals"],
  },
  {
    id: "contextLambda",
    title: "v9 · KONTEKSTNI λ KOREKTORI (sudac, teren, ulog)",
    claim: "Vrijeme, teren, sudac, umor i motivacija mijenjaju očekivane golove.",
    desc: "λ_total se množi zadanim korektorima: kiša/vjetar i loš teren spuštaju golove, sudac sklon penalima ih diže, utakmica bez uloga diže, borba za opstanak i derbi spuštaju. Ručno postavljaš jačinu tih korektora.",
    markets: ["btts", "ou25", "htgoals", "1x2"],
  },
  {
    id: "stakeDiscipline",
    title: "v9 · DISCIPLINA ULOGA (Kelly + stop-loss)",
    claim: "Ograničava broj tipova i veličinu uloga po danu.",
    desc: "Luna smije predložiti najviše zadani broj tipova dnevno, uvijek s frakcijskim Kellyjem i jasnim stop-loss pravilom. Manje tipova = veća prosječna točnost.",
    markets: ["btts", "ou25", "1x2", "htft", "htx", "htgoals", "opce"],
  },
  {
    id: "correlationGuard",
    title: "v9+ · ČUVAR KORELACIJE (kombo i listić)",
    claim: "Kombinirani tipovi se ne množe naslijepo — korelacija se računa.",
    desc: "GG i Over 2.5 nisu neovisni događaji. Zajednička vjerojatnost računa se iz iste matrice rezultata (ili kopule), nikad množenjem dviju vjerojatnosti. Ako korelacija ruši kombo ispod praga, Luna nudi jedan čisti tip umjesto komba.",
    markets: ["btts", "ou25", "1x2", "htft", "htgoals"],
  },
  {
    id: "timeWindows",
    title: "v9+ · VREMENSKI PROZORI (0-15, 16-30 … 76-90+)",
    claim: "Golovi se ne događaju ravnomjerno — raspodjela po prozorima mijenja tip.",
    desc: "λ se dijeli po šest 15-minutnih prozora s pojačanjem prema kraju utakmice. Iz toga izlaze HT tipovi, 'gol u oba poluvremena' i kasni Over. Ako tip ovisi samo o kasnom golu, sigurnost se reže.",
    markets: ["ou25", "btts", "htgoals", "htft", "htx"],
  },
  {
    id: "opponentQuality",
    title: "v9+ · KVALITETA PROTIVNIKA (prilagodba rasporeda)",
    claim: "Statistika bez konteksta protivnika je zavaravajuća.",
    desc: "Forma i xG se prilagođavaju jačini protivnika iz prethodnih kola (strength of schedule). Serija golova protiv zadnjeplasiranih vrijedi manje; slaba forma protiv top-4 ne znači pad. Sigurnost se korigira prema prilagođenim brojkama.",
    markets: ["btts", "ou25", "1x2", "htft", "htgoals"],
  },
];

export interface SniperPrefs {
  /** Uključeni filtri. */
  on: Record<SniperId, boolean>;
  /** Po filtru: na koja tržišta se primjenjuje. */
  scope: Record<SniperId, Partial<Record<Market, boolean>>>;
  minProb: number;
  minEdge: number;
  guardMaxDevPb: number;
  guardMarketWeight: number;
  ladderThreshold: number;
  dataGateCap: number;
  streakPull: number;
  ctxWeather: number;
  ctxReferee: number;
  ctxStakes: number;
  maxTipsPerDay: number;
  kellyFraction: number;
  /** v9+: minimalna zajednička vjerojatnost da kombo prođe. */
  comboFloor: number;
  /** v9+: pojačanje intenziteta golova u zadnjem prozoru. */
  lateWindowBoost: number;
  /** v9+: jačina prilagodbe na kvalitetu protivnika (0–1). */
  sosStrength: number;
}

function allOff(): Record<SniperId, boolean> {
  return {
    threshold: false,
    marketGuard: false,
    ladder: false,
    dataGate: false,
    streakBreaker: false,
    contextLambda: false,
    stakeDiscipline: false,
    correlationGuard: false,
    timeWindows: false,
    opponentQuality: false,
  };
}

function defaultScope(): Record<SniperId, Partial<Record<Market, boolean>>> {
  const out = {} as Record<SniperId, Partial<Record<Market, boolean>>>;
  for (const f of SNIPER_FILTERS) {
    const s: Partial<Record<Market, boolean>> = {};
    for (const m of f.markets) s[m] = true;
    out[f.id] = s;
  }
  return out;
}

export const DEFAULT_SNIPER: SniperPrefs = {
  on: allOff(),
  scope: defaultScope(),
  minProb: 0.62,
  minEdge: 5,
  guardMaxDevPb: 8,
  guardMarketWeight: 0.45,
  ladderThreshold: 0.68,
  dataGateCap: 60,
  streakPull: 0.2,
  ctxWeather: 0.94,
  ctxReferee: 1.04,
  ctxStakes: 0.96,
  maxTipsPerDay: 8,
  kellyFraction: 0.25,
  comboFloor: 0.55,
  lateWindowBoost: 1.15,
  sosStrength: 0.35,
};

const KEY = "andromeda.sniper.v9";

export function loadSniper(): SniperPrefs {
  const raw = loadJSON<Partial<SniperPrefs>>(KEY, {});
  const scope = defaultScope();
  if (raw.scope) {
    for (const f of SNIPER_FILTERS) scope[f.id] = { ...scope[f.id], ...(raw.scope[f.id] ?? {}) };
  }
  return { ...DEFAULT_SNIPER, ...raw, on: { ...allOff(), ...(raw.on ?? {}) }, scope };
}

export function saveSniper(p: SniperPrefs): void {
  saveJSON(KEY, p);
}

export function sniperActiveCount(p: SniperPrefs): number {
  return SNIPER_FILTERS.filter((f) => p.on[f.id]).length;
}

/** Filtri koji vrijede za konkretno tržište. */
export function sniperFor(p: SniperPrefs, market: Market): SniperFilter[] {
  return SNIPER_FILTERS.filter((f) => p.on[f.id] && p.scope[f.id]?.[market]);
}

const RULE: Record<SniperId, (p: SniperPrefs) => string> = {
  threshold: (p) =>
    `SNAJPER PRAG: tip objavi samo ako je kalibrirana vjerojatnost ≥ ${(p.minProb * 100).toFixed(0)}% I edge (p × kvota − 1) ≥ ${p.minEdge}%. Ako ijedan uvjet padne, napiši velikim slovima "PRESKAČEM" i objasni što točno nedostaje. Nikad ne forsiraj tip na 50/50 utakmici.`,
  marketGuard: (p) =>
    `ČUVAR TRŽIŠTA: kvotu očisti od marže (Shin/power/proporcionalno), spoji model s tržištem u logit prostoru s težinom tržišta ${p.guardMarketWeight}. Ako model odstupa više od ${p.guardMaxDevPb} postotnih bodova od poštene kvote, podigni alarm i reži sigurnost.`,
  ladder: (p) =>
    `LJESTVICA LINIJA: izračunaj Over 1.5 / 2.5 / 3.5, Under linije i GG/NG iz iste matrice. Kao glavni tip preporuči najvišu liniju koja prelazi ${(p.ladderThreshold * 100).toFixed(0)}%, čak i ako korisnik pita drugu, i objasni zašto je tražena linija preriskantna.`,
  dataGate: (p) =>
    `KAPIJA PODATAKA: bez xG/prosjeka golova oba tima, forme zadnjih 5 i barem jedne kvote NE smiješ prijeći ${p.dataGateCap}% sigurnosti. Nabroji koji podatak nedostaje umjesto da ga izmisliš.`,
  streakBreaker: (p) =>
    `LOMILAC SERIJA: serije od 4-6 utakmica tretiraj kao šum. Procjenu iz serije povuci prema prosjeku lige jačinom ${p.streakPull} i smanji sigurnost. Nikad tip ne obrazlaži samo serijom.`,
  contextLambda: (p) =>
    `KONTEKSTNI λ KOREKTORI: λ_total pomnoži s vrijeme/teren ×${p.ctxWeather}, sudac ×${p.ctxReferee}, ulog utakmice ×${p.ctxStakes} (primijeni samo one koji su relevantni i reci koje si primijenio i koliko su pomaknuli golove).`,
  correlationGuard: (p) =>
    `ČUVAR KORELACIJE: kombo tipove (GG+Over, 1+Over, X+GG…) NIKAD ne računaj množenjem pojedinačnih vjerojatnosti — izvedi zajedničku vjerojatnost iz iste matrice rezultata ili kopule. Kombo objavi samo ako je zajednička vjerojatnost ≥ ${(p.comboFloor * 100).toFixed(0)}%; inače daj jedan čisti tip.`,
  timeWindows: (p) =>
    `VREMENSKI PROZORI: λ raspodijeli na 15-minutne prozore uz pojačanje zadnjeg prozora ×${p.lateWindowBoost}. Iz toga izvedi HT golove, 'gol u oba poluvremena' i kasni Over. Ako tip stoji samo na kasnom golu, smanji sigurnost i reci to.`,
  opponentQuality: (p) =>
    `KVALITETA PROTIVNIKA: formu i xG prilagodi jačini dosadašnjih protivnika jačinom ${p.sosStrength} (rezultati protiv dna vrijede manje, protiv vrha više). Navedi prilagođene brojke, ne sirove.`,
  stakeDiscipline: (p) =>
    `DISCIPLINA ULOGA: najviše ${p.maxTipsPerDay} tipova dnevno, ulog isključivo frakcijski Kelly ${p.kellyFraction} i obavezno navedi stop-loss pravilo (npr. dva uzastopna gubitka = pauza do sutra).`,
};

/** Blok za sistemski prompt — samo aktivni filtri za traženo tržište. */
export function sniperDirectives(p: SniperPrefs, market: Market): string {
  const active = sniperFor(p, market);
  if (!active.length) return "";
  return `\n\n═══ SNAJPER MOTOR v9 (RUČNO AKTIVIRAN — ${active.length} filtara za ${market}) ═══
Ovi filtri su obavezni i imaju prednost pred željom da se pošto-poto da tip.
${active.map((f, i) => `${i + 1}) ${RULE[f.id](p)}`).join("\n")}
Na kraju odgovora u jednoj liniji napiši koje si snajper filtre primijenio.`;
}
