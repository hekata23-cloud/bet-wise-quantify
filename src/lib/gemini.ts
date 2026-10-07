import { getKey } from "./storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function geminiChat(systemPrompt: string, history: any[]): Promise<string> {
  const key = getKey("gemini");
  if (!key) throw new Error("Nedostaje Google API ključ");

  const MODEL = "gemini-3.8-flash";
  const url = `${BASE_URL}/${MODEL}:generateContent?key=${key}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: history,
      system_instruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.6, maxOutputTokens: 2500 }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini Error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

export async function testGemini() {
  try {
    await geminiChat("Say OK", [{ role: "user", parts: [{ text: "Test" }] }]);
    return { ok: true, msg: "Google Gemini 3.8 Flash radi!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
