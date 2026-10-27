// Groq API klijent — brzi fallback mozak (Llama 3.3 70B Versatile + rezerve).
import { getKey } from "./storage";

const URL = "https://api.groq.com/openai/v1/chat/completions";

/** Redoslijed modela: ako Groq ugasi ili preoptereti jedan, ide sljedeći. */
export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function humanizeGroqError(status: number, body: string): string {
  let msg = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    if (j.error?.message) msg = j.error.message;
  } catch {
    /* raw */
  }
  if (status === 401 || status === 403)
    return "Groq ključ nije važeći (oblik gsk_…). Provjeri ga u Postavkama.";
  if (status === 429) return "Groq je dosegao limit zahtjeva. Pokušaj za par sekundi.";
  return `Groq greška (${status}): ${msg.slice(0, 200)}`;
}

export async function groqChat(messages: GroqMessage[]): Promise<string> {
  const key = getKey("groq");
  if (!key) throw new Error("Nedostaje Groq ključ");
  let lastErr = "";
  for (const model of GROQ_MODELS) {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const err = humanizeGroqError(res.status, await res.text());
      if (res.status === 401 || res.status === 403) throw new Error(err);
      lastErr = err;
      continue;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (text) return text;
    lastErr = "Groq je vratio prazan odgovor";
  }
  throw new Error(lastErr || "Groq je vratio prazan odgovor");
}


export async function testGroq(): Promise<{ ok: boolean; msg: string }> {
  try {
    const t = await groqChat([
      { role: "system", content: "Odgovori samo riječju 'OK'." },
      { role: "user", content: "test" },
    ]);
    return { ok: true, msg: `Radi: ${t.trim().slice(0, 60)}` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}