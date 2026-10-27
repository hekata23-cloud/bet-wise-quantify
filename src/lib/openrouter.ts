import { getKey } from "./storage";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const OR_MODELS = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B Instruct (Besplatno)", free: true },
  { id: "google/gemini-2.0-flash-lite-preview-02-05:free", label: "Gemini 2.0 Flash Lite (Brzina)", free: true },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Logika)", free: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B Instant (Brzina)", free: true },
  { id: "openrouter/auto", label: "OpenRouter Auto Router", free: true },
];

export function specialistDefault(): string {
  return "meta-llama/llama-3.3-70b-instruct:free";
}

export interface ORCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

const FALLBACK_OR_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-lite-preview-02-05:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "openrouter/auto"
];

export async function openrouterChat(
  model: string,
  messages: ORMessage[],
  opts: ORCallOptions = {},
): Promise<string> {
  const key = getKey("openrouter");
  if (!key) throw new Error("Ključ nedostaje");

  const requested = model && model !== "openrouter/free" ? model : "meta-llama/llama-3.3-70b-instruct:free";
  const modelQueue = [requested, ...FALLBACK_OR_MODELS.filter((m) => m !== requested)];

  let lastError = "";
  for (const m of modelQueue) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key.trim()}`,
          "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://andromeda-ai.app",
          "X-Title": "Andromeda AI Oracle"
        },
        body: JSON.stringify({
          model: m,
          messages,
          temperature: opts.temperature ?? 0.6,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        })
      });

      const data = await res.json();
      if (res.ok) {
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
      lastError = data.error?.message || `Model ${m} greška`;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`OpenRouter Error: ${lastError || "Prazan odgovor"}`);
}

export async function testOpenRouter() {
  try {
    const res = await openrouterChat("meta-llama/llama-3.3-70b-instruct:free", [{ role: "user", content: "Odgovori sa 'OK'" }]);
    return { ok: true, msg: `OpenRouter je spreman (${res.slice(0, 30)})!` };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
