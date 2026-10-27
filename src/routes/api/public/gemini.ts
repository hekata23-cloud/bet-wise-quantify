import { createFileRoute } from "@tanstack/react-router";

// Proxy za Google Gemini — omogućuje rad i kada korisnik ima ključ u pregledniku
// i automatski fallback na GEMINI_API_KEY sa poslužitelja (AI Studio okruženje).
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const CANDIDATE_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite"
];

export const Route = createFileRoute("/api/public/gemini")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientKey = request.headers.get("x-gemini-key")?.trim() ?? "";
        const serverKey = process.env.GEMINI_API_KEY?.trim() ?? "";
        const apiKey = clientKey || serverKey;

        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: { message: "Nedostaje Gemini API ključ (nije postavljen ni u pregledniku ni na poslužitelju)" } }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }

        let bodyJson: any;
        try {
          bodyJson = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: { message: "Neispravan JSON format" } }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        let lastErr = "";
        for (const model of CANDIDATE_MODELS) {
          try {
            const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
            const upstream = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodyJson),
              signal: AbortSignal.timeout(45000),
            });

            const data = await upstream.json();
            if (upstream.ok) {
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
              if (text) {
                return new Response(JSON.stringify({ ok: true, text, model }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              }
            }

            lastErr = data.error?.message || `Model ${model} nije vratio tekst`;
          } catch (e: any) {
            lastErr = e?.message || String(e);
          }
        }

        return new Response(
          JSON.stringify({ ok: false, error: { message: `Gemini poziv nije uspio: ${lastErr}` } }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
