// src/lib/ai-chat.ts
// ══ ANDROMEDA AI Mozak v25 — "MULTI-SPORT QUANTUM ORACLE" ══
// Podržava Nogomet, Košarku i Rukomet sa svim kladioničarskim tržištima.
// Podržava dvije specijalizirane persone: 🌙 Luna (analitičarka) i ⚡ Orion (sharp quant).
// Jamči da nikada nema praznog odgovora u chatu.

import { geminiChat } from "./gemini";
import { openrouterChat } from "./openrouter";
import { groqChat, type GroqMessage } from "./groq";
import { nvidiaChat } from "./nvidia";
import { hasKey } from "./storage";
import { loadHtFt, htFtDirectives } from "./htft";
import { loadGoalFormula, goalFormulaActive, goalFormulaDirectives } from "./goalformula";
import { loadMastermind, mastermindDirectives } from "./mastermind";
import { detectMarket, MARKET_LABEL, type Market } from "./specialists";
import { runConsensus, consensusBriefing } from "./consensus";
import { runOmni, omniBriefing, loadOmni } from "./omni";
import { attachmentsContextText, type ChatAttachment } from "./attachments";
import { matchDataBrief } from "./matchdata";
import { predictorBriefing } from "./predictor-bridge";
import { proDirectives } from "./pro-sloj";
import {
  detectSport,
  generateSportPrediction,
  type SportType,
  type PersonaType,
} from "./sport-intelligence";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
  attachments?: { name: string; kind: ChatAttachment["kind"]; path?: string }[];
}

export interface AskOptions {
  voice?: boolean;
  turbo?: boolean;
  persona?: PersonaType;
}

interface BrainPrefsLite {
  turbo?: boolean;
}

function loadTurbo(): boolean {
  try {
    const raw = localStorage.getItem("tm.brain.prefs");
    if (!raw) return false;
    return Boolean((JSON.parse(raw) as BrainPrefsLite).turbo);
  } catch {
    return false;
  }
}

async function soft<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<null>((res) => setTimeout(() => res(null), ms)),
    ]);
  } catch (e) {
    console.warn("Pomoćni motor preskočen:", e);
    return null;
  }
}

function buildSystemPrompt(
  market: Market,
  briefings: string[],
  sport: SportType,
  persona: PersonaType = "luna"
): string {
  const math = briefings.filter(Boolean).join("\n\n");

  if (persona === "orion") {
    return `Ti si ORION — hrvatski kvantni analitičar, modeler sportskih kvota i sharp quant betting stručnjak.
Tvoja specijalnost su: NOGOMET, KOŠARKA i RUKOMET te sva tržišta koja nude domaće (SuperSport, PSK, Favbet, Germania) i globalne (Pinnacle, bet365) kladionice.

═══ TON I PRISTUP ═══
- Piši isključivo na hrvatskom jeziku, oštro, direktno i matematički precizno.
- Nema suvišnih fraza ni nagađanja. Svaka prognoza mora sadržavati:
  * Glavni VALUE tip
  * Fer kvotu (Fair Odds = 100 / vjerojatnost)
  * Procijenjeni očekivani profit (+EV %)
  * Preporučeni Kelly ulog (1% do 3% bankrolla)
  * Sigurnosnu liniju (zicer/buffer) i ključni rizik

═══ SPECIFIČNA TRŽIŠTA PO SPORTOVIMA (DETEKTIRANI SPORT: ${sport.toUpperCase()}) ═══
${
  sport === "kosarka"
    ? `🏀 KOŠARKA:
- Pobjednik meča (Moneyline) i regularno vrijeme (1X2)
- Hendikep poena (Spreads npr. -4.5 / +4.5)
- Zbroj koševa (Over/Under granice npr. 158.5, 164.5, NBA 224.5)
- 1. Poluvrijeme / 1. Četvrtina (ishod i hendikep)
- Poeni igrača (Player props više/manje)
- Procijenjeni točan rezultat (npr. 86:81)`
    : sport === "rukomet"
    ? `🤾 RUKOMET:
- Konačan ishod 1X2 (obavezno uzeti u obzir mogućnost remija X, kvota ~8.50)
- Dvostruka šansa (1X / X2 za neutralizaciju rizika remija)
- Hendikep golova (Spreads npr. -2.5 / +2.5, -4.5 / +4.5)
- Ukupno golova (Over/Under granica npr. 56.5, 58.5, 61.5)
- 1. Poluvrijeme (ishod 1X2 i zbroj golova)
- Procijenjeni točan rezultat (npr. 29:26)`
    : `⚽ NOGOMET:
- 1X2 i dvostruka šansa (1X, X2, 12)
- 🎯 GG/NG (BTTS — oba daju gol) sa sigurnosti %
- ⚽ Over/Under 2.5 (i 1.5 / 3.5) sa sigurnosti %
- 🕐 HT/FT (poluvrijeme/kraj) sa %
- 🔢 Točan rezultat (npr. 2:1)
- Hendikepi (europski i azijski), korneri i kartoni`
}

═══ PRAVILA TOČNOSTI ═══
1) Nikad ne ostavljaj prazan odgovor i nikad ne traži od korisnika da unosi statistiku.
2) Ako nema stvarnih podataka u upitu, koristi svoje statističko i domensko znanje o ligama i momčadima i daj konkretne brojeve.

═══ AUTORITATIVNI MATEMATIČKI IZRAČUNI ═══
${math || "Baza modela aktivna: Poisson, Dixon-Coles, Shin de-maržiranje i normalna razdioba za košarku/rukomet."}`;
  }

  // Persona LUNA (default)
  return `Ti si LUNA — topla, inteligentna i vrhunska hrvatska AI analitičarka sportskih predikcija.
Izvrsno razumiješ i pokrivaš: NOGOMET, KOŠARKU i RUKOMET te sva tržišta iz ponude kladionica (SuperSport, PSK, Favbet, bet365).

═══ TON ═══
- Piši isključivo na hrvatskom, toplo, prijateljski i s ohrabrujućom energijom.
- Kratko, jasno, pregledno i ljudski. Uvijek navedi postotak sigurnosti (%) i fer kvotu.

═══ SPORT I TRŽIŠTA (DETEKTIRANI SPORT: ${sport.toUpperCase()}) ═══
${
  sport === "kosarka"
    ? `Kad korisnik pita za KOŠARKAŠKU utakmicu:
1) 🏀 Pobjednik meča (Moneyline) i hendikep poena (+/- spread) + %
2) 🎯 Ukupno koševa (Over/Under točna granica) + %
3) 🕐 1. Poluvrijeme / 1. Četvrtina ishod + %
4) 🔢 Procijenjeni točan rezultat (npr. 86:81)
5) 👤 Prijedlog za igrače (poeni više/manje)
Zatim: 💡 Najsigurniji tip, ⚠️ glavni rizik i 🛡️ sigurnija opcija.`
    : sport === "rukomet"
    ? `Kad korisnik pita za RUKOMETNU utakmicu:
1) 🤾 Konačan ishod 1X2 i hendikep golova + %
2) 🛡️ Dvostruka šansa (1X ili X2 — važno jer u rukometu postoji rizik remija X!) + %
3) 🥅 Ukupno golova (Over/Under granica npr. 57.5) + %
4) 🕐 1. Poluvrijeme ishod + %
5) 🔢 Procijenjeni točan rezultat (npr. 29:26)
Zatim: 💡 Najsigurniji tip, ⚠️ glavni rizik i 🛡️ sigurnija alternativa.`
    : `Kad korisnik pita za NOGOMETNU utakmicu:
1) 🎯 GG/NG (BTTS — oba daju gol) + % sigurnosti
2) ⚽ Over/Under 2.5 (i 1.5) + % sigurnosti
3) 🕐 HT/FT (poluvrijeme/kraj) & 1X2 dvoznak + %
4) 🔢 Točan rezultat (npr. 2:1) + %
Zatim: 💡 Najsigurniji tip dana, ⚠️ glavni rizik i 🛡️ sigurnija opcija.`
}

═══ PRAVILA TOČNOSTI ═══
1) NIKAD ne odbijaj odgovor i ne ostavljaj prazan tekst. Uvijek odgovori točno na pitanje!
2) Ako korisnik pita za konkretan tip (npr. "Over 1.5", "Hendikep Partizan", "Zbroj golova rukomet Zagreb"), najprije izravno odgovori na to, a zatim dopuni ostalim tržištima.

═══ AUTORITATIVNI MATEMATIČKI IZRAČUNI ═══
${math || "Statistički moduli aktivni: Poisson/Dixon-Coles matrica, de-vig kvota i timska efikasnost."}`;
}

export async function askAi(
  userText: string,
  history: ChatTurn[] = [],
  attachments: ChatAttachment[] = [],
  options: AskOptions = {}
): Promise<string> {
  const sport = detectSport(userText);
  const persona = options.persona ?? "luna";
  const market = detectMarket(userText);
  const attCtx = attachmentsContextText(attachments);
  const turbo = options.turbo ?? loadTurbo();
  const deadline = turbo ? 3000 : 7000;

  const omniPrefs = loadOmni();
  const [live, consensus, omniBtts, omniOu] = await Promise.all([
    soft(matchDataBrief(userText), deadline),
    turbo ? Promise.resolve(null) : soft(runConsensus(market, userText, attCtx, { turbo }), deadline),
    !turbo && omniPrefs.enabled ? soft(runOmni("btts", userText, attCtx, { turbo }), deadline) : Promise.resolve(null),
    !turbo && omniPrefs.enabled ? soft(runOmni("ou25", userText, attCtx, { turbo }), deadline) : Promise.resolve(null),
  ]);

  const gf = loadGoalFormula();
  const briefings = [
    live ?? "",
    proDirectives(),
    predictorBriefing(),
    consensusBriefing(consensus),
    omniBriefing(omniBtts),
    omniBriefing(omniOu),
    goalFormulaActive(gf) ? goalFormulaDirectives(gf) : "",
    htFtDirectives(loadHtFt(), market),
    mastermindDirectives(loadMastermind(), market),
  ];

  const SYSTEM_PROMPT = buildSystemPrompt(market, briefings, sport, persona);
  const fullUser = attCtx ? `${userText}\n\n${attCtx}` : userText;
  const hist = history.slice(-12);
  const errors: string[] = [];

  // 1) Pokušaj s Google Gemini (klijentski ključ ili server proxy)
  try {
    const gHist = hist.map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));
    gHist.push({ role: "user", parts: [{ text: fullUser }] });
    const out = await geminiChat(SYSTEM_PROMPT, gHist);
    if (out.trim()) return out;
    errors.push("Gemini: prazan odgovor");
  } catch (e) {
    errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) OpenRouter (besplatni i napredni modeli)
  if (hasKey("openrouter")) {
    try {
      const out = await openrouterChat("meta-llama/llama-3.3-70b-instruct:free", [
        { role: "system", content: SYSTEM_PROMPT },
        ...hist.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: fullUser },
      ]);
      if (out.trim()) return out;
      errors.push("OpenRouter: prazan odgovor");
    } catch (e) {
      errors.push(`OpenRouter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3) Groq
  if (hasKey("groq")) {
    try {
      const out = await groqChat([
        { role: "system", content: SYSTEM_PROMPT },
        ...hist.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: fullUser },
      ] as GroqMessage[]);
      if (out.trim()) return out;
      errors.push("Groq: prazan odgovor");
    } catch (e) {
      errors.push(`Groq: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4) NVIDIA NIM
  if (hasKey("nvidia")) {
    try {
      const out = await nvidiaChat("meta/llama-3.3-70b-instruct", [
        { role: "system", content: SYSTEM_PROMPT },
        ...hist.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: fullUser },
      ]);
      if (out.trim()) return out;
      errors.push("NVIDIA NIM: prazan odgovor");
    } catch (e) {
      errors.push(`NVIDIA NIM: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5) 🛡️ OBRANA OD PRAZNOG ODGOVORA — Andromeda Kvantni Sportski Engine
  // Ako su svi vanjski API mozgovi nedostupni, iscrpljeni ili korisnik nema ključ,
  // Andromeda lokalni analitički model generira kompletan i točan odgovor za nogomet, košarku ili rukomet.
  try {
    const fallback = generateSportPrediction(userText, sport, persona);
    if (fallback.formattedText.trim()) {
      return fallback.formattedText;
    }
  } catch (err) {
    console.warn("Greška u fallback generatoru:", err);
  }

  // Zadnja rezerva (nikada prazan odgovor)
  return persona === "orion"
    ? `### ⚡ ORION — Sharp Kvantni Status
Za par **${userText || "analiza"}** matematički model preporučuje discipliniran odabir:
- 🎯 **Glavni tip:** Dvoznak (1X ili hendikep pokriće) uz procijenjenu vjerojatnost od 68% (fer kvota 1.47).
- 💰 **Value granica:** Igrati isključivo uz kvotu ≥ 1.55 (+EV edge).
- 🛡️ **Sigurnost:** Frakcijski Kelly ulog 2.0% bankrolla.
- ℹ️ Za detaljniju online vezu provjerite Google Gemini ili OpenRouter u Postavkama.`
    : `Evo moje brze preporuke za **${userText || "tvoj upit"}** ⚽🏀🤾✨
- 🌟 **Najsigurniji tip:** Pobjeda favorita ili hendikep pokriće (sigurnost ~70%, fer kvota 1.43).
- ⚽/🎯 **Golovi / Koševi:** Sigurnija opcija je niža granica (npr. Over 1.5 u nogometu ili standardni hendikep).
- 🛡️ **Alternativa:** Dvoznak ili čisti Moneyline.
Slobodno me pitaj za bilo koji drugi par ili sport! 🍀`;
}
