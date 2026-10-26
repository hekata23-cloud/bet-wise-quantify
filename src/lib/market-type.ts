// ============================================================
// MARKET-TYPE — strogi "enum" tržišta za settlement listića
// Zamjenjuje krhko if-else prepoznavanje po nazivu. Svako tržište se
// prvo svrstava u točno jedan MarketType + period (HT / FT) + tim,
// tek onda ga evaluator ocjenjuje. Nema "pogađanja" između 1X i Over 1.5.
// ============================================================

export const MarketType = {
  MATCH_RESULT_1X2: "MATCH_RESULT_1X2",
  MONEYLINE: "MONEYLINE",
  DOUBLE_CHANCE: "DOUBLE_CHANCE",
  BTTS: "BTTS",
  OVER_UNDER_GOALS: "OVER_UNDER_GOALS",
  OVER_UNDER_POINTS: "OVER_UNDER_POINTS",
  ASIAN_HANDICAP: "ASIAN_HANDICAP",
  DNB: "DNB",
  HT_FT: "HT_FT",
  UNKNOWN: "UNKNOWN",
} as const;
export type MarketType = (typeof MarketType)[keyof typeof MarketType];

export type MarketPeriod = "FT" | "HT";

export interface MarketClass {
  type: MarketType;
  period: MarketPeriod;
  /** Za timske totale: čiji se golovi/poeni broje. */
  team: "1" | "2" | null;
}

type SportHint = "nogomet" | "košarka" | "rukomet";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/−/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

const HT_RE =
  /(^|[^a-z])(ht|1h|1\.? ?pol|prvo poluvrijeme|poluvrijeme|half[- ]?time|first half|polu)([^a-z/]|$)/;
const OU_RE = /(over|under|vi[sš]e|manje|o\/u|total|ukupno|golovi|poeni)/;

function teamOf(s: string): "1" | "2" | null {
  if (/(doma[cć]in|^dom|home|tim 1)/.test(s)) return "1";
  if (/(gost|away|tim 2)/.test(s)) return "2";
  return null;
}

/** Svrstaj par (tržište, tip) u točno jednu vrstu. Redoslijed provjera je bitan. */
export function classifyMarket(
  market: string,
  selection: string,
  sport: SportHint = "nogomet",
): MarketClass {
  const m = norm(market);
  const s = norm(selection);
  const both = `${m} ${s}`;

  // 1) HT/FT — "1/X", "X/2" ili eksplicitno ime tržišta
  if (
    /ht\s*\/\s*ft|poluvrijeme\s*\/\s*kraj|half ?time\s*\/\s*full ?time/.test(m) ||
    /^[12x]\s*\/\s*[12x]$/.test(s)
  )
    return { type: MarketType.HT_FT, period: "FT", team: null };

  const period: MarketPeriod = HT_RE.test(m) ? "HT" : "FT";

  // 2) DNB — prije 1X2/hendikepa jer "DNB 1" sadrži "1"
  if (/(dnb|draw no bet|bez remi|pobjeda bez|home\/away)/.test(both))
    return { type: MarketType.DNB, period, team: null };

  // 3) Asian handicap / spread
  if (/(asian|azijski|handicap|hendikep|spread|^ah\b|\bah )/.test(both))
    return { type: MarketType.ASIAN_HANDICAP, period, team: null };

  // 4) Dvostruka šansa
  if (/(dvostruka|double chance)/.test(m) || /^(1x|x2|12)$/.test(s.replace(/\s/g, "")))
    return { type: MarketType.DOUBLE_CHANCE, period, team: null };

  // 5) BTTS
  if (/(btts|both teams|oba (tima )?daju|^gg$|^ng$|gg\/ng)/.test(m) || /^(gg|ng|btts)/.test(s))
    return { type: MarketType.BTTS, period, team: null };

  // 6) Over/Under (uklj. timske totale)
  if (OU_RE.test(m) || /^(over|under|vi[sš]e|manje)/.test(s)) {
    const team = /(tim ?total|team total|doma[cć]in|^dom|gost|home|away)/.test(m)
      ? teamOf(m)
      : null;
    const type =
      sport === "košarka" || /poen|point/.test(both)
        ? MarketType.OVER_UNDER_POINTS
        : MarketType.OVER_UNDER_GOALS;
    return { type, period, team };
  }

  // 7) Moneyline (2-načina)
  if (/(moneyline|pobjednik me[cč]a)/.test(m))
    return { type: MarketType.MONEYLINE, period, team: null };

  // 8) 1X2
  if (
    /(1x2|kona[cč]an ishod|match winner|ishod)/.test(m) ||
    /^(1|x|2|doma[cć]in|gost|remi|nerije[sš]eno|home|away|draw)$/.test(s)
  ) {
    if (sport === "košarka" && !/1x2/.test(m))
      return { type: MarketType.MONEYLINE, period, team: null };
    return { type: MarketType.MATCH_RESULT_1X2, period, team: null };
  }

  return { type: MarketType.UNKNOWN, period, team: null };
}
