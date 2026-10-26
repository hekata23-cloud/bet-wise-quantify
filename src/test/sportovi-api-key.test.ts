import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({
  dohvatiUtakmiceSport: vi.fn(), dohvatiOddsSport: vi.fn(),
  dohvatiH2HSport: vi.fn(), statusSportova: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown): any => value;
    const builder = {
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (args: { data: any }) => unknown) =>
        (args: { data: unknown }) => fn({ data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/lib/sportovi-guard.server", () => guard);
vi.mock("@/lib/sportovi-motor", () => ({ analizirajSportUtakmicu: () => ({ tipovi: [] }) }));

import { analizirajSportUtakmicuServer, dohvatiSportUtakmiceServer, getSportBundle } from "@/lib/sportovi.functions";

describe.each(["kosarka", "rukomet"] as const)("%s saved API credential", (sport) => {
  beforeEach(() => {
    vi.clearAllMocks();
    guard.dohvatiUtakmiceSport.mockResolvedValue({ ok: true, data: [] });
    guard.dohvatiOddsSport.mockResolvedValue({ ok: true, data: [{ bookmakers: [
      { name: "Other", bets: [{ name: "Home/Away", values: [{ value: "Home", odd: "3.00" }, { value: "Away", odd: "1.40" }] }] },
      { name: "Bet365", bets: [{ name: "Home/Away", values: [{ value: "Home", odd: "1.80" }, { value: "Away", odd: "2.00" }] }] },
    ] }] });
    guard.dohvatiH2HSport.mockResolvedValue({ ok: true, data: [] });
  });
  it("forwards the entered key when loading games", async () => {
    await dohvatiSportUtakmiceServer({ data: { sport, date: "2026-10-17", apiKey: " test-credential " } });
    expect(guard.dohvatiUtakmiceSport).toHaveBeenCalledWith(sport, "2026-10-17", "test-credential");
  });
  it("forwards the entered key to odds and head-to-head analysis", async () => {
    const utakmica = { id: 42, domacinId: 10, gostId: 20 };
    await analizirajSportUtakmicuServer({ data: { sport, utakmica: utakmica as any, apiKey: "test-credential" } });
    expect(guard.dohvatiOddsSport).toHaveBeenCalledWith(sport, 42, "test-credential");
    expect(guard.dohvatiH2HSport).toHaveBeenCalledWith(sport, 10, 20, "test-credential");
  });
  it("forwards the entered key on the bundle path", async () => {
    await getSportBundle({ data: { sport, id: 42, apiKey: "test-credential" } });
    expect(guard.dohvatiOddsSport).toHaveBeenCalledWith(sport, 42, "test-credential");
  });
  it("uses only Bet365 odds when Bet365 is offered", async () => {
    const r = await getSportBundle({ data: { sport, id: 42, apiKey: "k" } });
    expect(r.bookmaker).toBe("Bet365");
    expect(r.kvote["2"]).toBe(2);
  });
  it("refuses a pick when no odds exist", async () => {
    guard.dohvatiOddsSport.mockResolvedValue({ ok: true, data: [] });
    const r = await analizirajSportUtakmicuServer({ data: { sport, utakmica: { id: 1 } as any, apiKey: "k" } });
    expect(r.ok).toBe(false);
  });
});
