export type LeagueProfile = {
  name: string;
  category: "GOLIJADA" | "STANDARD" | "DEFANZIVNA";
  avgGoals: number;
  bttsRate: number; // postotak povijesnih BTTS DA
  goalMultiplier: number;
  desc: string;
};

export const LEAGUE_PROFILES: Record<string, LeagueProfile> = {
  eredivisie: {
    name: "Nizozemska (Eredivisie / Eerste)",
    category: "GOLIJADA",
    avgGoals: 3.12,
    bttsRate: 61,
    goalMultiplier: 1.14,
    desc: "Ekstremno otvoren nogomet. Visok postotak Over 2.5 i GG.",
  },
  bundesliga: {
    name: "Njemačka Bundesliga",
    category: "GOLIJADA",
    avgGoals: 3.18,
    bttsRate: 59,
    goalMultiplier: 1.12,
    desc: "Visok tempo, puno tranzicijskih prilika i golova.",
  },
  norway: {
    name: "Norveška (Eliteserien / OBOS)",
    category: "GOLIJADA",
    avgGoals: 3.05,
    bttsRate: 58,
    goalMultiplier: 1.1,
    desc: "Sjevernjačke lige s puno golova u drugom poluvremenu.",
  },
  premier_league: {
    name: "Engleska Premier League",
    category: "STANDARD",
    avgGoals: 2.85,
    bttsRate: 53,
    goalMultiplier: 1.02,
    desc: "Uravnotežena liga visoke kvalitete.",
  },
  la_liga: {
    name: "Španjolska La Liga",
    category: "DEFANZIVNA",
    avgGoals: 2.52,
    bttsRate: 48,
    goalMultiplier: 0.94,
    desc: "Taktički disciplinirana, puno tvrdih utakmica 1:0 i 1:1.",
  },
  ligue2: {
    name: "Francuska Ligue 2",
    category: "DEFANZIVNA",
    avgGoals: 2.28,
    bttsRate: 44,
    goalMultiplier: 0.86,
    desc: "Tradicionalno tvrda liga. 0-2 gola dominira u ~58% utakmica.",
  },
  serie_b: {
    name: "Talijanska Serie B",
    category: "DEFANZIVNA",
    avgGoals: 2.38,
    bttsRate: 46,
    goalMultiplier: 0.9,
    desc: "Čvrste obrane, malo prostora između linija.",
  },
};

export const DEFAULT_LEAGUE_PROFILE: LeagueProfile = {
  name: "Standardna svjetska liga",
  category: "STANDARD",
  avgGoals: 2.68,
  bttsRate: 51,
  goalMultiplier: 1.0,
  desc: "Prosječna globalna statistika bez izraženih devijacija.",
};

export function matchLeague(leagueName: string): LeagueProfile {
  const s = leagueName.toLowerCase();
  if (s.includes("netherland") || s.includes("nizozem") || s.includes("eredivisie") || s.includes("eerste")) {
    return LEAGUE_PROFILES["eredivisie"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("bundesliga") || s.includes("germany") || s.includes("njemač")) {
    return LEAGUE_PROFILES["bundesliga"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("norway") || s.includes("norve") || s.includes("eliteserien")) {
    return LEAGUE_PROFILES["norway"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("premier") || s.includes("england") || s.includes("engles")) {
    return LEAGUE_PROFILES["premier_league"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("ligue 2") || s.includes("france 2")) {
    return LEAGUE_PROFILES["ligue2"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("serie b") || s.includes("italy 2")) {
    return LEAGUE_PROFILES["serie_b"] ?? DEFAULT_LEAGUE_PROFILE;
  }
  if (s.includes("spain") || s.includes("la liga") || s.includes("segunda")) {
    return LEAGUE_PROFILES["la_liga"] ?? DEFAULT_LEAGUE_PROFILE;
  }

  return DEFAULT_LEAGUE_PROFILE;
}

