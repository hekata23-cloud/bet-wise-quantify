// Detektor "klizavih" parova: slučajevi kad kvote međusobno proturječe
// pa ishod s VEĆOM kvotom ima stvarnu šansu (npr. Over 2.00 / Under 1.75, a padne over).

export type Anomaly = {
  level: "VISOKO" | "SREDNJE";
  title: string;
  detail: string;
  favours: string;
};

export function detectAnomalies(k22: number, kOver: number, kGg: number): Anomaly[] {
  const out: Anomaly[] = [];

  // 1) Skriveni Over: Over je skup (≥ 1.95), ali 2:2 i GG govore da će golova biti
  if (kOver >= 1.95 && k22 <= 13 && kGg <= 1.8) {
    out.push({
      level: k22 <= 12 && kGg <= 1.72 ? "VISOKO" : "SREDNJE",
      title: "Skriveni OVER (podcijenjeni golovi)",
      detail: `Over ${kOver.toFixed(2)} izgleda kao "manje", ali 2:2 = ${k22.toFixed(2)} i GG = ${kGg.toFixed(2)} pokazuju otvorenu utakmicu. Veća kvota ovdje često prolazi.`,
      favours: "2.5 VIŠE / BTTS DA",
    });
  }

  // 2) Lažni Over: Over jeftin (≤ 1.75), ali 2:2 i GG ne prate
  if (kOver <= 1.75 && (k22 >= 14 || kGg >= 1.9)) {
    out.push({
      level: k22 >= 15 && kGg >= 1.95 ? "VISOKO" : "SREDNJE",
      title: "Lažni OVER (napuhan favorit)",
      detail: `Over ${kOver.toFixed(2)} je nizak, ali 2:2 = ${k22.toFixed(2)} / GG = ${kGg.toFixed(2)} ne potvrđuju golove na obje strane — moguća jednostrana pobjeda 2:0 ili 1:0.`,
      favours: "2.5 MANJE ili BTTS NE",
    });
  }

  // 3) GG skup, a Over jeftin → golovi samo s jedne strane
  if (kGg >= 1.95 && kOver <= 1.8) {
    out.push({
      level: "SREDNJE",
      title: "Jednostrani golovi",
      detail: "Tržište očekuje golove, ali ne od oba tima (npr. 3:0, 2:0). BTTS DA je rizičan.",
      favours: "BTTS NE",
    });
  }

  // 4) Granična zona – kvote gotovo 50/50, prednost ima veća kvota (bolji EV)
  if (kOver >= 1.85 && kOver <= 2.05 && kGg >= 1.7 && kGg <= 1.9 && k22 >= 12 && k22 <= 14.5) {
    out.push({
      level: "SREDNJE",
      title: "Klizava 50/50 utakmica",
      detail:
        "Sve tri kvote su u neutralnoj zoni. Ishod je praktično novčić — ako igraš, biraj stranu s većom kvotom (bolja vrijednost) i manji ulog.",
      favours: "manji ulog, veća kvota",
    });
  }

  return out;
}
