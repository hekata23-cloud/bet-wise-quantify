import { getKey } from "./storage";

// Koristimo proxy putanju koju tvoja aplikacija već ima ugrađenu
const URL = "/api/public/nvidia";

export const NIM_MODELS = [
  { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
  { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B" }
];

export const NIM_GOAL_MODELS = ["meta/llama-3.1-8b-instruct"];

export interface NimMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NimCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

export async function nvidiaChat(
  model: string,
  messages: NimMessage[] | any[],
  opts: NimCallOptions = {},
): Promise<string> {
  const key = getKey("nvidia");
  if (!key) throw new Error("Ključ nedostaje");

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nim-Key": key },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.5,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "Prazan odgovor";
  } catch (e: any) { throw new Error("NVIDIA veza blokirana (CORS/Proxy)"); }
}

export async function testNvidia() {
  try {
    await nvidiaChat("meta/llama-3.1-8b-instruct", [{role:"user", content:"Hi"}]);
    return { ok: true, msg: "Radi!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
