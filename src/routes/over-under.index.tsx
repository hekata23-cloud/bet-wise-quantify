import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Award,
  BookmarkPlus,
  Calculator,
  Check,
  Crosshair,
  Download,
  Gauge,
  History,
  Info,
  Lightbulb,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Thermometer,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { MatchPicker } from "@/components/MatchPicker";
import { OddsScreenshot } from "@/components/OddsScreenshot";
import { detectAnomalies } from "@/lib/anomaly-detector";
import { evaluateMatchConfidence } from "@/lib/confidence-score";
import { scanAllMarketValues } from "@/lib/bet-engine";
import {
  matchLeague,
  LEAGUE_PROFILES,
  DEFAULT_LEAGUE_PROFILE,
  type LeagueProfile,
} from "@/lib/league-profiles";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/over-under/")({
  head: () => ({
    meta: [
      { title: "2.5 Termometar — Over/Under kalkulator" },
      {
        name: "description",
        content:
          "Kalkulator za 2.5 over/under golova: glavna odluka iz kvote na Over 2.5, potvrda kroz kvotu za 2:2 i GG (oba tima daju gol). Unesi kvote i dobij konkretan tip.",
      },
      {
        property: "og:title",
        content: "2.5 Termometar — Over/Under kalkulator",
      },
      {
        property: "og:description",
        content:
          "Matematički model: vjerojatnost iz kvote Over 2.5 + provjere kroz kvote 2:2 i GG.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "hr_HR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Result = {
  k22: number;
  kOver: number;
  kGg: number;
  p22: number;
  pOver: number;
  pGg: number;
  pGgOver: number;
  pThree: number;
  pTwoRaw: number;
  pTwo: number;
  pUnder: number;
  isOver: boolean;
};

type SavedAnalysis = {
  id: string;
  date: string;
  label: string;
  k22: number;
  kOver: number;
  kGg: number;
  tipOver: "VIŠE" | "MANJE";
  tipBtts: "DA" | "NE";
  status: "pending" | "won" | "lost";
};

const HISTORY_KEY = "termometar.history";

function loadHistory(): SavedAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SavedAnalysis[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: SavedAnalysis[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const GG_OVER_IF_YES = 0.62;
const GG_OVER_IF_NO = 0.35;
const MARGIN = 1.05;

function parseKvota(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function calculateResult(k22: number, kOver: number, kGg: number): Result {
  const p22 = 1 / k22;
  const pOver = 1 / kOver;
  const pGg = 1 / kGg;

  const pGgOver = pGg * GG_OVER_IF_YES + (1 - pGg) * GG_OVER_IF_NO;
  const pThree = (pOver + pGgOver) / 2;

  const pTwoRaw = 1 / MARGIN - pThree;
  const pTwo = Math.max(0, pTwoRaw);
  const pUnder = 1 - pThree;

  const isOver = pThree > pUnder;

  return {
    k22,
    kOver,
    kGg,
    p22,
    pOver,
    pGg,
    pGgOver,
    pThree,
    pTwoRaw,
    pTwo,
    pUnder,
    isOver,
  };
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function ratioDesc(r: number): string {
  if (r > 0.3) return "umjetno napuhan (2:2 nosi prevelik udio)";
  if (r >= 0.15) return "normalan raspon";
  return "nizak (2:2 slabo doprinosi)";
}

type GoldenZone = {
  tone: string;
  title: string;
  desc: string;
  badge: string;
};

function checkGoldenZone(k22: number, kOver: number, kGg: number): GoldenZone {
  if (k22 <= 11.0 && kOver <= 1.7 && kGg <= 1.65) {
    return {
      tone: "border-win bg-win/10 text-win",
      title: "Zlatna zona (Zicer 2.5 VIŠE & BTTS DA)",
      desc: "Sve tri kvote istovremeno vrište golove. Iznimno visoka statistička podudarnost.",
      badge: "ZICER GOLOVI",
    };
  }
  if (k22 >= 15.0 && kOver >= 2.1 && kGg >= 2.0) {
    return {
      tone: "border-loss bg-loss/10 text-loss",
      title: "Zaključana mreža (Zicer 2.5 MANJE & BTTS NE)",
      desc: "Svi indikatori potvrđuju tvrd meč, malo šansi i zatvorene obrane.",
      badge: "ZICER DEFICIT",
    };
  }
  if (k22 <= 12.0 && kOver >= 2.05) {
    return {
      tone: "border-gold bg-gold/10 text-gold",
      title: "Lažni signal (Oprez!)",
      desc: "Kvota na 2:2 vuče na golove, ali je Over 2.5 previsok. Moguća zamka kladionice.",
      badge: "OPREZ / ANOMALIJA",
    };
  }
  return {
    tone: "border-line bg-surface/30 text-ink/70",
    title: "Standardni profil para",
    desc: "Kvote su unutar uobičajenih statističkih korelacija.",
    badge: "STANDARD",
  };
}

type ValueBetResult = {
  ev: number;
  evPct: string;
  stake: number;
  isValue: boolean;
  targetOdd: number;
};

function calculateValue(pModel: number, odd: number): ValueBetResult {
  const ev = pModel * odd - 1;
  const isValue = ev > 0.02;

  let stake = 0;
  if (ev >= 0.1) stake = 4;
  else if (ev >= 0.05) stake = 3;
  else if (ev > 0.02) stake = 2;
  else if (ev > -0.05) stake = 1;

  return {
    ev,
    evPct: (ev * 100).toFixed(1) + "%",
    stake,
    isValue,
    targetOdd: odd,
  };
}

type BttsFlag = "DA" | "NE" | "NEUTRALNO";

type BttsIndicator = {
  name: string;
  flag: BttsFlag;
  valueStr: string;
  detail: string;
};

type BttsVerdict = {
  p: number;
  yes: boolean;
  strength: "IZRAZITI" | "JASAN" | "UMJERENI";
  indicators: BttsIndicator[];
  neCount: number;
  daCount: number;
};

function bttsTip(
  kGg: number,
  k22: number,
  kOver: number,
  exact: Record<string, number> | null,
): BttsVerdict {
  const pGg = Math.min(0.9, Math.max(0.1, 1 / (kGg * MARGIN)));
  const pOver = Math.min(0.88, Math.max(0.12, 1 / (kOver * MARGIN)));
  let low = 0.5;
  let high = 6.0;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const pUnderCalc = Math.exp(-mid) * (1 + mid + (mid * mid) / 2);
    const pOverCalc = 1 - pUnderCalc;
    if (pOverCalc < pOver) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const lambda = (low + high) / 2;
  const lH = lambda * 0.55;
  const lA = lambda * 0.45;
  const pPoisson = (1 - Math.exp(-lH)) * (1 - Math.exp(-lA));

  let pExact: number | null = null;
  if (exact) {
    const scores = Object.entries(exact);
    let sumAll = 0;
    let sumBoth = 0;
    for (const [s, odd] of scores) {
      if (odd <= 1) continue;
      const inv = 1 / odd;
      sumAll += inv;
      const parts = s.split(/[-:]/).map(Number);
      if (parts.length === 2 && (parts[0] ?? 0) > 0 && (parts[1] ?? 0) > 0) {
        sumBoth += inv;
      }
    }
    if (sumAll > 0) pExact = sumBoth / sumAll;
  }

  const indicators: BttsIndicator[] = [];

  let ggFlag: BttsFlag = "NEUTRALNO";
  if (pGg < 0.48) ggFlag = "NE";
  else if (pGg > 0.52) ggFlag = "DA";
  indicators.push({
    name: "GG kvota (bez marže)",
    flag: ggFlag,
    valueStr: (pGg * 100).toFixed(1) + "%",
    detail:
      ggFlag === "NE"
        ? "Kvota iznad 1.98 — tržište ne vjeruje u golove oba tima"
        : ggFlag === "DA"
          ? "Kvota ispod 1.83 — tržište daje prednost GG-u"
          : "Kvota u sivoj zoni oko 50/50",
  });

  let poissonFlag: BttsFlag = "NEUTRALNO";
  if (pPoisson < 0.47) poissonFlag = "NE";
  else if (pPoisson > 0.52) poissonFlag = "DA";
  indicators.push({
    name: "Poisson procjena iz Over 2.5",
    flag: poissonFlag,
    valueStr: (pPoisson * 100).toFixed(1) + "%",
    detail:
      poissonFlag === "NE"
        ? `Niska očekivana efikasnost (λ ≈ ${lambda.toFixed(2)})`
        : poissonFlag === "DA"
          ? `Visoka očekivana efikasnost (λ ≈ ${lambda.toFixed(2)})`
          : `Prosječna efikasnost (λ ≈ ${lambda.toFixed(2)})`,
  });

  if (pExact !== null) {
    let exactFlag: BttsFlag = "NEUTRALNO";
    if (pExact < 0.47) exactFlag = "NE";
    else if (pExact > 0.52) exactFlag = "DA";
    indicators.push({
      name: "Distribucija točnih rezultata",
      flag: exactFlag,
      valueStr: (pExact * 100).toFixed(1) + "%",
      detail:
        exactFlag === "NE"
          ? "Rezultati 0:0, 1:0 i 0:1 nose veći dio vjerojatnosti"
          : exactFlag === "DA"
            ? "Rezultati u kojima oba zabijaju dominiraju ponudom"
            : "Nema jasne prevage u točnim rezultatima",
    });
  }

  let k22Flag: BttsFlag = "NEUTRALNO";
  if (k22 <= 13.0) k22Flag = "DA";
  else if (k22 >= 15.0) k22Flag = "NE";
  indicators.push({
    name: "Kvota na točan rezultat 2:2",
    flag: k22Flag,
    valueStr: k22.toFixed(2),
    detail:
      k22Flag === "DA"
        ? "Niska kvota na 2:2 (≤ 13.00) signalizira otvoren meč"
        : k22Flag === "NE"
          ? "Visoka kvota na 2:2 (≥ 15.00) isključuje visok remi"
          : "Umjerena kvota (13.01 – 14.99)",
  });

  let p: number;
  if (pExact !== null) {
    p = 0.55 * pGg + 0.25 * pPoisson + 0.2 * pExact;
  } else {
    p = 0.7 * pGg + 0.3 * pPoisson;
  }

  const isYes = p >= 0.5;

  let neCount = 0;
  let daCount = 0;
  for (const ind of indicators) {
    if (ind.flag === "NE") neCount++;
    else if (ind.flag === "DA") daCount++;
  }

  let strength: BttsVerdict["strength"];
  if (!isYes) {
    if (p < 0.43 && neCount >= 3) strength = "IZRAZITI";
    else if (p < 0.47 || neCount >= 2) strength = "JASAN";
    else strength = "UMJERENI";
  } else {
    if (p > 0.57 && daCount >= 3) strength = "IZRAZITI";
    else if (p > 0.53 || daCount >= 2) strength = "JASAN";
    else strength = "UMJERENI";
  }

  return { p, yes: isYes, strength, indicators, neCount, daCount };
}

type ExtraSignal = {
  title: string;
  detail: string;
  on: boolean | null;
};

function extraSignals(k22: number, exact: Record<string, number> | null): ExtraSignal[] {
  const out: ExtraSignal[] = [];

  out.push({
    title: "GG zeleno svjetlo (2:2 ≤ 13.00)",
    detail:
      k22 <= 13.0
        ? `Kvota 2:2 je ${k22.toFixed(2)} — visoka vjerovatnoća da oba tima zabiju.`
        : `Kvota 2:2 je ${k22.toFixed(2)} — uvjet nije ispunjen.`,
    on: k22 <= 13.0,
  });

  out.push({
    title: "Over 2.5 jak signal (2:2 ≤ 10.00)",
    detail:
      k22 <= 10.0
        ? `Kvota 2:2 je ${k22.toFixed(2)} — vrlo snažan signal za 3+ gola.`
        : `Kvota 2:2 je ${k22.toFixed(2)} — uvjet nije ispunjen.`,
    on: k22 <= 10.0,
  });

  if (!exact) {
    out.push({
      title: "Over 1.5 signal (1:0, 0:0, 0:1 ≥ 10.00)",
      detail: "Potrebne su kvote za tačne rezultate.",
      on: null,
    });
    out.push({
      title: "Under 3.5 zicer (najniža kvota tačnog rez. ≤ 6.00)",
      detail: "Potrebne su kvote za tačne rezultate.",
      on: null,
    });
    return out;
  }

  const k10 = exact["1-0"] ?? exact["1:0"];
  const k00 = exact["0-0"] ?? exact["0:0"];
  const k01 = exact["0-1"] ?? exact["0:1"];
  const highLowScores = [k10, k00, k01].filter(
    (v): v is number => typeof v === "number" && v >= 10.0,
  );
  const over15On = highLowScores.length >= 2;
  out.push({
    title: "Over 1.5 signal (1:0, 0:0, 0:1 ≥ 10.00)",
    detail: over15On
      ? `Barem 2 od 3 niska rezultata imaju kvotu ≥ 10.00 (${highLowScores.map((x) => x.toFixed(2)).join(", ")}).`
      : `Samo ${highLowScores.length} od 3 niska rezultata ima kvotu ≥ 10.00.`,
    on: over15On,
  });

  const odds = Object.values(exact).filter((v): v is number => typeof v === "number" && v > 1);
  const minExact = odds.length ? Math.min(...odds) : null;
  const under35On = minExact !== null && minExact <= 6.0;
  out.push({
    title: "Under 3.5 zicer (najniža kvota tačnog rez. ≤ 6.00)",
    detail:
      minExact !== null
        ? `Najniža kvota tačnog rezultata je ${minExact.toFixed(2)} (prag ≤ 6.00).`
        : "Nema kvota za tačne rezultate.",
    on: under35On,
  });

  return out;
}

const DEFAULT_RESULT: Result = {
  k22: 12.0,
  kOver: 1.85,
  kGg: 1.72,
  p22: 1 / 12.0,
  pOver: 1 / 1.85,
  pGg: 1 / 1.72,
  pGgOver: (1 / 1.72) * GG_OVER_IF_YES + (1 - 1 / 1.72) * GG_OVER_IF_NO,
  pThree: (1 / 1.85 + ((1 / 1.72) * GG_OVER_IF_YES + (1 - 1 / 1.72) * GG_OVER_IF_NO)) / 2,
  pTwoRaw:
    1 / MARGIN - (1 / 1.85 + ((1 / 1.72) * GG_OVER_IF_YES + (1 - 1 / 1.72) * GG_OVER_IF_NO)) / 2,
  pTwo: Math.max(
    0,
    1 / MARGIN - (1 / 1.85 + ((1 / 1.72) * GG_OVER_IF_YES + (1 - 1 / 1.72) * GG_OVER_IF_NO)) / 2,
  ),
  pUnder: 1 - (1 / 1.85 + ((1 / 1.72) * GG_OVER_IF_YES + (1 - 1 / 1.72) * GG_OVER_IF_NO)) / 2,
  isOver: true,
};

function Index() {
  const [input22, setInput22] = useState("12.00");
  const [inputOver, setInputOver] = useState("1.85");
  const [inputGg, setInputGg] = useState("1.72");
  const [matchLabel, setMatchLabel] = useState<string>("");
  const [selectedLeagueKey, setSelectedLeagueKey] = useState<string>("auto");
  const [exact, setExact] = useState<Record<string, number> | null>(null);

  const [verdict, setVerdict] = useState<Result | null>(DEFAULT_RESULT);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const k22 = parseKvota(input22);
    const kOver = parseKvota(inputOver);
    const kGg = parseKvota(inputGg);

    if (!k22 || !kOver || !kGg) {
      setVerdict(null);
      return;
    }

    setVerdict(calculateResult(k22, kOver, kGg));
  }

  function handleReset() {
    setInput22("12.00");
    setInputOver("1.85");
    setInputGg("1.72");
    setMatchLabel("");
    setExact(null);
    setVerdict(DEFAULT_RESULT);
  }

  function handleSaveAnalysis() {
    const r = shown;
    const b = bttsTip(r.kGg, r.k22, r.kOver, exact);
    const newItem: SavedAnalysis = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString("hr-HR"),
      label: matchLabel.trim() || `Par (${r.kOver} / ${r.kGg})`,
      k22: r.k22,
      kOver: r.kOver,
      kGg: r.kGg,
      tipOver: r.isOver ? "VIŠE" : "MANJE",
      tipBtts: b.yes ? "DA" : "NE",
      status: "pending",
    };
    const updated = [newItem, ...history];
    setHistory(updated);
    saveHistory(updated);
  }

  function handleSetStatus(id: string, status: SavedAnalysis["status"]) {
    const updated = history.map((item) => (item.id === id ? { ...item, status } : item));
    setHistory(updated);
    saveHistory(updated);
  }

  function handleDeleteHistory(id: string) {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    saveHistory(updated);
  }

  const shown = verdict ?? DEFAULT_RESULT;
  const ratio = shown.p22 / shown.pOver;
  const zone = checkGoldenZone(shown.k22, shown.kOver, shown.kGg);

  const activeLeague: LeagueProfile =
    selectedLeagueKey !== "auto" && LEAGUE_PROFILES[selectedLeagueKey]
      ? LEAGUE_PROFILES[selectedLeagueKey]!
      : matchLeague(matchLabel || "");

  const confidence = evaluateMatchConfidence(
    shown.k22,
    shown.kOver,
    shown.kGg,
    activeLeague.goalMultiplier,
  );

  // Automatski Value Bet izračun za sva 4 tržišta
  const kUnderEstimated = Number((1 / Math.max(0.08, 1.05 - 1 / shown.kOver)).toFixed(2));
  const kNgEstimated = Number((1 / Math.max(0.08, 1.05 - 1 / shown.kGg)).toFixed(2));
  const bttsCalc = bttsTip(shown.kGg, shown.k22, shown.kOver, verdict ? exact : null);
  const valueScan = scanAllMarketValues(
    shown.kOver,
    kUnderEstimated,
    shown.kGg,
    kNgEstimated,
    shown.pThree,
    bttsCalc.p,
  );

  const settled = history.filter((h) => h.status !== "pending");
  const wonCount = settled.filter((h) => h.status === "won").length;
  const winRate = settled.length > 0 ? ((wonCount / settled.length) * 100).toFixed(1) : "0.0";

  return (
    <main className="min-h-screen bg-surface px-3 py-4 font-sans text-ink sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative grid size-20 shrink-0 place-items-center text-win sm:size-24">
              <Thermometer className="size-full" strokeWidth={2.4} />
              <span className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full border-2 border-surface bg-ink text-xl">
                ⚽
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-extrabold sm:text-5xl">
                <span className="text-ink">2.5</span> <span className="text-win">TERMOMETAR</span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-ink/80 sm:text-lg">
                Brzo i precizno izračunaj da li je više ili manje od 2.5 golova na osnovu 3 kvote:
                2:2, Over 2.5 i GG.
              </p>
              <Link
                to="/over-under/postavke"
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold text-ink/85 hover:border-cyan hover:text-cyan"
              >
                <Settings className="size-4" /> Postavke (API-Football ključ)
              </Link>
            </div>
          </div>
          <Panel className="flex items-center gap-4 py-4">
            <Target className="size-12 shrink-0 text-mint" />
            <div>
              <h2 className="font-display text-lg font-bold">Šta radi app?</h2>
              <p className="text-sm leading-relaxed text-ink/75">
                Usklađuje omjer kvota, računa vjerojatnoće i daje točan odgovor:{" "}
                <strong className="text-win">2.5 VIŠE</strong> ili{" "}
                <strong className="text-mint">2.5 MANJE</strong>.
              </p>
            </div>
          </Panel>
        </header>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.95fr]">
          {/* STUPAC 1: UNOS I GLAVNI REZULTAT */}
          <div className="space-y-4">
            <Panel>
              <PanelTitle icon={<Download className="size-7 text-cyan" />}>
                Automatski unos kvota
              </PanelTitle>
              <MatchPicker
                onLoaded={(o) => {
                  if (o.k22) setInput22(o.k22.toFixed(2));
                  if (o.over) setInputOver(o.over.toFixed(2));
                  if (o.gg) setInputGg(o.gg.toFixed(2));
                  if (o.label) setMatchLabel(o.label);
                  setExact(o.exact ?? null);
                  setVerdict(o.k22 && o.over && o.gg ? calculateResult(o.k22, o.over, o.gg) : null);
                }}
              />
              <OddsScreenshot
                onRead={(r) => {
                  if (r.k22) setInput22(r.k22.toFixed(2));
                  if (r.over) setInputOver(r.over.toFixed(2));
                  if (r.gg) setInputGg(r.gg.toFixed(2));
                  setExact(null);
                  setVerdict(r.k22 && r.over && r.gg ? calculateResult(r.k22, r.over, r.gg) : null);
                }}
              />
            </Panel>

            <Panel>
              <PanelTitle icon={<Calculator className="size-7 text-win" />}>
                Ručni unos kvota
              </PanelTitle>
              <form onSubmit={handleCalculate} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="k22" className="block text-sm font-bold text-ink">
                    1. Kvota za točan rezultat 2:2
                  </label>
                  <p className="text-xs text-muted">Unesi kvotu (npr. 12.00 ili 15.50)</p>
                  <input
                    id="k22"
                    type="text"
                    inputMode="decimal"
                    value={input22}
                    onChange={(e) => setInput22(e.target.value)}
                    placeholder="12.00"
                    className="mt-1 w-full rounded-md border border-line bg-card px-4 py-3 font-mono text-xl font-bold text-ink focus:border-win focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="kOver" className="block text-sm font-bold text-ink">
                    2. Kvota za 2.5 VIŠE (Over 2.5)
                  </label>
                  <p className="text-xs text-muted">Unesi kvotu (npr. 1.85)</p>
                  <input
                    id="kOver"
                    type="text"
                    inputMode="decimal"
                    value={inputOver}
                    onChange={(e) => setInputOver(e.target.value)}
                    placeholder="1.85"
                    className="mt-1 w-full rounded-md border border-line bg-card px-4 py-3 font-mono text-xl font-bold text-ink focus:border-win focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="kGg" className="block text-sm font-bold text-ink">
                    3. Kvota za GG (oba tima daju gol)
                  </label>
                  <p className="text-xs text-muted">Unesi kvotu (npr. 1.72)</p>
                  <input
                    id="kGg"
                    type="text"
                    inputMode="decimal"
                    value={inputGg}
                    onChange={(e) => setInputGg(e.target.value)}
                    placeholder="1.72"
                    className="mt-1 w-full rounded-md border border-line bg-card px-4 py-3 font-mono text-xl font-bold text-ink focus:border-win focus:outline-none"
                  />
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-bold text-ink">Liga / Takmičenje</label>
                  <p className="text-xs text-muted">Prilagođava Poisson model stilu igre lige</p>
                  <select
                    value={selectedLeagueKey}
                    onChange={(e) => setSelectedLeagueKey(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold text-ink focus:border-win focus:outline-none"
                  >
                    <option value="auto">
                      Automatski ({activeLeague.name} — {activeLeague.category})
                    </option>
                    {Object.entries(LEAGUE_PROFILES).map(([key, prof]) => (
                      <option key={key} value={key}>
                        {prof.name} ({prof.category} · {prof.avgGoals} gol/ut)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-win text-surface hover:bg-win/90 font-bold py-3 text-base"
                  >
                    Izračunaj ponovo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className="border-line text-ink"
                  >
                    Reset
                  </Button>
                </div>
              </form>
            </Panel>

            {/* KARTICA: INDEKS POUZDANOSTI & KONAČNA PRESUDA */}
            <Panel className="border-cyan/70">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <PanelTitle icon={<Award className="size-7 text-cyan" />}>
                  Indeks pouzdanosti
                </PanelTitle>
                <span className="rounded bg-surface px-2.5 py-1 font-mono text-sm font-extrabold text-cyan border border-line">
                  {confidence.score}%
                </span>
              </div>

              <div className="mt-4 rounded-md border-2 border-cyan bg-cyan/10 p-4 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/70">
                  Konačna ocjena modela
                </span>
                <div className="font-display text-2xl font-black text-cyan mt-1">
                  {confidence.grade}
                </div>
                <div className="mt-3 flex items-center justify-around border-t border-cyan/30 pt-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-ink/60">
                      Glavni izbor
                    </span>
                    <strong className="block text-base font-extrabold text-win">
                      {confidence.primaryMarket}
                    </strong>
                  </div>
                  <div className="h-8 w-px bg-cyan/30" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-ink/60">Alternativa</span>
                    <strong className="block text-base font-extrabold text-ink">
                      {confidence.alternativeMarket}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/60">
                  Ključni faktori presude:
                </span>
                <ul className="space-y-1 text-xs text-ink/80">
                  {confidence.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan">▸</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            {/* KARTICA: DIXON-COLES MATRICA I TOČNI REZULTATI */}
            <Panel className="border-line">
              <PanelTitle icon={<Target className="size-7 text-mint" />}>
                Dixon-Coles matrica
              </PanelTitle>

              <div className="mt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/60">
                  Najvjerojatniji točni rezultati:
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {confidence.poisson.topScores.map((s, idx) => (
                    <div
                      key={s.score}
                      className={`rounded-md border p-2 text-center ${
                        idx === 0
                          ? "border-win bg-win/10 text-win"
                          : "border-line bg-surface/40 text-ink"
                      }`}
                    >
                      <span className="block font-display text-lg font-black">{s.score}</span>
                      <span className="text-[11px] font-mono font-bold opacity-80">
                        {s.prob.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/60">
                  Raspodjela broja golova:
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded border border-line bg-surface/30 p-2">
                    <span className="text-[10px] uppercase text-ink/60">0-1 gol</span>
                    <strong className="block text-sm font-bold text-loss">
                      {confidence.poisson.brackets.zeroOne}%
                    </strong>
                  </div>
                  <div className="rounded border border-line bg-surface/30 p-2">
                    <span className="text-[10px] uppercase text-ink/60">2-3 gola</span>
                    <strong className="block text-sm font-bold text-win">
                      {confidence.poisson.brackets.twoThree}%
                    </strong>
                  </div>
                  <div className="rounded border border-line bg-surface/30 p-2">
                    <span className="text-[10px] uppercase text-ink/60">4+ golova</span>
                    <strong className="block text-sm font-bold text-cyan">
                      {confidence.poisson.brackets.fourPlus}%
                    </strong>
                  </div>
                </div>
              </div>
            </Panel>

            {/* KARTICA: BTTS TIP */}
            {(() => {
              const b = bttsTip(shown.kGg, shown.k22, shown.kOver, verdict ? exact : null);
              return (
                <Panel className={b.yes ? "border-win/70" : "border-loss/70"}>
                  <PanelTitle
                    icon={<Sparkles className={`size-7 ${b.yes ? "text-win" : "text-loss"}`} />}
                  >
                    BTTS tip (Oba daju gol)
                  </PanelTitle>
                  <div
                    className={`mt-4 rounded-md border-2 p-4 text-center ${
                      b.yes ? "border-win bg-win/8" : "border-loss bg-loss/8"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center gap-3 font-display text-2xl font-extrabold ${
                        b.yes ? "text-win" : "text-loss"
                      }`}
                    >
                      <span
                        className={`grid size-8 place-items-center rounded-full ${
                          b.yes ? "bg-win text-surface" : "bg-loss text-ink"
                        }`}
                      >
                        <Check className="size-5" />
                      </span>
                      BTTS {b.yes ? "DA" : "NE"}
                    </div>
                    <p className="mt-1 font-bold">
                      Procjena: {(b.p * 100).toFixed(1)}% · Snaga: {b.strength}
                    </p>
                    <p className="mt-1 text-xs text-ink/75">
                      Potvrđeni uvjeti: <strong className="text-win">{b.daCount} DA</strong> ·{" "}
                      <strong className="text-loss">{b.neCount} NE</strong>
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {b.indicators.map((ind) => (
                      <div
                        key={ind.name}
                        className="flex items-center justify-between rounded-md border border-line bg-surface/35 px-3 py-2 text-xs"
                      >
                        <div>
                          <strong className="text-ink/90">{ind.name}</strong>
                          <span className="ml-2 font-mono text-ink/70">({ind.valueStr})</span>
                          <p className="text-[11px] text-ink/60">{ind.detail}</p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${
                            ind.flag === "DA"
                              ? "bg-win/20 text-win border border-win/50"
                              : ind.flag === "NE"
                                ? "bg-loss/20 text-loss border border-loss/50"
                                : "bg-surface text-ink/60 border border-line"
                          }`}
                        >
                          {ind.flag}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            })()}

            {/* SKENER ZLATNIH PAROVA */}
            <Panel className={zone.tone.split(" ")[0] ?? ""}>
              <PanelTitle icon={<Sparkles className="size-7 text-gold" />}>
                Skener profila para
              </PanelTitle>
              <div className={`mt-3 rounded-md border p-3 ${zone.tone}`}>
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-bold">{zone.title}</strong>
                  <span className="rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-surface/60 border border-current">
                    {zone.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{zone.desc}</p>
              </div>
            </Panel>

            {/* DETEKTOR KLIZAVIH PAROVA */}
            {(() => {
              const anomalies = detectAnomalies(shown.k22, shown.kOver, shown.kGg);
              return (
                <Panel className={anomalies.length ? "border-gold/70" : ""}>
                  <PanelTitle icon={<AlertTriangle className="size-7 text-gold" />}>
                    Detektor klizavih parova
                  </PanelTitle>
                  {anomalies.length === 0 ? (
                    <p className="mt-3 text-xs text-ink/75">
                      Kvote su međusobno usklađene — nema znakova da bi veća kvota bila bolji izbor.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {anomalies.map((a) => (
                        <li
                          key={a.title}
                          className="rounded-md border border-gold/60 bg-gold/10 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm text-gold">{a.title}</strong>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${
                                a.level === "VISOKO"
                                  ? "bg-loss/20 text-loss border border-loss/50"
                                  : "bg-gold/20 text-gold border border-gold/50"
                              }`}
                            >
                              {a.level}
                            </span>
                          </div>
                          <p className="mt-1 leading-relaxed text-ink/80">{a.detail}</p>
                          <p className="mt-1 font-bold text-ink">Smjer: {a.favours}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              );
            })()}
          </div>

          {/* STUPAC 2: FORMULE I DNEVNIK ANALIZA */}
          <div className="space-y-4">
            <Panel>
              <PanelTitle icon={<Settings className="size-7" />}>Formule i metoda</PanelTitle>
              <h3 className="section-label mt-5">1. Izračun osnovnih vjerojatnoća iz kvota</h3>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center font-math text-base sm:text-lg">
                <span>
                  P(2:2) ={" "}
                  <span className="fraction">
                    <i>1</i>
                    <i>k₂:₂</i>
                  </span>
                </span>
                <span>
                  P(O2.5) ={" "}
                  <span className="fraction">
                    <i>1</i>
                    <i>kO2.5</i>
                  </span>
                </span>
                <span>
                  P(GG) ={" "}
                  <span className="fraction">
                    <i>1</i>
                    <i>kGG</i>
                  </span>
                </span>
              </div>

              <h3 className="section-label mt-5">2. Korigirani Over kroz GG formulu</h3>
              <FormulaBox label="A" tone="bg-cyan">
                P(GG→Over) = P(GG) · 62% + (1 − P(GG)) · 35%
              </FormulaBox>

              <h3 className="section-label mt-5">3. Kombinacija P(O2.5) i P(GG→Over)</h3>
              <FormulaBox label="B" tone="bg-win">
                P(≥3 gola) = [ P(O2.5) + P(GG→Over) ] / 2
              </FormulaBox>

              <h3 className="section-label mt-5">4. Izračun točno 2 gola</h3>
              <FormulaBox label="C" tone="bg-mint">
                P(točno 2) = max(0, 1/1.05 − P(≥3 gola))
              </FormulaBox>

              <h3 className="section-label mt-5">5. Vjerojatnoća za 2.5 MANJE</h3>
              <FormulaBox label="D" tone="bg-loss">
                P(≤2 gola) = 1 − P(≥3 gola)
              </FormulaBox>

              <h3 className="section-label mt-5">6. Provjera konzistentnosti kvote 2:2</h3>
              <div className="mt-3 rounded-md border border-line bg-surface/50 p-3 text-sm">
                Omjer = P(2:2) / P(O2.5). Ako je &gt; 0.30, kvota 2:2 je umjetno niska i ne prati
                ponudu.
              </div>
            </Panel>

            {/* DNEVNIK ANALIZA (TRACKER) */}
            <Panel className="border-cyan/60">
              <div className="flex items-center justify-between">
                <PanelTitle icon={<History className="size-7 text-cyan" />}>
                  Dnevnik analiza (Tracker)
                </PanelTitle>
                <Button
                  size="sm"
                  onClick={handleSaveAnalysis}
                  className="gap-1 bg-cyan text-surface hover:bg-cyan/90 font-bold"
                >
                  <BookmarkPlus className="size-4" /> Spremi analizu
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-md border border-line bg-surface/40 p-3 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink/60">Ukupno:</span>
                  <strong className="block text-base font-bold text-ink">{history.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink/60">Riješeno:</span>
                  <strong className="block text-base font-bold text-ink">{settled.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink/60">Prolaznost:</span>
                  <strong className="block text-base font-bold text-win">{winRate}%</strong>
                </div>
              </div>

              {history.length === 0 ? (
                <p className="mt-4 text-center text-xs text-ink/60">
                  Još nema spremljenih analiza. Klikni "Spremi analizu" da pratiš rezultate.
                </p>
              ) : (
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-line bg-surface/20 p-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-ink">{item.label}</div>
                        <div className="mt-0.5 text-[11px] text-ink/60">
                          {item.date} · 2.5:{" "}
                          <strong className={item.tipOver === "VIŠE" ? "text-win" : "text-loss"}>
                            {item.tipOver}
                          </strong>{" "}
                          · BTTS:{" "}
                          <strong className={item.tipBtts === "DA" ? "text-win" : "text-loss"}>
                            {item.tipBtts}
                          </strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetStatus(item.id, "won")}
                          className={`rounded px-1.5 py-1 text-[10px] font-bold ${item.status === "won" ? "bg-win text-surface" : "bg-surface border border-line text-ink/60 hover:text-win"}`}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatus(item.id, "lost")}
                          className={`rounded px-1.5 py-1 text-[10px] font-bold ${item.status === "lost" ? "bg-loss text-ink" : "bg-surface border border-line text-ink/60 hover:text-loss"}`}
                        >
                          ✗
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(item.id)}
                          className="rounded p-1 text-ink/40 hover:text-loss"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* STUPAC 3: REZULTAT I ZAKLJUČAK */}
          <div className="space-y-4">
            <Panel className="border-win/70">
              <PanelTitle icon={<Gauge className="size-7 text-win" />}>
                Rezultat — Brzi pregled
              </PanelTitle>
              <div className="mt-4 space-y-3 font-mono text-sm sm:text-base">
                <ResultRow
                  label="P(2:2)"
                  val={pct(shown.p22)}
                  raw={`1 / ${shown.k22.toFixed(2)}`}
                />
                <ResultRow
                  label="P(O2.5)"
                  val={pct(shown.pOver)}
                  raw={`1 / ${shown.kOver.toFixed(2)}`}
                />
                <ResultRow label="P(GG)" val={pct(shown.pGg)} raw={`1 / ${shown.kGg.toFixed(2)}`} />
                <ResultRow label="P(GG→Over)" val={pct(shown.pGgOver)} raw="formula A" />
                <ResultRow
                  label="P(≥3 gola)"
                  val={pct(shown.pThree)}
                  raw="formula B"
                  highlight={shown.isOver}
                />
                <ResultRow label="P(točno 2)" val={pct(shown.pTwo)} raw="formula C" />
                <ResultRow
                  label="P(≤2 gola)"
                  val={pct(shown.pUnder)}
                  raw="formula D"
                  highlight={!shown.isOver}
                />
              </div>

              <div className="mt-4 border-t border-line pt-3 text-xs text-ink/80">
                <span className="font-bold">Omjer P(2:2) / P(O2.5):</span>{" "}
                <span className="font-mono font-bold">{ratio.toFixed(3)}</span> — {ratioDesc(ratio)}
              </div>
            </Panel>

            {/* AUTOMATSKI VALUE BET SKENER (SVA 4 TRŽIŠTA) */}
            <Panel className={valueScan.bestValue ? "border-win/70" : "border-line"}>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <PanelTitle
                  icon={
                    <TrendingUp
                      className={`size-7 ${valueScan.bestValue ? "text-win" : "text-muted"}`}
                    />
                  }
                >
                  Automatski Value Bet Skener
                </PanelTitle>
                <span className="rounded bg-surface px-2 py-0.5 text-xs font-bold text-ink/75 border border-line">
                  4 TRŽIŠTA
                </span>
              </div>

              {valueScan.bestValue ? (
                <div className="mt-4 rounded-md border-2 border-win bg-win/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-win">
                      Najveća matematička prednost
                    </span>
                    <span className="rounded-full bg-win px-2.5 py-0.5 text-xs font-extrabold text-surface">
                      EV +{valueScan.bestValue.ev}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-display text-2xl font-black text-ink">
                      {valueScan.bestValue.market}
                    </span>
                    <span className="font-mono text-sm font-bold text-win">
                      Kvota: {valueScan.bestValue.bookieOdd.toFixed(2)}
                    </span>
                    <span className="text-xs text-ink/60">
                      (Fer: {valueScan.bestValue.fairOdd.toFixed(2)})
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink/85">{valueScan.summary}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-line bg-surface/30 p-3 text-center">
                  <p className="text-sm font-bold text-ink/70">
                    Nema izražene matematičke prednosti
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    Kladionica je kvote postavila točno u skladu s rizikom.
                  </p>
                </div>
              )}

              {valueScan.worstTrap && (
                <div className="mt-3 flex items-center justify-between rounded-md border border-loss/50 bg-loss/10 p-2.5 text-xs text-loss">
                  <span>
                    ⚠️ <strong>Tržišna zamka:</strong> {valueScan.worstTrap.market} @{" "}
                    {valueScan.worstTrap.bookieOdd.toFixed(2)}
                  </span>
                  <span className="font-bold">EV {valueScan.worstTrap.ev}%</span>
                </div>
              )}

              {/* TABLICA SVA 4 TRŽIŠTA */}
              <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface/20">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-surface/60 text-ink/60">
                    <tr>
                      <th className="p-2">Tržište</th>
                      <th className="p-2">Kvota</th>
                      <th className="p-2">Model %</th>
                      <th className="p-2 text-right">EV %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-mono">
                    {valueScan.allMarkets.map((m) => (
                      <tr
                        key={m.market}
                        className={m.isRecommended ? "bg-win/10 font-bold text-win" : "text-ink/80"}
                      >
                        <td className="p-2 font-sans font-semibold">{m.market}</td>
                        <td className="p-2">{m.bookieOdd.toFixed(2)}</td>
                        <td className="p-2">{m.modelProb}%</td>
                        <td
                          className={`p-2 text-right font-bold ${m.ev > 0 ? "text-win" : "text-ink/50"}`}
                        >
                          {m.ev > 0 ? `+${m.ev}%` : `${m.ev}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel className="border-gold/70">
              <PanelTitle icon={<Radar className="size-7 text-gold" />}>
                Dodatni signali (iz tačnih rezultata)
              </PanelTitle>
              <ul className="mt-3 space-y-2 text-sm">
                {extraSignals(shown.k22, verdict ? exact : null).map((s) => (
                  <li
                    key={s.title}
                    className={`rounded-md border px-3 py-2 ${
                      s.on === true
                        ? "border-win/60 bg-win/8"
                        : s.on === false
                          ? "border-line bg-surface/35"
                          : "border-line/50 bg-surface/20 opacity-70"
                    }`}
                  >
                    <strong className={s.on === true ? "text-win" : "text-ink/85"}>
                      {s.on === true ? "✓ " : s.on === false ? "✗ " : "– "}
                      {s.title}
                    </strong>
                    <span className="block text-xs text-ink/70">{s.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Ovo su iskustvena pravila, ne dokaz. Glavni tip gore ostaje matematički model.
              </p>
            </Panel>

            <Panel className="border-violet/70">
              <PanelTitle icon={<ShieldCheck className="size-7 text-violet" />}>
                Zaključak
              </PanelTitle>
              <div
                className={`mt-4 rounded-md border-2 p-4 text-center ${
                  shown.isOver ? "border-win bg-win/8" : "border-loss bg-loss/8"
                }`}
              >
                <div
                  className={`flex items-center justify-center gap-3 font-display text-2xl font-extrabold ${
                    shown.isOver ? "text-win" : "text-loss"
                  }`}
                >
                  <span
                    className={`grid size-8 place-items-center rounded-full ${
                      shown.isOver ? "bg-win text-surface" : "bg-loss text-ink"
                    }`}
                  >
                    <Check className="size-5" />
                  </span>
                  2.5 {shown.isOver ? "VIŠE" : "MANJE"}
                </div>
                <p className="mt-1 font-bold">
                  ({pct(shown.isOver ? shown.pThree : shown.pUnder)} &gt;{" "}
                  {pct(shown.isOver ? shown.pUnder : shown.pThree)})
                </p>
              </div>
            </Panel>

            <Panel className="border-magenta/70">
              <PanelTitle icon={<Info className="size-7 text-magenta" />}>Važno</PanelTitle>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink/75">
                <li>Koristi točne decimalne kvote.</li>
                <li>Unesi kvote iz iste kladionice i istog trenutka.</li>
                <li>Prikaz je procjena modela, ne jamstvo ishoda.</li>
                <li>Kalkulator ne zamjenjuje odgovorno odlučivanje.</li>
              </ul>
            </Panel>
          </div>
        </div>

        <footer className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_auto] lg:items-center">
          <div className="panel flex items-center gap-3 py-3">
            <Crosshair className="size-8 shrink-0 text-win" />
            <p className="text-xs text-ink/75">
              <strong className="block text-ink">Tvoja app logika u jednoj rečenici:</strong>
              Iz 3 kvote izračunaj P<sub>≥3</sub> i usporedi s P<sub>≤2</sub>: veća vrijednost
              određuje konkretan tip.
            </p>
          </div>
          <p className="px-5 text-center font-display text-sm font-bold italic text-win">
            Precizno. Brzo. Pouzdano.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function PanelTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-xl font-bold text-ink">
      {icon}
      <span>{children}</span>
    </h2>
  );
}

function FormulaBox({
  label,
  tone,
  children,
}: {
  label: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-md border border-line bg-surface/50 p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        <span className={`grid size-5 place-items-center rounded-full text-surface ${tone}`}>
          {label}
        </span>
        <span className="text-ink/80">{children}</span>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  val,
  raw,
  highlight = false,
}: {
  label: string;
  val: string;
  raw: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 ${
        highlight ? "bg-win/15 font-bold text-win" : "text-ink/85"
      }`}
    >
      <span>{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">({raw})</span>
        <span className="font-bold">{val}</span>
      </div>
    </div>
  );
}
