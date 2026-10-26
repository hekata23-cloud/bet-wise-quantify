import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  analyzeBTTS,
  analyzeOU,
  analyzeWDL,
  scoreMatrix,
  srceIndex,
  analyzeHTFT,
  analyzeCorners,
  analyzeCards,
  monteCarlo,
} from "@/lib/predictor";
import { Calculator as CalcIcon, Flame, TrendingUp, Flag, Square } from "lucide-react";

export const Route = createFileRoute("/kalkulator")({
  head: () => ({
    meta: [
      { title: "Kalkulator predikcija · Andromeda AI" },
      {
        name: "description",
        content:
          "Ručno unesi xG, forme, kvote i motivaciju — dobiješ BTTS, Over/Under i 1X2 s opširnim obrazloženjem.",
      },
    ],
  }),
  component: KalkulatorPage,
});

interface State {
  home: string;
  away: string;
  homeXG: number;
  awayXG: number;
  homeGoalsAvg: number;
  awayGoalsAvg: number;
  homeBTTSRate: number;
  awayBTTSRate: number;
  homeScoredRate: number;
  awayScoredRate: number;
  homeConcededRate: number;
  awayConcededRate: number;
  odd1: number;
  oddX: number;
  odd2: number;
  bttsYes: number;
  bttsNo: number;
  over25: number;
  under25: number;
  ouLine: number;
  motH: number;
  motA: number;
  formH: number;
  formA: number;
  rivalry: number;
  crowd: number;
  // Kornera
  cornersHome: number;
  cornersAway: number;
  cornersConcededHome: number;
  cornersConcededAway: number;
  cornersLine: number;
  // Kartona
  cardsHome: number;
  cardsAway: number;
  refereeCards: number;
  cardsLine: number;
  // HT udio
  htShare: number;
}

const DEFAULTS: State = {
  home: "Dinamo",
  away: "Hajduk",
  homeXG: 1.65,
  awayXG: 1.15,
  homeGoalsAvg: 1.8,
  awayGoalsAvg: 1.3,
  homeBTTSRate: 0.6,
  awayBTTSRate: 0.55,
  homeScoredRate: 0.85,
  awayScoredRate: 0.7,
  homeConcededRate: 0.6,
  awayConcededRate: 0.75,
  odd1: 1.9,
  oddX: 3.5,
  odd2: 3.9,
  bttsYes: 1.75,
  bttsNo: 2.0,
  over25: 1.85,
  under25: 1.95,
  ouLine: 2.5,
  motH: 8,
  motA: 7,
  formH: 7,
  formA: 6,
  rivalry: 9,
  crowd: 8,
  cornersHome: 5.5,
  cornersAway: 4.5,
  cornersConcededHome: 4.8,
  cornersConcededAway: 5.3,
  cornersLine: 9.5,
  cardsHome: 1.8,
  cardsAway: 2.1,
  refereeCards: 3.6,
  cardsLine: 3.5,
  htShare: 0.44,
};

function KalkulatorPage() {
  const [s, setS] = useState<State>(DEFAULTS);
  const [computed, setComputed] = useState<null | {
    btts: ReturnType<typeof analyzeBTTS>;
    ou: ReturnType<typeof analyzeOU>;
    wdl: ReturnType<typeof analyzeWDL>;
    mat: ReturnType<typeof scoreMatrix>;
    htft: ReturnType<typeof analyzeHTFT>;
    corners: ReturnType<typeof analyzeCorners>;
    cards: ReturnType<typeof analyzeCards>;
    mc: ReturnType<typeof monteCarlo>;
  }>(null);

  const update = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));

  const canCompute = useMemo(() => s.homeXG > 0 && s.awayXG > 0, [s]);

  function calculate() {
    const srce = srceIndex({
      homeMotivation: s.motH,
      awayMotivation: s.motA,
      homeForm: s.formH,
      awayForm: s.formA,
      rivalry: s.rivalry,
      crowd: s.crowd,
    });
    const btts = analyzeBTTS({
      homeXG: s.homeXG,
      awayXG: s.awayXG,
      homeBTTSRate: s.homeBTTSRate,
      awayBTTSRate: s.awayBTTSRate,
      homeScoredRate: s.homeScoredRate,
      awayScoredRate: s.awayScoredRate,
      homeConcededRate: s.homeConcededRate,
      awayConcededRate: s.awayConcededRate,
      bttsYesOdd: s.bttsYes || undefined,
      bttsNoOdd: s.bttsNo || undefined,
    });
    const ou = analyzeOU({
      homeXG: s.homeXG,
      awayXG: s.awayXG,
      line: s.ouLine,
      homeGoalsAvg: s.homeGoalsAvg,
      awayGoalsAvg: s.awayGoalsAvg,
      overOdd: s.over25 || undefined,
      underOdd: s.under25 || undefined,
    });
    const wdl = analyzeWDL({
      homeXG: s.homeXG,
      awayXG: s.awayXG,
      odd1: s.odd1,
      oddX: s.oddX,
      odd2: s.odd2,
      srce,
    });
    const mat = scoreMatrix(s.homeXG, s.awayXG);
    const htft = analyzeHTFT({ homeXG: s.homeXG, awayXG: s.awayXG, htShare: s.htShare });
    const corners = analyzeCorners({
      homeAvg: s.cornersHome,
      awayAvg: s.cornersAway,
      homeConcededAvg: s.cornersConcededHome,
      awayConcededAvg: s.cornersConcededAway,
      line: s.cornersLine,
    });
    const cards = analyzeCards({
      homeAvg: s.cardsHome,
      awayAvg: s.cardsAway,
      refereeAvg: s.refereeCards,
      line: s.cardsLine,
    });
    const mc = monteCarlo(s.homeXG, s.awayXG, 10000);
    setComputed({ btts, ou, wdl, mat, htft, corners, cards, mc });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "var(--gradient-primary)" }}
        >
          <CalcIcon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Kalkulator predikcija</h1>
          <p className="text-sm text-muted-foreground">
            Unesi sve podatke ručno. Napredne postavke otvorene po defaultu.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Timovi i osnove
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Domaći tim">
              <input className={inputCls} value={s.home} onChange={(e) => update("home", e.target.value)} />
            </Field>
            <Field label="Gostujući tim">
              <input className={inputCls} value={s.away} onChange={(e) => update("away", e.target.value)} />
            </Field>
            <NumField label="xG domaćin" value={s.homeXG} step={0.05} onChange={(v) => update("homeXG", v)} />
            <NumField label="xG gost" value={s.awayXG} step={0.05} onChange={(v) => update("awayXG", v)} />
            <NumField label="Prosjek golova (dom)" value={s.homeGoalsAvg} step={0.05} onChange={(v) => update("homeGoalsAvg", v)} />
            <NumField label="Prosjek golova (gost)" value={s.awayGoalsAvg} step={0.05} onChange={(v) => update("awayGoalsAvg", v)} />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            Napredne stope (0–1)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="BTTS stopa dom" value={s.homeBTTSRate} step={0.05} min={0} max={1} onChange={(v) => update("homeBTTSRate", v)} />
            <NumField label="BTTS stopa gost" value={s.awayBTTSRate} step={0.05} min={0} max={1} onChange={(v) => update("awayBTTSRate", v)} />
            <NumField label="% postignut dom" value={s.homeScoredRate} step={0.05} min={0} max={1} onChange={(v) => update("homeScoredRate", v)} />
            <NumField label="% postignut gost" value={s.awayScoredRate} step={0.05} min={0} max={1} onChange={(v) => update("awayScoredRate", v)} />
            <NumField label="% primljen dom" value={s.homeConcededRate} step={0.05} min={0} max={1} onChange={(v) => update("homeConcededRate", v)} />
            <NumField label="% primljen gost" value={s.awayConcededRate} step={0.05} min={0} max={1} onChange={(v) => update("awayConcededRate", v)} />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            Kvote
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="1" value={s.odd1} step={0.05} onChange={(v) => update("odd1", v)} />
            <NumField label="X" value={s.oddX} step={0.05} onChange={(v) => update("oddX", v)} />
            <NumField label="2" value={s.odd2} step={0.05} onChange={(v) => update("odd2", v)} />
            <NumField label="BTTS DA" value={s.bttsYes} step={0.05} onChange={(v) => update("bttsYes", v)} />
            <NumField label="BTTS NE" value={s.bttsNo} step={0.05} onChange={(v) => update("bttsNo", v)} />
            <NumField label="OU linija" value={s.ouLine} step={0.5} onChange={(v) => update("ouLine", v)} />
            <NumField label={`Over ${s.ouLine}`} value={s.over25} step={0.05} onChange={(v) => update("over25", v)} />
            <NumField label={`Under ${s.ouLine}`} value={s.under25} step={0.05} onChange={(v) => update("under25", v)} />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            Srce indeks (0–10)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Motivacija dom" value={s.motH} step={1} min={0} max={10} onChange={(v) => update("motH", v)} />
            <NumField label="Motivacija gost" value={s.motA} step={1} min={0} max={10} onChange={(v) => update("motA", v)} />
            <NumField label="Forma dom" value={s.formH} step={1} min={0} max={10} onChange={(v) => update("formH", v)} />
            <NumField label="Forma gost" value={s.formA} step={1} min={0} max={10} onChange={(v) => update("formA", v)} />
            <NumField label="Rivalstvo" value={s.rivalry} step={1} min={0} max={10} onChange={(v) => update("rivalry", v)} />
            <NumField label="Publika (dom)" value={s.crowd} step={1} min={0} max={10} onChange={(v) => update("crowd", v)} />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            Kornera (prosjek po utakmici)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Dom postiže" value={s.cornersHome} step={0.1} onChange={(v) => update("cornersHome", v)} />
            <NumField label="Gost postiže" value={s.cornersAway} step={0.1} onChange={(v) => update("cornersAway", v)} />
            <NumField label="Dom prima" value={s.cornersConcededHome} step={0.1} onChange={(v) => update("cornersConcededHome", v)} />
            <NumField label="Gost prima" value={s.cornersConcededAway} step={0.1} onChange={(v) => update("cornersConcededAway", v)} />
            <NumField label="Kornera linija" value={s.cornersLine} step={0.5} onChange={(v) => update("cornersLine", v)} />
            <NumField label="HT udio golova (0-1)" value={s.htShare} step={0.02} min={0.3} max={0.6} onChange={(v) => update("htShare", v)} />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            Kartona (prosjek)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Dom prima kart." value={s.cardsHome} step={0.1} onChange={(v) => update("cardsHome", v)} />
            <NumField label="Gost prima kart." value={s.cardsAway} step={0.1} onChange={(v) => update("cardsAway", v)} />
            <NumField label="Sudac prosjek kart." value={s.refereeCards} step={0.1} onChange={(v) => update("refereeCards", v)} />
            <NumField label="Kartona linija" value={s.cardsLine} step={0.5} onChange={(v) => update("cardsLine", v)} />
          </div>

          <button
            onClick={calculate}
            disabled={!canCompute}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90"
            style={{ boxShadow: "var(--shadow-glow)" }}
          >
            <Flame className="h-4 w-4" /> Izračunaj
          </button>
        </section>

        <section className="space-y-4">
          {!computed && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Popuni podatke i klikni <b className="text-foreground">Izračunaj</b>. Dobit ćeš BTTS,
              Over/Under i 1X2 tip s opširnim obrazloženjem.
            </div>
          )}
          {computed && (
            <>
              <ResultCard
                title="BTTS"
                verdict={computed.btts.tip === "GG" ? "GG (Obostrano DA)" : "NG (Obostrano NE)"}
                probability={computed.btts.tip === "GG" ? computed.btts.probYes : computed.btts.probNo}
                confidence={computed.btts.confidence}
                color={computed.btts.color}
                reasons={computed.btts.reasons}
                extra={`Poissonov BTTS: ${(computed.mat.pBTTS * 100).toFixed(1)}%`}
              />
              <ResultCard
                title={`Over/Under ${computed.ou.line}`}
                verdict={computed.ou.tip}
                probability={computed.ou.tip.startsWith("Over") ? computed.ou.probOver : computed.ou.probUnder}
                confidence={computed.ou.confidence}
                color={computed.ou.tip.startsWith("Over") ? "success" : "destructive"}
                reasons={computed.ou.reasons}
              />
              <ResultCard
                title="1X2 tip"
                verdict={
                  computed.wdl.tip === "1"
                    ? `1 — pobjeda ${s.home}`
                    : computed.wdl.tip === "2"
                      ? `2 — pobjeda ${s.away}`
                      : "X — neriješeno"
                }
                probability={
                  computed.wdl.tip === "1"
                    ? computed.wdl.probHome
                    : computed.wdl.tip === "2"
                      ? computed.wdl.probAway
                      : computed.wdl.probDraw
                }
                confidence={computed.wdl.confidence}
                color="success"
                reasons={computed.wdl.reasons}
                extra={`Indeks slučajnosti: ${(computed.wdl.randomness * 100).toFixed(1)}%`}
              />
              <ResultCard
                title="HT/FT"
                verdict={`Preporuka: ${computed.htft.tip}`}
                probability={computed.htft.top[0].p}
                confidence={computed.htft.confidence}
                color="success"
                reasons={computed.htft.reasons}
              />
              <ResultCard
                title={`Kornera Over/Under ${computed.corners.line}`}
                verdict={computed.corners.tip}
                probability={computed.corners.tip.startsWith("Over") ? computed.corners.probOver : computed.corners.probUnder}
                confidence={computed.corners.confidence}
                color={computed.corners.tip.startsWith("Over") ? "success" : "destructive"}
                reasons={computed.corners.reasons}
                extra={`Očekivano ${computed.corners.expected.toFixed(1)}`}
              />
              <ResultCard
                title={`Kartona Over/Under ${computed.cards.line}`}
                verdict={computed.cards.tip}
                probability={computed.cards.tip.startsWith("Over") ? computed.cards.probOver : computed.cards.probUnder}
                confidence={computed.cards.confidence}
                color={computed.cards.tip.startsWith("Over") ? "success" : "destructive"}
                reasons={computed.cards.reasons}
                extra={`Očekivano ${computed.cards.expected.toFixed(1)}`}
              />
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Flag className="h-4 w-4 text-primary" /> Monte Carlo (10 000 iteracija)
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                  <MCCell label="1" value={computed.mc.pHome} />
                  <MCCell label="X" value={computed.mc.pDraw} />
                  <MCCell label="2" value={computed.mc.pAway} />
                  <MCCell label="BTTS" value={computed.mc.pBTTS} />
                  <MCCell label="O2.5" value={computed.mc.pOver25} />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-primary" /> Top 5 vjerojatnih rezultata
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {computed.mat.topScores.map((sc) => (
                    <div key={sc.score} className="rounded-lg bg-secondary p-3 text-center">
                      <div className="text-lg font-bold">{sc.score}</div>
                      <div className="text-xs text-muted-foreground">{(sc.p * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        className={inputCls}
      />
    </Field>
  );
}

function ResultCard({
  title,
  verdict,
  probability,
  confidence,
  color,
  reasons,
  extra,
}: {
  title: string;
  verdict: string;
  probability: number;
  confidence: number;
  color: "success" | "destructive";
  reasons: string[];
  extra?: string;
}) {
  const isGood = color === "success";
  return (
    <div
      className={`rounded-2xl border p-5 ${isGood ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className={`mt-1 text-2xl font-bold ${isGood ? "text-primary" : "text-destructive"}`}>
            {verdict}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Vjerojatnost {(probability * 100).toFixed(1)}% · Sigurnost {confidence}%
            {extra ? ` · ${extra}` : ""}
          </div>
        </div>
        <div className={`text-3xl font-black ${isGood ? "text-primary" : "text-destructive"}`}>
          {confidence}%
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className={isGood ? "text-primary" : "text-destructive"}>›</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MCCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-base font-bold text-primary">{(value * 100).toFixed(1)}%</div>
    </div>
  );
}