import { getKey } from "./storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const WORKING_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite"
];

export async function geminiChat(systemPrompt: string, history: any[]): Promise<string> {
  const key = getKey("gemini");

  // 1) Ako korisnik ima uneseni ključ u pregledniku, pokušaj direktan poziv s aktivnim modelima
  if (key) {
    for (const model of WORKING_MODELS) {
      try {
        const url = `${BASE_URL}/${model}:generateContent?key=${key}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: history,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.6, maxOutputTokens: 2500 }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) return text;
        }
      } catch (e) {
        console.warn(`Gemini direct model ${model} failed, trying next/proxy...`, e);
      }
    }
  }

  // 2) Pokušaj kroz poslužiteljski proxy (radi i sa serverskim GEMINI_API_KEY i kao CORS zaobilaznica)
  try {
    const proxyRes = await fetch("/api/public/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "X-Gemini-Key": key } : {}),
      },
      body: JSON.stringify({
        contents: history,
        system_instruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 2500 }
      })
    });

    if (proxyRes.ok) {
      const pData = await proxyRes.json();
      if (pData.text?.trim()) return pData.text.trim();
    }
  } catch (err) {
    console.warn("Gemini proxy call error:", err);
  }

  throw new Error("Google Gemini nije dostupan (provjeri ključ u Postavkama).");
}

export async function testGemini() {
  try {
    const res = await geminiChat("Odgovori točno riječju 'OK'.", [{ role: "user", parts: [{ text: "Test" }] }]);
    return { ok: true, msg: `Google Gemini je spreman (${res.slice(0, 30)})!` };
  } catch (e: any) {
    return { ok: false, msg: e.message || String(e) };
  }
}

