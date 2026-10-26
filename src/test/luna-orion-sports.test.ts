import { describe, expect, it } from "vitest";
import {
  runQuantAnalytics,
  formatLunaResponse,
  formatOrionResponse,
  identifySpecificMarket,
  isConversationalQuery,
  extractMatchDetails,
} from "@/lib/botovi";

describe("Luna i Orion — Višesportski analitički engine i prepoznavanje tržišta", () => {
  it("prepoznaje nogometna tržišta (1X2, BTTS, Over/Under, Hendikep, DNB, Korneri, Kartoni)", () => {
    expect(identifySpecificMarket("Dinamo vs Hajduk BTTS oba daju gol", "nogomet").category).toBe("btts");
    expect(identifySpecificMarket("Arsenal vs Chelsea over 2.5 gola", "nogomet").category).toBe("over_under");
    expect(identifySpecificMarket("Real Madrid vs Barcelona azijski hendikep -0.75", "nogomet").category).toBe("hendikep");
    expect(identifySpecificMarket("Liverpool vs City DNB pobjeda bez neriješenog", "nogomet").category).toBe("dnb");
    expect(identifySpecificMarket("Inter vs Milan zbroj kornera više od 9.5", "nogomet").category).toBe("korneri");
    expect(identifySpecificMarket("Bayern vs Dortmund više od 3.5 kartona", "nogomet").category).toBe("kartoni");
    expect(identifySpecificMarket("PSG vs Marseille točan rezultat 2:1", "nogomet").category).toBe("tocan_rezultat");
    expect(identifySpecificMarket("Dinamo vs Rijeka 1/1 poluvrijeme kraj prijelaz", "nogomet").category).toBe("ht_ft");
    expect(identifySpecificMarket("Dinamo vs Hajduk čista mreža bez primljenog gola", "nogomet").category).toBe("clean_sheet");
    expect(identifySpecificMarket("Arsenal vs Chelsea raspon 2-3 gola", "nogomet").category).toBe("raspon_golova");
    expect(identifySpecificMarket("Real vs Barca 2. poluvrijeme ishod", "nogomet").category).toBe("drugo_poluvrijeme");
  });

  it("prepoznaje košarkaška tržišta (Moneyline, Spread, Total poena, Četvrtine, Igrači props, Produžeci, Par/Nepar)", () => {
    expect(identifySpecificMarket("Lakers vs Celtics spread hendikep -4.5", "kosarka").category).toBe("hendikep");
    expect(identifySpecificMarket("Warriors vs Nuggets ukupno poena over 224.5", "kosarka").category).toBe("over_under");
    expect(identifySpecificMarket("Partizan vs Crvena zvezda pobjednik meča moneyline", "kosarka").category).toBe("1x2");
    expect(identifySpecificMarket("Cibona vs Zadar prva četvrtina Q1 ishod", "kosarka").category).toBe("cetvrtine");
    expect(identifySpecificMarket("Dončić zbroj poena igrača over 31.5", "kosarka").category).toBe("igraci");
    expect(identifySpecificMarket("Real Madrid vs Barcelona margina pobjede 1-10 poena", "kosarka").category).toBe("margina");
    expect(identifySpecificMarket("Lakers vs Warriors hoće li biti produžetaka", "kosarka").category).toBe("produzeci");
    expect(identifySpecificMarket("Celtics vs Heat zbroj poena par ili nepar", "kosarka").category).toBe("par_nepar");
    expect(identifySpecificMarket("Partizan vs Real pobjednik u regularnom vremenu 40 min", "kosarka").category).toBe("regularno");
  });

  it("prepoznaje rukometna tržišta (1X2 s remijem, Hendikep, Total golova, Poluvrijeme, DNB, Par/Nepar, Igrači)", () => {
    expect(identifySpecificMarket("Zagreb vs PSG rukomet konačan ishod 1X2", "rukomet").category).toBe("1x2");
    expect(identifySpecificMarket("Veszprem vs Magdeburg hendikep golova -2.5", "rukomet").category).toBe("hendikep");
    expect(identifySpecificMarket("Kiel vs Flensburg ukupno golova preko 56.5", "rukomet").category).toBe("over_under");
    expect(identifySpecificMarket("Zagreb vs Veszprem 1. poluvrijeme zbroj golova", "rukomet").category).toBe("poluvrijeme");
    expect(identifySpecificMarket("Domaćin daje više od 28.5 golova rukomet", "rukomet").category).toBe("timski_total");
    expect(identifySpecificMarket("Zagreb vs Magdeburg DNB pobjeda bez neriješenog", "rukomet").category).toBe("dnb");
    expect(identifySpecificMarket("Flensburg vs Kiel zbroj golova par nepar", "rukomet").category).toBe("par_nepar");
    expect(identifySpecificMarket("Gidsel zbroj golova rukomet", "rukomet").category).toBe("igraci");
  });

  it("detektira razgovorne upite i NE generira lažni mock par za Domaćin vs Gost", () => {
    expect(isConversationalQuery("Bok Luna, kako si?")).toBe(true);
    expect(isConversationalQuery("Što je Kelly kriterij i kako ga koristiti?")).toBe(true);
    expect(isConversationalQuery("Koja je razlika između azijskog i europskog hendikepa?")).toBe(true);

    const quantConversational = runQuantAnalytics("Bok Luna, kako si danas?");
    expect(quantConversational.isMatchQuery).toBe(false);

    const lunaReply = formatLunaResponse(quantConversational);
    expect(lunaReply).toContain("Luna");
    expect(lunaReply).not.toContain("Domaćin vs Gost");
    expect(lunaReply).not.toContain("stoper gostiju odsutan");

    const orionReply = formatOrionResponse(quantConversational);
    expect(orionReply).toContain("Orion");
    expect(orionReply).not.toContain("Domaćin vs Gost");
  });

  it("izračunava specifičnu košarkašku matematiku (pace, ratings, normalna distribucija)", () => {
    const quant = runQuantAnalytics("Lakers vs Celtics košarka hendikep -4.5 poena");
    expect(quant.sport).toBe("kosarka");
    expect(quant.isMatchQuery).toBe(true);
    expect(quant.pick).toMatch(/Lakers|Celtics/);
    expect(quant.confidencePercent).toBeGreaterThanOrEqual(40);
    expect(quant.confidencePercent).toBeLessThanOrEqual(95);

    const lunaResponse = formatLunaResponse(quant);
    expect(lunaResponse).toContain("Lakers vs Celtics");
    expect(lunaResponse).not.toContain("prazan odgovor");
    expect(lunaResponse.length).toBeGreaterThan(200);

    const orionResponse = formatOrionResponse(quant);
    expect(orionResponse).toContain("Pace");
    expect(orionResponse).not.toContain("prazan odgovor");
    expect(orionResponse.length).toBeGreaterThan(200);
  });

  it("izračunava specifičnu rukometnu matematiku (posjedi, remi X ~9%, total golovi)", () => {
    const quant = runQuantAnalytics("Zagreb vs PSG rukomet zbroj golova preko 56.5");
    expect(quant.sport).toBe("rukomet");
    expect(quant.isMatchQuery).toBe(true);
    expect(quant.totalXG).toBeGreaterThan(45); // Rukometni zbroj golova 50-60
    expect(quant.totalXG).toBeLessThan(75);
    expect(quant.pX).toBeGreaterThan(5); // Remi X u rukometu je stvaran

    const lunaResponse = formatLunaResponse(quant);
    expect(lunaResponse).toContain("Zagreb vs PSG");
    expect(lunaResponse).toContain("gol");
    expect(lunaResponse).not.toContain("prazan odgovor");

    const orionResponse = formatOrionResponse(quant);
    expect(orionResponse).toContain("Posjedi");
    expect(orionResponse).not.toContain("prazan odgovor");
  });

  it("pravilno uvažava gostujućeg favorita kada kvote favoriziraju gosta", () => {
    // Gost izraziti favorit u nogometu (kvote: 4.50 3.60 1.75)
    const quantFootball = runQuantAnalytics("Luton vs Manchester City 4.50 3.60 1.75");
    expect(quantFootball.p2).toBeGreaterThan(quantFootball.p1);
    expect(quantFootball.pick).toMatch(/Manchester City|2/);

    // Gost favorit u košarci (kvote: 2.80 1.45)
    const quantBasketball = runQuantAnalytics("Hornets vs Celtics košarka 2.80 1.45");
    expect(quantBasketball.p2).toBeGreaterThan(quantBasketball.p1);
    expect(quantBasketball.pick).toMatch(/Celtics/);

    // Gost favorit u rukometu (kvote: 4.80 10.0 1.25)
    const quantHandball = runQuantAnalytics("Zagreb vs Magdeburg rukomet 4.80 10.0 1.25");
    expect(quantHandball.p2).toBeGreaterThan(quantHandball.p1);
    expect(quantHandball.pick).toMatch(/Magdeburg|2/);
  });
});
