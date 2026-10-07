// ═══ KVANTNA TOČNOST v12 (QUANTUM) ═══
// Nove napredne postavke koje se AUTOMATSKI povezuju i uvijek su aktivne
// chat botu prilikom donošenja odgovora. Rade uz postojeće module
// (Mastermind, OMNI, Anti-greška, Sniper, Titan, Super točnost) i ne
// zamjenjuju ih — dodaju sloj kalibracije i provjere prije objave tipa.
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

export type QuantumId =
  | "calibration"
  | "marketBlend"
  | "devigCLV"
  | "bayesHierarchy"
  | "gameState"
  | "lineupImpact"
  | "refereeProfile"
  | "weatherPitch"
  | "fatigueTravel"
  | "sampleShrink"
  | "anomalyRegression"
  | "correlationParlay"
  | "uncertaintyBand"
  | "abstainRule"
  | "contradictionAudit"
  | "postMortem";

export interface QuantumModule {
  id: QuantumId;
  label: string;
  desc: string;
  directive: string;
}

export const QUANTUM_MODULES: QuantumModule[] = [
  {
    id: "calibration",
    label: "Kalibracija sigurnosti (Brier/log-loss)",
    desc: "Sigurnost se steže prema realnosti — nema 95% bez pokrića.",
    directive:
      "KALIBRACIJA — izlaznu vjerojatnost stegni prema realnom povijesnom pogotku (Brier/log-loss logika): p_final = 0.75 × p_model + 0.25 × p_baza_lige. Sigurnost iznad 85% smiješ napisati samo ako se sve metode poklapaju unutar 4 postotna boda.",
  },
  {
    id: "marketBlend",
    label: "Miks s tržištem (model + kvote)",
    desc: "Model se spaja s de-vigiranom kvotom umjesto slijepog vjerovanja modelu.",
    directive:
      "MIKS S TRŽIŠTEM — kad postoje kvote, finalni p = 0.6 × p_model + 0.4 × p_devig_tržište. Ako je razlika modela i tržišta > 12 pb, izričito napiši da je to crvena zastava i smanji sigurnost.",
  },
  {
    id: "devigCLV",
    label: "De-vig, edge i CLV",
    desc: "Uklanjanje marže, izračun edge-a i procjena zatvaranja linije.",
    directive:
      "DE-VIG I EDGE — uvijek ukloni maržu (proporcionalno ili Shin), izračunaj edge = p × kvota − 1 i procijeni hoće li linija pasti ili rasti do početka (CLV). Tip preporuči samo ako je edge ≥ 3%.",
  },
  {
    id: "bayesHierarchy",
    label: "Hijerarhijski Bayes (liga → tim → forma)",
    desc: "Prior lige + tim + zadnjih 5 utakmica, s težinama.",
    directive:
      "HIJERARHIJSKI BAYES — λ izvedi u tri sloja: prior lige (prosjek golova), sezonski xG tima, pa zadnjih 5 utakmica (težina 0.5/0.3/0.2). Nikad ne gradi predikciju samo iz zadnje 2-3 utakmice.",
  },
  {
    id: "gameState",
    label: "Game-state hazard model",
    desc: "Golovi po minutama i ovisnost o rezultatu na terenu.",
    directive:
      "GAME-STATE — modeliraj hazard gola po 15-minutnim intervalima i ovisnost o stanju rezultata (vodstvo → niži tempo, zaostatak → viši). Za Over/BTTS posebno razdvoji 1. i 2. poluvrijeme.",
  },
  {
    id: "lineupImpact",
    label: "Utjecaj sastava i izostanaka",
    desc: "Ozljede i suspenzije prevedene u xG oduzeto/dodano.",
    directive:
      "SASTAV — ključne izostanke prevedi u konkretan xG pomak (prvi napadač ≈ −0.25 xG, playmaker ≈ −0.18, stožer obrane ≈ +0.20 xGA) i to napiši u brojkama. Ako sastav nije poznat, reci to i smanji sigurnost.",
  },
  {
    id: "refereeProfile",
    label: "Profil sudca",
    desc: "Kartoni, penali i dodano vrijeme.",
    directive:
      "SUDAC — uzmi profil sudca (kartoni/utakmica, penali, dodano vrijeme) i primijeni ga na kartone, penale i Over linije.",
  },
  {
    id: "weatherPitch",
    label: "Vrijeme, teren i visina",
    desc: "Vjetar, kiša, mraz, umjetna trava, altituda.",
    directive:
      "VRIJEME I TEREN — jak vjetar/kiša/mraz snižavaju očekivane golove (do −0.3 λ), visoka altituda i umjetna trava ih dižu. Navedi korekciju samo ako je poznata.",
  },
  {
    id: "fatigueTravel",
    label: "Umor, putovanja i raspored",
    desc: "Dani odmora, minute u nogama, europska sredina tjedna.",
    directive:
      "UMOR — manje od 3 dana odmora ili put preko 2 vremenske zone: snizi ofenzivnu učinkovitost 5-8% i naglasi rizik rotacije.",
  },
  {
    id: "sampleShrink",
    label: "Kazna za mali uzorak",
    desc: "Malo utakmica = obavezno stezanje prema prosjeku lige.",
    directive:
      "MALI UZORAK — ako imaš manje od 8 utakmica podatka, stegni procjenu prema prosjeku lige i eksplicitno napiši da je uzorak mali.",
  },
  {
    id: "anomalyRegression",
    label: "Regresija anomalija",
    desc: "Outlier rezultati i PDO/konverzija se vraćaju prema sredini.",
    directive:
      "ANOMALIJE — rezultate tipa 5:0 i ekstremnu konverziju (PDO) regresiraj prema sredini; serije protiv top-3 protivnika ne računaj kao pad forme.",
  },
  {
    id: "correlationParlay",
    label: "Korelacija u kombinacijama",
    desc: "Kombo tipovi se ne množe naivno.",
    directive:
      "KORELACIJA — kod kombo/parlay tipova nikad ne množi vjerojatnosti naivno; koristi zajedničku distribuciju (npr. 1 + Over 2.5 pozitivno korelira) i napiši koliko korelacija mijenja p.",
  },
  {
    id: "uncertaintyBand",
    label: "Interval nesigurnosti",
    desc: "Uz svaki postotak ide raspon (± pb).",
    directive:
      "INTERVAL — uz svaku vjerojatnost napiši raspon (npr. 58% ± 6 pb). Široki raspon = manji ulog.",
  },
  {
    id: "abstainRule",
    label: "Pravilo odustajanja",
    desc: "Bez pokrića → sigurnija linija ili PRESKAČEM.",
    directive:
      "ODUSTAJANJE — ako kalibrirana sigurnost padne ispod praga ili se metode razilaze > 10 pb, ponudi sigurniju liniju (Over 1.5, Under 3.5, dvostruka šansa) ili jasno napiši PRESKAČEM. Nikad ne forsiraj tip.",
  },
  {
    id: "contradictionAudit",
    label: "Revizija protuslovlja",
    desc: "Zadnja provjera da se tipovi i brojke ne sudaraju.",
    directive:
      "REVIZIJA — prije objave provjeri da se p-ovi zbrajaju logično (1X2 = 100%, Over 1.5 ≥ Over 2.5 ≥ Over 3.5, BTTS ≤ Over 1.5) i da nema kontradikcije s tekstom. Ako je ima, ispravi prije odgovora.",
  },
  {
    id: "postMortem",
    label: "Zapis za učenje (post-mortem)",
    desc: "Na kraju kratka linija ključnih pretpostavki za kasniju provjeru.",
    directive:
      "POST-MORTEM — na kraju odgovora u jednoj liniji navedi ključne pretpostavke i glavni rizik, u formatu 'Pretpostavke: … | Rizik: …', da se predikcija kasnije može provjeriti.",
  },
];

export interface QuantumPrefs {
  /** Glavni prekidač — uključen po defaultu. */
  enabled: boolean;
  /** Automatski se veže na svaki odgovor chat bota, za sva tržišta. */
  autoAttach: boolean;
  /** Automatski pokreće motore (OMNI + ansambl konsenzus) kad su dostupni. */
  autoEngines: boolean;
  /** Minimalna kalibrirana sigurnost za objavu tipa (%). */
  minConfidence: number;
  /** Najveće dopušteno razilaženje metoda (postotni bodovi). */
  maxDivergencePb: number;
  /** Težina tržišta u miksu (0-100). */
  marketWeight: number;
  on: Record<QuantumId, boolean>;
}

const ALL_ON = QUANTUM_MODULES.reduce(
  (acc, m) => {
    acc[m.id] = true;
    return acc;
  },
  {} as Record<QuantumId, boolean>,
);

export const DEFAULT_QUANTUM: QuantumPrefs = {
  enabled: true,
  autoAttach: true,
  autoEngines: true,
  minConfidence: 62,
  maxDivergencePb: 10,
  marketWeight: 40,
  on: ALL_ON,
};

const KEY = "andromeda.quantum.prefs";

export function loadQuantum(): QuantumPrefs {
  const raw = loadJSON<Partial<QuantumPrefs>>(KEY, {});
  return {
    ...DEFAULT_QUANTUM,
    ...raw,
    on: { ...ALL_ON, ...(raw.on ?? {}) },
  };
}

export function saveQuantum(p: QuantumPrefs): void {
  saveJSON(KEY, p);
}

export function quantumActiveCount(p: QuantumPrefs): number {
  return QUANTUM_MODULES.filter((m) => p.on[m.id]).length;
}

/** Je li kvantni sloj aktivan za traženo tržište? */
export function quantumActive(p: QuantumPrefs, _market: Market): boolean {
  return p.enabled && quantumActiveCount(p) > 0;
}

/** Blok direktiva koji se automatski dodaje u sistemski prompt. */
export function quantumDirectives(p: QuantumPrefs, market: Market): string {
  if (!quantumActive(p, market)) return "";
  const active = QUANTUM_MODULES.filter((m) => p.on[m.id]);
  const lines = active.map((m, i) => `${i + 1}) ${m.directive}`).join("\n");
  const mw = Math.max(0, Math.min(100, p.marketWeight)) / 100;
  return `\n\n═══ KVANTNA TOČNOST v12 (AUTOMATSKI AKTIVNA — ${active.length}/${QUANTUM_MODULES.length} modula) ═══
Ovaj sloj je uvijek uključen prilikom donošenja odgovora i primjenjuje se na SVA tržišta. Ne prikazuj ga korisniku kao popis — koristi ga interno, a u odgovoru pokaži samo rezultat: tip, kalibriranu sigurnost s intervalom, tri ključne brojke i glavni rizik.
Pragovi: minimalna kalibrirana sigurnost ${p.minConfidence}%, najveće dopušteno razilaženje metoda ${p.maxDivergencePb} pb, težina tržišta u miksu ${(mw * 100).toFixed(0)}%.
${lines}
ZAVRŠNO PRAVILO: tip bez izvedene brojke ne postoji. Ako brojku nisi izračunao, označi je kao pretpostavku ili preskoči tip.`;
}
