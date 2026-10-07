import { createFileRoute } from "@tanstack/react-router";

// Proxy za football-data.org — preglednik ne može zvati taj API izravno
// (nema CORS zaglavlja), pa zahtjev ide kroz naš server.
// Ključ korisnika stiže u zaglavlju X-Auth-Token i nigdje se ne pohranjuje.
const BASE = "https://api.football-data.org/v4";

export const Route = createFileRoute("/api/public/football-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "";
        const token = request.headers.get("x-auth-token") ?? "";
        if (!token) return new Response(JSON.stringify({ message: "Nedostaje ključ" }), { status: 401 });
        if (!path.startsWith("/")) {
          return new Response(JSON.stringify({ message: "Neispravna putanja" }), { status: 400 });
        }
        const qs = new URLSearchParams(url.searchParams);
        qs.delete("path");
        const target = `${BASE}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
        try {
          const upstream = await fetch(target, { headers: { "X-Auth-Token": token } });
          const body = await upstream.text();
          return new Response(body, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ message: `Proxy greška: ${e instanceof Error ? e.message : String(e)}` }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
