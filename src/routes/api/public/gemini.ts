import { createFileRoute } from "@tanstack/react-router";

// Poslužiteljski proxy za Google Gemini (preuzeto iz Orion 8 / Ana 4, poboljšano).
// - Koristi ključ iz preglednika (X-Gemini-Key) ili GEMINI_API_KEY s poslužitelja.
// - Rješava CORS / mrežne blokade kod direktnog poziva iz preglednika.
// - Čita SVE dijelove odgovora i ima timeout po modelu.
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
];
const MAX_BODY = 400_000; // zaštita od zloupotrebe ogromnim zahtjevima

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/gemini")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientKey = request.headers.get("x-gemini-key")?.trim() ?? "";
        const serverKey = process.env.GEMINI_API_KEY?.trim() ?? "";
        const apiKey = clientKey || serverKey;
        if (!apiKey) {
          return json(
            { ok: false, error: { message: "Nedostaje Gemini API ključ (Postavke)." } },
            401,
          );
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY) {
          return json({ ok: false, error: { message: "Zahtjev je prevelik." } }, 413);
        }
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: { message: "Neispravan JSON format" } }, 400);
        }
        if (!body || !Array.isArray(body.contents)) {
          return json({ ok: false, error: { message: "Nedostaje 'contents'." } }, 400);
        }
        const safeBody = {
          contents: body.contents,
          system_instruction: body.system_instruction,
          generationConfig: body.generationConfig ?? { temperature: 0.6, maxOutputTokens: 8192 },
        };

        let lastErr = "";
        for (const model of MODELS) {
          try {
            const upstream = await fetch(
              `${BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(safeBody),
                signal: AbortSignal.timeout(45000),
              },
            );
            const data: any = await upstream.json().catch(() => null);
            if (upstream.ok) {
              const parts = data?.candidates?.[0]?.content?.parts ?? [];
              const text = parts
                .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
                .join("")
                .trim();
              if (text) return json({ ok: true, text, model }, 200);
              lastErr = `Model ${model} nije vratio tekst`;
            } else {
              lastErr = data?.error?.message || `Model ${model}: greška ${upstream.status}`;
              if (upstream.status === 401 || upstream.status === 403) break; // loš ključ — ne troši dalje
            }
          } catch (e: any) {
            lastErr = e?.message || String(e);
          }
        }
        return json({ ok: false, error: { message: `Gemini poziv nije uspio: ${lastErr}` } }, 502);
      },
    },
  },
});
