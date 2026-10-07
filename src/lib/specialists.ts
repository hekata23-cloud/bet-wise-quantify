// Specijalisti za nogometne predikcije — besplatni modeli s jakim matematičkim
// i logičkim rezoniranjem. Svaki specijalist pokriva određena tržišta (markete),
// može se uključiti/isključiti u Postavkama, a mozak chata sam bira najboljeg
// specijalista za tip koji korisnik traži.
import { loadJSON, saveJSON } from "./storage";

export type Market = "1x2" | "btts" | "ou25" | "htft" | "htx" | "htgoals" | "opce";

export const MARKET_LABEL: Record<Market, string> = {
  "1x2": "1X2 (konačni ishod)",
  btts: "BTTS (GG/NG)",
  ou25: "Over/Under 2.5 gola",
  htft: "HT/FT (poluvrijeme/kraj)",
  htx: "X na poluvremenu",
  htgoals: "Broj golova na poluvremenu",
  opce: "Opća analiza",
};

export interface Specialist {
  id: string; // OpenRouter model id
  name: string;
  desc: string;
  markets: Market[];
  defaultOn: boolean;
  /** odjeljci: "gol" (BTTS/OU), "elite" (napredni gol ansambl), "htft" (poluvrijeme/kraj) */
  group?: "gol" | "elite" | "htft" | "auto";
}

export const SPECIALISTS: Specialist[] = [
  {
    id: "nvidia/nemotron-3-ultra-550b:free",
    name: "Nemotron 3 Ultra 550B — Predikcije PRO",
    desc: "1M konteksta · duboke statističke analize, najjači za 1X2 i HT/FT",
    markets: ["1x2", "htft", "htx", "opce"],
    defaultOn: true,
  },
  {
    id: "deepseek/deepseek-r1-0528:free",
    name: "DeepSeek R1 — Poisson/EV reasoning",
    desc: "korak-po-korak izračun vjerojatnosti, matrica 0..6, de-vig",
    markets: ["btts", "ou25", "htgoals", "1x2"],
    defaultOn: true,
  },
  {
    id: "deepseek/deepseek-chat-v3.1:free",
    name: "DeepSeek Chat v3.1 — Modeliranje",
    desc: "163k konteksta · Dixon-Coles, bivariate Poisson, EV/Kelly",
    markets: ["btts", "ou25", "1x2", "htft", "opce"],
    defaultOn: true,
  },
  {
    id: "nvidia/nemotron-3-super-120b:free",
    name: "Nemotron 3 Super 120B — Analitičar",
    desc: "najbolji omjer brzine i točnosti za konkretne tipove",
    markets: ["1x2", "btts", "ou25", "opce"],
    defaultOn: true,
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B A22B — Matrica rezultata",
    desc: "duboko rezoniranje nad matricama i HT/FT kombinacijama",
    markets: ["htft", "htx", "htgoals", "1x2"],
    defaultOn: true,
  },
  {
    id: "qwen/qwq-32b:free",
    name: "QwQ 32B — Chain-of-thought kalkulator",
    desc: "eksplicitno računa Poissonove sume, dobar za Over/Under",
    markets: ["ou25", "htgoals", "btts"],
    defaultOn: true,
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air — Kalkulator",
    desc: "precizna aritmetika, brz kod BTTS i λ dekompozicije",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B — Value & de-vig",
    desc: "usporedba s kvotama, edge i Kelly udio",
    markets: ["1x2", "btts", "ou25", "htft", "opce"],
    defaultOn: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B — Kontekst lige",
    desc: "poznavanje malih i egzotičnih liga, motivacija i derbiji",
    markets: ["1x2", "htx", "opce"],
    defaultOn: true,
  },
  {
    id: "meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick — Taktički sudar",
    desc: "stilovi igre, pressing vs low block, utjecaj na BTTS",
    markets: ["btts", "1x2", "htx"],
    defaultOn: true,
  },
  {
    id: "moonshotai/kimi-k2:free",
    name: "Kimi K2 — Dugi kontekst",
    desc: "obrada više parova i dugih statističkih tablica odjednom",
    markets: ["opce", "ou25", "htft"],
    defaultOn: true,
  },
  {
    id: "microsoft/mai-ds-r1:free",
    name: "MAI DS R1 — Statistički revizor",
    desc: "provjerava lanac zaključivanja i filtrira predrasude",
    markets: ["1x2", "btts", "ou25", "htft", "htx", "htgoals"],
    defaultOn: false,
  },
  {
    id: "tngtech/deepseek-r1t2-chimera:free",
    name: "R1T2 Chimera — Hibridni reasoner",
    desc: "brži R1 derivat, dobar za HT golove i X na poluvremenu",
    markets: ["htx", "htgoals", "htft"],
    defaultOn: false,
  },
  {
    id: "inclusionai/ling-1t:free",
    name: "Ling 3.0 Flash — Brzi skener listića",
    desc: "brzo prolazi kroz više parova odjednom",
    markets: ["opce"],
    defaultOn: false,
  },
  {
    id: "nvidia/nemotron-nano-9b-v2:free",
    name: "Nemotron Nano 9B v2 — Brzi tipster",
    desc: "brze procjene i kombinacije kad treba odmah tip",
    markets: ["opce", "btts", "ou25"],
    defaultOn: false,
  },
  {
    id: "cohere/command-a:free",
    name: "Cohere Command A — Precizna matematika",
    desc: "matrice rezultata, točan rezultat, korneri i kartoni",
    markets: ["ou25", "htgoals", "opce"],
    defaultOn: false,
  },

  // ═══ Zaseban odjeljak: GOL-SPECIJALISTI (BTTS + Over/Under 2.5) ═══
  {
    id: "deepseek/deepseek-r1-distill-llama-70b:free",
    name: "DeepSeek R1 Distill 70B — GG/NG snajper",
    desc: "brzi R1 lanac misli fokusiran na P(GG) i clean-sheet profile",
    markets: ["btts", "ou25"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "qwen/qwen3-30b-a3b:free",
    name: "Qwen3 30B A3B — λ dekompozicija",
    desc: "razlaže λ_dom/λ_gost po xG i xGA, precizan za Over/Under 2.5",
    markets: ["ou25", "btts"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1:free",
    name: "Nemotron Ultra 253B — Gol model PRO",
    desc: "duboka Poisson/Dixon-Coles analiza golova, najjači za GG i Over 2.5",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "mistralai/mistral-nemo:free",
    name: "Mistral Nemo — Tempo & shots skener",
    desc: "tempo utakmice, shots/90, PPDA → korekcija λ_total",
    markets: ["ou25", "btts"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B — Kontrola gol-trendova",
    desc: "BTTS% i Over 2.5% zadnjih 10, kuća/gosti odvojeno",
    markets: ["btts", "ou25"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B — Gol de-vig & value",
    desc: "de-vig GG/NG i O/U kvota, edge i Kelly udio za gol tržišta",
    markets: ["btts", "ou25"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder — Numerički solver",
    desc: "egzaktno računa Poissonove sume i matricu 0..8 bez aproksimacija",
    markets: ["ou25", "btts", "htgoals"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "deepseek/deepseek-r1-distill-qwen-32b:free",
    name: "R1 Distill Qwen 32B — Clean-sheet profiler",
    desc: "modelira P(tim ne zabije) posebno za domaćina i gosta",
    markets: ["btts", "ou25"],
    defaultOn: true,
    group: "gol",
  },
  {
    id: "meta-llama/llama-3.2-90b-vision-instruct:free",
    name: "Llama 3.2 90B — Skener listića i kvota",
    desc: "čita kvote sa slike listića i pretvara ih u de-vig vjerojatnosti",
    markets: ["btts", "ou25", "opce"],
    defaultOn: false,
    group: "gol",
  },
  {
    id: "microsoft/phi-4-reasoning-plus:free",
    name: "Phi-4 Reasoning+ — Kontrolor aritmetike",
    desc: "provjerava da P i λ nisu međusobno kontradiktorni",
    markets: ["ou25", "btts", "htgoals"],
    defaultOn: true,
    group: "gol",
  },
];

// ═══ Zaseban odjeljak: NAPREDNI BTTS & OVER/UNDER ANSAMBL (elite) ═══
// Ovi modeli se pozivaju paralelno i njihove se procjene spajaju u konsenzus
// (medijan P i λ) — time se bitno smanjuje pogreška pojedinog modela.
export const ELITE_SPECIALISTS: Specialist[] = [
  {
    id: "deepseek/deepseek-r1-0528:free",
    name: "R1 Ansambl — Poisson jezgra",
    desc: "λ_dom/λ_gost + Dixon-Coles τ, vraća strogi JSON s P(GG) i P(Over 2.5)",
    markets: ["btts", "ou25", "htgoals", "1x2"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B — Bivariate Poisson",
    desc: "korelirani golovi (ρ), matrica 0..8, precizan za GG i Over/Under",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b:free",
    name: "Nemotron Ultra 550B — Gol ansambl PRO",
    desc: "duboka forma, xG/xGA po lokaciji, kalibracija prema ligi",
    markets: ["btts", "ou25", "htgoals", "1x2"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B — De-vig kalibrator",
    desc: "skida maržu s kvota i uspoređuje s modelom (edge, CLV, Kelly)",
    markets: ["btts", "ou25", "1x2", "htft"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick — Kontekst & taktika",
    desc: "izostanci, motivacija, stil igre → korekcija λ prije konsenzusa",
    markets: ["btts", "ou25", "1x2", "htx"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air — Brza kontra-provjera",
    desc: "neovisna aritmetička provjera P(GG)/P(O2.5), hvata outliere",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct:free",
    name: "Mistral Small 3.2 — Revizor konsenzusa",
    desc: "provjerava odstupanja članova ansambla i kažnjava nekalibrirane",
    markets: ["btts", "ou25", "opce"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "deepseek/deepseek-chat-v3.1:free",
    name: "DeepSeek v3.1 — Dixon-Coles τ kalibrator",
    desc: "fino podešava τ i ρ prema profilu lige prije konsenzusa",
    markets: ["btts", "ou25", "htgoals", "1x2"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "nvidia/nemotron-3-super-120b:free",
    name: "Nemotron Super 120B — Tempo & xG modul",
    desc: "shots/90, PPDA, field tilt → korekcija λ_total za Over/Under",
    markets: ["ou25", "btts", "htgoals"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "qwen/qwen3-30b-a3b:free",
    name: "Qwen3 30B — Monte Carlo replikator",
    desc: "simulira ishod 10k puta i vraća empirijsku P za GG i Over 2.5",
    markets: ["btts", "ou25", "htgoals"],
    defaultOn: true,
    group: "elite",
  },
  {
    id: "moonshotai/kimi-k2:free",
    name: "Kimi K2 — Kontekst lige i rasporeda",
    desc: "umor, europska kola, ulog u tablici → korekcija λ i varijance",
    markets: ["btts", "ou25", "1x2", "htft"],
    defaultOn: false,
    group: "elite",
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B — Bazni trend kontrolor",
    desc: "BTTS% i Over% zadnjih 10 kao neovisna kontrola matrice",
    markets: ["btts", "ou25"],
    defaultOn: false,
    group: "elite",
  },
];

SPECIALISTS.push(...ELITE_SPECIALISTS);

// ═══ Zaseban odjeljak: NAPREDNI HT/FT & POLUVRIJEME ANSAMBL (htft) ═══
// Modeli specijalizirani za dinamiku poluvremena: split λ, uvjetni drugi dio,
// vodstva i preokreti. Pozivaju se prvi kad pitaš HT/FT, HT X ili HT golove.
export const HTFT_SPECIALISTS: Specialist[] = [
  {
    id: "deepseek/deepseek-r1-0528:free",
    name: "R1 HT/FT — Konvolucija poluvremena",
    desc: "λ_HT i λ_2H odvojeno, pa egzaktna konvolucija svih 9 kombinacija",
    markets: ["htft", "htx", "htgoals"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B — Uvjetni drugi dio",
    desc: "P(FT | HT vodstvo) uz korelaciju tempa nakon gola",
    markets: ["htft", "htx"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b:free",
    name: "Nemotron Ultra 550B — HT/FT PRO",
    desc: "profil ranih golova, gol do 30. minute, taktika prvog dijela",
    markets: ["htft", "htx", "htgoals"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B — HT/FT de-vig",
    desc: "skida maržu s 9 HT/FT kvota i traži jedini kombo s edgeom",
    markets: ["htft", "htx"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "deepseek/deepseek-chat-v3.1:free",
    name: "DeepSeek v3.1 — Split λ kalibrator",
    desc: "fino podešava udio golova u 1. poluvremenu po ligi (0.40–0.47)",
    markets: ["htgoals", "htft", "htx"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick — Start utakmice",
    desc: "oprezni startovi, derbi tempo, rizik ranog gola",
    markets: ["htx", "htgoals", "htft"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air — HT kontra-provjera",
    desc: "neovisno računa P(HT X) i P(HT Over 0.5), hvata outliere",
    markets: ["htx", "htgoals"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "microsoft/phi-4-reasoning-plus:free",
    name: "Phi-4 Reasoning+ — HT aritmetika",
    desc: "provjerava da HT i FT brojke nisu međusobno kontradiktorne",
    markets: ["htft", "htgoals", "htx"],
    defaultOn: true,
    group: "htft",
  },
  {
    id: "tngtech/deepseek-r1t2-chimera:free",
    name: "R1T2 Chimera — Preokreti",
    desc: "modelira X/1, X/2, 1/2 i 2/1 scenarije i njihovu stvarnu rijetkost",
    markets: ["htft"],
    defaultOn: false,
    group: "htft",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct:free",
    name: "Mistral Small 3.2 — HT revizor",
    desc: "revidira konsenzus poluvremena i kažnjava nekalibrirane članove",
    markets: ["htft", "htx", "htgoals"],
    defaultOn: false,
    group: "htft",
  },
];

// ═══ Dodatni besplatni modeli — opći bazen (v7) ═══
export const EXTRA_FREE_SPECIALISTS: Specialist[] = [
  {
    id: "qwen/qwen3-14b:free",
    name: "Qwen3 14B — Brzi kalkulator",
    desc: "brze Poissonove sume kad treba tip u sekundi",
    markets: ["ou25", "btts", "opce"],
    defaultOn: false,
  },
  {
    id: "qwen/qwen3-8b:free",
    name: "Qwen3 8B — Lagani skener",
    desc: "prolazi kroz više parova odjednom uz minimalnu latenciju",
    markets: ["opce"],
    defaultOn: false,
  },
  {
    id: "mistralai/mistral-7b-instruct:free",
    name: "Mistral 7B — Rezerva",
    desc: "stabilna rezerva kad su veći besplatni modeli na limitu",
    markets: ["opce", "1x2"],
    defaultOn: false,
  },
  {
    id: "google/gemma-3-12b-it:free",
    name: "Gemma 3 12B — Trend kontrolor",
    desc: "kontrolira postotke forme i gol-trendove",
    markets: ["btts", "ou25", "opce"],
    defaultOn: false,
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    name: "Llama 3.2 3B — Mikro provjera",
    desc: "sanity-check konačnog tipa u par riječi",
    markets: ["opce"],
    defaultOn: false,
  },
  {
    id: "deepseek/deepseek-r1-distill-llama-70b:free",
    name: "R1 Distill 70B — 1X2 rezoner",
    desc: "lanac misli za konačni ishod i dvostruku šansu",
    markets: ["1x2", "htft", "opce"],
    defaultOn: false,
  },
  {
    id: "nousresearch/deephermes-3-llama-3-8b-preview:free",
    name: "DeepHermes 3 — Kontekst i motivacija",
    desc: "ulog u tablici, derbi, borba za opstanak",
    markets: ["1x2", "opce"],
    defaultOn: false,
  },
  {
    id: "openai/gpt-oss-20b:free",
    name: "GPT-OSS 20B — Value skener",
    desc: "brza usporedba modela i kvote, edge i Kelly",
    markets: ["1x2", "btts", "ou25"],
    defaultOn: false,
  },
];

/** ═══ AUTO MODELI v11 — bira ih Mastermind automatski, bez ručnog biranja ═══ */
export const AUTO_SPECIALISTS: Specialist[] = [
  {
    id: "deepseek/deepseek-r1-0528:free",
    name: "AUTO · DeepSeek R1 — glavni rezoner",
    desc: "lanac misli, Poissonova matrica, de-vig i EV u jednom prolazu",
    markets: ["btts", "ou25", "1x2", "htft", "htgoals", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    name: "AUTO · DeepSeek V3 — brzi analitičar",
    desc: "širok kontekst, dobar za formu, ozljede i motivaciju",
    markets: ["btts", "ou25", "1x2", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "AUTO · Qwen3 235B — teška artiljerija",
    desc: "najjači besplatni model za kompleksne izračune i kombo tipove",
    markets: ["btts", "ou25", "1x2", "htft", "htx", "htgoals", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "qwen/qwq-32b:free",
    name: "AUTO · QwQ 32B — matematički provjeravač",
    desc: "druga neovisna metoda: Monte Carlo i kontrola brojki",
    markets: ["btts", "ou25", "htgoals", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "AUTO · Llama 3.3 70B — kontekst i taktika",
    desc: "taktički sudar, pressing, blok, umor i raspored",
    markets: ["1x2", "htft", "btts", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1:free",
    name: "AUTO · Nemotron Ultra 253B — dubinska analiza",
    desc: "duboka statistička razrada i HT/FT scenariji",
    markets: ["1x2", "htft", "htx", "htgoals", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "AUTO · Gemini 2.0 Flash — brza kalibracija",
    desc: "brzi drugi glas za kalibraciju vjerojatnosti",
    markets: ["btts", "ou25", "1x2", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct:free",
    name: "AUTO · Mistral Small 3.2 — value skener",
    desc: "usporedba modela i kvote, edge i Kelly",
    markets: ["btts", "ou25", "1x2", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "AUTO · GPT-OSS 120B — kontrolor zaključka",
    desc: "završna logička provjera i koherencija tržišta",
    markets: ["btts", "ou25", "1x2", "htft", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "tngtech/deepseek-r1t2-chimera:free",
    name: "AUTO · R1T2 Chimera — hibridni rezoner",
    desc: "spoj brzine i dubine, dobar za HT golove i HT/FT",
    markets: ["htft", "htx", "htgoals", "ou25", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "moonshotai/kimi-k2:free",
    name: "AUTO · Kimi K2 — dugi kontekst",
    desc: "obrada velikih setova podataka i povijesnih H2H",
    markets: ["1x2", "btts", "ou25", "opce"],
    defaultOn: true,
    group: "auto",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "AUTO · GLM 4.5 Air — rezerva u lancu",
    desc: "uskače kad su ostali na limitu, drži lanac neprekinutim",
    markets: ["btts", "ou25", "1x2", "opce"],
    defaultOn: true,
    group: "auto",
  },
];

SPECIALISTS.push(...HTFT_SPECIALISTS, ...EXTRA_FREE_SPECIALISTS);
SPECIALISTS.push(...AUTO_SPECIALISTS);


const STORE = "tm.specialists.active";

export function loadActiveSpecialists(): Record<string, boolean> {
  const saved = loadJSON<Record<string, boolean>>(STORE, {});
  const out: Record<string, boolean> = {};
  for (const s of SPECIALISTS) out[specKey(s)] = saved[specKey(s)] ?? s.defaultOn;
  return out;
}

/** Jedinstveni ključ — isti model id može biti i u gol-odjeljku. */
export function specKey(s: Specialist): string {
  return s.group ? `${s.group}:${s.id}` : s.id;
}

export function saveActiveSpecialists(map: Record<string, boolean>): void {
  saveJSON(STORE, map);
}

/** Prepoznaje o kojem tržištu korisnik pita. */
export function detectMarket(text: string): Market {
  const t = text.toLowerCase();
  if (/(pol[uo]vrem|ht\b|prvo poluvrij|1\.\s*pol)/.test(t)) {
    if (/(gol|golov|over|under|0\.5|1\.5|2\.5)/.test(t)) return "htgoals";
    if (/(ht\s*\/\s*ft|htft|poluvrijeme\s*\/\s*kraj|pol\/kraj)/.test(t)) return "htft";
    if (/\bx\b|neodluč|remi/.test(t)) return "htx";
    return "htgoals";
  }
  if (/ht\s*\/\s*ft|htft/.test(t)) return "htft";
  if (/btts|gg\/ng|\bgg\b|\bng\b|oba tima|both teams/.test(t)) return "btts";
  if (/over|under|2\.5|3\.5|1\.5|ukupno golova/.test(t)) return "ou25";
  if (/1x2|konačni ishod|tko pobj|pobjednik|domaćin|gost pobj/.test(t)) return "1x2";
  return "opce";
}

/** Vraća listu aktivnih specijalista za traženo tržište, po prioritetu. */
export function specialistsForMarket(market: Market): Specialist[] {
  const active = loadActiveSpecialists();
  const list = SPECIALISTS.filter((s) => active[specKey(s)]);
  const isGolMarket = market === "btts" || market === "ou25" || market === "htgoals";
  // Elitni ansambl pa gol-specijalisti idu prvi kad se pita za gol tržišta
  const elite = list.filter((s) => s.group === "elite" && s.markets.includes(market));
  const gol = isGolMarket ? list.filter((s) => s.group === "gol" && s.markets.includes(market)) : [];
  const head = [...elite, ...gol];
  const rest0 = list.filter((s) => !head.includes(s));
  const exact = rest0.filter((s) => s.markets.includes(market));
  const rest = rest0.filter((s) => !s.markets.includes(market));
  const out = [...head, ...exact, ...rest];
  // makni duplikate po model id-u (isti model u dva odjeljka)
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

/** Aktivni članovi elitnog ansambla za traženo tržište. */
export function ensembleForMarket(market: Market, max = 6): Specialist[] {
  const active = loadActiveSpecialists();
  const isHt = market === "htft" || market === "htx" || market === "htgoals";
  const htft = isHt
    ? HTFT_SPECIALISTS.filter((s) => active[specKey(s)] && s.markets.includes(market))
    : [];
  const eliteRaw = ELITE_SPECIALISTS.filter((s) => active[specKey(s)] && s.markets.includes(market));
  const elite = isHt ? [...htft, ...eliteRaw] : [...eliteRaw, ...htft];
  const seen = new Set(elite.map((e) => e.id));
  const extra = specialistsForMarket(market).filter((s) => !seen.has(s.id));
  return [...elite, ...extra].slice(0, Math.max(3, max));
}

/** Dodatni "modul razmišljanja" koji se ubacuje u sistemski prompt. */
export function marketModule(market: Market): string {
  switch (market) {
    case "btts":
      return `═══ MODUL: BTTS (GG/NG) — MAKSIMALNA PRECIZNOST ═══
1) Procijeni λ_dom i λ_gost (xG for napada × xGA obrane / prosjek lige), s home advantage ×1.12/×0.92.
2) P(GG) = (1 − e^−λd)(1 − e^−λg), pa dodaj Dixon-Coles korekciju za 0:0/1:0/0:1/1:1 (τ smanjuje GG za 2-4%).
3) Provjeri: BTTS% zadnjih 10 (dom kod kuće, gost u gostima), clean sheet% obiju obrana, % utakmica u kojima svaki tim zabije bar 1.
4) Korekcije: ključni napadač van → −0.25 λ; stožer obrane van → +0.20 λ protivniku; derbi/nož-u-leđa → −3% GG; utakmica bez uloga → +4% GG.
5) Sudac s puno penala i umor (≤3 dana odmora) → +2-4% GG.
6) Odluka: GG ako P ≥ 57% i oba tima prosječno primaju ≥ 0.9 gola; NG ako P ≤ 45% ili λ_total ≤ 2.1 uz jednu dominantnu obranu.
7) Uvijek navedi P(GG) u %, kvotu praga (1/P) i edge ako je kvota poznata. Napomeni rizik rane crvene.`;
    case "ou25":
      return `═══ MODUL: OVER/UNDER 2.5 — MAKSIMALNA PRECIZNOST ═══
1) λ_total = λ_dom + λ_gost. P(Over 2.5) = 1 − e^−λ(1 + λ + λ²/2).
2) Kontrola: prosjek golova lige, Over 2.5% zadnjih 10 za oba tima (kuća/gosti odvojeno), xG i xGA razlika, tempo (shots/90, PPDA).
3) Korekcije: dvije napadačke, otvorene ekipe → +3-5%; obje bore za opstanak → −4%; loše vrijeme/teren → −3%; kasna sezona bez uloga → +4%.
4) Ako se P i de-vig kvota razlikuju > 7 postotnih bodova, ponovno provjeri λ prije nego proglasiš value.
5) Odluka: Over 2.5 ako λ_total ≥ 2.85 i P ≥ 56%; Under 2.5 ako λ_total ≤ 2.35 i P(Under) ≥ 57%. Između → reci da nema edgea i ponudi Over 1.5 / Under 3.5 kao sigurniju alternativu.
6) Navedi λ_dom, λ_gost, λ_total, P(Over), P(Under), edge i Kelly.`;
    case "1x2":
      return `═══ MODUL: 1X2 ═══
1) Poissonova matrica 0..6 × 0..6 → P(1), P(X), P(2), uz Dixon-Coles korekciju niskih rezultata.
2) Kontrolna provjera Elo/Glicko razlikom: 400-bodova razlike ≈ 91% očekivanog rezultata; regresija xG outliera prema sredini.
3) Motivacija, umor, izostanci, taktički sudar → pomak λ, ne pomak "osjećaja".
4) De-vig kvote (1/o normaliziran) pa usporedi sa svojim p. Edge ≥ 5% za singl.
5) Shannonova entropija (base 3): > 0.95 → predloži dvostruku šansu ili DNB umjesto singla.
6) Odgovor: tip, P u %, edge, Kelly, i jedna sigurnija alternativa (1X/X2/DNB).`;
    case "htft":
      return `═══ MODUL: HT/FT ═══
1) Podijeli λ: prvo poluvrijeme ≈ 0.44 × λ_ukupno, drugo ≈ 0.56 (favoriti pojačavaju u 2. dijelu, umornije obrane).
2) Izračunaj HT ishod Poissonom s λ_HT, pa uvjetno FT ishod s λ_2H — 9 kombinacija, poštuj korelaciju (vodstvo → nizak tempo).
3) Tipične vjerojatnosti: 1/1 25-30% (jak domaćin), X/1 10-12%, X/X 10-13%, X/2 7-9%, 2/2 15-20%, preokreti 1/2 i 2/1 po 1-2%.
4) Preporuči HT/FT samo ako edge ≥ 20%; nikad ne predlaži preokret bez jakog razloga (rani crveni karton, ekstremna 2H forma).
5) Uvijek daj i "sigurniju verziju" (npr. X/1 → dvostruka šansa 1X ili DNB).`;
    case "htx":
      return `═══ MODUL: X NA POLUVREMENU ═══
1) λ_HT_dom i λ_HT_gost = 0.44 × λ_FT po timu. P(HT X) = Σ_k P(dom=k)·P(gost=k), k = 0..3 (dominira 0:0 i 1:1).
2) Bazna vrijednost u profi ligama: 35-42%. Raste kod: sporog starta obje ekipe, derbija, oprezne taktike, kišnog terena, ekipa s malo golova do 30. minute.
3) Pada kod: jakog favorita s ranim golovima (gol do 20' u > 50% utakmica), otvorenih napadačkih dvoboja.
4) Provjeri profil "gol u prvih 30 minuta %" za oba tima — ključni podatak.
5) Preporuči HT X samo ako P ≥ 42% i kvota ≥ 2.30 (edge ≥ 5%).`;
    case "htgoals":
      return `═══ MODUL: BROJ GOLOVA NA POLUVREMENU ═══
1) λ_HT = 0.44 × λ_FT (raspon 0.40-0.47 ovisno o ligi; Bundesliga i Eredivisie više, Serie A i grčka liga manje).
2) P(HT 0 golova) = e^−λHT; P(HT Over 0.5) = 1 − e^−λHT; P(HT Over 1.5) = 1 − e^−λHT(1 + λHT).
3) Očekivani broj golova na poluvremenu daj kao broj (npr. "očekujem 1.2 gola do odmora") + raspodjelu 0 / 1 / 2 / 3+ u postocima.
4) Korekcije: rana motivacija (derbi, kup) −0.1 λHT; slaba obrana + jak pressing +0.15; ekipa koja prima puno ranih golova +0.15.
5) Preporuči HT Over 0.5 ako P ≥ 62%, HT Under 1.5 ako P ≥ 62%, inače reci da nema edgea.`;
    default:
      return "";
  }
}
