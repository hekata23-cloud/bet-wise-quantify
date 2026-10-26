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
import { ORION_PERSONA, runQuantAnalytics, formatOrionResponse, formatLunaResponse } from "./botovi";

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

═══ SVEOBUHVATNO POZNAVANJE KLADIONIČARSKIH TRŽIŠTA (NOGOMET, KOŠARKA, RUKOMET) ═══
MORAŠ prepoznati i precizno analizirati SVA tržišta koja kladionice nude:

⚽ NOGOMET:
- 1X2 (Konačan ishod: 1, X, 2)
- Dvostruka šansa / Dvoznak (1X, X2, 12)
- Draw No Bet (DNB — pobjeda bez neriješenog, kod remija povrat uloga)
- Oba daju gol — BTTS (GG, NG, GG i 3+, GG u 1. poluvremenu, GG u 2. poluvremenu)
- Zbroj golova / Over-Under (linije 0.5, 1.5, 2.5, 3.5, 4.5; i u 1. poluvremenu 0.5, 1.5)
- Azijski hendikep (AH 0, -0.25, -0.5, -0.75, -1.0, -1.25, -1.5, +0.25, +0.5, +0.75, +1.0, +1.5) i Europski hendikep (EH -1, +1)
- Poluvrijeme / Kraj prijelazi (HT/FT: 1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2)
- Poluvrijeme tržišta: 1X2 na poluvremenu, zbroj golova u 1. poluvremenu, gol u oba poluvremena
- Točan rezultat (Exact Score: top ishodi iz Poissonove matrice: 1:0, 2:0, 2:1, 1:1, itd.)
- Timski zbroj golova: Domaćin ili Gost preko/ispod 0.5, 1.5, 2.5 gola; tim daje gol (DA/NE)
- Korneri: zbroj kornera Over/Under (8.5, 9.5, 10.5), tim s više kornera, hendikep kornera
- Kartoni: zbroj kartona Over/Under (3.5, 4.5), crveni karton na utakmici (DA/NE)
- Prvi gol: tko postiže prvi gol, vrijeme prvog gola
- Kombinirane oklade (Kombo): 1 & Over 2.5, 1 & GG, 1X & Under 3.5, 2 & Over 2.5, X & Under 2.5
- Strijelci i specijali: Anytime Goalscorer, 2+ gola, udarci u okvir (shots on target)

🏀 KOŠARKA:
- Pobjednik meča (Moneyline 1 - 2, uključujući produžetke)
- Regularno vrijeme 1X2 (1, X, 2 bez produžetaka)
- Point Spread / Hendikep poena (npr. -3.5, -5.5, -8.5, +4.5, +7.5 s produžetcima)
- Ukupan zbroj poena (Total Over/Under: npr. 155.5..168.5 u Europi, 218.5..232.5 u NBA)
- Poluvrijeme tržišta: pobjednik 1. poluvremena (1-2 HT), hendikep na poluvremenu, total poena 1. poluvrijeme
- Četvrtine (Q1, Q2, Q3, Q4): pobjednik 1. četvrtine, hendikep Q1, zbroj poena u 1. četvrtini
- Timski zbroj poena (Domaćin preko/ispod, Gost preko/ispod zadanog broja poena)
- Margina pobjede (Winning Margin: 1-5 poena, 6-10 poena, 11-15 poena, 16+ poena)
- Igrači / Player Props: igrač zbroj poena (Over/Under), skokovi, asistencije, pogođene trice, PRA kombo
- Utrka do poena (Race to 20 / Race to 50 poena)

🤾 RUKOMET:
- 1X2 (Konačan ishod: 1, X, 2 — u rukometu je remi X realan ishod s vjerojatnošću ~8.5-10.5% i kvotom 8.00-10.50)
- Dvostruka šansa / Dvoznak (1X, X2, 12)
- Hendikep golova (npr. -1.5, -2.5, -3.5, -4.5, +2.5, +3.5, +5.5)
- Ukupno golova (Total Over/Under: linije 52.5, 54.5, 56.5, 58.5, 60.5, 63.5)
- Poluvrijeme tržišta: 1X2 1. poluvrijeme, hendikep 1. poluvremena, zbroj golova 1. poluvrijeme (npr. 27.5, 29.5)
- Timski zbroj golova: Domaćin postiže više/manje npr. 28.5 golova, Gost više/manje npr. 26.5
- Poluvrijeme / Kraj (HT/FT: 1/1, X/1, 2/1, 2/2...)
- Zbroj golova u 2. poluvremenu
- Parno / Neparno golova
- Igrač zbroj golova (npr. vanjski pucač ili krilo više/manje 4.5 ili 6.5 golova)

═══ OSTALI SPORTOVI ═══
- Tenis: forma na podlozi (clay/hard/grass), break points saved/won, prvi servis %, H2H, altituda, umor.
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
  const quant = runQuantAnalytics(userText);
  let quantDirective = "";
  if (quant.isMatchQuery) {
    if (quant.sport === "kosarka") {
      quantDirective = `\n\n═══ EGZAKTNA MATEMATIČKA TELEMETRIJA: KOŠARKA ═══
- Momčadi: ${quant.homeTeam} vs ${quant.awayTeam} (KOŠARKA - ${quant.competition})
- Tržište: ${quant.marketName}
- Očekivani poeni: ${quant.homeTeam} ≈ ${quant.lambdaHome} | ${quant.awayTeam} ≈ ${quant.lambdaAway} (Ukupno: ${quant.totalXG} poena)
- Vjerojatnosti ishoda (Moneyline): 1 (${quant.p1}%) vs 2 (${quant.p2}%)
- Glavni tip: ${quant.pick} (${quant.confidencePercent}% sigurnost)
- De-vig fer kvota: ${quant.fairOdds} · Edge: +${Math.max(0.5, quant.edgePercent)}% · Kelly: ${quant.kellyFractionPercent}%
- 10.000 Monte Carlo simulacija: ${quant.monteCarloRatio} u korist tipa
- Prediction Integrity Gate: ${quant.integrity.status} (${quant.integrity.label})
OBAVEZNO uskladi svoj izračun s ovim točnim košarkaškim vrijednostima!`;
    } else if (quant.sport === "rukomet") {
      quantDirective = `\n\n═══ EGZAKTNA MATEMATIČKA TELEMETRIJA: RUKOMET ═══
- Momčadi: ${quant.homeTeam} vs ${quant.awayTeam} (RUKOMET - ${quant.competition})
- Tržište: ${quant.marketName}
- Posjedi i tempo: 52-56 napada po ekipi · Projicirani golovi: ${quant.homeTeam} ≈ ${quant.lambdaHome} | ${quant.awayTeam} ≈ ${quant.lambdaAway} (Ukupno: ${quant.totalXG} golova)
- Vjerojatnosti 1X2: 1 (${quant.p1}%) | Neriješeno X (${quant.pX}%) | 2 (${quant.p2}%)
- Glavni tip: ${quant.pick} (${quant.confidencePercent}% sigurnost)
- De-vig fer kvota: ${quant.fairOdds} · Edge: +${Math.max(0.5, quant.edgePercent)}% · Kelly: ${quant.kellyFractionPercent}%
- 10.000 Monte Carlo simulacija: ${quant.monteCarloRatio} u korist tipa
- Prediction Integrity Gate: ${quant.integrity.status} (${quant.integrity.label})
OBAVEZNO uskladi svoj izračun s ovim točnim rukometnim vrijednostima!`;
    } else {
      quantDirective = `\n\n═══ EGZAKTNA MATEMATIČKA TELEMETRIJA: NOGOMET ═══
- Momčadi: ${quant.homeTeam} vs ${quant.awayTeam} (NOGOMET - ${quant.competition})
- Tržište: ${quant.marketName}
- Dixon-Coles Poisson model: λ_dom = ${quant.lambdaHome}, λ_gost = ${quant.lambdaAway} (Ukupno očekivano: ${quant.totalXG} gola)
- Matrica vjerojatnosti 1X2: 1 (${quant.p1}%), X (${quant.pX}%), 2 (${quant.p2}%)
- Tržišta golova: Over 2.5 (${quant.pOver25}%), Under 2.5 (${quant.pUnder25}%), BTTS (${quant.pBttsYes}%)
- 10.000 Monte Carlo simulacija: ${quant.monteCarloRatio} u korist tipa ${quant.pick} (${quant.confidencePercent}%)
- Kelly kriterij: ${quant.kellyFractionPercent}% preporučeni ulog (frakcijski 25%)
- Shannonova entropija: H = ${quant.shannonEntropy} (indeks neodređenosti)
- De-vig fer kvota: ${quant.fairOdds} · Edge: +${Math.max(0.5, quant.edgePercent)}%
- Prediction Integrity Gate: ${quant.integrity.status} (${quant.integrity.label})
OBAVEZNO uskladi svoj izračun s ovim točnim matematičkim vrijednostima!`;
    }
  } else {
    quantDirective = `\n\n═══ RAZGOVORNI NAČIN (OPĆENITO PITANJE / STRATEGIJA) ═══
Korisnik postavlja općenito pitanje, pozdravlja ili pita za pojašnjenje pojmova/strategije.
Odgovori prijateljski, toplo, kolegijalno i stručno na čistom hrvatskom jeziku.
NEMOJ izmišljati nepostojeću utakmicu niti nametati lažni mock par za Domaćin vs Gost!`;
  }

  const marketDirective =
    market === "opce"
      ? deepThinking + antiDirectives + quantDirective + tail
      : deepThinking + `\n\nTRAŽENO TRŽIŠTE: ${MARKET_LABEL[market]}. Prva rečenica odgovora MORA biti konkretan tip za ovo tržište + sigurnost u %. Ne skreći na druga tržišta osim jedne alternative na kraju.\n\n${modul}${consensusBlock}${omniBlock}${antiDirectives}${quantDirective}${tail}`;
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
  for (const b of brains) {
    try {
      let candidate = "";
      if (b === "openrouter" && hasKey("openrouter")) {
        candidate = await runOpenRouter(sys, history, userText, attachments, prefs, market);
      } else if (b === "nvidia" && hasKey("nvidia")) {
        candidate = await runNim(sys, history, userText, prefs);
      } else if (b === "gemini" && hasKey("gemini")) {
        candidate = await runGemini(sys, history, userText, attachments);
      } else if (b === "groq" && hasKey("groq")) {
        candidate = await runGroq(sys, history, userText, attachments);
      } else if (b === "huggingface" && hasKey("huggingface")) {
        candidate = await runHF(sys, history, userText, attachments, prefs);
      }
      const s = (candidate ?? "").trim();
      if (s && !/^prazan odgovor$/i.test(s)) {
        return s;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${b}: ${msg}`);
      console.warn(`${b} pao, automatski prebacujem na sljedeći:`, msg);
    }
  }

  // Autonomni analitički odgovor (nikada ne vraća prazan odgovor niti mock podatke)
  if (opts.agent === "orion") {
    return formatOrionResponse(quant);
  }
  return formatLunaResponse(quant);
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


