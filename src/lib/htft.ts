// ══ VISOKI STRUČNJAK ZA HT/FT (POLUVRIJEME–KRAJ) v14 ══
import { loadJSON, saveJSON } from "./storage";

export type HtFtCombo =
  | "1/1" | "1/X" | "1/2"
  | "X/1" | "X/X" | "X/2"
  | "2/1" | "2/X" | "2/2";

export const HTFT_COMBOS: HtFtCombo[] = [
  "1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2",
];

export type HtFtModuleId =
  | "splitLambda" | "htMatrix" | "ftMatrix" | "jointDist"
  | "dixonColes" | "drawShare" | "turnoverRate" | "tempoProfile"
  | "leagueBase" | "scorePortfolio" | "resultGrouping" | "devigOdds"
  | "calibration" | "coherence" | "riskCeiling" | "auditBlock";

export interface HtFtModule {
  id: HtFtModuleId;
  label: string;
  desc: string;
}

export const HTFT_MODULES: HtFtModule[] = [
  { id: "splitLambda", label: "Razdvojeni λ", desc: "Nezavisni izračun za svako poluvrijeme." },
  { id: "htMatrix", label: "HT Matrica 0-4", desc: "Poissonova distribucija za prvo poluvrijeme." },
  { id: "ftMatrix", label: "FT Matrica 0-6", desc: "Puna Poissonova distribucija za cijelu utakmicu." },
  { id: "jointDist", label: "Zajednička HT×FT", desc: "Korelacija rezultata poluvremena i kraja." },
  { id: "dixonColes", label: "Dixon-Coles", desc: "Korekcija za niske rezultate (0:0, 1:1)." },
  { id: "drawShare", label: "Realan udio X", desc: "Kalibracija neriješenog ishoda prema snazi liga." },
  { id: "turnoverRate", label: "Stopa preokreta", desc: "Analiza vjerojatnosti 1/2 i 2/1 ishoda." },
  { id: "tempoProfile", label: "Tempo profil", desc: "Procjena intenziteta golova po periodima." },
  { id: "leagueBase", label: "Bazna linija lige", desc: "Usklađivanje s povijesnim prosjekom lige." },
  { id: "scorePortfolio", label: "Top-5 Portfelj", desc: "Samo najvjerojatniji rezultati ulaze u kalkulaciju." },
  { id: "resultGrouping", label: "Grupiranje", desc: "Spajanje sličnih ishoda radi stabilnosti." },
  { id: "devigOdds", label: "De-vig kvota", desc: "Uklanjanje kladioničarske marže iz modela." },
  { id: "calibration", label: "Kalibracija", desc: "Povlačenje ekstremnih λ prema sredini." },
  { id: "coherence", label: "Koherencija", desc: "Provjera HT↔FT↔BTTS logičke povezanosti." },
  { id: "riskCeiling", label: "Strop rizika", desc: "Automatsko smanjenje p za visoke kvote." },
  { id: "auditBlock", label: "Revizijski blok", desc: "Detaljan ispis svih faza izračuna boti." },
];

export interface HtFtPrefs {
  enabled: boolean;
  autoAttach: boolean;
  homeFor: number;
  homeAgainst: number;
  awayFor: number;
  awayAgainst: number;
  leagueAvg: number;
  homeAdvantage: number;
  firstHalfShare: number;
  rho: number;
  minConfidence: number;
  maxScoreProb: number;
  topScoresCount: number;
  on: Record<HtFtModuleId, boolean>;
}

export const DEFAULT_HTFT: HtFtPrefs = {
  enabled: false,
  autoAttach: true,
  homeFor: 1.6,
  homeAgainst: 1.1,
  awayFor: 1.2,
  awayAgainst: 1.4,
  leagueAvg: 2.7,
  homeAdvantage: 1.12,
  firstHalfShare: 0.45,
  rho: -0.03,
  minConfidence: 55,
  maxScoreProb: 15,
  topScoresCount: 5,
  on: {
    splitLambda: true, htMatrix: true, ftMatrix: true, jointDist: true,
    dixonColes: true, drawShare: true, turnoverRate: true, tempoProfile: true,
    leagueBase: true, scorePortfolio: true, resultGrouping: true, devigOdds: true,
    calibration: true, coherence: true, riskCeiling: true, auditBlock: true,
  },
};

const KEY = "andromeda.htft.v14";

export function loadHtFt(): HtFtPrefs {
  const saved = loadJSON<Partial<HtFtPrefs>>(KEY, {});
  return { 
    ...DEFAULT_HTFT, 
    ...saved,
    on: { ...DEFAULT_HTFT.on, ...(saved.on || {}) }
  };
}

export function saveHtFt(p: HtFtPrefs): void {
  saveJSON(KEY, p);
}

export interface HtFtResult {
  lambdaHome: number;
  lambdaAway: number;
  lambdaHome1H: number;
  lambdaAway1H: number;
  combos: Array<{ combo: HtFtCombo; p: number }>;
  scores: Array<{ score: string; p: number }>;
  p1: number; pX: number; p2: number;
  ht1: number; htX: number; ht2: number;
  p1X: number; p12: number; pX2: number;
  btts: number; over25: number; under25: number;
  topCombo: HtFtCombo;
  confidence: number;
  outcomeConfidence: number;
  safestPick: string;
  safestProb: number;
  skip: boolean;
}

function pois(l: number, k: number): number {
  if (l <= 0) return k === 0 ? 1 : 0;
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

function dc(x: number, y: number, lh: number, la: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

const sign = (h: number, a: number): "1" | "X" | "2" => (h > a ? "1" : h < a ? "2" : "X");

export function computeHtFt(p: HtFtPrefs): HtFtResult {
  const base = Math.max(0.4, p.leagueAvg) / 2;
  const lh = Math.max(0.15, (p.homeFor / base) * (p.awayAgainst / base) * base * p.homeAdvantage);
  const la = Math.max(0.15, (p.awayFor / base) * (p.homeAgainst / base) * base);

  const share = Math.min(0.7, Math.max(0.3, p.firstHalfShare));
  const lh1 = lh * share;
  const la1 = la * share;
  const lh2 = lh * (1 - share);
  const la2 = la * (1 - share);

  const MAX_HT = 4;
  const MAX_FT = 6;
  const comboP: Record<string, number> = {};
  const scoreP: Record<string, number> = {};
  const htP: Record<string, number> = { "1": 0, X: 0, "2": 0 };
  const ftP: Record<string, number> = { "1": 0, X: 0, "2": 0 };
  let bttsRaw = 0;
  let over25Raw = 0;

  for (let h1 = 0; h1 <= MAX_HT; h1++) {
    for (let a1 = 0; a1 <= MAX_HT; a1++) {
      const p1h = pois(lh1, h1) * pois(la1, a1) * dc(h1, a1, lh1, la1, p.rho);
      if (p1h < 1e-8) continue;
      
      const s1 = sign(h1, a1);
      htP[s1] += p1h;

      for (let h2 = 0; h2 <= (MAX_FT - h1); h2++) {
        for (let a2 = 0; a2 <= (MAX_FT - a1); a2++) {
          const p2h = pois(lh2, h2) * pois(la2, a2);
          const pr = p1h * p2h;
          
          const fh = h1 + h2;
          const fa = a1 + a2;
          const s2 = sign(fh, fa);
          
          const key = `${s1}/${s2}`;
          comboP[key] = (comboP[key] ?? 0) + pr;
          ftP[s2] += pr;
          
          const sk = `${fh}:${fa}`;
          scoreP[sk] = (scoreP[sk] ?? 0) + pr;
          
          if (fh > 0 && fa > 0) bttsRaw += pr;
          if (fh + fa > 2.5) over25Raw += pr;
        }
      }
    }
  }

  const total = Object.values(comboP).reduce((a, b) => a + b, 0) || 1;
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  const r1 = (v: number) => Math.round(v * 10) / 10;

  const combos = HTFT_COMBOS.map((c) => ({ combo: c, p: pct(comboP[c] ?? 0) })).sort((a, b) => b.p - a.p);
  
  // Definicije prije korištenja u 'candidates'
  const p1 = pct(ftP["1"]), pX = pct(ftP["X"]), p2 = pct(ftP["2"]);
  const btts = pct(bttsRaw);
  const over25 = pct(over25Raw);
  const under25 = r1(100 - over25);

  const scores = Object.entries(scoreP)
    .map(([score, v]) => ({ score, p: Math.min(p.maxScoreProb, pct(v)) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, p.topScoresCount);

  const htTotal = Object.values(htP).reduce((a, b) => a + b, 0) || 1;
  const best = combos[0]!;

  const bestOutcome = Math.max(p1, pX, p2);
  const outcomeConfidence = r1(bestOutcome * 0.85 + 33.3 * 0.15);

  const candidates = [
    { label: "1X", p: r1(p1 + pX) },
    { label: "X2", p: r1(pX + p2) },
    { label: "12", p: r1(p1 + p2) },
    { label: over25 > 50 ? "Over 2.5" : "Under 2.5", p: r1(Math.max(over25, 100 - over25)) }
  ].sort((a, b) => b.p - a.p);

  return {
    lambdaHome: r1(lh), lambdaAway: r1(la),
    lambdaHome1H: r1(lh1), lambdaAway1H: r1(la1),
    combos, scores, p1, pX, p2,
    ht1: Math.round((htP["1"] / htTotal) * 1000) / 10,
    htX: Math.round((htP["X"] / htTotal) * 1000) / 10,
    ht2: Math.round((htP["2"] / htTotal) * 1000) / 10,
    p1X: r1(p1 + pX), p12: r1(p1 + p2), pX2: r1(pX + p2),
    btts, over25, under25,
    topCombo: best.combo, confidence: best.p, outcomeConfidence,
    safestPick: candidates[0].label, safestProb: candidates[0].p,
    skip: best.p < p.minConfidence
  };
}

export function htFtDirectives(p: HtFtPrefs, market: string = "opce"): string {
  if (!p.enabled) return "";
  const r = computeHtFt(p);
  const activeModules = HTFT_MODULES.filter(m => p.on[m.id]).map(m => m.label).join(", ");
  
  return `

═══ HT/FT MAJSTOR v14 — AKTIVNI FILTRI: ${activeModules} ═══
Analiziraš poluvrijeme/kraj i točne rezultate koristeći Poissonove matrice (HT 0-4, FT 0-6).
PARAMETRI: λ_dom=${r.lambdaHome} (${r.lambdaHome1H} HT), λ_gost=${r.lambdaAway} (${r.lambdaAway1H} HT), Dixon-Coles ρ=${p.rho}.
HT/FT VJEROJATNOSTI: ${r.combos.map(c => `${c.combo}:${c.p}%`).join(" | ")}
ISHOD 1X2: 1=${r.p1}% · X=${r.pX}% · 2=${r.p2}%. Sigurnost ishoda: ${r.outcomeConfidence}%.
TOP REZULTATI: ${r.scores.map(s => `${s.score} (${s.p}%)`).join(", ")}.
NAJSIGURNIJE: ${r.safestPick} (${r.safestProb}%).
DIREKTIVA: Za HT/FT pitanja koristi isključivo ove brojke. ${r.skip ? "UPOZORI da je pouzdanost niska." : ""}
`;
}
