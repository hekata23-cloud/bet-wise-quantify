import { createFileRoute } from "@tanstack/react-router";

// Proxy za NVIDIA NIM (integrate.api.nvidia.com) — preglednik ne može zvati taj
// API izravno jer nema CORS zaglavlja (zato je test javljao "nema mreže").
// Korisnikov ključ stiže u zaglavlju X-Nim-Key i nigdje se ne pohranjuje.
const TARGET = "https://integrate.api.nvidia.com/v1/chat/completions";

export const Route = createFileRoute("/api/public/nvidia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-nim-key") ?? "";
        if (!key) {
          return new Response(JSON.stringify({ error: { message: "Nedostaje NVIDIA NIM ključ" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const body = await request.text();
        let lastErr = "";
        // Do 3 pokušaja: upstream povremeno vrati 429/5xx ili prekine vezu.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const upstream = await fetch(TARGET, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${key.trim()}`,
              },
              body,
              signal: AbortSignal.timeout(90000),
            });
            const text = await upstream.text();
            if ((upstream.status === 429 || upstream.status >= 500) && attempt < 2) {
              lastErr = `${upstream.status}: ${text.slice(0, 160)}`;
              await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
              continue;
            }
            return new Response(text, {
              status: upstream.status,
              headers: { "Content-Type": "application/json" },
            });
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
            await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
          }
        }
        return new Response(
          JSON.stringify({ error: { message: `Proxy greška prema NVIDIA NIM-u: ${lastErr}` } }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
