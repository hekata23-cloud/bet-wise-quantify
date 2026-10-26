import { describe, expect, it } from "vitest";
import { classifyMarket, MarketType } from "@/lib/market-type";
import {
  ocijeniNogu,
  statusTiketa,
  ukupnaKvotaTiketa,
  type RezultatUtakmice,
  type TiketNoga,
} from "@/lib/listici";
import { lineupDelta } from "@/lib/lineup-delta";
import { padoviKvota, plosneKvote, sharpConsensus } from "@/lib/smart-money";
import { dnbAhTablica, parseAsianHandicapLine, skellam } from "@/lib/skellam-dnb";
import { jeTier1 } from "@/lib/league-tier";

const r = (dom: number, gost: number, domHT = 0, gostHT = 0): RezultatUtakmice => ({
  status: "FT",
  zavrsena: true,
  dom,
  gost,
  domReg: dom,
  gostReg: gost,
  domHT,
  gostHT,
});

describe("MarketType enum", () => {
  it("razlikuje 1X i Over 1.5", () => {
    expect(classifyMarket("Dvostruka šansa", "1X").type).toBe(MarketType.DOUBLE_CHANCE);
    expect(classifyMarket("O/U 1.5", "Over 1.5").type).toBe(MarketType.OVER_UNDER_GOALS);
  });
  it("razlikuje HT i FT over/under", () => {
    expect(classifyMarket("1. poluvrijeme O/U", "Over 0.5").period).toBe("HT");
    expect(classifyMarket("O/U 2.5", "Over 2.5").period).toBe("FT");
  });
});

describe("settlement", () => {
  it("DNB remi je povrat (kvota 1.00), ne gubitak", () => {
    expect(ocijeniNogu("nogomet", { trziste: "DNB", tip: "DNB 1", kvota: 1.6 }, r(1, 1))).toBe(
      "povrat",
    );
    expect(ocijeniNogu("nogomet", { trziste: "DNB", tip: "DNB 1", kvota: 1.6 }, r(2, 1))).toBe(
      "dobitna",
    );
  });
  it("tiket s DNB remijem ostaje dobitan, kvota se preračuna", () => {
    const noge = [
      { kvota: 1.6, status: "void" },
      { kvota: 2.0, status: "dobitna" },
    ] as TiketNoga[];
    expect(statusTiketa(noge)).toBe("dobitno");
    expect(ukupnaKvotaTiketa(noge)).toBe(2);
  });
  it("HT over gleda poluvrijeme, FT over cijelu utakmicu", () => {
    const rez = r(3, 0, 0, 0);
    expect(
      ocijeniNogu("nogomet", { trziste: "1. poluvrijeme O/U", tip: "Over 0.5", kvota: 1.4 }, rez),
    ).toBe("izgubljena");
    expect(ocijeniNogu("nogomet", { trziste: "O/U 2.5", tip: "Over 2.5", kvota: 1.9 }, rez)).toBe(
      "dobitna",
    );
  });
  it("timski total gosta broji golove gosta", () => {
    expect(
      ocijeniNogu("nogomet", { trziste: "Gost O/U", tip: "Over 0.5", kvota: 1.5 }, r(3, 0)),
    ).toBe("izgubljena");
  });
});

describe("lineup delta", () => {
  const base = { pBtts: 0.5, pOver25: 0.5, lambdaDom: 1.5, lambdaGost: 1.2 };
  it("bez prvog golmana: BTTS +6.8 pp, Over 2.5 +7.4 pp", () => {
    const o = lineupDelta({
      ...base,
      startDom: [{ ime: "Rez", id: 99 }],
      startGost: [],
      jezgraDom: { golman: 1, stoperi: [] },
      jezgraGost: { stoperi: [] },
    });
    expect(o.alert).toBe(true);
    expect(o.pBtts).toBeCloseTo(0.568);
    expect(o.pOver25).toBeCloseTo(0.574);
    expect(o.oznaka).toBe("LINEUP ALERT: DEFENSIVE ROTATION DETECTED");
  });
  it("napadač na klupi: λ napada −0.18", () => {
    const o = lineupDelta({
      ...base,
      startDom: [{ ime: "GK", id: 1 }],
      startGost: [],
      jezgraDom: { golman: 1, stoperi: [], napadac: 9 },
      jezgraGost: { stoperi: [] },
    });
    expect(o.lambdaDom).toBeCloseTo(1.32);
    expect(o.alert).toBe(false);
  });
});

describe("smart money", () => {
  it("pad 2.15 → 1.78 unutar 12 h je ≥8%", () => {
    const now = Date.now();
    const p = padoviKvota(
      [
        { t: now - 3600_000, kvote: { "1": 2.15 } },
        { t: now, kvote: { "1": 1.78 } },
      ],
      now,
    );
    expect(p[0]?.padPct).toBeCloseTo(17.2, 1);
  });
  it("pad stariji od 12 h se ignorira", () => {
    const now = Date.now();
    expect(
      padoviKvota(
        [
          { t: now - 13 * 3600_000, kvote: { "1": 2.15 } },
          { t: now, kvote: { "1": 1.78 } },
        ],
        now,
      ),
    ).toHaveLength(0);
  });
  it("budući i neispravni snimci ne stvaraju lažni pad", () => {
    const now = Date.now();
    expect(
      padoviKvota(
        [
          { t: now - 3600_000, kvote: { "1": 2.15 } },
          { t: now + 60_000, kvote: { "1": 1.7 } },
        ],
        now,
      ),
    ).toHaveLength(0);
    expect(
      padoviKvota(
        [
          { t: now - 3600_000, kvote: { "1": Infinity } },
          { t: now, kvote: { "1": 1.7 } },
        ],
        now,
      ),
    ).toHaveLength(0);
  });
  it("čita DNB i oznake kvota bez obzira na velika/mala slova", () => {
    expect(plosneKvote({ "Draw No Bet": { home: 1.82, away: 2.04 } })).toEqual({
      "DNB 1": 1.82,
      "DNB 2": 2.04,
    });
  });
  it("ne potvrđuje consensus za nemoguće vjerojatnosti ili kvote", () => {
    expect(sharpConsensus(1.2, 2.1, 1.8)).toEqual({ slaze: false, ev: 0 });
  });
});

describe("DNB / AH", () => {
  it("DNB dobitak + povrat + gubitak = 1", () => {
    const d = dnbAhTablica(1.6, 1.0)[0]!;
    expect(d.win + d.push + d.loss).toBeCloseTo(1);
  });
  it("Skellamov rep ostaje dostupan i kod otvorenih utakmica", () => {
    const p = skellam(15, 0.5);
    expect(p.get(12)).toBeGreaterThan(0);
    expect([...p.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });
  it("pretvara zapis azijske četvrt-linije u decimalnu liniju", () => {
    expect(parseAsianHandicapLine("-0/0.5")).toBe(-0.25);
    expect(parseAsianHandicapLine("+0/0.5")).toBe(0.25);
    expect(parseAsianHandicapLine("0/-0.5")).toBe(-0.25);
    expect(parseAsianHandicapLine("nema linije")).toBeNull();
  });
  it("odbija nevaljan λ umjesto izračuna neispravnih vjerojatnosti", () => {
    expect(() => skellam(Number.NaN, 1)).toThrow(RangeError);
    expect(() => dnbAhTablica(-1, 1)).toThrow(RangeError);
  });
});

it("Tier 1 lige", () => {
  expect(jeTier1("UEFA Champions League")).toBe(true);
  expect(jeTier1("NBA")).toBe(true);
  expect(jeTier1("Liga MX")).toBe(false);
});

it("Tier 1 lige u formatu API-Footballa (Država — Liga)", () => {
  expect(jeTier1("England — Premier League")).toBe(true);
  expect(jeTier1("Spain — La Liga")).toBe(true);
  expect(jeTier1("Croatia — HNL")).toBe(true);
  expect(jeTier1("World — UEFA Champions League")).toBe(true);
  expect(jeTier1("Ethiopia — Premier League")).toBe(false);
  expect(jeTier1("Brazil — Serie A")).toBe(false);
});
