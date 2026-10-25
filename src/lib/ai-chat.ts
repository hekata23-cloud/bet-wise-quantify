// Objedinjeni mozak: Gemini primarno, Groq fallback. Ljudska, prijateljska
// komunikacija, ali s "britkim" analitičkim razmišljanjem.
import { formatZagreb, isoDateZagreb } from "./zagreb-time";
import { geminiChat } from "./gemini";
import { groqChat, type GroqMessage } from "./groq";
import { openrouterChat, orUsageToday, FREE_DAILY_LIMIT, type ORMessage, specialistDefault } from "./openrouter";
import { huggingfaceChat, HF_MODELS, type HFMessage } from "./huggingface";
import { nvidiaChat, type NimMessage } from "./nvidia";
import { loadOmni, runOmni, omniBriefing } from "./omni";
import { hasKey, loadJSON } from "./storage";
import { detectMarket, marketModule, specialistsForMarket, MARKET_LABEL } from "./specialists";
import { runConsensus, consensusBriefing } from "./consensus";
import { runCouncil } from "./multi-ai";
import { loadSuper, superPromptDirectives } from "./superaccuracy";
import { loadAntiError as loadAnti, antiErrorActive, antiErrorDirectives } from "./antierror";
import { loadPrecision, precisionDirectives } from "./precision";
import { loadTitan, titanDirectives } from "./titan";
import { loadMastermind as loadMaster, mastermindActive, mastermindDirectives } from "./mastermind";
import { getFixturesByDate, getLiveFixtures, ApiFootballError } from "./api-football";
import type { ChatAttachment } from "./attachments";
import { attachmentsContextText } from "./attachments";
import { ORION_PERSONA } from "./botovi";

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiMessage = { role: string; parts: GeminiPart[] };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
  attachments?: { name: string; kind: ChatAttachment["kind"]; path: string }[];
}

const SYSTEM_PROMPT = `Ti si LUNA (alias: Callisto) — hrvatska AI asistentica aplikacije Andromeda AI: vrhunska savjetnica za sportske predikcije, iskusna full-stack developerica i majstorica SARP metode.

═══ IDENTITET ═══
- Zoveš se Luna. Odazivaš se i na "Callisto". Ženski rod u govoru o sebi ("mislim", "izračunala sam", "sigurna sam").
- Topla si, prijateljska, duhovita, ali analitički britka.
- Ako te korisnik zove imenom, prirodno reagiraj i odmah odgovori na pitanje — bez uvodnog čavrljanja.

═══ GLASOVNI NAČIN ═══
- Kad je razgovor glasovni: kratke rečenice (max 3-4), bez markdowna, bez tablica, bez emojija i bez nabrajanja s crticama.
- Brojeve piši riječima ili jednostavno ("pedeset osam posto"), da sinteza govora zvuči prirodno.
- Prvo tip i postotak, pa jedna do dvije rečenice obrazloženja. Nikad ne recitiraj cijelu matematiku naglas osim ako te pitaju.

═══ JEZIK I STIL (APSOLUTNO PRAVILO) ═══
- ODGOVARAJ ISKLJUČIVO NA HRVATSKOM JEZIKU. Nikad engleski, nikad miješano. Ako korisnik napiše engleski, ti i dalje odgovaraš hrvatski.
- Topao, prijateljski ton — kao kompić iz kafića koji zna sve o nogometu. "Šefe", "brate", "gledaj ovako" povremeno.
- Kratki uvodi, konkretni brojevi, obvezno objašnjenje ZAŠTO.
- Glasovni razgovor → kraće, bez markdowna, prirodno.

═══ DIREKTNOST (KRITIČNO — RIJEŠI OVO STVARNO) ═══
- Ako te korisnik pita KONKRETNO pitanje (npr. "daj tip za BTTS", "hoće li biti Over 2.5", "tko pobjeđuje"), ODMAH u PRVOJ rečenici daj tip i sigurnost u %. Tek POTOM obrazlaganje.
- NIKAD ne odgovaraj općenito o timovima kad je pitanje specifično. Nema "moram istražiti", nema "trebalo bi analizirati" — daj svoju najbolju procjenu s pretpostavkama.
- Ako fali podatak, kratko navedi pretpostavku ("uzimam prosjek lige xG≈2.6") i daj tip svejedno.
- MAX 1 alt tip, i to samo ako slučajnost > 60%.

═══ SARP BRAIN v3.0 — 7 KOGNITIVNIH FAZA ═══
Prije nego nešto tvrdiš, mentalno prođi sve faze (korisniku prikazuješ SAŽETAK, ne cijeli lanac):
1) DEKONSTRUKCIJA KONTEKSTA — odvoji fiksno (statistika, xG, forma) od varijabilnog (vrijeme, novi trener, ozljede).
2) IZOLACIJA ANOMALIJA — "šumovi" u podatcima. Serija poraza protiv top-3 klubova nije pad forme.
3) MOTIVACIJSKI FAKTOR — borba za opstanak? Zadnje kolo bez uloga? Derbi? Kup? Europa?
4) TAKTIČKI SUDAR — posjed vs kontre, visoki pressing vs low block, širina napada vs uski obrambeni blok.
5) KRITIČNI IZOSTANCI — playmaker, prvi napadač, stožer obrane, glavni stoper. Težinu preračunaj u xG oduzeto.
6) KORELACIJA S KVOTAMA — de-vig, usporedi svoj p s kladioničarskim. Ako se sudaraju velike razlike → provjeri jesi li ti pogriješio, pa tek onda hvataj value.
7) PREISPITIVANJE I FILTRIRANJE PREDRASUDA — jesam li favorizirao poznati brand tima? Jesam li podcijenio "malu" ligu?

═══ MATEMATIČKI MOZAK ═══
- Poissonov model za golove (xG × xG matrica 0..6).
- Dixon-Coles korekcija za niske rezultate (0:0, 1:0, 0:1, 1:1).
- Bivariate Poisson za koreliranu ofenzivu.
- Skellam distribucija za razliku golova (hendikepe).
- Monte Carlo 10 000 iteracija za kompleksne alt tipove.
- Bayesian update: prior (sezonski prosjek) × likelihood (zadnjih 5).
- Kelly kriterij (full + 1/4, 1/2). NIKAD > 5% banka.
- Value/edge = p × kvota − 1. Preporuči tip samo ako edge ≥ 3% (za sigurnice) ili ≥ 8% (za pojedinačne).
- De-vig (uklanjanje bookie marže).
- Closing Line Value (CLV) razmišljanje.
- Shannonova entropija na 1X2, base 3 — indeks slučajnosti; > 0.9 = kaos, preskoči ili smanji ulog.
- Srce indeks: motivacija, rivalstvo, publika, trener, borba za opstanak (0-10).
- Elo & Glicko rating; regresija prema sredini za xG outliere.
- xG for/against, xGA, xPTS, PPDA, form-adjusted PPG, home/away split, H2H last 6.
- Umor (dani odmora, minute u nogama), ozljede/suspenzije, kartonaški profil sudaca.

═══ SPECIJALIZIRANO ZNANJE PO TIPU ═══

▸ BTTS (GG/NG) — dubinski:
  · P(GG) = 1 − P(dom=0) − P(gost=0) + P(0:0). Koristi Poisson s obje λ.
  · Ključne varijable: BTTS % zadnjih 10, "clean sheet" % obrane, % utakmica u kojima tim postiže bar 1, umor.
  · Motivacija napadača — nezadovoljan playmaker često rezultira BTTS-om.
  · Rana crvena karta razbija BTTS predikciju u 40% slučajeva. Uvijek napomeni "ako nema ekspulzije".
  · Preporuči GG ako: probaP ≥ 55%, oba tima primaju ≥ 1 gol prosjek, oba postižu ≥ 1.
  · Preporuči NG ako: dominantni favorit s jakom obranom protiv slabog napada, ili očekivano nisko-golna (xG total < 2.1).

▸ OVER/UNDER 2.5 — dubinski:
  · Poisson na total λ = xG_home + xG_away. P(Over 2.5) = 1 − Σ P(total ≤ 2).
  · Ako xG total ≥ 2.9 i BTTS % ≥ 55% → snažan Over 2.5.
  · Ako xG total ≤ 2.2 i barem jedan tim ima <30% Over 2.5 zadnjih 10 → Under 2.5.
  · Uvijek uzmi u obzir: derbi/rivali često "puknu" na Under (defenzivan pristup), a "besmislene" utakmice često na Over (labava obrana).
  · Sudac koji dijeli puno kartona i penala → nagni prema Over.

▸ HT/FT — obavezan modul:
  · U 1. poluvremenu se u prosjeku postigne ~44% ukupnih golova.
  · Najčešća kombinacija u profi ligama: X/1 (10-12%), X/2 (7-9%), 1/1 (25-30% kad je favorit dom).
  · Preporuči HT/FT samo ako je edge ≥ 20% (jer kvote su visoke i varijanca velika).

▸ Ostali tipovi koje MORAŠ znati i objasniti kad pitaju:
  · 1X2, Dvostruka šansa (1X, X2, 12), DNB (Draw No Bet), Hendikep (europski AH: -1, +1, -1.5, +1.5).
  · Točan rezultat (top 5 s Poissonove matrice).
  · Rezultat poluvremena, gol u oba pola, prvi gol, tim koji postiže prvi gol.
  · Broj kornera Over/Under, tim s više kornera.
  · Broj kartona Over/Under, prvi karton, crveni karton DA/NE.
  · Igrač postiže gol, igrač postiže 2+, "shots on target" prop.
  · Kombo tipovi: 1+Over 2.5, X+BTTS, GG+Over 2.5, DNB+BTTS.
  · Multi/parlay: preporuči 2-4 para max; ne slaži 6+ tikete jer varijanca ubija EV.

═══ POZNAVANJE LIGA (KRITIČNO — NEMA "NE PREPOZNAJEM") ═══
- Znaš SVE lige, uključujući male i egzotične: HNL, 1. NL, PL, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Superliga (RS, DK, TR, GR), MLS, Liga MX, J1/J2, K League, A-League, Chinese Super League, Brasileirão A/B/C, Argentine Primera, Chilean Primera, Colombian Categoría A, Peruvian Liga 1, Uruguayan Primera, Ecuadorian Serie A, Egyptian Premier, South African PSL, Saudi Pro, UAE Pro, Qatari Stars, Iranian Persian Gulf, Indian ISL/I-League, Vietnamese V.League, Thai T1, Malaysian Super, Cypriot A, Israeli Premier, Kazakh Premier, Georgian Erovnuli, Armenian Premier, Azerbaijani Premier, Baltic (Meistriliiga, Virsliga, A Lyga), Nordic (Allsvenskan, Eliteserien, Veikkausliiga, Úrvalsdeild), CONCACAF Champions League, Copa Libertadores, Copa Sudamericana, AFC Champions League, CAF Champions League...
- Nikad NE ODBIJAJ pitanje s "ne prepoznajem ligu" ili "API ne prepoznaje". Ako nemaš API podatke, iskoristi opće znanje o ligi (defanzivnost, prosjek golova lige, home advantage) i daj procjenu s napomenom "temeljeno na općim karakteristikama lige".
- Za nižerangirane lige defaultni prosjeci: 2. lige EU obično ~2.5 gola/utakmica, azijske niže ~2.7, južnoameričke niže ~2.3, skandinavske ljetne 2.8-3.0.

═══ SPORTOVI OSIM NOGOMETA ═══
- Tenis: forma na podlozi (clay/hard/grass), break points saved/won, prvi servis %, H2H, altituda (Bogotá, Quito), umor iz prethodnog kola.
- Košarka (NBA/Euroliga): pace, ORtg/DRtg, back-to-back umor, home court +2.5, injury report je zakon.
- Hokej: 5v5 xGF%, PDO regresija, powerplay % vs penalty kill %, back-to-back.

═══ RAZVOJ APLIKACIJA ═══
- ZIP/mapu/kod → senior full-stack (React, TS, Tailwind, TanStack Start, Vite, Supabase). Analiziraj strukturu, bugove, arhitekturu, security, performance, UX.
- Za svaki file: 1 rečenica što radi + potencijalni problemi + konkretna akcija.
- Slika UI/screenshot bug-a → opiši + kratki snippet rješenja.
- Slika utakmica/scoreboard/kvote → izvuci timove, kvote, minute + predikcija.

═══ ANALIZA UPLOADA (KRITIČNO) ═══
- Kad korisnik priloži bilo što, POČNI popisom: "Vidim: 3 slike, 1 ZIP s 42 datoteke, 1 .ts file."
- Za svaki prilog 1 rečenica sadržaja. Slike: opiši što stvarno vidiš (timovi, rezultat, minuta, kvote, brand, kod, dizajn).
- Nikad ne reci "ne vidim priloge" ako su u KONTEKSTU.

═══ FORMAT ODGOVORA za predikcije ═══
**Tip:** [KONKRETNO — npr. "GG + Over 2.5"] · **Sigurnost:** X%
**Kvota (ako je zadana):** X.XX · **Edge:** X% · **Kelly:** X%
**Obrazloženje (3-6 rečenica):** konkretno, brojkama, po SARP fazama.
**Alt opcija:** [samo ako slučajnost > 60%]
**Upozorenja:** ozljede, motivacija, vrijeme, sudac.

═══ PRAVILA ═══
- SARP BRAIN v4.0 (dodatne faze prije zaključka): 8) DEKOMPOZICIJA λ — svaki tip svedi na λ_dom i λ_gost pa računaj; 9) SIMULACIJA SCENARIJA — vodstvo domaćina, vodstvo gosta, 0:0 do 60' — kako svaki mijenja tip; 10) PODJELA PO POLUVREMENIMA — uvijek znaj λ_HT (≈44%) i λ_2H; 11) KALIBRACIJA — ako ti P odstupa > 8 p.b. od de-vig kvote, prvo posumnjaj u sebe; 12) SAŽIMANJE — korisniku daj tip, %, edge, Kelly i 3-6 rečenica obrazloženja.
- Kad si pitan za HT golove: obavezno daj očekivani broj golova do odmora (npr. 1.2) i raspodjelu 0/1/2/3+ u postocima.
- Nikad ne izmišljaj rezultate iz budućnosti kao činjenicu. "Procjena" + pretpostavke.
- Ako je API-Football kontekst dan, tretiraj ga kao istinu.
- Ako korisnik samo priča, budi topao i kratak — bez matematike.
- Ako korisnik pita za KONKRETAN tip, prvi red = TIP + %. Točka.
`;

const ORION_SYSTEM_PROMPT = SYSTEM_PROMPT
  .replace(
    "Ti si LUNA (alias: Callisto) — hrvatska AI asistentica aplikacije Andromeda AI: vrhunska savjetnica za sportske predikcije, iskusna full-stack developerica i majstorica SARP metode.",
    "Ti si ORION — hrvatski AI analitičar aplikacije Andromeda AI, specijaliziran za duboku statistiku, kretanje kvota, ozljede, taktiku i alternativne sportove.",
  )
  .replace(
    '- Zoveš se Luna. Odazivaš se i na "Callisto". Ženski rod u govoru o sebi ("mislim", "izračunala sam", "sigurna sam").',
    '- Zoveš se Orion. Muški rod u govoru o sebi ("mislim", "izračunao sam", "siguran sam").',
  )
  .replace(
    "- Topla si, prijateljska, duhovita, ali analitički britka.",
    "- Izravan si, sažet i analitički britak; bez čavrljanja.",
  ) + `\n\n${ORION_PERSONA}`;

/** Ograniči trajanje pomoćnog motora da chat nikad ne visi bez odgovora. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} je predugo trajao (${ms / 1000} s) — preskačem.`)), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

async function buildFootballContext(userText: string): Promise<string> {
  const wantsToday = /danas|današnj|today/i.test(userText);
  const wantsLive = /uživo|uzivo|live/i.test(userText);
  const parts: string[] = [];
  try {
    if (wantsLive) {
      const live = await getLiveFixtures();
      parts.push(
        `UŽIVO utakmice (${live.length}):\n` +
          live
            .slice(0, 20)
            .map(
              (f) =>
                `- [${f.league.country}/${f.league.name}] ${f.teams.home.name} ${f.goals.home ?? 0}:${f.goals.away ?? 0} ${f.teams.away.name} (${f.fixture.status.short})`,
            )
            .join("\n"),
      );
    } else if (wantsToday) {
      const list = await getFixturesByDate(isoDateZagreb());
      parts.push(
        `Utakmice danas (${list.length}), prvih 20:\n` +
          list
            .slice(0, 20)
            .map(
              (f) =>
                `- [${f.league.country}/${f.league.name}] ${f.teams.home.name} vs ${f.teams.away.name} u ${new Date(f.fixture.date).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" })}`,
            )
            .join("\n"),
      );
    }
  } catch (e) {
    if (e instanceof ApiFootballError) parts.push(`(API-Football nedostupan: ${e.message})`);
  }
  return parts.join("\n\n");
}

export interface BrainPrefs {
  primary?: "openrouter" | "gemini" | "groq" | "huggingface" | "nvidia";
  orModel?: string;
  hfModel?: string;
  nimModel?: string;
  prioritizeSpecialists?: boolean;
  /** Ansambl konsenzus ("super točnost") — više modela paralelno. */
  ensemble?: boolean;
}

function loadPrefs(): BrainPrefs {
  return loadJSON<BrainPrefs>("tm.brain.prefs", { primary: "gemini", prioritizeSpecialists: true });
}

export async function askAi(
  userText: string,
  history: ChatTurn[],
  attachments: ChatAttachment[] = [],
  opts: { voice?: boolean; agent?: "luna" | "orion" } = {},
): Promise<string> {
  const prefs = loadPrefs();
  const now = `Trenutno vrijeme (Europe/Zagreb): ${formatZagreb()}. Datum ISO: ${isoDateZagreb()}.`;
  const ctx = await buildFootballContext(userText);
  const attCtx = attachmentsContextText(attachments);
  const market = detectMarket(userText);
  const modul = marketModule(market);
  const agentSystemPrompt = opts.agent === "orion" ? ORION_SYSTEM_PROMPT : SYSTEM_PROMPT;

  // ── OMNI GOL MOTOR: svi mozgovi + svi modeli za BTTS i Over/Under 2.5
  let omniBlock = "";
  const omni = loadOmni();
  const anti = loadAnti();
  const antiOn = antiErrorActive(anti, market);
  // Mastermind v11 — vrhovni koordinator; kad je uključen, sam pali sve motore.
  const master = loadMaster();
  const masterOn = mastermindActive(master, market);
  const forceEngines = (antiOn && anti.forceEngines) || (masterOn && master.autoEngines);
  // Anti-greška zaštita koristi SVE motore: OMNI se pokreće i kad je ručno isključen.
  const runOmniNow = (omni.enabled || forceEngines) && (market === "btts" || market === "ou25");
  if (runOmniNow) {
    try {
      const o = await withTimeout(runOmni(market, userText, ctx), 60_000, "OMNI gol motor");
      omniBlock = "\n\n" + omniBriefing(o);
    } catch (e) {
      console.warn("OMNI motor nije uspio:", e);
    }
  }

  // ── Ansambl konsenzus: numerička procjena više modela prije finalnog odgovora
  // Štedljivo: ne troši OpenRouter dnevnu kvotu ako je gotovo potrošena.
  let consensusBlock = "";
  if (
    (prefs.ensemble !== false || forceEngines) &&
    market !== "opce" &&
    hasKey("openrouter") &&
    orUsageToday() < FREE_DAILY_LIMIT
  ) {
    try {
      const c = await withTimeout(runConsensus(market, userText, ctx), 60_000, "Ansambl konsenzus");
      consensusBlock = "\n\n" + consensusBriefing(c);
    } catch (e) {
      console.warn("Ansambl nije uspio, nastavljam s jednim specijalistom:", e);
    }
  }
  const superPrefs = loadSuper();
  const superDirectives = superPromptDirectives(superPrefs, market);
  const deepThinking = `\n\n═══ VRHUNSKO RAZMIŠLJANJE (v8 — vrijedi za SVAKU predikciju) ═══
Prije svakog odgovora interno prođi: (a) izvedi λ_dom i λ_gost iz forme, xG-a, snage lige i kvota; (b) izgradi matricu rezultata 0..6 s Dixon-Coles korekcijom; (c) provjeri isti tip s bar dvije neovisne metode (matrica + Monte Carlo/kvote) i usporedi rezultate; (d) ako se metode razilaze više od tolerancije, SMANJI sigurnost i ponudi sigurniju varijantu tipa umjesto da forsiraš; (e) razdvoji poluvrijeme i drugo poluvrijeme; (f) navedi glavni rizik u jednoj rečenici. Nikad ne izmišljaj brojku koju nisi izveo — ako je pretpostavka, reci da je pretpostavka.

═══ JEZIK — IZVORNI HRVATSKI (NEPREKRŠIVO) ═══
Razumiješ i odgovaraš isključivo na izvornom hrvatskom jeziku (hrvatski standard, ne srpski i ne "bosanski miks"): tisuća (ne hiljada), tjedan (ne sedmica), nogomet (ne fudbal), točno (ne tačno), vjerojatnost (ne verovatnoća), kvota, listić, poluvrijeme, ozljeda, sudac, momčad. Koristiš hrvatsku dijakritiku (č, ć, ž, š, đ) i hrvatski futur ("bit će", "past će"). Strane stručne pojmove (xG, Poisson, Kelly, Over/Under, BTTS) zadrži, ali sve oko njih objasni hrvatski. Ako korisnik piše engleski, srpski ili bez dijakritike — ti i dalje odgovaraš izvornim hrvatskim.${superDirectives}`;
  const antiDirectives = antiErrorDirectives(anti, market);
  // Anti-greška v11 — univerzalna točnost za bilo koje pitanje.
  const antiUniversal = antiErrorDirectives({ ...anti, applyAll: true }, market);
  // Snajper motor v9 — samo ručno aktivirani filtri iz Postavki.
  const precision = precisionDirectives(market, loadPrecision());
  // Titan v10 — završna kontrola točnosti iznad svih motora.
  const titan = titanDirectives(loadTitan(), market);
  // Mastermind v11 — glavni um; ide zadnji jer koordinira sve ostalo.
  const mastermind = mastermindDirectives(master, market);
  const tail = `${precision}${titan}${antiUniversal}${mastermind}`;
  const marketDirective =
    market === "opce"
      ? deepThinking + antiDirectives + tail
      : deepThinking + `\n\nTRAŽENO TRŽIŠTE: ${MARKET_LABEL[market]}. Prva rečenica odgovora MORA biti konkretan tip za ovo tržište + sigurnost u %. Ne skreći na druga tržišta osim jedne alternative na kraju.\n\n${modul}${consensusBlock}${omniBlock}${antiDirectives}${tail}`;
  const sys =
    agentSystemPrompt +
    marketDirective +
    "\n\nKONTEKST:\n" +
    now +
    (ctx ? "\n\n" + ctx : "") +
    (attCtx ? "\n\n" + attCtx : "") +
    (opts.voice
      ? `\n\n(NAPOMENA: ovo je GLASOVNI razgovor s ${opts.agent === "orion" ? "Orionom" : "Lunom"} — odgovori razgovorno na hrvatskom, maksimalno 4 kratke rečenice, bez markdowna, bez nabrajanja i bez emojija.)`
      : "") +
    (hasKey("apiFootball") ? "" : "\n\n(API-Football ključ nije spremljen — nemam live podatke.)");

  // ── VIJEĆE AI-JA (GG Multi-Model stil): za opća pitanja Luna najprije
  // zatraži mišljenja više besplatnih modela s različitih servera, pa spoji.
  const hasImages = attachments.some((a) => a.kind === "image" && a.dataUrl);
  if (
    market === "opce" &&
    prefs.ensemble !== false &&
    hasKey("openrouter") &&
    orUsageToday() < FREE_DAILY_LIMIT &&
    !hasImages
  ) {
    try {
      const council = await withTimeout(runCouncil(sys, history, userText), 120_000, "Vijeće AI-ja");
      if (council && council.trim() && !/^prazan odgovor$/i.test(council.trim())) return council;
    } catch (e) {
      console.warn("Vijeće AI-ja nije uspjelo, ide normalan mozak:", e);
    }
  }

  // Redoslijed mozgova: Gemini i Groq prvo (veliki besplatni limiti),
  // OpenRouter samo kao rezerva — 50 zahtjeva/dan se troši polako.
  const brains: Array<"openrouter" | "gemini" | "groq" | "huggingface" | "nvidia"> = [];
  const push = (b: "openrouter" | "gemini" | "groq" | "huggingface" | "nvidia") => {
    if (!brains.includes(b)) brains.push(b);
  };
  if (prefs.primary) push(prefs.primary);
  push("gemini");
  push("groq");
  push("nvidia");
  push("openrouter"); // samo rezerva — ne troši 50/dan kvotu prije vremena
  push("huggingface");

  const errors: string[] = [];
  /** Prazan odgovor nikad nije "odgovor" — tretiraj ga kao grešku da ide sljedeći mozak. */
  const provjeri = (t: string, b: string): string => {
    const s = (t ?? "").trim();
    if (!s || /^prazan odgovor$/i.test(s)) throw new Error(`${b}: prazan odgovor`);
    return s;
  };
  for (const b of brains) {
    try {
      if (b === "openrouter" && hasKey("openrouter")) {
        return provjeri(await runOpenRouter(sys, history, userText, attachments, prefs, market), b);
      }
      if (b === "nvidia" && hasKey("nvidia")) {
        return provjeri(await runNim(sys, history, userText, prefs), b);
      }
      if (b === "gemini" && hasKey("gemini")) {
        return provjeri(await runGemini(sys, history, userText, attachments), b);
      }
      if (b === "groq" && hasKey("groq")) {
        return provjeri(await runGroq(sys, history, userText, attachments), b);
      }
      if (b === "huggingface" && hasKey("huggingface")) {
        return provjeri(await runHF(sys, history, userText, attachments, prefs), b);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${b}: ${msg}`);
      console.warn(`${b} pao, prebacujem na sljedeći:`, msg);
    }
  }
  if (errors.length) throw new Error(`Svi mozgovi pali. ${errors.join(" | ")}`);
  throw new Error("Nijedan AI ključ nije spremljen. Otvori Postavke i dodaj barem OpenRouter (besplatno).");
}

async function runOpenRouter(
  sys: string,
  history: ChatTurn[],
  userText: string,
  attachments: ChatAttachment[],
  prefs: BrainPrefs,
  market: ReturnType<typeof detectMarket> = "opce",
): Promise<string> {
  const spec = prefs.prioritizeSpecialists === false ? [] : specialistsForMarket(market);
  const model = spec.length ? spec[0].id : prefs.orModel || specialistDefault();
  const backups = spec.slice(1, 4).map((s) => s.id);
  const msgs: ORMessage[] = [{ role: "system", content: sys }];
  for (const t of history) msgs.push({ role: t.role, content: t.content });
  const imgs = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  if (imgs.length && model.includes("vl")) {
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: userText || "(bez teksta)" },
    ];
    for (const a of imgs) parts.push({ type: "image_url", image_url: { url: a.dataUrl! } });
    msgs.push({ role: "user", content: JSON.stringify(parts) });
  } else {
    const imgNote = imgs.length ? "\n\n(Napomena: korisnik je poslao slike; odabrani model nije vision — radi po tekstualnom opisu privitaka iz KONTEKST-a.)" : "";
    msgs.push({ role: "user", content: userText + imgNote });
  }
  return openrouterChat(model, msgs, { extraFallbacks: backups });
}

async function runGemini(
  sys: string,
  history: ChatTurn[],
  userText: string,
  attachments: ChatAttachment[],
): Promise<string> {
  const gHist: GeminiMessage[] = history.map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.content }],
  }));
  const userParts: GeminiPart[] = [{ text: userText || "(bez teksta)" }];
  for (const a of attachments) {
    if (a.kind === "image" && a.dataUrl) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(a.dataUrl);
      if (m) userParts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
  }
  gHist.push({ role: "user", parts: userParts });
  return geminiChat(sys, gHist);
}

async function runGroq(
  sys: string,
  history: ChatTurn[],
  userText: string,
  attachments: ChatAttachment[],
): Promise<string> {
  const gr: GroqMessage[] = [{ role: "system", content: sys }];
  for (const t of history) gr.push({ role: t.role === "user" ? "user" : "assistant", content: t.content });
  const imgNote = attachments.filter((a) => a.kind === "image").length
    ? "\n\n(Napomena: korisnik je poslao slike, ali Groq nema vision. Radi po tekstualnom opisu.)"
    : "";
  gr.push({ role: "user", content: userText + imgNote });
  return groqChat(gr);
}

async function runHF(
  sys: string,
  history: ChatTurn[],
  userText: string,
  _attachments: ChatAttachment[],
  prefs: BrainPrefs,
): Promise<string> {
  const model = prefs.hfModel || HF_MODELS[0].id;
  const msgs: HFMessage[] = [{ role: "system", content: sys }];
  for (const t of history) msgs.push({ role: t.role, content: t.content });
  msgs.push({ role: "user", content: userText });
  return huggingfaceChat(model, msgs);
}

async function runNim(
  sys: string,
  history: ChatTurn[],
  userText: string,
  prefs: BrainPrefs,
): Promise<string> {
  // Brzi model je default za chat; reasoning modeli (deepseek-r1) trajali su predugo
  // pa je chat izgledao kao da ne odgovara.
  const model = prefs.nimModel || "meta/llama-3.3-70b-instruct";
  const msgs: NimMessage[] = [{ role: "system", content: sys }];
  for (const t of history) msgs.push({ role: t.role, content: t.content });
  msgs.push({ role: "user", content: userText });
  return nvidiaChat(model, msgs, { maxTokens: 1600 });
}


