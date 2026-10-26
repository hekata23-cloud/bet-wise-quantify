// Hugging Face Inference Router (OpenAI-kompatibilan chat endpoint).
// Uključen lanac rezervnih modela: ako model nije serviran (HTTP 400/404),
// automatski se prelazi na sljedeći.
import { getKey } from "./storage";

const URL = "https://router.huggingface.co/v1/chat/completions";

export interface HFModel {
  id: string;
  label: string;
  note?: string;
}

// Najnoviji modeli koje HF Router trenutno servira preko besplatnog tiera.
export const HF_MODELS: HFModel[] = [
  { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct — analitičar" },
  { id: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1 — matematika/predikcije" },
  { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1 — chain of thought" },
  { id: "Qwen/Qwen3-235B-A22B-Instruct-2507", label: "Qwen3 235B A22B — Poisson/EV" },
  { id: "Qwen/Qwen3-32B", label: "Qwen3 32B — brzi reasoning" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B — brzi" },
  { id: "moonshotai/Kimi-K2-Instruct", label: "Kimi K2 Instruct" },
  { id: "zai-org/GLM-4.5-Air", label: "GLM 4.5 Air — kalkulator" },
  { id: "mistralai/Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2 24B" },
  { id: "meta-llama/Llama-3.1-8B-Instruct", label: "Llama 3.1 8B Instruct — najbrži" },
  { id: "google/gemma-2-9b-it", label: "Gemma 2 9B" },
];

const FALLBACK_CHAIN = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "Qwen/Qwen3-32B",
  "openai/gpt-oss-20b",
  "meta-llama/Llama-3.1-8B-Instruct",
];

export interface HFMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

class HFError extends Error {
  retryable: boolean;
  constructor(msg: string, retryable: boolean) {
    super(msg);
    this.retryable = retryable;
  }
}

async function callOnce(
  key: string,
  model: string,
  messages: HFMessage[],
  opts: { temperature?: number; maxTokens?: number },
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 1500,
        stream: false,
      }),
    });
  } catch {
    throw new HFError("Nema mreže prema Hugging Face routeru.", false);
  }

  const bodyText = await res.text();
  let parsed: {
    choices?: { message?: { content?: string | null; reasoning?: string | null } }[];
    error?: string | { message?: string };
  } = {};
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    /* nije JSON */
  }
  const errMsg =
    typeof parsed.error === "string" ? parsed.error : parsed.error?.message || bodyText.slice(0, 200);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new HFError("Hugging Face token odbijen. Treba token tipa 'Read' ili 'Fine-grained' s pravom 'Make calls to Inference Providers'.", false);
    if (res.status === 429) throw new HFError("Hugging Face rate limit (429). Pokušaj za par sekundi.", true);
    if (res.status === 402)
      throw new HFError("Hugging Face: potrošen besplatni mjesečni kredit za Inference Providers.", false);
    if (res.status === 400 || res.status === 404)
      throw new HFError(`Model "${model}" nije serviran (${res.status}): ${errMsg}`, true);
    throw new HFError(`Hugging Face ${res.status}: ${errMsg}`, true);
  }

  const m = parsed.choices?.[0]?.message;
  const text = (m?.content || m?.reasoning || "").trim();
  if (!text) throw new HFError(`Model "${model}" je vratio prazan odgovor.`, true);
  return text;
}

export async function huggingfaceChat(
  model: string,
  messages: HFMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const key = getKey("huggingface");
  if (!key) throw new Error("Nedostaje Hugging Face token");
  const seen = new Set<string>();
  const chain = [model, ...FALLBACK_CHAIN].filter((m) => {
    if (!m || seen.has(m)) return false;
    seen.add(m);
    return true;
  });
  let last = "";
  for (const m of chain) {
    try {
      return await callOnce(key, m, messages, opts);
    } catch (e) {
      if (e instanceof HFError && !e.retryable) throw new Error(e.message);
      last = e instanceof Error ? e.message : String(e);
      console.warn("HF fallback:", last);
    }
  }
  throw new Error(`Hugging Face nije uspio ni s jednim modelom. Zadnja greška: ${last}`);
}

export async function testHuggingface(): Promise<{ ok: boolean; msg: string }> {
  try {
    const t = await huggingfaceChat(
      HF_MODELS[0].id,
      [
        { role: "system", content: "Odgovaraj na hrvatskom." },
        { role: "user", content: "Napiši samo riječ: OK" },
      ],
      { maxTokens: 40, temperature: 0 },
    );
    return { ok: true, msg: `Hugging Face radi: ${t.trim().slice(0, 80)}` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}
