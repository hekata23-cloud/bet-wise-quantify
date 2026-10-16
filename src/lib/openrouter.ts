import { getKey } from "./storage";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Ožujak 2026 → listopad 2026: stari :free modeli (DeepSeek v3.1, GPT-OSS 120B,
// Qwen3 235B, Llama 4 Maverick, Gemma 3 27B) su umirovljeni. Ovo su trenutno
// živi besplatni modeli na OpenRouteru.
export const OR_MODELS = [
  { id: "openrouter/free", label: "Free Router (sam bira živi besplatni model)", free: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra (Logika)", free: true },
  { id: "thinkingmachines/inkling-small:free", label: "Inkling Small (Brzina)", free: true },
];

export function specialistDefault(): string {
  return "openrouter/free";
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
      model: model || "openrouter/free",
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
    // Model umirovljen / nedostupan za free / preopterećen → jedan spas preko
    // Free Routera, koji uvijek routa na trenutno živi besplatni model.
    const rescue = /unavailable|not found|invalid model|no allowed providers|deprecated|rate|quota|429|402|404|400|\(429\)|\(400\)|\(404\)/i.test(msg);
    if (rescue && model !== "openrouter/free") {
      const out = await call("openrouter/free", messages, opts);
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
    await openrouterChat("openrouter/free", [{ role: "user", content: "Say OK" }]);
    return { ok: true, msg: "OpenRouter Free Router je spreman!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
