// ═══ TITAN PROTOKOL v10 — završna kontrola točnosti (ručna aktivacija) ═══
// Nadogradnja iznad Snajpera v9, ANTI-GREŠKE i super točnosti: sve što je već
// aktivno Titan uzima kao ulaz i tek onda donosi konačnu odluku o tipu.
// Vrijedi za SVA tržišta (BTTS, OU 2.5, 1X2, HT/FT, HT X, HT golovi, opće).
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

export type TitanId =
  | "unifiedConsensus"
  | "crossMarketCoherence"
  | "bayesEvidence"
  | "varianceGuard"
  | "clv"
  | "scenarioTree"
  | "redTeam"
  | "finalVerdict";

export interface TitanModule {
  id: TitanId;
  title: string;
  claim: string;
  desc: string;
  markets: Market[];
}

const ALL: Market[] = ["btts", "ou25", "1x2", "htft", "htx", "htgoals", "opce"];

export const TITAN_MODULES: TitanModule[] = [
  {
    id: "unifiedConsensus",
    title: "v10 · JEDINSTVENI KONSENZUS (svi mozgovi + svi motori)",
    claim: "Jedna brojka nastala iz svih mozgova, motora i filtara koje si uključio.",
    desc: "Uzima procjene OMNI motora, ansambla, super točnosti i Snajpera v9, odbacuje ekstreme (trimmed mean), pa težinski spaja preostale prema pouzdanosti izvora. Konačna vjerojatnost je jedna i mora biti eksplicitno napisana.",
    markets: ALL,
  },
  {
    id: "crossMarketCoherence",
    title: "v10 · KOHERENCIJA TRŽIŠTA (1X2 ↔ BTTS ↔ OU ↔ HT/FT)",
    claim: "Tipovi se moraju međusobno slagati, inače padaju.",
    desc: "Sve linije se izvode iz iste matrice rezultata: 1X2, GG/NG, Over 1.5/2.5/3.5, HT/FT i HT golovi. Ako npr. 'Under 2.5' i 'domaći −1.5' istovremeno imaju visoku vjerojatnost, to je logička kontradikcija — sigurnost se reže dok se matrica ne uskladi.",
    markets: ALL,
  },
  {
    id: "bayesEvidence",
    title: "v10 · BAYESOV LANAC DOKAZA (prior → posterior)",
    claim: "Svaki dokaz mijenja vjerojatnost mjerljivo, ne 'na osjećaj'.",
    desc: "Kreće se od priora lige, pa se svaki dokaz (xG, forma, ozljede, motiv, kvota, vrijeme) unosi kao omjer izgleda (likelihood ratio) i ispisuje koliko je pomaknuo posterior u postotnim bodovima. Zabranjeno je 'osjećam da...' bez brojke.",
    markets: ALL,
  },
  {
    id: "varianceGuard",
    title: "v10 · ČUVAR VARIJANCE (interval pouzdanosti)",
    claim: "Tip prolazi samo ako i donja granica intervala prelazi prag.",
    desc: "Uz točkastu procjenu računa se i 90% interval (bootstrap/Monte Carlo). Ako donja granica padne ispod praga, tip se odbija ili se spušta linija — ovo uklanja 'sretne' tipove koji su prošli samo zbog sredine raspona.",
    markets: ALL,
  },
  {
    id: "clv",
    title: "v10 · CLV / KRETANJE KVOTE (pametni novac)",
    claim: "Smjer kretanja kvote je dokaz, ne šum.",
    desc: "Uspoređuje otvarajuću i trenutnu kvotu. Ako se kvota kreće protiv tvojeg tipa, sigurnost se smanjuje; ako se kreće u tvoju korist (pozitivan CLV), potvrđuje tip. Bez podatka o kretanju to se mora eksplicitno napisati.",
    markets: ALL,
  },
  {
    id: "scenarioTree",
    title: "v10 · STABLO SCENARIJA (rani gol, crveni karton, penal)",
    claim: "Predikcija se testira kroz scenarije tijeka utakmice.",
    desc: "Grana se na scenarije: rani gol domaćina, rani gol gosta, 0-0 do 60. minute, crveni karton, penal. Svakom se pridruži vjerojatnost i utjecaj na tip. Tip prolazi samo ako preživi većinu scenarija težinski.",
    markets: ALL,
  },
  {
    id: "redTeam",
    title: "v10 · CRVENI TIM (napad na vlastiti tip)",
    claim: "Bot mora najprije pokušati oboriti sam sebe.",
    desc: "Prije objave gradi se najjači mogući argument protiv tipa i traže tri konkretna razloga zašto bi pao. Ako ijedan razlog ostane neodgovoren podatkom, sigurnost se reže za zadani postotak.",
    markets: ALL,
  },
  {
    id: "finalVerdict",
    title: "v10 · KONAČNA PRESUDA (ocjena A/B/C/PRESKAČEM)",
    claim: "Svaki odgovor završava jasnom ocjenom i ulogom.",
    desc: "Na kraju ide blok: konačna vjerojatnost, interval, ocjena (A = objavi, B = smanji ulog, C = samo informativno, PRESKAČEM = nema tipa), preporučeni ulog po Kellyju i jedna rečenica glavnog rizika.",
    markets: ALL,
  },
];

export interface TitanPrefs {
  on: Record<TitanId, boolean>;
  scope: Record<TitanId, Partial<Record<Market, boolean>>>;
  /** Konsenzus */
  trimPct: number;
  minSources: number;
  /** Koherencija */
  coherenceTolPb: number;
  /** Varijanca */
  ciLevel: number;
  ciFloor: number;
  /** CLV */
  clvPenaltyPb: number;
  /** Crveni tim */
  redTeamCutPb: number;
  /** Presuda */
  gradeA: number;
  gradeB: number;
  kellyFraction: number;
}

function allOff(): Record<TitanId, boolean> {
  return {
    unifiedConsensus: false,
    crossMarketCoherence: false,
    bayesEvidence: false,
    varianceGuard: false,
    clv: false,
    scenarioTree: false,
    redTeam: false,
    finalVerdict: false,
  };
}

function defaultScope(): Record<TitanId, Partial<Record<Market, boolean>>> {
  const out = {} as Record<TitanId, Partial<Record<Market, boolean>>>;
  for (const m of TITAN_MODULES) {
    const s: Partial<Record<Market, boolean>> = {};
    for (const mk of m.markets) s[mk] = true;
    out[m.id] = s;
  }
  return out;
}

export const DEFAULT_TITAN: TitanPrefs = {
  on: allOff(),
  scope: defaultScope(),
  trimPct: 20,
  minSources: 3,
  coherenceTolPb: 5,
  ciLevel: 90,
  ciFloor: 0.55,
  clvPenaltyPb: 6,
  redTeamCutPb: 10,
  gradeA: 0.72,
  gradeB: 0.62,
  kellyFraction: 0.25,
};

const KEY = "andromeda.titan.v10";

export function loadTitan(): TitanPrefs {
  const raw = loadJSON<Partial<TitanPrefs>>(KEY, {});
  const scope = defaultScope();
  if (raw.scope) {
    for (const m of TITAN_MODULES) scope[m.id] = { ...scope[m.id], ...(raw.scope[m.id] ?? {}) };
  }
  return { ...DEFAULT_TITAN, ...raw, on: { ...allOff(), ...(raw.on ?? {}) }, scope };
}

export function saveTitan(p: TitanPrefs): void {
  saveJSON(KEY, p);
}

export function titanActiveCount(p: TitanPrefs): number {
  return TITAN_MODULES.filter((m) => p.on[m.id]).length;
}

export function titanFor(p: TitanPrefs, market: Market): TitanModule[] {
  return TITAN_MODULES.filter((m) => p.on[m.id] && p.scope[m.id]?.[market]);
}

const RULE: Record<TitanId, (p: TitanPrefs) => string> = {
  unifiedConsensus: (p) =>
    `JEDINSTVENI KONSENZUS: skupi sve dostupne procjene (mozgovi, OMNI motor, ansambl, super točnost, snajper filtri), odbaci ${p.trimPct}% najekstremnijih s obje strane i težinski ih spoji u JEDNU konačnu vjerojatnost. Ako imaš manje od ${p.minSources} neovisna izvora, jasno to napiši i ograniči sigurnost.`,
  crossMarketCoherence: (p) =>
    `KOHERENCIJA TRŽIŠTA: sva tržišta (1X2, GG/NG, Over 1.5/2.5/3.5, HT/FT, HT golovi) izvedi iz iste matrice rezultata i provjeri da se ne proturječe. Odstupanje veće od ${p.coherenceTolPb} postotnih bodova između izvedenih linija je greška — uskladi matricu i smanji sigurnost.`,
  bayesEvidence: () =>
    `BAYESOV LANAC DOKAZA: kreni od priora lige, pa svaki dokaz (xG, forma, ozljede, motivacija, kvota, vrijeme, teren) unesi kao omjer izgleda i ispiši koliko je pomaknuo posterior u postotnim bodovima. Bez brojke nema dokaza.`,
  varianceGuard: (p) =>
    `ČUVAR VARIJANCE: uz točkastu procjenu daj ${p.ciLevel}% interval pouzdanosti (Monte Carlo/bootstrap). Tip objavi samo ako je DONJA granica ≥ ${(p.ciFloor * 100).toFixed(0)}%; inače spusti liniju ili preskoči.`,
  clv: (p) =>
    `CLV / KRETANJE KVOTE: usporedi otvarajuću i trenutnu kvotu. Kretanje protiv tvojeg tipa smanjuje sigurnost za ${p.clvPenaltyPb} postotnih bodova; kretanje u korist tipa je potvrda. Ako nemaš podatak o kretanju, izričito to napiši.`,
  scenarioTree: () =>
    `STABLO SCENARIJA: razgranaj na scenarije (rani gol domaćina, rani gol gosta, 0-0 do 60. min, crveni karton, penal), svakom dodijeli vjerojatnost i utjecaj na tip. Tip prolazi samo ako preživi težinsku većinu scenarija.`,
  redTeam: (p) =>
    `CRVENI TIM: prije objave izgradi najjači argument PROTIV vlastitog tipa i navedi tri konkretna razloga pada. Za svaki razlog na koji nemaš podatkovni odgovor smanji sigurnost za ${p.redTeamCutPb} postotnih bodova.`,
  finalVerdict: (p) =>
    `KONAČNA PRESUDA: odgovor završi blokom "TITAN PRESUDA" — konačna vjerojatnost, interval, ocjena (A ≥ ${(p.gradeA * 100).toFixed(0)}% = objavi, B ≥ ${(p.gradeB * 100).toFixed(0)}% = smanji ulog, ispod toga C = samo informativno ili PRESKAČEM), ulog po frakcijskom Kellyju ${p.kellyFraction} i jedna rečenica glavnog rizika.`,
};

/** Blok za sistemski prompt — samo aktivni moduli za traženo tržište. */
export function titanDirectives(p: TitanPrefs, market: Market): string {
  const active = titanFor(p, market);
  if (!active.length) return "";
  return `\n\n═══ TITAN PROTOKOL v10 (RUČNO AKTIVIRAN — ${active.length} modula za ${market}) ═══
Titan je ZADNJA instanca: ulaz su mu rezultati svih ostalih uključenih modula (super točnost, OMNI, ansambl, Snajper v9, ANTI-GREŠKA), a on donosi konačnu odluku. Nikad ne proturječi strožem modulu — uvijek vrijedi stroža granica.
${active.map((m, i) => `${i + 1}) ${RULE[m.id](p)}`).join("\n")}
Na kraju odgovora u jednoj liniji napiši koje si Titan module primijenio.`;
}
