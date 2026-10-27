import { getKey } from "./storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// gemini-3.8-flash RAZMIŠLJA prije odgovora — misli troše output budžet,
// pa je budžet uvećan na 16384 i razmišljanje je na najnižem nivou.
// Listopad 2026: 3.8 Flash je aktualni besplatni Flash (3.7 → 3.8, 3.5 → 3.6);
// stari 1.5/2.0 modeli su ugašeni pa su uklonjeni iz lanca.
const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export async function geminiChat(systemPrompt: string, history: any[]): Promise<string> {
  const key = getKey("gemini");
  if (!key) throw new Error("Nedostaje Google API ključ");

  let lastErr = "Gemini: prazan odgovor";
  for (const MODEL of MODELS) {
    for (const sRazmisljanjem of [true, false]) {
      const gen: any = { temperature: 0.6, maxOutputTokens: 16384 };
      if (sRazmisljanjem) gen.thinkingConfig = { thinkingLevel: "low" };
      const response = await fetch(
        `${BASE_URL}/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: history,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: gen,
          }),
        },
      );
      const data = await response.json().catch(() => null as any);
      if (!response.ok) {
        const m = data?.error?.message || "Gemini Error";
        lastErr = `(${response.status}) ${m}`;
        // Ako model ne prihvaća thinkingLevel, pokušaj bez razmišljanja.
        if (response.status === 400 && sRazmisljanjem && /thinking/i.test(String(m))) continue;
        break; // idući model
      }
      const cand = data?.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      // Čitaju se SVI dijelovi odgovora, ne samo prvi.
      const text = parts
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim();
      if (text) return text;
      const fr = cand?.finishReason || data?.promptFeedback?.blockReason;
      lastErr = fr ? `Gemini: prazan odgovor (finishReason=${fr})` : "Gemini: prazan odgovor";
      break;
    }
  }
  throw new Error(lastErr);
}

export async function testGemini() {
  try {
    await geminiChat("Say OK", [{ role: "user", parts: [{ text: "Test" }] }]);
    return { ok: true, msg: "Google Gemini 3.8 Flash radi!" };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
