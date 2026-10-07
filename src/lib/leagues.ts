// ══ LEAGUE DNA DATABASE v1.0 ══
// Specifični faktori za svaku ligu koji korigiraju Poissonov model

export interface LeagueProfile {
  name: string;
  underOverBias: number; // >1 favorizira Over, <1 favorizira Under
  drawProbability: number; // Dodatni bonus na HT-X
  homeAdvantage: number;
}

export const LEAGUE_PROFILES: Record<string, LeagueProfile> = {
  "Premier League": { name: "Premier League", underOverBias: 1.15, drawProbability: 1.05, homeAdvantage: 1.10 },
  "HNL": { name: "HNL", underOverBias: 0.85, drawProbability: 1.25, homeAdvantage: 1.15 },
  "Serie A": { name: "Serie A", underOverBias: 0.95, drawProbability: 1.15, homeAdvantage: 1.12 },
  "Bundesliga": { name: "Bundesliga", underOverBias: 1.25, drawProbability: 0.95, homeAdvantage: 1.08 },
  "La Liga": { name: "La Liga", underOverBias: 0.90, drawProbability: 1.10, homeAdvantage: 1.14 },
  "Ligue 1": { name: "Ligue 1", underOverBias: 0.88, drawProbability: 1.20, homeAdvantage: 1.10 },
  "Default": { name: "Ostale", underOverBias: 1.00, drawProbability: 1.10, homeAdvantage: 1.12 }
};

/** Funkcija koja vraća korektivni faktor ovisno o ligi */
export function getLeagueModifier(leagueName: string): LeagueProfile {
  return LEAGUE_PROFILES[leagueName] || LEAGUE_PROFILES["Default"];
}
