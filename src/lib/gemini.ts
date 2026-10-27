import { getKey } from "./storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// gemini-3.8-flash RAZMIŠLJA prije odgovora — misli troše output budžet,
// pa je budžet uvećan na 16384 i razmišljanje je na najnižem nivou.
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
];

async function direktno(key: string, systemPrompt: string, history: any[]): Promise<string> {
  let lastErr = "Gemini: prazan odgovor";
  for (const MODEL of MODELS) {
    for (const sRazmisljanjem of [true, false]) {
      const gen: any = { temperature: 0.6, maxOutputTokens: 16384 };
      if (sRazmisljanjem) gen.thinkingConfig = { thinkingLevel: "low" };
      let response: Response;
      try {
        response = await fetch(
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
      } catch (e: any) {
        // Mrežna/CORS greška — nema smisla probati ostale modele direktno.
        throw new Error(`Mrežna greška: ${e?.message ?? "nepoznato"}`);
      }
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

// NOVO (iz Orion 8 / Ana 4): rezervni put preko poslužiteljskog proxyja.
async function prekoProxyja(key: string, systemPrompt: string, history: any[]): Promise<string> {
  const res = await fetch("/api/public/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Gemini-Key": key } : {}) },
    body: JSON.stringify({
      contents: history,
      system_instruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
    }),
  });
  const data: any = await res.json().catch(() => null);
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (res.ok && text) return text;
  throw new Error(data?.error?.message || `Gemini proxy greška ${res.status}`);
}

export async function geminiChat(systemPrompt: string, history: any[]): Promise<string> {
  const key = getKey("gemini");
  let direktnaGreska = "";
  if (key) {
    try {
      return await direktno(key, systemPrompt, history);
    } catch (e: any) {
      direktnaGreska = e?.message ?? String(e);
    }
  }
  try {
    return await prekoProxyja(key, systemPrompt, history);
  } catch (e: any) {
    if (!key) throw new Error("Nedostaje Google API ključ (Postavke).");
    throw new Error(direktnaGreska || e?.message || "Google Gemini nije dostupan.");
  }
}

export async function testGemini() {
  try {
    await geminiChat("Say OK", [{ role: "user", parts: [{ text: "Test" }] }]);
    return { ok: true, msg: "Google Gemini radi!" };
  } catch (e: any) {
    return { ok: false, msg: e.message };
  }
}
