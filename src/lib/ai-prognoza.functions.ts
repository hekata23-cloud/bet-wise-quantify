import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI prognoza preko Lovable AI Gateway (Responses API, streaming).
 * Model dobiva već izračunate (de-vig + Dixon-Coles) vjerojatnosti i mora ih poštovati,
 * pa je prognoza usklađena s matematikom i ne proturječi sama sebi.
 * v2: 45 s ukupni timeout — ako AI visi, odmah puštamo besplatni rezervni mozak.
 */
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["glavniTip", "trziste", "vjerojatnost", "ferKvota", "kvota", "evPostotak", "isplativo", "sigurnosnaLinija", "tocanRezultat", "ulogPostotak", "obrazlozenje", "rizici"],
  properties: {
    glavniTip: { type: "string" },
    trziste: { type: "string" },
    vjerojatnost: { type: "number" },
    ferKvota: { type: "number" },
    kvota: { type: ["number", "null"] },
    evPostotak: { type: ["number", "null"] },
    isplativo: { type: "boolean" },
    sigurnosnaLinija: { type: "string" },
    tocanRezultat: { type: "string" },
    ulogPostotak: { type: "number" },
    obrazlozenje: { type: "string" },
    rizici: { type: "array", items: { type: "string" } },
  },
} as const;

export type AiPrognoza = {
  glavniTip: string; trziste: string; vjerojatnost: number; ferKvota: number; kvota: number | null;
  evPostotak: number | null; isplativo: boolean; sigurnosnaLinija: string; tocanRezultat: string;
  ulogPostotak: number; obrazlozenje: string; rizici: string[];
};

export const getAiPrognoza = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      utakmica: z.string().min(3).max(200),
      vrstaOklade: z.string().max(100),
      kontekst: z.string().max(8000),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; p: AiPrognoza } | { ok: false; error: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "AI nije podešen (nedostaje ključ)." };
    const instructions = `Ti si profesionalni kvotni analitičar (sharp bettor). Odgovaraš na hrvatskom.
PRAVILA:
- Koristi ISKLJUČIVO dane vjerojatnosti modela (de-vig + Dixon-Coles). Ne izmišljaj brojeve, ne mijenjaj ih više od ±3 postotna boda.
- vjerojatnost je postotak 0-100. ferKvota = 100/vjerojatnost.
- Ako korisnik traži vrstu oklade, glavniTip MORA biti iz te vrste.
- evPostotak = (vjerojatnost/100 × kvota − 1) × 100 ako je kvota poznata, inače null. isplativo = evPostotak > 2.
- Tip ne smije proturječiti točnom rezultatu ni sigurnosnoj liniji (npr. "Manje 2.5" + rezultat 2:1 je zabranjeno).
- Ako je vjerojatnost < 60%, sigurnosnaLinija je sigurnija varijanta (dvostruka šansa, niža linija golova); inače "Nije potrebna".
- ulogPostotak: 1/4 Kelly u % banke, 0 ako nije isplativo, maksimalno 3.
- obrazlozenje: 2-4 rečenice konkretno. rizici: 1-3 kratke stavke.`;

    // Ukupni timeout za CIJELI poziv (konekcija + stream) — 45 s.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          instructions,
          input: [{ role: "user", content: `Utakmica: ${data.utakmica}\nTražena vrsta oklade: ${data.vrstaOklade || "bilo koja (najbolji tip)"}\n\nPodaci modela:\n${data.kontekst}` }],
          text: { format: { type: "json_schema", name: "prognoza", strict: true, schema } },
        }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        if (res.status === 429) return { ok: false, error: "AI je trenutno zauzet — pokušaj za minutu." };
        if (res.status === 402) return { ok: false, error: "Mjesečni besplatni AI krediti su potrošeni. Obnavljaju se početkom idućeg mjeseca." };
        if (res.status === 403) return { ok: false, error: "AI pristup je odbijen za ovaj radni prostor." };
        return { ok: false, error: `AI greška ${res.status}: ${t.slice(0, 200)}` };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", out = "", failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
            else if (ev.type === "response.refusal.delta") failed = "AI je odbio odgovoriti.";
            else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "AI greška.";
          } catch { /* nepotpun okvir */ }
        }
      }
      if (failed) return { ok: false, error: failed };
      try {
        return { ok: true, p: JSON.parse(out) as AiPrognoza };
      } catch {
        return { ok: false, error: "AI nije vratio ispravan odgovor." };
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError")
        return { ok: false, error: "AI nije odgovorio u 45 s — prekidač je otkazao poziv." };
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `AI mrežna greška: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  });

