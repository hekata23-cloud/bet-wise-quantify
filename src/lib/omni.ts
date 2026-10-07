// ═══ OMNI GOL MOTOR — BTTS & OVER/UNDER 2.5 preko SVIH mozgova i SVIH modela ═══
// Ručno se aktivira u Postavkama. Kad je uključen i korisnik pita za BTTS ili
// Over/Under 2.5, pokreće se višemozgovni ansambl (OpenRouter + NVIDIA NIM +
// Hugging Face + Groq + Gemini), spajaju se sve numeričke procjene robusnom
// statistikom, pa se rezultat provjerava vlastitom matematikom (Dixon-Coles
// matrica, Frank kopula, game-state hazard, Monte Carlo, de-vig, Kelly).
import { loadJSON, saveJSON, hasKey } from "./storage";
import { openrouterChat, type ORMessage } from "./openrouter";
import { nvidiaChat, NIM_GOAL_MODELS, type NimMessage } from "./nvidia";
import { huggingfaceChat, HF_MODELS } from "./huggingface";
import { groqChat } from "./groq";
import { geminiChat } from "./gemini";
import { specialistsForMarket } from "./specialists";
import {
  loadAccuracy, scoreMatrix, marketProbs, robustMean, median, devig, parseOdds,
  monteCarlo, verdict, blendWithMarket, shrinkToPrior, leaguePriorTotal, type Verdict,
} from "./accuracy";
import {
  bttsCopula, ouGameStateHazard, entropy, kelly, fairOdds, edge as edgeOf,
  devigShin, devigPower, devigMultiplicative, skellam, bayesLambda,
} from "./formulas";
import { loadSuper, plattCalibrate, confWeightedMean } from "./superaccuracy";

export type OmniBrain = "openrouter" | "nvidia" | "huggingface" | "groq" | "gemini";
export type OmniMarket = "btts" | "ou25";

export interface OmniPrefs {
  /** Glavni prekidač — ručno uključi u Postavkama. */
  enabled: boolean;
  brains: Record<OmniBrain, boolean>;
  /** Koliko modela po mozgu (1–8). */
  modelsPerBrain: number;
  /** Broj prolaza po modelu (self-consistency). */
  passes: number;
  /** Metode koje se primjenjuju nad spojenim λ. */
  useCopula: boolean;
  useHazard: boolean;
  useBayes: boolean;
  useSkellam: boolean;
  useMonteCarlo: boolean;
  useDevig: boolean;
  usePlatt: boolean;
  /** Odbacivanje outliera (postotnih bodova odstupanja od medijana). */
  outlierPb: number;
  /** Težina tržišne (de-vig) vjerojatnosti 0–1. */
  marketWeight: number;
  /** Povlačenje prema 50% (regularizacija). */
  shrink: number;
  /** Minimalno slaganje mozgova ispod kojeg se tip degradira. */
  minAgreement: number;
  /** Minimalna sigurnost (%) da tip prođe filtar. */
  minConfidence: number;
  /** Minimalni edge (%) za singl. */
  minEdge: number;
  /** Frakcija Kellyja. */
  kellyFraction: number;
  /** Monte Carlo iteracije. */
  mcIters: number;
  /** Uvijek izračunaj i BTTS i OU 2.5 (kombo tipovi GG+Over itd.). */
  bothMarkets: boolean;
}

export const DEFAULT_OMNI: OmniPrefs = {
  enabled: false,
  brains: { openrouter: true, nvidia: true, huggingface: true, groq: true, gemini: true },
  modelsPerBrain: 3,
  passes: 1,
  useCopula: true,
  useHazard: true,
  useBayes: true,
  useSkellam: true,
  useMonteCarlo: true,
  useDevig: true,
  usePlatt: true,
  outlierPb: 12,
  marketWeight: 0.35,
  shrink: 0.12,
  minAgreement: 0.45,
  minConfidence: 56,
  minEdge: 4,
  kellyFraction: 0.25,
  mcIters: 20000,
  bothMarkets: true,
};

const KEY = "andromeda.omni.prefs";

export function loadOmni(): OmniPrefs {
  const raw = loadJSON<Partial<OmniPrefs>>(KEY, {});
  return {
    ...DEFAULT_OMNI,
    ...raw,
    brains: { ...DEFAULT_OMNI.brains, ...(raw.brains ?? {}) },
  };
}

export function saveOmni(p: OmniPrefs): void {
  saveJSON(KEY, p);
}

export const OMNI_BRAIN_LABEL: Record<OmniBrain, string> = {
  openrouter: "OpenRouter",
  nvidia: "NVIDIA NIM",
  huggingface: "Hugging Face",
  groq: "Groq",
  gemini: "Google Gemini",
};

// ───────────────────────── procjene članova ─────────────────────────

export interface OmniEstimate {
  brain: OmniBrain;
  model: string;
  lambdaHome: number;
  lambdaAway: number;
  pBtts: number;
  pOver25: number;
  conf: number;
  note: string;
}

function prompt(userText: string, ctx: string, priorTotal: number, pass: number): string {
  return `Ti si kvantitativni analitičar nogometa (prolaz ${pass}). Radi TIHO i vrati ISKLJUČIVO JSON.
Postupak: 1) λ_dom = (xG napada dom ÷ prosjek lige) × (xGA gost ÷ prosjek lige) × prosjek lige × 1.12; λ_gost isto ×0.92 (prosjek lige ${priorTotal.toFixed(2)} golova ako nemaš podatak).
2) Korekcije: ključni napadač van −0.22; stožer obrane van +0.18 protivniku; ≤3 dana odmora −0.08; derbi −0.10; utakmica bez uloga +0.12; loše vrijeme −0.10.
3) Poissonova matrica 0..8 s Dixon-Coles korekcijom → P(GG) i P(Over 2.5).
4) Ako imaš kvotu u tekstu, kalibriraj: odstupanje veće od 8 postotnih bodova prepolovi.
5) conf = pouzdanost tvojih ULAZNIH podataka (0..1); bez stvarnih brojki conf ≤ 0.5.
Vrati točno: {"lambda_home":number,"lambda_away":number,"p_btts":number(0..1),"p_over25":number(0..1),"conf":number(0..1),"note":"jedna rečenica na hrvatskom"}

PITANJE: ${userText}
${ctx}`.trim();
}

function parseEst(raw: string): Omit<OmniEstimate, "brain" | "model"> | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    const p01 = (v: unknown) => {
      let x = num(v);
      if (x > 1 && x <= 100) x = x / 100;
      return x;
    };
    const pb = p01(j.p_btts);
    const po = p01(j.p_over25);
    if (!Number.isFinite(pb) && !Number.isFinite(po)) return null;
    const lh = num(j.lambda_home);
    const la = num(j.lambda_away);
    let conf = p01(j.conf);
    if (!Number.isFinite(conf)) conf = 0.55;
    return {
      lambdaHome: Number.isFinite(lh) ? Math.min(Math.max(lh, 0.1), 5) : 1.3,
      lambdaAway: Number.isFinite(la) ? Math.min(Math.max(la, 0.1), 5) : 1.1,
      pBtts: Number.isFinite(pb) ? Math.min(Math.max(pb, 0.02), 0.98) : NaN,
      pOver25: Number.isFinite(po) ? Math.min(Math.max(po, 0.02), 0.98) : NaN,
      conf: Math.min(Math.max(conf, 0.1), 1),
      note: typeof j.note === "string" ? j.note : "",
    };
  } catch {
    return null;
  }
}

async function callBrain(
  brain: OmniBrain,
  model: string,
  text: string,
  maxTokens = 700,
): Promise<string> {
  const sys = "Vrati isključivo valjani JSON, bez markdowna i bez teksta oko njega.";
  switch (brain) {
    case "openrouter": {
      const msgs: ORMessage[] = [
        { role: "system", content: sys },
        { role: "user", content: text },
      ];
      return openrouterChat(model, msgs, { temperature: 0.2, maxTokens, extraFallbacks: [] });
    }
    case "nvidia": {
      const msgs: NimMessage[] = [
        { role: "system", content: sys },
        { role: "user", content: text },
      ];
      return nvidiaChat(model, msgs, { temperature: 0.2, maxTokens });
    }
    case "huggingface":
      return huggingfaceChat(model, [
        { role: "system", content: sys },
        { role: "user", content: text },
      ], { temperature: 0.2, maxTokens });
    case "groq":
      return groqChat([
        { role: "system", content: sys },
        { role: "user", content: text },
      ]);
    case "gemini":
      return geminiChat(sys, [{ role: "user", parts: [{ text }] }]);
  }
}

function modelsFor(brain: OmniBrain, p: OmniPrefs): string[] {
  const n = Math.max(1, Math.min(8, p.modelsPerBrain));
  switch (brain) {
    case "openrouter":
      return specialistsForMarket("btts").slice(0, n).map((s) => s.id);
    case "nvidia":
      return NIM_GOAL_MODELS.slice(0, n);
    case "huggingface":
      return HF_MODELS.slice(0, Math.min(n, 3)).map((m) => m.id);
    case "groq":
      return ["groq"];
    case "gemini":
      return ["gemini"];
  }
}

// ───────────────────────── rezultat ─────────────────────────

export interface OmniResult {
  market: OmniMarket;
  prefs: OmniPrefs;
  estimates: OmniEstimate[];
  brainsUsed: OmniBrain[];
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
  pBtts: number;
  pOver25: number;
  pMain: number;
  pMarket: number | null;
  agreement: number;
  spread: number;
  copula: ReturnType<typeof bttsCopula> | null;
  hazard: ReturnType<typeof ouGameStateHazard> | null;
  mc: { over25: number; btts: number; home: number; draw: number } | null;
  matrix: ReturnType<typeof marketProbs>;
  entropy3: number;
  skellamDraw: number;
  verdict: Verdict;
  methods: string[];
  summary: string;
}

const MAIN_LABEL: Record<OmniMarket, string> = {
  btts: "GG (oba tima zabijaju)",
  ou25: "Over 2.5 gola",
};
const ALT_LABEL: Record<OmniMarket, string> = {
  btts: "NG (netko ne zabije)",
  ou25: "Under 2.5 gola",
};

/** Pokreće OMNI motor. Baca grešku ako nijedan mozak ne odgovori. */
export async function runOmni(
  market: OmniMarket,
  userText: string,
  ctx: string,
  opts: { turbo?: boolean } = {},
): Promise<OmniResult> {
  const p = loadOmni();
  const a = loadAccuracy();
  const sp = loadSuper();
  const priorTotal = leaguePriorTotal(`${userText} ${ctx}`);
  // Turbo: 1 prolaz po modelu i najviše 2 modela po mozgu (svi moduli ostaju).
  const passes = opts.turbo ? 1 : Math.max(1, Math.min(3, p.passes));
  const pEff: OmniPrefs = opts.turbo
    ? { ...p, passes: 1, modelsPerBrain: Math.min(2, p.modelsPerBrain) }
    : p;


  const jobs: Array<Promise<OmniEstimate | null>> = [];
  const brainsUsed: OmniBrain[] = [];
  const KEY_FOR: Record<OmniBrain, "openrouter" | "nvidia" | "huggingface" | "groq" | "gemini"> = {
    openrouter: "openrouter",
    nvidia: "nvidia",
    huggingface: "huggingface",
    groq: "groq",
    gemini: "gemini",
  };
  (Object.keys(p.brains) as OmniBrain[]).forEach((b) => {
    if (!p.brains[b]) return;
    if (!hasKey(KEY_FOR[b])) return;
    brainsUsed.push(b);
    for (const model of modelsFor(b, pEff)) {

      jobs.push(
        (async () => {
          const runs: Omit<OmniEstimate, "brain" | "model">[] = [];
          for (let i = 1; i <= passes; i++) {
            try {
              const raw = await callBrain(b, model, prompt(userText, ctx, priorTotal, i), opts.turbo ? 420 : 700);
              const parsed = parseEst(raw);
              if (parsed) runs.push(parsed);
            } catch {
              /* pojedini poziv smije pasti */
            }
          }
          if (!runs.length) return null;
          const pick = (f: (r: (typeof runs)[number]) => number) => {
            const xs = runs.map(f).filter((x) => Number.isFinite(x));
            return xs.length ? median(xs) : NaN;
          };
          return {
            brain: b,
            model,
            lambdaHome: pick((r) => r.lambdaHome),
            lambdaAway: pick((r) => r.lambdaAway),
            pBtts: pick((r) => r.pBtts),
            pOver25: pick((r) => r.pOver25),
            conf: pick((r) => r.conf),
            note: runs[0].note,
          } as OmniEstimate;
        })(),
      );
    }
  });

  if (!jobs.length) throw new Error("OMNI: nema aktivnog mozga s ključem.");
  const settled = await Promise.all(jobs);
  const estimates = settled.filter((e): e is OmniEstimate => !!e);
  if (!estimates.length) throw new Error("OMNI: nijedan model nije vratio valjanu procjenu.");

  const methods: string[] = [`višemozgovni ansambl (${estimates.length} modela / ${brainsUsed.length} mozgova)`];

  // ── spajanje λ i vjerojatnosti (robusna statistika + vaganje pouzdanosti)
  const maxDev = Math.max(0.05, p.outlierPb / 100);
  let lh = robustMean(estimates.map((e) => e.lambdaHome), 0.9).value;
  let la = robustMean(estimates.map((e) => e.lambdaAway), 0.9).value;

  if (p.useBayes) {
    const share = lh + la > 0 ? lh / (lh + la) : 0.5;
    const tot = bayesLambda(priorTotal, 4, (lh + la) * estimates.length, estimates.length);
    lh = tot * share;
    la = tot * (1 - share);
    methods.push("Bayesov update λ prema prosjeku lige");
  }

  const bttsList = estimates.map((e) => e.pBtts).filter((x) => Number.isFinite(x));
  const ouList = estimates.map((e) => e.pOver25).filter((x) => Number.isFinite(x));
  const aggB = bttsList.length ? robustMean(bttsList, maxDev) : null;
  const aggO = ouList.length ? robustMean(ouList, maxDev) : null;

  const confs = estimates.map((e) => e.conf);
  const wB = aggB ? confWeightedMean(estimates.map((e) => e.pBtts), confs, sp.confGamma) : NaN;
  const wO = aggO ? confWeightedMean(estimates.map((e) => e.pOver25), confs, sp.confGamma) : NaN;

  // ── vlastita matematika
  const sm = scoreMatrix(lh, la, a.tau, a.rho);
  const mp = marketProbs(sm, a.tau, a.rho);
  methods.push("Dixon-Coles matrica 0..10");

  const copula = p.useCopula ? bttsCopula(lh, la, sp.bttsRho) : null;
  if (copula) methods.push(`Frank kopula ρ=${sp.bttsRho}`);
  const hazard = p.useHazard ? ouGameStateHazard(lh, la, sp.ouBeta, sp.lateSkew) : null;
  if (hazard) methods.push(`game-state hazard β=${sp.ouBeta}`);
  const mc = p.useMonteCarlo ? monteCarlo(lh, la, Math.max(2000, p.mcIters)) : null;
  if (mc) methods.push(`Monte Carlo ${p.mcIters}`);
  const skellamDraw = p.useSkellam ? skellam(lh, la, 0) : 0;
  if (p.useSkellam) methods.push("Skellam kontrola remija");

  const mix = (model: number, ens: number, weighted: number) => {
    const parts = [model, ens];
    if (Number.isFinite(weighted)) parts.push(weighted);
    return parts.reduce((s, x) => s + x, 0) / parts.length;
  };

  let pBtts = mix(
    copula ? 0.5 * copula.gg + 0.5 * mp.btts : mp.btts,
    aggB ? aggB.value : mp.btts,
    wB,
  );
  let pOver = mix(
    hazard ? 0.5 * hazard.over25 + 0.5 * mp.over25 : mp.over25,
    aggO ? aggO.value : mp.over25,
    wO,
  );
  if (mc) {
    pBtts = 0.85 * pBtts + 0.15 * mc.btts;
    pOver = 0.85 * pOver + 0.15 * mc.over25;
  }

  pBtts = shrinkToPrior(pBtts, p.shrink, 0.5);
  pOver = shrinkToPrior(pOver, p.shrink, 0.5);
  if (p.usePlatt) {
    pBtts = plattCalibrate(pBtts, sp.plattA, sp.plattB);
    pOver = plattCalibrate(pOver, sp.plattA, sp.plattB);
    methods.push("Platt kalibracija");
  }

  // ── tržište (de-vig)
  const odds = parseOdds(userText, market);
  let pMarket: number | null = null;
  if (p.useDevig && odds.main && odds.alt) {
    const pair = [odds.main, odds.alt];
    const dv =
      sp.devig === "shin" ? devigShin(pair) : sp.devig === "power" ? devigPower(pair) : devigMultiplicative(pair);
    pMarket = dv[0];
    methods.push(`de-vig (${sp.devig})`);
  } else if (odds.main) {
    pMarket = devig(odds.main, 0);
  }

  if (pMarket !== null) {
    if (market === "btts") pBtts = blendWithMarket(pBtts, pMarket, p.marketWeight);
    else pOver = blendWithMarket(pOver, pMarket, p.marketWeight);
  }

  const pMain = Math.min(0.97, Math.max(0.03, market === "btts" ? pBtts : pOver));
  const list = market === "btts" ? bttsList : ouList;
  const spread = list.length > 1 ? Math.max(...list) - Math.min(...list) : 0;
  const agreement = Math.max(0, Math.min(1, 1 - spread / 0.4));

  const v = verdict(pMain, MAIN_LABEL[market], ALT_LABEL[market], odds.main ?? null, agreement, {
    ...a,
    minConfidence: p.minConfidence,
    minEdge: p.minEdge,
    kellyFraction: p.kellyFraction,
  });

  const summary = estimates
    .map(
      (e) =>
        `- [${OMNI_BRAIN_LABEL[e.brain]}] ${e.model}: GG ${Number.isFinite(e.pBtts) ? (e.pBtts * 100).toFixed(0) + "%" : "—"} · Over2.5 ${
          Number.isFinite(e.pOver25) ? (e.pOver25 * 100).toFixed(0) + "%" : "—"
        } · λ ${e.lambdaHome.toFixed(2)}–${e.lambdaAway.toFixed(2)} · pouzdanost ${(e.conf * 100).toFixed(0)}%${e.note ? ` · ${e.note}` : ""}`,
    )
    .join("\n");

  return {
    market, prefs: p, estimates, brainsUsed,
    lambdaHome: lh, lambdaAway: la, lambdaTotal: lh + la,
    pBtts, pOver25: pOver, pMain, pMarket, agreement, spread,
    copula, hazard, mc, matrix: mp,
    entropy3: entropy([mp.home, mp.draw, mp.away]),
    skellamDraw,
    verdict: v, methods, summary,
  };
}

/** Blok koji ide u sistemski prompt chat bota kad je OMNI aktivan. */
export function omniBriefing(o: OmniResult | null): string {
  if (!o) return "";
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const p = o.prefs;
  const k = o.verdict.edge !== null && o.verdict.edge > 0 ? kelly(o.verdict.p, 1 / o.verdict.p + 0.01, p.kellyFraction) : null;
  return `═══ OMNI GOL MOTOR — BTTS & OVER/UNDER 2.5 (AKTIVIRAN RUČNO) ═══
Mozgovi u igri: ${o.brainsUsed.map((b) => OMNI_BRAIN_LABEL[b]).join(", ")} · modela: ${o.estimates.length} · prolaza po modelu: ${p.passes}
Primijenjene metode: ${o.methods.join(" · ")}
λ_dom = ${o.lambdaHome.toFixed(2)} · λ_gost = ${o.lambdaAway.toFixed(2)} · λ_total = ${o.lambdaTotal.toFixed(2)}
P(GG) = ${pct(o.pBtts)} · P(NG) = ${pct(1 - o.pBtts)}
P(Over 2.5) = ${pct(o.pOver25)} · P(Under 2.5) = ${pct(1 - o.pOver25)}
P(Over 1.5) = ${pct(o.matrix.over15)} · P(Over 3.5) = ${pct(o.matrix.over35)}
Kombo referenca: GG+Over 2.5 ≈ ${pct(Math.max(0.02, o.pBtts * o.pOver25 * 1.12))} (korelirano, ne množi naslijepo)
${o.copula ? `Kopula: GG ${pct(o.copula.gg)} vs neovisni Poisson ${pct(o.copula.ggIndependent)} → pomak ${o.copula.shiftPb.toFixed(1)} pb · P(0:0) ${pct(o.copula.p00)}` : "Kopula: isključena"}
${o.hazard ? `Game-state: λ_eff ${o.hazard.lambdaEff.toFixed(2)} (baza ${(o.lambdaTotal).toFixed(2)}) · Over 2.5 pomak ${o.hazard.shiftPb.toFixed(1)} pb · golovi po trećinama ${o.hazard.thirds.map((t) => t.toFixed(2)).join(" / ")}` : "Game-state hazard: isključen"}
${o.mc ? `Monte Carlo kontrola: GG ${pct(o.mc.btts)} · Over 2.5 ${pct(o.mc.over25)} · 1 ${pct(o.mc.home)} · X ${pct(o.mc.draw)}` : "Monte Carlo: isključen"}
Skellam P(remi) = ${pct(o.skellamDraw)} · entropija 1X2 = ${o.entropy3.toFixed(2)}
${o.pMarket !== null ? `Tržište (de-vig): ${pct(o.pMarket)} · fer kvota modela ${fairOdds(o.pMain).toFixed(2)}` : "Kvota nije zadana — nema edge računa."}
KONAČNI TIP (OMNI): ${o.verdict.pick} · sigurnost ${pct(o.verdict.p)} · min. isplativa kvota ${o.verdict.fairOdds.toFixed(2)}${
    o.verdict.edge !== null ? ` · edge ${o.verdict.edge.toFixed(1)}%` : ""
  }${o.verdict.kelly !== null ? ` · Kelly ${o.verdict.kelly.toFixed(1)}%` : k !== null ? ` · Kelly ${k.toFixed(1)}%` : ""} · ocjena ${"★".repeat(o.verdict.stars)}${"☆".repeat(5 - o.verdict.stars)}
Filtar vrijednosti: ${o.verdict.valueOk ? "PROLAZI" : "NE PROLAZI"} — ${o.verdict.advice}
Slaganje mozgova: ${(o.agreement * 100).toFixed(0)}% (raspon ${(o.spread * 100).toFixed(0)} pb; prag ${(p.minAgreement * 100).toFixed(0)}%)

Pojedinačne procjene:
${o.summary}

PRAVILA (OMNI ima prednost nad svime ostalim za BTTS i Over/Under 2.5):
1) Prva rečenica = tip iznad + sigurnost u %. Ne izmišljaj druge brojke i ne proturječi ovim izračunima.
2) Obavezno navedi λ_dom, λ_gost, λ_total, P glavnog i suprotnog ishoda, minimalnu isplativu kvotu i (ako je kvota poznata) edge i Kelly.
3) Reci koje su metode radile (kopula, hazard, Monte Carlo, de-vig) i što je koja pomaknula u postotnim bodovima.
4) Ako slaganje mozgova padne ispod ${(p.minAgreement * 100).toFixed(0)}% ili tip ne prolazi filtar, NE forsiraj singl — ponudi sigurniju varijantu (Over 1.5, Under 3.5, GG u 1. poluvremenu NE) i reci koji podatak nedostaje.
5) Sve na izvornom hrvatskom jeziku.`;
}

/** Kratki edge helper za UI. */
export function omniEdge(p: number, odds: number): number {
  return edgeOf(p, odds);
}
