// ═══ REZERVNI MOZAK za AI Prognozu — BESPLATNO, s lanacem 3 provajdera ═══
// v5 — RASPODJELA OPTEREĆENJA NA VIŠE BESPLATNIH IZVORA:
//  1. Google Gemini (besplatni ključ s aistudio.google.com) — daleko najveći
//     besplatni limit (requests/day računa se po projektu, reset u ponoć
//     po pacifičkom vremenu), pa ide PRVI.
//  2. Groq (besplatni ključ s console.groq.com) — llama-3.1-8b-instant ima
//     14 400 zahtjeva/dan, veći modeli 1 000/dan. Groq sam bira model ako
//     je jedan preopterećen.
//  3. OpenRouter :free modeli — treća rezerva (50/dan, 20/min po računu).
// Ključna razlika u odnosu na staro ponašanje: 429 na jednom provajderu
// NE prekida posao — preskačemo na sljedećeg provajdera jer su limiti
// neovisni. Jedan klik troši 1 zahtjev na jednom provajderu (bez paralelne
// granje), pa limiti troše se sporo i raspodijeljeno.
import { geminiChat } from "./gemini";
import { groqChat } from "./groq";
import { openrouterChat, jeRateGreska, orUsageToday, FREE_DAILY_LIMIT } from "./openrouter";
import { hasKey } from "./storage";
import type { AiPrognoza } from "./ai-prognoza.functions";

export type FallbackResult = { ok: true; p: AiPrognoza } | { ok: false; error: string };

// Popis OpenRouter modela provjeren živim upitom na /models (17.10.2026).
const OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
];

const SCHEMA_TEXT = `{
  "glavniTip": string, "trziste": string, "vjerojatnost": number (0-100),
  "ferKvota": number (=100/vjerojatnost), "kvota": number|null, "evPostotak": number|null,
  "isplativo": boolean, "sigurnosnaLinija": string, "tocanRezultat": string,
  "ulogPostotak": number, "obrazlozenje": string, "rizici": string[]
}`;

const RULES = `Ti si profesionalni kvotni analitičar (sharp bettor). Odgovaraš na hrvatskom.
PRAVILA:
- Koristi ISKLJUČIVO dane vjerojatnosti modela (de-vig + Dixon-Coles). Ne izmišljaj brojeve, ne mijenjaj ih više od ±3 postotna boda.
- vjerojatnost je postotak 0-100. ferKvota = 100/vjerojatnost.
- Ako korisnik traži vrstu oklade, glavniTip MORA biti iz te vrste.
- evPostotak = (vjerojatnost/100 × kvota − 1) × 100 ako je kvota poznata, inače null. isplativo = evPostotak > 2.
- Tip ne smije proturječiti točnom rezultatu ni sigurnosnoj liniji (npr. "Manje 2.5" + rezultat 2:1 je zabranjeno).
- Ako je vjerojatnost < 60%, sigurnosnaLinija je sigurnija varijanta (dvostruka šansa, niža linija golova); inače "Nije potrebna".
- ulogPostotak: 1/4 Kelly u % banke, 0 ako nije isplativo, maksimalno 3.
- obrazlozenje: 2-4 rečenice konkretno. rizici: 1-3 kratke stavke.`;

/** Izvući JSON kandidat iz odgovora modela (podnosi markdown i tekst oko njega). */
function extractJson(out: string): string | null {
  const s = out.replace(/```[a-z]*\s*/gi, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  return s.slice(first, last + 1);
}

function parsePrognoza(out: string): AiPrognoza | null {
  const raw = extractJson(out);
  if (!raw) return null;
  let x: any = null;
  try {
    x = JSON.parse(raw);
  } catch {
    // Popravi najčešće greške modela: zapete zarede prije } ili ].
    try {
      x = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
  if (!x) return null;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const vjerojatnost = num(x.vjerojatnost);
  const ferKvota = num(x.ferKvota) ?? (vjerojatnost !== null && vjerojatnost > 0 ? 100 / vjerojatnost : null);
  const ulogPostotak = num(x.ulogPostotak) ?? 0;
  if (typeof x.glavniTip !== "string" || vjerojatnost === null || ferKvota === null) return null;
  if (typeof x.obrazlozenje !== "string" || !Array.isArray(x.rizici)) return null;
  return {
    glavniTip: String(x.glavniTip),
    trziste: typeof x.trziste === "string" ? x.trziste : "—",
    vjerojatnost,
    ferKvota,
    kvota: num(x.kvota),
    evPostotak: num(x.evPostotak),
    isplativo: Boolean(x.isplativo),
    sigurnosnaLinija: typeof x.sigurnosnaLinija === "string" ? x.sigurnosnaLinija : "—",
    tocanRezultat: typeof x.tocanRezultat === "string" ? x.tocanRezultat : "—",
    ulogPostotak,
    obrazlozenje: x.obrazlozenje,
    rizici: (x.rizici as unknown[]).filter((r): r is string => typeof r === "string").slice(0, 3),
  };
}

/** Lokalni timeout da provajder koji visi nikad ne blokira lanac. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`nema odgovora ${ms / 1000} s`)), ms),
    ),
  ]);
}

const PROVIDER_TIMEOUT_MS = 60_000;

/** Prepoznaj ograničavajuću grešku BILO kojeg provajdera (429 / quota). */
function jeRatePoruka(msg: string): boolean {
  return /429|rate.?limit|too many requests|quota|exhausted|dosegao limit|resource/i.test(msg);
}

export async function runAiPrognozaFallback(input: {
  utakmica: string;
  vrstaOklade: string;
  kontekst: string;
}, onProgress?: (m: string) => void): Promise<FallbackResult> {
  const sys = `${RULES}

FORMAT ODGOVORA: vrati ISKLJUČIVO jedan JSON objekt, bez markdowna, bez obrazloženja van JSON-a, po ovoj shemi:
${SCHEMA_TEXT}`;
  const user = `Utakmica: ${input.utakmica}\nTražena vrsta oklade: ${input.vrstaOklade || "bilo koja (najbolji tip)"}\n\nPodaci modela:\n${input.kontekst}`;

  const nemaNijednog =
    !hasKey("gemini") && !hasKey("groq") && !hasKey("openrouter");
  if (nemaNijednog) {
    return {
      ok: false,
      error:
        "Za besplatni rezervni mozak dodaj u Postavkama Google Gemini ključ (besplatan, aistudio.google.com/apikey) — po mogućnosti i Groq (console.groq.com) i OpenRouter kao rezerve.",
    };
  }

  /** Jedan pokušaj: pozovi provajdera i parsiraj odgovor. */
  const pokusaj = async (provajder: string): Promise<AiPrognoza> => {
    if (provajder === "gemini") {
      const out = await withTimeout(
        geminiChat(sys, [{ role: "user", parts: [{ text: user }] }]),
        PROVIDER_TIMEOUT_MS,
      );
      const p = parsePrognoza(out);
      if (p) return p;
      throw new Error("Gemini: nevažeći ili prazan odgovor");
    }
    if (provajder === "groq") {
      const out = await withTimeout(
        groqChat([
          { role: "system", content: sys },
          { role: "user", content: user },
        ]),
        PROVIDER_TIMEOUT_MS,
      );
      const p = parsePrognoza(out);
      if (p) return p;
      throw new Error("Groq: nevažeći ili prazan odgovor");
    }
    // openrouter
    const out = await withTimeout(
      openrouterChat(OPENROUTER_MODELS[0], [
        { role: "system", content: sys },
        { role: "user", content: user },
      ], { maxTokens: 1400, temperature: 0.3 }),
      PROVIDER_TIMEOUT_MS,
    );
    const p = parsePrognoza(out);
    if (p) return p;
    throw new Error("OpenRouter: nevažeći ili prazan odgovor");
  };

  // Redoslijed: Gemini prvi (najveći besplatni limit), pa Groq, pa OpenRouter.
  const lanac: string[] = [];
  if (hasKey("gemini")) lanac.push("gemini");
  if (hasKey("groq")) lanac.push("groq");
  if (hasKey("openrouter")) lanac.push("openrouter");

  const errs: string[] = [];
  for (const provajder of lanac) {
    onProgress?.(`Rezervni mozak: pokušavam ${provajder.toUpperCase()}…`);
    try {
      const p = await pokusaj(provajder);
      return { ok: true, p };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Rate greška → NE stajemo: limiti su neovisni po provajderu,
      // pa idemo na sljedećeg (on možda još ima slobodnih zahtjeva).
      if (jeRatePoruka(msg) || jeRateGreska(msg)) {
        errs.push(`${provajder}: ograničenje zahtjeva (429/quota)`);
        continue;
      }
      errs.push(`${provajder}: ${msg}`);
    }
  }

  const openrouterNapomena =
    hasKey("openrouter") && orUsageToday() >= FREE_DAILY_LIMIT
      ? ` OpenRouter dnevni limit (${FREE_DAILY_LIMIT}) vjerojatno potrošen — reset u 02:00.`
      : "";
  const jedinstvene = [...new Set(errs)].slice(0, 4).join(" | ");
  return { ok: false, error: `Rezervni mozak nije uspio (${lanac.join(" → ")}). ${jedinstvene}.${openrouterNapomena}` };
}

