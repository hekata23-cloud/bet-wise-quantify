// Čisti matematički alati za karticu "Pro Alati" (bez API poziva).
const fact = (k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
export const poisson = (l: number, k: number) => (Math.exp(-l) * Math.pow(l, k)) / fact(k);

export function matrix(lh: number, la: number, max = 10): number[][] {
  const m: number[][] = [];
  let s = 0;
  for (let i = 0; i <= max; i++) { m[i] = []; for (let j = 0; j <= max; j++) { m[i][j] = poisson(lh, i) * poisson(la, j); s += m[i][j]; } }
  return m.map((r) => r.map((v) => v / s));
}

export function oneXtwo(lh: number, la: number) {
  const m = matrix(lh, la); let h = 0, d = 0, a = 0, o25 = 0, gg = 0;
  m.forEach((r, i) => r.forEach((p, j) => { if (i > j) h += p; else if (i === j) d += p; else a += p; if (i + j > 2.5) o25 += p; if (i > 0 && j > 0) gg += p; }));
  return { h, d, a, o25, gg };
}

/** Razdvaja četvrtinske linije (-0.25 → [0, -0.5]). */
const halves = (line: number) => (Math.abs((line * 4) % 2) === 1 ? [line - 0.25, line + 0.25] : [line]);

export interface LineResult { win: number; push: number; loss: number; fairOdds: number }

/** Fer kvota za koju je očekivana dobit 0: o = 1 + E[gubitak] / E[dobitak]. */
function settle(m: number[][], val: (i: number, j: number) => number, line: number): LineResult {
  const parts = halves(line); let fw = 0, fl = 0, win = 0, push = 0, loss = 0;
  m.forEach((r, i) => r.forEach((p, j) => {
    for (const l of parts) {
      const x = val(i, j) + l, w = p / parts.length;
      if (x > 1e-9) { fw += w; win += w; } else if (x < -1e-9) { fl += w; loss += w; } else push += w;
    }
  }));
  return { win, push, loss, fairOdds: fw > 0 ? 1 + fl / fw : Infinity };
}
export const asianHandicap = (lh: number, la: number, homeLine: number) => settle(matrix(lh, la), (i, j) => i - j, homeLine);
export const goalLineOver = (lh: number, la: number, line: number) => settle(matrix(lh, la), (i, j) => i + j, -line);

/** Over/Under za kornere/kartone: Poisson ukupnog broja. */
export function countOver(lambda: number, line: number) {
  let under = 0; for (let k = 0; k <= Math.floor(line); k++) under += poisson(lambda, k);
  return { over: 1 - under, under };
}
export const statLambda = (hFor: number, hAg: number, aFor: number, aAg: number) => (hFor + aAg) / 2 + (aFor + hAg) / 2;

/** Arbitraža: zbroj 1/kvota < 1 → siguran profit. */
export function arbitrage(odds: number[], bank: number) {
  const inv = odds.reduce((s, o) => s + 1 / o, 0);
  const stakes = odds.map((o) => (bank * (1 / o)) / inv);
  return { margin: inv, profitPct: (1 / inv - 1) * 100, stakes, surebet: inv < 1 };
}

export interface Leg { label: string; prob: number; odds: number; match: string }
export function combo(legs: Leg[]) {
  const prob = legs.reduce((p, l) => p * l.prob, 1);
  const odds = legs.reduce((p, l) => p * l.odds, 1);
  const seen = new Map<string, number>(); legs.forEach((l) => seen.set(l.match.trim().toLowerCase(), (seen.get(l.match.trim().toLowerCase()) ?? 0) + 1));
  const correlated = [...seen.entries()].filter(([k, v]) => k && v > 1).map(([k]) => k);
  return { prob, odds, fairOdds: prob > 0 ? 1 / prob : Infinity, ev: prob * odds - 1, correlated };
}

export const kelly = (p: number, o: number, frac = 0.25) => Math.max(0, ((p * o - 1) / (o - 1)) * frac);

/** Live: preostali λ prema minuti i omjeru pritiska (udarci u okvir ×3 + opasni napadi). */
export function liveMomentum(x: { minute: number; lh: number; la: number; sotH: number; sotA: number; daH: number; daA: number }) {
  const rem = Math.max(0, 90 - x.minute) / 90;
  const pH = x.sotH * 3 + x.daH, pA = x.sotA * 3 + x.daA, tot = pH + pA;
  const shareH = tot > 0 ? pH / tot : 0.5;
  const baseShare = x.lh / (x.lh + x.la);
  // umjerena korekcija (max ±40%) prema stvarnom pritisku
  const fH = Math.min(1.4, Math.max(0.6, shareH / baseShare));
  const fA = Math.min(1.4, Math.max(0.6, (1 - shareH) / (1 - baseShare)));
  const rh = x.lh * rem * fH, ra = x.la * rem * fA, r = rh + ra;
  const noGoal = Math.exp(-r);
  return { rh, ra, noGoal, nextHome: (1 - noGoal) * (rh / (r || 1)), nextAway: (1 - noGoal) * (ra / (r || 1)) };
}

export type Role = "napadac" | "vezni" | "obrana" | "golman";
const IMPACT: Record<Role, { att: number; def: number }> = {
  napadac: { att: 0.1, def: 0 }, vezni: { att: 0.05, def: 0.04 }, obrana: { att: 0, def: 0.07 }, golman: { att: 0, def: 0.1 },
};
/** Ključni igrač koji nedostaje smanjuje napad svog tima ili povećava napad protivnika. */
export function injuryAdjust(lh: number, la: number, missing: { team: "home" | "away"; role: Role; key: boolean }[]) {
  let h = lh, a = la;
  for (const m of missing) {
    const w = m.key ? 1 : 0.4, i = IMPACT[m.role];
    if (m.team === "home") { h *= 1 - i.att * w; a *= 1 + i.def * w; } else { a *= 1 - i.att * w; h *= 1 + i.def * w; }
  }
  return { lh: h, la: a };
}

export interface Bet { id: string; label: string; stake: number; odds: number; closing: number | null; result: "win" | "loss" | "push" | null; ts: number }
export function bankrollStats(bets: Bet[]) {
  const done = bets.filter((b) => b.result);
  const staked = done.reduce((s, b) => s + b.stake, 0);
  const profit = done.reduce((s, b) => s + (b.result === "win" ? b.stake * (b.odds - 1) : b.result === "loss" ? -b.stake : 0), 0);
  const clv = bets.filter((b) => b.closing && b.closing > 1);
  const avgClv = clv.length ? clv.reduce((s, b) => s + (b.odds / (b.closing as number) - 1), 0) / clv.length : null;
  return { count: done.length, staked, profit, roi: staked ? profit / staked : 0, avgClv, hit: done.length ? done.filter((b) => b.result === "win").length / done.length : 0 };
}

export interface HistPick { id: string; card: string; label: string; prob: number; won: boolean | null; ts: number }
export function historyByCard(picks: HistPick[]) {
  const out: Record<string, { n: number; hit: number; brier: number; expected: number }> = {};
  for (const p of picks) {
    if (p.won === null) continue;
    const o = (out[p.card] ??= { n: 0, hit: 0, brier: 0, expected: 0 });
    o.n++; if (p.won) o.hit++; o.brier += (p.prob - (p.won ? 1 : 0)) ** 2; o.expected += p.prob;
  }
  return Object.entries(out).map(([card, o]) => ({ card, n: o.n, hitRate: o.hit / o.n, brier: o.brier / o.n, expected: o.expected / o.n }));
}
