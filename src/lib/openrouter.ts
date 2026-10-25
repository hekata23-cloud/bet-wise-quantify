import { getKey } from "./storage";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const OR_MODELS = [
  { id: "openrouter/free", label: "OpenRouter Free Router (Automatski bira najbolji besplatni model)", free: true },
  { id: "nvidia/nemotron-3-ultra:free", label: "Nvidia Nemotron-3 Ultra (Logika)", free: true },
  { id: "minimax/minimax-m3:free", label: "Minimax-M3 (Brzina)", free: true },
];

export function specialistDefault(): string {
  return "openrouter/free";
}

export interface ORCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

export async function openrouterChat(
  model: string,
  messages: ORMessage[],
  opts: ORCallOptions = {},
): Promise<string> {
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
  if (!res.ok) throw new Error(data.error?.message || "OpenRouter Error");
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function testOpenRouter() {
  try {
    await openrouterChat("openrouter/free", [{ role: "user", content: "Say OK" }]);
    return { ok: true, msg: "OpenRouter Free Router je spreman!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
