// ============================================================
// LEAGUE-TIERS.TS — Tier 1 / All / Favorites league filtering
// ============================================================

export const TOP_LEAGUES = [
  "Champions League",
  "UEFA Champions League",
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "HNL",
  "NBA",
  "EuroLeague",
  "Euroleague",
];

export function isTier1League(league?: string | null): boolean {
  if (!league) return false;
  const normalized = league.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return TOP_LEAGUES.some((name) => {
    const target = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return normalized === target || normalized.includes(target) || target.includes(normalized);
  });
}
