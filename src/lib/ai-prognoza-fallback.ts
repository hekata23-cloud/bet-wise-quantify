// ═══ REZERVNI MOZAK za AI Prognozu — BESPLATNO, lanac 3 provajdera ═══
// v6 — POPRAVAK PRAZNIH ODGOVORA:
//  - Gemini: gemini-3.8-flash RAZMIŠLJA prije odgovora — stari kod dao je
//    samo 2500 tokena, misli su pojele cijeli budžet pa je tekst bio prazan.
//    Sada: budžet 16384, thinking na "low", JSON način rada (responseMimeType),
//    čitaju se SVI dijelovi odgovora, a finishReason/blockReason se javljaju.
//  - Groq: dodan JSON način (response_format) i čitanje "reasoning" polja
//    (gpt-oss modeli) ako je content prazan; temperature 0.3.
//  - Redoslijed: Gemini → Groq → OpenRouter; 429 na jednom ne staje, ide se
//    na sljedećeg. Jedan klik = 1 zahtjev na jednom provajderu.
import { getKey, hasKey } from "./storage";
import { openrouterChat, jeRateGreska, orUsageToday, FREE_DAILY_LIMIT } from "./openrouter";
import type { AiPrognoza } from "./ai-prognoza.functions";

export type FallbackResult = { ok: true; p: AiPrognoza } | { ok: false; error: string };

const OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
];

// gemini-3.7-flash i 3.5-flash su umirovljeni (auto-preusmjerenje na 3.8/3.6).
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",  // 1 000 zahtjeva/dan — najpametniji
  "llama-3.1-8b-instant",     // 14 400 zahtjeva/dan — najizdašniji limit
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
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

/** Izvući JSON kandidat iz odgovora (podnosi markdown i tekst oko njega). */
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`nema odgovora ${ms / 1000} s`)), ms),
    ),
  ]);
}

const PROVIDER_TIMEOUT_MS = 60_000;

function jeRatePoruka(msg: string): boolean {
  return /429|rate.?limit|too many requests|quota|exhausted|dosegao limit|resource/i.test(msg);
}

// ─────────────────────────── GEMINI ───────────────────────────
async function geminiJSON(sys: string, user: string): Promise<string> {
  const key = getKey("gemini");
  if (!key) throw new Error("Gemini ključ nedostaje (Postavke).");
  let lastErr = "Gemini: prazan odgovor";
  for (const MODEL of GEMINI_MODELS) {
    for (const sRazmisljanjem of [true, false]) {
      const gen: any = {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      };
      if (sRazmisljanjem) gen.thinkingConfig = { thinkingLevel: "low" };
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: user }] }],
              system_instruction: { parts: [{ text: sys }] },
              generationConfig: gen,
            }),
          },
        );
      } catch (e) {
        throw new Error(`Gemini mreža: ${e instanceof Error ? e.message : String(e)}`);
      }
      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        const m = data?.error?.message || "Gemini Error";
        lastErr = `(${res.status}) ${m}`;
        // Ako model ne prihvaća thinkingLevel, pokušaj bez razmišljanja.
        if (res.status === 400 && sRazmisljanjem && /thinking/i.test(String(m))) continue;
        break; // idući model
      }
      const cand = data?.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      const text = parts
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim();
      if (text) return text;
      const fr = cand?.finishReason || data?.promptFeedback?.blockReason;
      lastErr = fr ? `Gemini: prazan odgovor (finishReason=${fr})` : "Gemini: prazan odgovor";
      break;
    }
  }
  throw new Error(lastErr);
}

// ─────────────────────────── GROQ ───────────────────────────
async function groqJSON(sys: string, user: string): Promise<string> {
  const key = getKey("groq");
  if (!key) throw new Error("Groq ključ nedostaje (Postavke).");
  let lastErr = "Groq: prazan odgovor";
  for (const MODEL of GROQ_MODELS) {
    for (const sJsonem of [true, false]) {
      let res: Response;
      try {
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: user },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            ...(sJsonem ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (e) {
        throw new Error(`Groq mreža: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!res.ok) {
        const t = await res.text();
        let m = t.slice(0, 200);
        try {
          const j = JSON.parse(t);
          if (j?.error?.message) m = String(j.error.message);
        } catch { /* sirovo */ }
        lastErr = `(${res.status}) ${m}`;
        // Ako model ne podržava JSON način, pokušaj bez njega.
        if (res.status === 400 && sJsonem) continue;
        break;
      }
      const j: any = await res.json().catch(() => null);
      const msg = j?.choices?.[0]?.message;
      const text =
        (typeof msg?.content === "string" ? msg.content : "") ||
        (typeof msg?.reasoning === "string" ? msg.reasoning : "");
      if (text.trim()) return text;
      lastErr = "Groq: prazan odgovor";
      break;
    }
  }
  throw new Error(lastErr);
}

// ─────────────────────── GLAVNI LANAC ───────────────────────
export async function runAiPrognozaFallback(input: {
  utakmica: string;
  vrstaOklade: string;
  kontekst: string;
}, onProgress?: (m: string) => void): Promise<FallbackResult> {
  const sys = `${RULES}

FORMAT ODGOVORA: vrati ISKLJUČIVO jedan JSON objekt, bez markdowna, bez obrazloženja van JSON-a, po ovoj shemi:
${SCHEMA_TEXT}`;
  const user = `Utakmica: ${input.utakmica}\nTražena vrsta oklade: ${input.vrstaOklade || "bilo koja (najbolji tip)"}\n\nPodaci modela:\n${input.kontekst}`;

  if (!hasKey("gemini") && !hasKey("groq") && !hasKey("openrouter")) {
    return {
      ok: false,
      error:
        "Za besplatni rezervni mozak dodaj u Postavkama Google Gemini ključ (besplatan, aistudio.google.com/apikey) — po mogućnosti i Groq (console.groq.com) i OpenRouter kao rezerve.",
    };
  }

  const pokusaj = async (provajder: string): Promise<AiPrognoza> => {
    let out: string;
    if (provajder === "gemini") {
      out = await withTimeout(geminiJSON(sys, user), PROVIDER_TIMEOUT_MS);
    } else if (provajder === "groq") {
      out = await withTimeout(groqJSON(sys, user), PROVIDER_TIMEOUT_MS);
    } else {
      out = await withTimeout(
        openrouterChat(OPENROUTER_MODELS[0], [
          { role: "system", content: sys },
          { role: "user", content: user },
        ], { maxTokens: 1400, temperature: 0.3 }),
        PROVIDER_TIMEOUT_MS,
      );
    }
    const p = parsePrognoza(out);
    if (p) return p;
    throw new Error(`${provajder}: odgovor nije valjani JSON predviđanja`);
  };

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

