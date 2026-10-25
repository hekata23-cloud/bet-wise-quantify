/**
 * Zlatni tip — profesionalni model predikcija.
 * 1. bet365 kvote → uklanjanje marže (power metoda) → "poštene" vjerojatnosti tržišta.
 * 2. Dixon-Coles bivarijatni Poisson: λ domaćina/gosta se fitaju na 1X2 + sve O/U linije + GG/NG.
 * 3. Statistika sezone (golovi dom/gost) s Bayes skupljanjem prema prosjeku lige → blend s tržištem.
 * 4. Iz jedne matrice rezultata računaju se sva golovna tržišta (dosljedno, bez kontradikcija).
 * 5. Poluvremena: udio golova u 1. pol. kalibriran na bet365 liniju 1. poluvremena.
 * 6. Korneri/kartoni: devig bet365 linija (tržište je tu najtočniji izvor).
 */
import type { Bet365Markets, TeamStats } from "./zlatni-tip.functions";

export type Outcome = { label: string; p: number; odd?: number; fair: number; ev?: number };
export type Market = { group: string; name: string; outcomes: Outcome[]; pick: Outcome; source: "model" | "tržište" };
export type Analysis = {
  lh: number; la: number; fitError: number | null; htShare: number;
  markets: Market[];
  topScores: { score: string; p: number; odd?: number }[];
  golden: { market: string; outcome: Outcome; kind: string } | null;
  safe: { market: string; outcome: Outcome } | null;
  value: { market: string; outcome: Outcome } | null;
  notes: string[];
};

const MAXG = 10;
const RHO = -0.06;

// ---------- matematika ----------
const fact = (() => { const f = [1]; for (let i = 1; i <= 20; i++) f[i] = f[i - 1]! * i; return f; })();
const pois = (k: number, l: number) => Math.exp(-l) * l ** k / fact[k]!;

function tau(x: number, y: number, lh: number, la: number) {
  if (x === 0 && y === 0) return 1 - lh * la * RHO;
  if (x === 0 && y === 1) return 1 + lh * RHO;
  if (x === 1 && y === 0) return 1 + la * RHO;
  if (x === 1 && y === 1) return 1 - RHO;
  return 1;
}

export function matrix(lh: number, la: number, dc = true): number[][] {
  const m: number[][] = [];
  let s = 0;
  for (let i = 0; i <= MAXG; i++) {
    m[i] = [];
    for (let j = 0; j <= MAXG; j++) {
      const v = pois(i, lh) * pois(j, la) * (dc ? tau(i, j, lh, la) : 1);
      m[i]![j] = Math.max(v, 0);
      s += m[i]![j]!;
    }
  }
  for (const r of m) for (let j = 0; j <= MAXG; j++) r[j]! /= s;
  return m;
}

const sum = (m: number[][], f: (i: number, j: number) => boolean) => {
  let s = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (f(i, j)) s += m[i]![j]!;
  return s;
};

/** Power-metoda uklanjanja marže (točnija od proporcionalne za favorite/autsajdere). */
export function devig(odds: number[]): number[] {
  const inv = odds.map((o) => 1 / o);
  if (inv.reduce((a, b) => a + b, 0) <= 1) { const t = inv.reduce((a, b) => a + b, 0); return inv.map((x) => x / t); }
  let lo = 1, hi = 3;
  // POPRAVAK: proširi gornju granicu ako je marža toliko visoka da korijen leži iznad 3.
  while (inv.reduce((a, x) => a + x ** hi, 0) > 1 && hi < 256) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const t = inv.reduce((a, x) => a + x ** k, 0);
    if (t > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  const powered = inv.map((x) => x ** k);
  const t = powered.reduce((a, b) => a + b, 0);
  return powered.map((x) => x / t);
}

// ---------- čitanje bet365 tržišta ----------
function find(mk: Bet365Markets, ...names: string[]) {
  for (const n of names) {
    const hit = Object.keys(mk).find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit) return mk[hit]!;
  }
  return undefined;
}
const val = (m: Record<string, number> | undefined, ...keys: string[]) => {
  if (!m) return undefined;
  for (const k of keys) {
    const hit = Object.keys(m).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit) return m[hit];
  }
  return undefined;
};
function lines(m: Record<string, number> | undefined) {
  const out: Record<string, { o: number; u: number }> = {};
  if (!m) return out;
  const tmp: Record<string, { o?: number; u?: number }> = {};
  for (const [k, v] of Object.entries(m)) {
    const r = k.match(/^(over|under)\s*([0-9.]+)$/i);
    if (!r) continue;
    const l = String(parseFloat(r[2]!));
    (tmp[l] ??= {})[r[1]!.toLowerCase() === "over" ? "o" : "u"] = v;
  }
  for (const [l, x] of Object.entries(tmp)) if (x.o && x.u) out[l] = { o: x.o, u: x.u };
  return out;
}

// ---------- fit λ na tržište ----------
type Target = { f: (m: number[][]) => number; p: number; w: number };

function fitMarket(mk: Bet365Markets): { lh: number; la: number; err: number } | null {
  const t: Target[] = [];
  const mw = find(mk, "Match Winner");
  const h = val(mw, "Home"), d = val(mw, "Draw"), a = val(mw, "Away");
  if (h && d && a) {
    const [ph, pd, pa] = devig([h, d, a]);
    t.push({ f: (m) => sum(m, (i, j) => i > j), p: ph!, w: 3 });
    t.push({ f: (m) => sum(m, (i, j) => i === j), p: pd!, w: 2 });
    t.push({ f: (m) => sum(m, (i, j) => i < j), p: pa!, w: 3 });
  }
  for (const [l, x] of Object.entries(lines(find(mk, "Goals Over/Under")))) {
    const L = parseFloat(l);
    if (L % 1 === 0) continue; // cijele linije imaju povrat — preskoči
    const [po] = devig([x.o, x.u]);
    t.push({ f: (m) => sum(m, (i, j) => i + j > L), p: po!, w: L === 2.5 ? 3 : 1.5 });
  }
  const bt = find(mk, "Both Teams Score", "Both Teams To Score");
  const y = val(bt, "Yes"), n = val(bt, "No");
  if (y && n) { const [py] = devig([y, n]); t.push({ f: (m) => sum(m, (i, j) => i > 0 && j > 0), p: py!, w: 2 }); }
  if (t.length < 3) return null;

  const loss = (lh: number, la: number) => {
    const m = matrix(lh, la);
    return t.reduce((s, x) => s + x.w * (x.f(m) - x.p) ** 2, 0);
  };
  let best = { lh: 1.4, la: 1.1, err: Infinity };
  for (let lh = 0.15; lh <= 4.5; lh += 0.1)
    for (let la = 0.15; la <= 4.5; la += 0.1) {
      const e = loss(lh, la);
      if (e < best.err) best = { lh, la, err: e };
    }
  for (let step = 0.04; step >= 0.005; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]]) {
        const lh = best.lh + dh!, la = best.la + da!;
        if (lh < 0.05 || la < 0.05) continue;
        const e = loss(lh, la);
        if (e < best.err) { best = { lh, la, err: e }; moved = true; }
      }
    }
  }
  return { ...best, err: Math.sqrt(best.err / t.reduce((s, x) => s + x.w, 0)) };
}

function fitStats(h: TeamStats | null, a: TeamStats | null) {
  if (!h || !a || h.playedHome + a.playedAway < 2) return null;
  const LH = 1.45, LA = 1.15; // prosjek europskih liga (dom/gost)
  const nh = h.playedHome, na = a.playedAway;
  const shrink = (v: number, prior: number, n: number) => (v * n + prior * 5) / (n + 5);
  const att_h = shrink(h.gfHome, LH, nh) / LH, def_a = shrink(a.gaAway, LH, na) / LH;
  const att_a = shrink(a.gfAway, LA, na) / LA, def_h = shrink(h.gaHome, LA, nh) / LA;
  return { lh: LH * att_h * def_a, la: LA * att_a * def_h, n: Math.min(nh, na) };
}

// ---------- glavna analiza ----------
export function analyze(mk: Bet365Markets, home: TeamStats | null, away: TeamStats | null): Analysis {
  const notes: string[] = [];
  const fm = fitMarket(mk);
  const fs = fitStats(home, away);
  let lh: number, la: number;
  if (fm && fs) {
    const ws = Math.min(0.25, fs.n / 40); // tržište je dominantno, statistika korigira
    lh = fm.lh * (1 - ws) + fs.lh * ws;
    la = fm.la * (1 - ws) + fs.la * ws;
    notes.push(`Model: bet365 ${Math.round((1 - ws) * 100)}% + statistika sezone ${Math.round(ws * 100)}%.`);
  } else if (fm) { lh = fm.lh; la = fm.la; notes.push("Model kalibriran isključivo na bet365 kvote."); }
  else if (fs) { lh = fs.lh; la = fs.la; notes.push("bet365 kvote nedostupne — model samo iz statistike sezone (manja točnost)."); }
  else { lh = 1.4; la = 1.1; notes.push("Nema kvota ni statistike — prikaz nije pouzdan."); }

  // udio 1. poluvremena
  let htShare = 0.445;
  const ht = lines(find(mk, "Goals Over/Under First Half"));
  if (ht["0.5"]) {
    const [p] = devig([ht["0.5"].o, ht["0.5"].u]);
    htShare = Math.min(0.5, Math.max(0.38, -Math.log(1 - p!) / (lh + la)));
  }

  const M = matrix(lh, la);
  const H1 = matrix(lh * htShare, la * htShare, false);
  const H2 = matrix(lh * (1 - htShare), la * (1 - htShare), false);

  const markets: Market[] = [];
  const mkO = (label: string, p: number, odd?: number): Outcome => ({ label, p, odd, fair: 1 / Math.max(p, 1e-6), ev: odd ? p * odd - 1 : undefined });
  const push = (group: string, name: string, outs: Outcome[], source: Market["source"] = "model") => {
    if (!outs.length) return;
    const pick = [...outs].sort((x, y) => y.p - x.p)[0]!;
    markets.push({ group, name, outcomes: outs, pick, source });
  };
  const yn = (group: string, name: string, p: number, bm?: Record<string, number>) =>
    push(group, name, [mkO("DA", p, val(bm, "Yes")), mkO("NE", 1 - p, val(bm, "No"))]);

  // 1X2 i izvedenice
  const pH = sum(M, (i, j) => i > j), pD = sum(M, (i, j) => i === j), pA = sum(M, (i, j) => i < j);
  const mw = find(mk, "Match Winner");
  push("Ishod", "Konačan ishod 1X2", [mkO("1", pH, val(mw, "Home")), mkO("X", pD, val(mw, "Draw")), mkO("2", pA, val(mw, "Away"))]);
  const dc = find(mk, "Double Chance");
  push("Ishod", "Dvostruka šansa", [mkO("1X", pH + pD, val(dc, "Home/Draw")), mkO("12", pH + pA, val(dc, "Home/Away")), mkO("X2", pD + pA, val(dc, "Draw/Away"))]);
  const dnb = find(mk, "Home/Away");
  push("Ishod", "Ishod bez neriješenog (DNB)", [mkO("1", pH / (pH + pA), val(dnb, "Home")), mkO("2", pA / (pH + pA), val(dnb, "Away"))]);

  // golovi
  const ou = find(mk, "Goals Over/Under");
  for (const L of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    const p = sum(M, (i, j) => i + j > L);
    push("Golovi", `Ukupno golova ${L}`, [mkO(`Više ${L}`, p, val(ou, `Over ${L}`)), mkO(`Manje ${L}`, 1 - p, val(ou, `Under ${L}`))]);
  }
  yn("Golovi", "Oba tima zabijaju (GG)", sum(M, (i, j) => i > 0 && j > 0), find(mk, "Both Teams Score"));
  const th = find(mk, "Total - Home"), ta = find(mk, "Total - Away");
  for (const L of [0.5, 1.5, 2.5]) {
    const p = sum(M, (i) => i > L), q = sum(M, (_, j) => j > L);
    push("Golovi tima", `Domaćin golova ${L}`, [mkO(`Više ${L}`, p, val(th, `Over ${L}`)), mkO(`Manje ${L}`, 1 - p, val(th, `Under ${L}`))]);
    push("Golovi tima", `Gost golova ${L}`, [mkO(`Više ${L}`, q, val(ta, `Over ${L}`)), mkO(`Manje ${L}`, 1 - q, val(ta, `Under ${L}`))]);
  }
  const oe = find(mk, "Odd/Even");
  const pOdd = sum(M, (i, j) => (i + j) % 2 === 1);
  push("Golovi", "Par / nepar golova", [mkO("Nepar", pOdd, val(oe, "Odd")), mkO("Par", 1 - pOdd, val(oe, "Even"))]);
  push("Golovi", "Raspon golova", [
    mkO("0-1", sum(M, (i, j) => i + j <= 1)), mkO("2-3", sum(M, (i, j) => i + j >= 2 && i + j <= 3)),
    mkO("4-6", sum(M, (i, j) => i + j >= 4 && i + j <= 6)), mkO("7+", sum(M, (i, j) => i + j >= 7)),
  ]);
  yn("Golovi tima", "Domaćin pobjeđuje bez primljenog gola", sum(M, (i, j) => i > j && j === 0), find(mk, "Win to Nil - Home"));
  yn("Golovi tima", "Gost pobjeđuje bez primljenog gola", sum(M, (i, j) => j > i && i === 0), find(mk, "Win to Nil - Away"));
  yn("Golovi tima", "Domaćin čuva mrežu (clean sheet)", sum(M, (_, j) => j === 0), find(mk, "Clean Sheet - Home"));
  yn("Golovi tima", "Gost čuva mrežu (clean sheet)", sum(M, (i) => i === 0), find(mk, "Clean Sheet - Away"));

  // kombinacije
  const rb = find(mk, "Results/Both Teams Score");
  push("Kombinacije", "Ishod + GG", [
    mkO("1 & GG", sum(M, (i, j) => i > j && j > 0), val(rb, "Home/Yes")), mkO("1 & NG", sum(M, (i, j) => i > j && j === 0), val(rb, "Home/No")),
    mkO("X & GG", sum(M, (i, j) => i === j && i > 0), val(rb, "Draw/Yes")), mkO("X & NG", M[0]![0]!, val(rb, "Draw/No")),
    mkO("2 & GG", sum(M, (i, j) => j > i && i > 0), val(rb, "Away/Yes")), mkO("2 & NG", sum(M, (i, j) => j > i && i === 0), val(rb, "Away/No")),
  ]);
  push("Kombinacije", "Dvostruka šansa + 1.5 golova", [
    mkO("1X & 2+", sum(M, (i, j) => i >= j && i + j >= 2)), mkO("X2 & 2+", sum(M, (i, j) => j >= i && i + j >= 2)), mkO("12 & 2+", sum(M, (i, j) => i !== j && i + j >= 2)),
  ]);

  // poluvremena (nezavisni Poisson po poluvremenu)
  // POPRAVAK: uključuje cijeli raspon matrica kako konvolucija ne bi odbacila golove 7–10.
  const conv = (fn: (h1: number, a1: number, h2: number, a2: number) => boolean) => {
    let s = 0;
    for (let a = 0; a <= MAXG; a++) for (let b = 0; b <= MAXG; b++) for (let c = 0; c <= MAXG; c++) for (let d = 0; d <= MAXG; d++)
      if (fn(a, b, c, d)) s += H1[a]![b]! * H2[c]![d]!;
    return s;
  };
  const fh = find(mk, "First Half Winner");
  push("Poluvremena", "1. poluvrijeme 1X2", [mkO("1", sum(H1, (i, j) => i > j), val(fh, "Home")), mkO("X", sum(H1, (i, j) => i === j), val(fh, "Draw")), mkO("2", sum(H1, (i, j) => i < j), val(fh, "Away"))]);
  const htou = find(mk, "Goals Over/Under First Half");
  for (const L of [0.5, 1.5]) {
    const p = sum(H1, (i, j) => i + j > L);
    push("Poluvremena", `1. poluvrijeme golova ${L}`, [mkO(`Više ${L}`, p, val(htou, `Over ${L}`)), mkO(`Manje ${L}`, 1 - p, val(htou, `Under ${L}`))]);
  }
  const p2 = sum(H2, (i, j) => i + j > 0.5);
  push("Poluvremena", "2. poluvrijeme golova 0.5", [mkO("Više 0.5", p2), mkO("Manje 0.5", 1 - p2)]);
  yn("Poluvremena", "Gol u oba poluvremena", conv((a, b, c, d) => a + b > 0 && c + d > 0));
  yn("Poluvremena", "Domaćin zabija u oba poluvremena", conv((a, _b, c) => a > 0 && c > 0));
  yn("Poluvremena", "Gost zabija u oba poluvremena", conv((_a, b, _c, d) => b > 0 && d > 0));
  yn("Poluvremena", "Domaćin osvaja barem 1 poluvrijeme", conv((a, b, c, d) => a > b || c > d));
  yn("Poluvremena", "Gost osvaja barem 1 poluvrijeme", conv((a, b, c, d) => b > a || d > c));
  const g1 = conv((a, b, c, d) => a + b > c + d), g2 = conv((a, b, c, d) => c + d > a + b);
  push("Poluvremena", "Poluvrijeme s više golova", [mkO("1. pol.", g1), mkO("Jednako", 1 - g1 - g2), mkO("2. pol.", g2)]);
  const hf = find(mk, "HT/FT Double");
  const r = (x: number, y: number) => (x > y ? "1" : x === y ? "X" : "2");
  const map: Record<string, string> = { "1": "Home", X: "Draw", "2": "Away" };
  const htft: Outcome[] = [];
  for (const A of ["1", "X", "2"]) for (const B of ["1", "X", "2"])
    htft.push(mkO(`${A}/${B}`, conv((a, b, c, d) => r(a, b) === A && r(a + c, b + d) === B), val(hf, `${map[A]}/${map[B]}`)));
  push("Poluvremena", "Poluvrijeme / Kraj", htft);

  // korneri / kartoni — devig bet365 linija
  const market = (group: string, title: string, src?: Record<string, number>) => {
    const ls = lines(src);
    for (const [l, x] of Object.entries(ls).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))) {
      const [po, pu] = devig([x.o, x.u]);
      push(group, `${title} ${l}`, [mkO(`Više ${l}`, po!, x.o), mkO(`Manje ${l}`, pu!, x.u)], "tržište");
    }
  };
  market("Korneri", "Korneri ukupno", find(mk, "Corners Over Under", "Corners Over/Under", "Total Corners"));
  market("Kartoni", "Kartoni ukupno", find(mk, "Cards Over/Under", "Cards Over Under", "Total Cards"));

  // točan rezultat
  const es = find(mk, "Exact Score", "Correct Score");
  const scores: { score: string; p: number; odd?: number }[] = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) scores.push({ score: `${i}:${j}`, p: M[i]![j]!, odd: val(es, `${i}:${j}`) });
  scores.sort((a, b) => b.p - a.p);
  push("Rezultat", "Točan rezultat", scores.slice(0, 6).map((s) => mkO(s.score, s.p, s.odd)));

  // izbor tipova
  const all = markets.flatMap((m) => m.outcomes.map((o) => ({ market: m.name, outcome: o, src: m.source })));
  const priced = all.filter((x) => x.outcome.odd && x.outcome.odd >= 1.2);
  const safe = [...priced].filter((x) => x.outcome.odd! >= 1.25).sort((a, b) => b.outcome.p - a.outcome.p)[0] ?? null;
  const value = [...priced].filter((x) => x.outcome.p >= 0.4 && x.src === "model").sort((a, b) => b.outcome.ev! - a.outcome.ev!)[0] ?? null;
  // Zlatni: visoka vjerojatnost + nenegativan EV + kvota koja se isplati
  const gold = [...priced]
    .filter((x) => x.outcome.p >= 0.62 && x.outcome.odd! >= 1.3 && x.outcome.ev! >= -0.01)
    .sort((a, b) => b.outcome.p * (1 + b.outcome.ev!) * Math.log(b.outcome.odd!) - a.outcome.p * (1 + a.outcome.ev!) * Math.log(a.outcome.odd!))[0];
  const golden = gold
    ? { market: gold.market, outcome: gold.outcome, kind: gold.outcome.ev! > 0.02 ? "Value + sigurnost" : "Visoka vjerojatnost" }
    : safe ? { market: safe.market, outcome: safe.outcome, kind: "Najsigurnija opcija (bez value prednosti)" } : null;

  return { lh, la, fitError: fm?.err ?? null, htShare, markets, topScores: scores.slice(0, 6), golden, safe, value, notes };
}
