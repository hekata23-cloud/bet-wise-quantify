// ============================================================
// SMART-MONEY.TS — Smart Money & Dropping Odds Radar
// ============================================================

export interface OddsSnapshot {
  fixtureId: number;
  match: string;
  league: string;
  kickoff: string;
  market: string;
  selection: string;
  openingOdds: number;
  currentOdds: number;
  capturedAt: number;
}

export interface SmartMoneySignal extends OddsSnapshot {
  dropPercent: number;
  isSharpDrop: boolean;
  modelProbability?: number;
  modelAgrees: boolean;
  badge: "STEAM / SHARP DROP" | "SHARP CONSENSUS VERIFIED (High EV)";
}

const SNAPSHOTS_KEY = "pc.smart-money.snapshots.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DROP_THRESHOLD = 0.08;

export function saveOddsSnapshots(snapshots: OddsSnapshot[]) {
  try {
    const existing = loadOddsSnapshots();
    const newestByKey = new Map<string, OddsSnapshot>();
    for (const item of [...existing, ...snapshots]) {
      const key = `${item.fixtureId}|${item.market}|${item.selection}`;
      const prior = newestByKey.get(key);
      if (!prior || prior.capturedAt < item.capturedAt) newestByKey.set(key, item);
    }
    const cutoff = Date.now() - MAX_AGE_MS;
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([...newestByKey.values()].filter((x) => x.capturedAt >= cutoff)));
  } catch {
    // Ignore storage quota errors; odds radar remains available with current snapshot.
  }
}

export function loadOddsSnapshots(): OddsSnapshot[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return raw.filter((x): x is OddsSnapshot =>
      x && typeof x === "object" && Number.isFinite(x.capturedAt) && x.capturedAt >= cutoff &&
      Number.isFinite(x.currentOdds) && Number.isFinite(x.openingOdds)
    );
  } catch {
    return [];
  }
}

export function detectDroppingOdds(
  current: OddsSnapshot[],
  modelProbabilities: Record<string, number> = {},
): SmartMoneySignal[] {
  const old = loadOddsSnapshots();
  const oldByKey = new Map(old.map((x) => [`${x.fixtureId}|${x.market}|${x.selection}`, x]));

  const signals: SmartMoneySignal[] = [];
  for (const now of current) {
    const key = `${now.fixtureId}|${now.market}|${now.selection}`;
    const previous = oldByKey.get(key);
    const openingOdds = previous?.openingOdds ?? now.openingOdds;
    if (!(openingOdds > 1) || !(now.currentOdds > 1)) continue;

    // Odds drop as implied probability increases. Percentage is relative to opening price.
    const dropPercent = ((openingOdds - now.currentOdds) / openingOdds) * 100;
    if (dropPercent < DROP_THRESHOLD * 100) continue;

    const modelProbability = modelProbabilities[key];
    const impliedCurrent = 1 / now.currentOdds;
    const modelAgrees = Number.isFinite(modelProbability) && modelProbability >= impliedCurrent;
    signals.push({
      ...now,
      openingOdds,
      dropPercent: Number(dropPercent.toFixed(1)),
      isSharpDrop: true,
      modelProbability,
      modelAgrees,
      badge: modelAgrees ? "SHARP CONSENSUS VERIFIED (High EV)" : "STEAM / SHARP DROP",
    });
  }
  return signals.sort((a, b) => b.dropPercent - a.dropPercent);
}
