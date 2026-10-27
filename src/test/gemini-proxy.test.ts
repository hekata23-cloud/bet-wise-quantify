import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiChat } from "@/lib/gemini";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Gemini rezervni proxy", () => {
  it("bez ključa u pregledniku koristi poslužiteljski proxy", async () => {
    const f = vi.fn().mockResolvedValue(ok({ ok: true, text: "Bok" }));
    vi.stubGlobal("fetch", f);
    await expect(geminiChat("sys", [{ role: "user", parts: [{ text: "x" }] }])).resolves.toBe(
      "Bok",
    );
    expect(f.mock.calls[0][0]).toBe("/api/public/gemini");
  });

  it("kad direktni poziv padne mrežno, prelazi na proxy", async () => {
    localStorage.setItem("tm.key.gemini", "k");
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok({ ok: true, text: "Preko proxyja" }));
    vi.stubGlobal("fetch", f);
    await expect(geminiChat("sys", [])).resolves.toBe("Preko proxyja");
    expect(f.mock.calls[1][0]).toBe("/api/public/gemini");
  });

  it("direktni odgovor spaja sve dijelove teksta", async () => {
    localStorage.setItem("tm.key.gemini", "k");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          ok({ candidates: [{ content: { parts: [{ text: "A" }, { text: "B" }] } }] }),
        ),
    );
    await expect(geminiChat("sys", [])).resolves.toBe("AB");
  });
});
