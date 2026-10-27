import { describe, it, expect } from "vitest";
import { offlineAnswer } from "@/lib/ai-chat";
import { runQuantAnalytics } from "@/lib/botovi";
import { liveNimModel } from "@/lib/nvidia";

describe("Luna i Orion odgovaraju na postavljeno pitanje", () => {
  it("Luna bez AI-ja navodi pitanje i razlog, ne generičko predstavljanje", () => {
    const q = "Što je Kelly kriterij?";
    const r = offlineAnswer("luna", q, runQuantAnalytics(q), ["groq: limit"]);
    expect(r).toContain(q);
    expect(r).not.toContain("Ja sam **Luna**");
  });
  it("Orion bez AI-ja navodi pitanje", () => {
    const q = "Koja je razlika između DNB i dvostruke šanse?";
    const r = offlineAnswer("orion", q, runQuantAnalytics(q), []);
    expect(r).toContain(q);
    expect(r).toContain("Orion");
  });
  it("ugašeni NVIDIA model se zamjenjuje živim", () => {
    expect(liveNimModel("meta/llama-3.3-70b-instruct")).toBe("deepseek-ai/deepseek-v4.1-flash");
  });
});
