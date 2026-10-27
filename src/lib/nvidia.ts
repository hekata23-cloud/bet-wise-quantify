import { getKey } from "./storage";

// Koristimo proxy putanju koju tvoja aplikacija već ima ugrađenu
const URL = "/api/public/nvidia";

// Listopad 2026 — provjereno živim upitom na integrate.api.nvidia.com/v1/models.
// meta/llama-3.x modeli su ugašeni (zato Orion/Luna preko NVIDIA-e nisu odgovarali).
export const NIM_MODELS = [
  { id: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash" },
  { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B" },
  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning (brzi)" },
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B" },
  { id: "minimaxai/minimax-m3.1-flash", label: "MiniMax M3.1 Flash" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
];

export const NIM_GOAL_MODELS = ["deepseek-ai/deepseek-v4.1-flash"];

const LIVE_NIM = new Set(NIM_MODELS.map((m) => m.id));
/** Stari spremljeni (ugašeni) model iz Postavki automatski se zamjenjuje živim. */
export function liveNimModel(id?: string): string {
  return id && LIVE_NIM.has(id) ? id : NIM_MODELS[0].id;
}

/** Rezervni modeli ako odabrani ne odgovori. */
const NIM_FALLBACKS = ["nvidia/nemotron-3.5-lightning-30b-a3b", "z-ai/glm-5.3-flash", "openai/gpt-oss-20b"];

export interface NimMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NimCallOptions {
  temperature?: number;
  maxTokens?: number;
  extraFallbacks?: string[];
}

type NimResponse = {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
  error?: { message?: string } | string;
  detail?: string;
};

async function callOnce(key: string, model: string, messages: NimMessage[] | any[], opts: NimCallOptions): Promise<string> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nim-Key": key },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.5,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  } catch {
    throw new Error("NVIDIA veza blokirana (CORS/Proxy)");
  }
  const data = (await res.json().catch(() => null)) as NimResponse | null;
  if (!res.ok) {
    const m = typeof data?.error === "string" ? data.error : data?.error?.message || data?.detail || "greška";
    throw new Error(`NVIDIA ${model} (${res.status}): ${String(m).slice(0, 200)}`);
  }
  const msg = data?.choices?.[0]?.message;
  const text = (msg?.content || msg?.reasoning_content || "").trim();
  // Prije se ovdje vraćao tekst "Prazan odgovor" kao da je pravi odgovor — zato je
  // Orion/Luna pisao "Prazan odgovor" i nikad nije prešao na sljedeći AI. Sada je to greška.
  if (!text) throw new Error(`NVIDIA ${model}: prazan odgovor`);
  return text;
}

export async function nvidiaChat(
  model: string,
  messages: NimMessage[] | any[],
  opts: NimCallOptions = {},
): Promise<string> {
  const key = getKey("nvidia");
  if (!key) throw new Error("Ključ nedostaje");
  const seen = new Set<string>();
  const chain = [liveNimModel(model), ...(opts.extraFallbacks ?? []), ...NIM_FALLBACKS].filter((m) => m && !seen.has(m) && seen.add(m));
  let last = "";
  for (const m of chain) {
    try {
      return await callOnce(key, m, messages, opts);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      // Neispravan ključ — nema smisla probati druge modele.
      if (/\((401|403)\)/.test(last)) break;
    }
  }
  throw new Error(last || "NVIDIA: prazan odgovor");
}

export async function testNvidia() {
  try {
    await nvidiaChat(NIM_MODELS[0].id, [{role:"user", content:"Hi"}]);
    return { ok: true, msg: "Radi!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
