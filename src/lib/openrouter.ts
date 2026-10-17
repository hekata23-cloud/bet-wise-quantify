import { getKey } from "./storage";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Popis modela provjeren ŽIVIM upitom na https://openrouter.ai/api/v1/models
// (17.10.2026) — svi slugovi postoje (besplatnih ima ukupno 16).
export const OR_MODELS = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (Glavni)", free: true },
  { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1", free: true },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B", free: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B", free: true },
  { id: "dots-studio/dots-3-note-preview:free", label: "Dots 3 Note Preview", free: true },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron Nano Omni 30B", free: true },
  { id: "xingchen-agi/xing4.0-29b-a4b:free", label: "Xing 4.0 29B", free: true },
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL", free: true },
];

export function specialistDefault(): string {
  return "google/gemma-4-31b-it:free";
}

export interface ORCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

/** Vlastiti timeout po pozivu — model koji visi nikad ne blokira lanac. */
const CALL_TIMEOUT_MS = 40_000;

/** Jedan poziv prema OpenRouteru; baca grešku s porukom provajdera. */
async function call(model: string, messages: ORMessage[], opts: ORCallOptions): Promise<string> {
  const key = getKey("openrouter");
  if (!key) throw new Error("Ključ nedostaje");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "X-Title": "Andromeda AI Oracle",
      },
      body: JSON.stringify({
        model: model || specialistDefault(),
        messages,
        temperature: opts.temperature ?? 0.6,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error(`${model}: nema odgovora ${CALL_TIMEOUT_MS / 1000} s`);
    throw e;
  } finally {
    clearTimeout(t);
  }

  const data = await res.json().catch(() => null as unknown);
  if (!res.ok) {
    const m = (data as any)?.error?.message;
    throw new Error(`(${res.status}) ${m || "OpenRouter Error"}`);
  }
  const ch = (data as any)?.choices?.[0];
  // Provider greška krije se unutar choices (npr. "no allowed providers").
  if (ch?.error?.message) throw new Error(ch.error.message);
  const content = typeof ch?.message?.content === "string" ? ch.message.content.trim() : "";
  if (content) return content;
  // Neki besplatni reasoning modeli vrate tekst u "reasoning" polju.
  const reasoning = typeof ch?.message?.reasoning === "string" ? ch.message.reasoning.trim() : "";
  if (reasoning) return reasoning;
  // Prazan odgovor je jasna greška — ne šuti.
  throw new Error(`${model}: prazan odgovor`);
}

/** Spas: samo 2 rezervna modela, da lanac ne traje duže od potrebne mjere. */
const RESCUE_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
];

export async function openrouterChat(
  model: string,
  messages: ORMessage[],
  opts: ORCallOptions = {},
): Promise<string> {
  try {
    return await call(model, messages, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Model umirovljen / nedostupan / preopterećen / spor / prazan → spas preko
    // živih besplatnih modela (max 2, da ukupno vrijeme ostane pod kontrolom).
    const rescue = /unavailable|not found|invalid model|no allowed providers|deprecated|agentic|rate|quota|429|402|404|400|prazan odgovor|nema odgovora/i.test(msg);
    if (rescue) {
      for (const m of RESCUE_MODELS) {
        if (m === model) continue;
        try {
          const out = await call(m, messages, opts);
          if (out) return out;
        } catch { /* idemo na sljedeći */ }
      }
    }
    // Eksplicitni rezervni modeli iz poziva.
    for (const fb of opts.extraFallbacks ?? []) {
      try {
        const out = await call(fb, messages, opts);
        if (out) return out;
      } catch { /* idemo dalje */ }
    }
    throw e;
  }
}

export async function testOpenRouter() {
  try {
    await openrouterChat(specialistDefault(), [{ role: "user", content: "Say OK" }]);
    return { ok: true, msg: "OpenRouter spreman — Gemma 4 31B odgovara!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
