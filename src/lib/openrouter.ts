import { getKey } from "./storage";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Popis modela provjeren ŽIVIM upitom na https://openrouter.ai/api/v1/models
// (16.10.2026). "openrouter/free" NE postoji kao model — uklonjen. Inkling:free
// je samo za agentic aplikacije (403), Ultra 550B prespor (timeout) — uklonjeni.
export const OR_MODELS = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (Glavni)", free: true },
  { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1", free: true },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B", free: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B", free: true },
  { id: "dots-studio/dots-3-note-preview:free", label: "Dots 3 Note Preview", free: true },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron Nano Omni 30B", free: true },
];

export function specialistDefault(): string {
  return "google/gemma-4-31b-it:free";
}

export interface ORCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

/** Jedan poziv prema OpenRouteru; baca grešku s porukom provajdera. */
async function call(model: string, messages: ORMessage[], opts: ORCallOptions): Promise<string> {
  const key = getKey("openrouter");
  if (!key) throw new Error("Ključ nedostaje");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "X-Title": "Andromeda AI Oracle"
    },
    body: JSON.stringify({
      model: model || specialistDefault(),
      messages,
      temperature: opts.temperature ?? 0.6,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`(${res.status}) ${data.error?.message || "OpenRouter Error"}`);
  const m = data.choices?.[0];
  // Provider greška krije se unutar choices (npr. "no allowed providers").
  if (m?.error?.message) throw new Error(m.error.message);
  const content = m?.message?.content?.trim();
  if (content) return content;
  // Neki besplatni reasoning modeli vrate tekst u "reasoning" polju.
  const reasoning = typeof m?.message?.reasoning === "string" ? m.message.reasoning.trim() : "";
  return reasoning;
}

export async function openrouterChat(
  model: string,
  messages: ORMessage[],
  opts: ORCallOptions = {},
): Promise<string> {
  try {
    return await call(model, messages, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Model umirovljen / nedostupan / preopterećen → jedan spas preko glavnog
    // živog besplatnog modela (Gemma 4 31B — provjeren danas na OpenRouteru).
    const rescue = /unavailable|not found|invalid model|no allowed providers|deprecated|agentic|rate|quota|429|402|404|400|\(429\)|\(400\)|\(404\)/i.test(msg);
    const main = specialistDefault();
    if (rescue && model !== main) {
      const out = await call(main, messages, opts);
      if (out) return out;
    }
    // Eksplicitni rezervni modeli iz poziva (npr. specialisti za tržište).
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
