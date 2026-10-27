// Testovi za doradu Bet Slip komponente:
// 1) auto-detekcija sporta iz linija i naziva tržišta
// 2) EV klasifikacija (zeleno/sivo/crveno)
// 3) Shannon-entropija varijansa (50/50 coin-flip badge)
// 4) frakcijski Kelly preporučeni ulog
// 5) localStorage persistencija korpe
import { describe, it, expect, beforeEach } from "vitest";
import { detectSport, formatSelectionLabel, extractLine } from "@/lib/sport-detect";
import { evStatus, visokaVarijanca, potentialReturn } from "@/lib/bet-slip-math";
import { entropijaNozice, varijancaTiketa, dodajUKorpu, loadKorpa, ukloniIzKorpe, ocistiKorpu, type KorpaTip } from "@/lib/korpa";
import { izracunajKorpuSmart } from "@/lib/korpa-smart";

const noga = (over: Partial<KorpaTip>): KorpaTip => ({
  id: over.id ?? "s|u|m|t",
  sport: over.sport ?? "nogomet",
  utakmica: over.utakmica ?? "A - B",
  trziste: over.trziste ?? "O/U 2.5",
  tip: over.tip ?? "Over 2.5",
  kvota: over.kvota ?? 1.95,
  vjerojatnost: over.vjerojatnost ?? 0.55,
  ...over,
});

describe("detectSport — auto-detekcija sporta iz linija", () => {
  it("klasični nogometni total Over 2.5 ostaje nogomet", () => {
    expect(detectSport({ sport: "nogomet", trziste: "O/U 2.5", tip: "Over 2.5" })).toBe("nogomet");
  });

  it("Over 29.5 u 2. poluvremenu je rukomet, NE nogomet", () => {
    expect(
      detectSport({ sport: "nogomet", utakmica: "Helsingborg - Hallby", trziste: "2nd Half Total", tip: "Over 29.5" }),
    ).toBe("rukomet");
  });

  it("Over 29.5 u četvrtini je košarka", () => {
    expect(detectSport({ sport: "nogomet", trziste: "3rd Quarter Total", tip: "Over 29.5" })).toBe("košarka");
  });

  it("full-time total 165.5 je košarka", () => {
    expect(detectSport({ sport: "nogomet", trziste: "Total Points", tip: "Over 165.5" })).toBe("košarka");
  });

  it("full-time total 55.5 (golovi) je rukomet", () => {
    expect(detectSport({ sport: "nogomet", trziste: "Ukupno golova", tip: "Over 55.5" })).toBe("rukomet");
  });

  it("eksplicitno zadani sport se ne dira", () => {
    expect(detectSport({ sport: "košarka", trziste: "O/U 2.5", tip: "Over 2.5" })).toBe("košarka");
    expect(detectSport({ sport: "rukomet", trziste: "Total", tip: "Over 55.5" })).toBe("rukomet");
  });

  it("nogometni total 1. poluvremena (Over 1.5) ostaje nogomet", () => {
    expect(detectSport({ sport: "nogomet", trziste: "1st Half O/U", tip: "Over 1.5" })).toBe("nogomet");
  });
});

describe("formatSelectionLabel — etiketa selekcije", () => {
  it("prikazuje [Sport] utakmicu i tržište s tipom", () => {
    expect(
      formatSelectionLabel({ sport: "nogomet", utakmica: "Helsingborg vs Hallby", trziste: "2nd Half Total", tip: "Over 29.5" }),
    ).toBe("Handball: Helsingborg vs Hallby — 2nd Half Total Over 29.5");
  });

  it("ne duplira naziv tržišta ako je već u tipu", () => {
    expect(
      formatSelectionLabel({ sport: "nogomet", utakmica: "A - B", trziste: "Over 2.5", tip: "Over 2.5" }),
    ).toBe("Football: A - B — Over 2.5");
  });
});

describe("extractLine", () => {
  it("čita decimalne linije", () => {
    expect(extractLine("Over 29.5")).toBe(29.5);
    expect(extractLine("Domaćin -5.5")).toBe(5.5);
    expect(extractLine("GG")).toBeNull();
  });
});

describe("EV klasifikacija", () => {
  it("pozitivan EV → zeleno", () => expect(evStatus(0.08)).toBe("pozitivan"));
  it("EV oko nule (±2%) → neutralno", () => {
    expect(evStatus(0.01)).toBe("neutralan");
    expect(evStatus(-0.01)).toBe("neutralan");
  });
  it("negativan EV → crveno", () => expect(evStatus(-0.05)).toBe("negativan"));
});

describe("Shannon entropija — High Variance badge", () => {
  it("entropija 50/50 noge je maksimalna (1.0)", () => {
    expect(entropijaNozice(0.5)).toBeCloseTo(1, 6);
  });

  it("tiket s 50/50 nogama je visoke varijance (coin-flip)", () => {
    const vj = varijancaTiketa([noga({ vjerojatnost: 0.5 })]);
    expect(vj.razina).toBe("visoka");
    expect(visokaVarijanca(vj.entropija)).toBe(true);
  });

  it("sigurna noga (95%) nije visoke varijance", () => {
    const vj = varijancaTiketa([noga({ vjerojatnost: 0.95 })]);
    expect(vj.razina).toBe("niska");
    expect(visokaVarijanca(vj.entropija)).toBe(false);
  });
});

describe("Frakcijski Kelly — preporučeni ulog", () => {
  it("kvota 1.95, model 55%, Kelly 25%, bankroll 100 € → ~1.91% = ~1.91 €", () => {
    const r = izracunajKorpuSmart([noga({ kvota: 1.95, vjerojatnost: 0.55 })], { bankroll: 100, kellyFrac: 0.25 });
    // puna Kelly = (0.95·0.55 − 0.45)/0.95 ≈ 0.07632 → 25% → ≈1.9079%
    expect(r.ulogPerc).toBeCloseTo(1.9079, 3);
    expect(r.ulogIznos).toBeCloseTo(1.9079, 3);
  });

  it("potencijalni povrat = ulog × kvota", () => {
    expect(potentialReturn(10, 1.95)).toBeCloseTo(19.5, 6);
    expect(potentialReturn(0, 1.95)).toBe(0);
    expect(potentialReturn(10, 1)).toBe(0);
  });
});

describe("Korpa — localStorage persistencija", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("dodana noga preživi reload (loadKorpa čita localStorage)", () => {
    dodajUKorpu(noga({ id: "rukomet|helsingborg-hallby|2h total|over 29.5", tip: "Over 29.5", trziste: "2nd Half Total" }));
    const raw = localStorage.getItem("andromeda.korpa");
    expect(raw).toBeTruthy();
    expect(loadKorpa()).toHaveLength(1);
  });

  it("uklanjanje i čišćenje ažuriraju localStorage", () => {
    dodajUKorpu(noga({ id: "a" }));
    dodajUKorpu(noga({ id: "b", tip: "Under 2.5" }));
    ukloniIzKorpe("a");
    expect(loadKorpa().map((t) => t.id)).toEqual(["b"]);
    ocistiKorpu();
    expect(loadKorpa()).toEqual([]);
  });
});
