import { createServerFn } from "@tanstack/react-start";

export type OcrResult = {
  ok: boolean;
  message?: string | undefined;
  k22?: number | undefined;
  over?: number | undefined;
  gg?: number | undefined;
};

const PROMPT = `Na slici je ponuda kladionice za nogometnu utakmicu. Pronađi decimalne kvote za:
- točan rezultat 2:2 (Correct score 2-2)
- Over 2.5 golova (Više 2.5, 3+)
- GG / oba tima daju gol (BTTS Yes)
Odgovori ISKLJUČIVO JSON objektom bez ikakvog drugog teksta: {"k22": broj ili null, "over": broj ili null, "gg": broj ili null}`;

function num(v: unknown) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : undefined;
}

export const readOddsFromImage = createServerFn({ method: "POST" })
  .inputValidator((data: { image: string }) => {
    const image = String(data?.image ?? "");
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image))
      throw new Error("Neispravna slika.");
    if (image.length > 7_000_000) throw new Error("Slika je prevelika (max ~5 MB).");
    return { image };
  })
  .handler(async ({ data }): Promise<OcrResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, message: "Čitanje slika nije podešeno." };
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: PROMPT },
                { type: "input_image", image_url: data.image },
              ],
            },
          ],
        }),
      });
      if (res.status === 429) return { ok: false, message: "Previše zahtjeva. Pokušaj za minutu." };
      if (res.status === 402)
        return { ok: false, message: "Ponestalo je AI kredita u radnom prostoru." };
      if (!res.ok || !res.body) {
        console.error("OCR gateway", res.status, await res.text().catch(() => ""));
        return { ok: false, message: `Čitanje slike nije uspjelo (${res.status}).` };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as { type?: string; delta?: string };
            if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
          } catch {
            /* skip */
          }
        }
      }
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, message: "Na slici nisam pronašao kvote." };
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const out = { k22: num(parsed["k22"]), over: num(parsed["over"]), gg: num(parsed["gg"]) };
      if (!out.k22 && !out.over && !out.gg)
        return { ok: false, message: "Na slici nisam pronašao tražene kvote." };
      return { ok: true, ...out };
    } catch (e) {
      console.error("OCR error", e);
      return { ok: false, message: "Čitanje slike nije uspjelo." };
    }
  });
