import { createFileRoute } from "@tanstack/react-router";
import { evaluatePredictionIntegrity, integrityClass, footballContradiction } from "@/lib/prediction-integrity";
import { useEffect, useState } from "react";
import {
  OUTCOMES,
  TOP_SCORES,
  calculate,
  calculateBtts,
  calculateCorrectScore,
  calculateHtDraw,
  calculateOu,
  calculateOu35,
  calculateOu15,
  type Ou15Result,
  dutch,
  emptyInputs,
  type BttsResult,
  type CorrectScoreResult,
  type HtDrawResult,
  type Inputs,
  type Outcome,
  type OuResult,
  type Ou35Result,
  type Result,
} from "@/lib/predictor-engine";
import {
  LimitError,
  cacheAny,
  fetchFixtures,
  fetchMatchOdds,
  formatZagrebTime,
  getZagrebDate,
  type Fixture,
  type Keys,
} from "@/lib/predictor-api";
import { saveLastPredictorInputs, loadLastPredictorInputs } from "@/lib/predictor-bridge";

export const Route = createFileRoute("/prediktor")({
  head: () => ({
    meta: [
      { title: "Prediktor — Točan Rezultat, HT/FT & Over/Under 3.5" },
      {
        name: "description",
        content: "Nogometni analitički centar: Poisson 5x5 točan rezultat s Over/Under 3.5 kalibracijom, HT/FT preokreti i skener vrijednosti.",
      },
    ],
  }),
  component: PrediktorPage,
  errorComponent: () => (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-xl font-bold">Stranica se nije mogla učitati</h2>
      <p className="text-sm text-muted-foreground">Došlo je do pogreške prilikom renderiranja prediktora.</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Osvježi stranicu
      </button>
    </div>
  ),
});

const COOLDOWN_SECONDS = 5;
const pct = (x: number) => (x * 100).toFixed(1) + "%";

function Polje({
  label,
  value,
  onChange,
  placeholder = "—",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

function Kartica({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function SharpBadge() {
  return (
    <div className="mt-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
      🎯 Optimized by Sharp Consensus
    </div>
  );
}

function PrediktorPage() {
  const [inp, setInp] = useState<Inputs>(emptyInputs);
  const [res, setRes] = useState<Result | null>(null);
  const [bttsRes, setBttsRes] = useState<BttsResult | null>(null);
  const [ouRes, setOuRes] = useState<OuResult | null>(null);
  const [ou35Res, setOu35Res] = useState<Ou35Result | null>(null);
  const [htDrawRes, setHtDrawRes] = useState<HtDrawResult | null>(null);
  const [csRes, setCsRes] = useState<CorrectScoreResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<Keys>({ football: "", odds: "", sport: "soccer_epl" });
  const [showSettings, setShowSettings] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [filter, setFilter] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"correctscore" | "ou35" | "scanner" | "htdraw" | "btts" | "ou" | "htft">("correctscore");

  const [dutchOn, setDutchOn] = useState(false);
  const [stake, setStake] = useState("100");
  const [dA, setDA] = useState<Outcome>("1/1");
  const [dB, setDB] = useState<Outcome>("X/1");

  useEffect(() => {
    try {
      const k = localStorage.getItem("htft:keys");
      if (k) {
        setKeys(JSON.parse(k));
      } else {
        const alt = localStorage.getItem("tm.key.apiFootball") || "";
        if (alt) setKeys((prev) => ({ ...prev, football: alt }));
      }
    } catch {
      /* ignore */
    }

    const last = loadLastPredictorInputs();
    if (last) {
      setInp(last);
      runAll(last);
    }

    const today = getZagrebDate();
    const c = cacheAny<any>("fixtures:" + today);
    if (c?.response) {
      setFixtures(
        c.response.map((f: any) => ({
          id: f.fixture.id,
          home: f.teams.home.name,
          away: f.teams.away.name,
          league: `${f.league.country ? f.league.country + " · " : ""}${f.league.name}`,
          time: f.fixture.date,
          status: f.fixture.status.short || "NS",
        }))
      );
      setNotice(`Utakmice učitane iz memorije (${today}, Zagreb) — 0 potrošenih kredita.`);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const saveKeys = (k: Keys) => {
    setKeys(k);
    localStorage.setItem("htft:keys", JSON.stringify(k));
  };

  const [sharps, setSharps] = useState(false);
  const [ou15Res, setOu15Res] = useState<Ou15Result | null>(null);
  const set = (k: keyof Omit<Inputs, "book" | "bookScores">) => (v: string) => setInp((s) => ({ ...s, [k]: v }));
  const setBook = (o: Outcome) => (v: string) => setInp((s) => ({ ...s, book: { ...s.book, [o]: v } }));
  const setBookScore = (score: string) => (v: string) =>
    setInp((s) => ({ ...s, bookScores: { ...s.bookScores, [score]: v } }));

  const runAll = (data: Inputs, sm: boolean = sharps) => {
    saveLastPredictorInputs(data);

    const r = calculate(data, sm);
    if ("error" in r) {
      setErr(r.error);
      setRes(null);
    } else {
      setErr(null);
      setRes(r);
    }

    const b = calculateBtts(data, sm);
    if (!("error" in b)) setBttsRes(b);

    const o = calculateOu(data);
    if (!("error" in o)) setOuRes(o);

    const o35 = calculateOu35(data);
    if (!("error" in o35)) setOu35Res(o35);

    const htd = calculateHtDraw(data, sm);
    if (!("error" in htd)) setHtDrawRes(htd);

    const o15r = calculateOu15(data, sm);
    setOu15Res("error" in o15r ? null : o15r);

    const cs = calculateCorrectScore(data, sm);
    if (!("error" in cs)) setCsRes(cs);
  };

  const handleErr = (e: unknown) => {
    if (e instanceof LimitError) {
      setWarn(e.message);
    } else {
      setWarn("Nije moguće dohvatiti API podatke. Aplikacija ostaje u zaštićenom ručnom radu.");
    }
  };

  const syncFixtures = async () => {
    if (!keys.football?.trim()) {
      setShowSettings(true);
      setWarn("Unesite svoj Football API ključ kako biste dohvatili utakmice.");
      return;
    }
    setCooldown(COOLDOWN_SECONDS);
    setLoading(true);
    setWarn(null);
    try {
      const data = await fetchFixtures(keys.football);
      setFixtures(data);
      setNotice(`Dohvaćeno ${data.length} današnjih utakmica.`);
    } catch (e) {
      handleErr(e);
    } finally {
      setLoading(false);
    }
  };

  const pickFixture = async (f: Fixture) => {
    setSelected(f.id);
    setLoading(true);
    setWarn(null);
    try {
      const odds = await fetchMatchOdds(f.id, keys.odds, keys.sport);
      if (odds) {
        const next: Inputs = {
          ...inp,
          f1: odds.f1 ? String(odds.f1) : inp.f1,
          fX: odds.fX ? String(odds.fX) : inp.fX,
          f2: odds.f2 ? String(odds.f2) : inp.f2,
          over: odds.over ? String(odds.over) : inp.over,
          under: odds.under ? String(odds.under) : inp.under,
          bttsYes: odds.bttsYes ? String(odds.bttsYes) : inp.bttsYes,
          bttsNo: odds.bttsNo ? String(odds.bttsNo) : inp.bttsNo,
          over35: odds.over35 ? String(odds.over35) : inp.over35,
          under35: odds.under35 ? String(odds.under35) : inp.under35,
          htDrawYes: odds.htDrawYes ? String(odds.htDrawYes) : inp.htDrawYes,
          htDrawNo: odds.htDrawNo ? String(odds.htDrawNo) : inp.htDrawNo,
        };
        setInp(next);
        runAll(next);
        setNotice(`Učitani tečajevi za: ${f.home} vs ${f.away}`);
      }
    } catch (e) {
      handleErr(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredFixtures = fixtures.filter(
    (f) =>
      f.home.toLowerCase().includes(filter.toLowerCase()) ||
      f.away.toLowerCase().includes(filter.toLowerCase()) ||
      f.league.toLowerCase().includes(filter.toLowerCase())
  );

  const dutchCalc = res ? dutch(res.probs[dA], res.probs[dB], parseFloat(stake) || 100) : null;

  const scanFindings = [
    ...(ou35Res?.valueOver && ou35Res.valueOver > 0
      ? [
          {
            title: "Over 3.5 Gola",
            outcome: "Više od 3.5 gola",
            edge: ou35Res.valueOver * 100,
            fair: ou35Res.fairOver,
            market: ou35Res.marketOver || 0,
            desc: "Tržišni tečaj nudi pozitivnu matematičku vrijednost prema Poissonovom modelu.",
          },
        ]
      : []),
    ...(ou35Res?.valueUnder && ou35Res.valueUnder > 0
      ? [
          {
            title: "Under 3.5 Gola",
            outcome: "Manje od 3.5 gola",
            edge: ou35Res.valueUnder * 100,
            fair: ou35Res.fairUnder,
            market: ou35Res.marketUnder || 0,
            desc: "Tržišni tečaj nudi pozitivnu matematičku vrijednost prema Poissonovom modelu.",
          },
        ]
      : []),
    ...(htDrawRes?.concretePick && htDrawRes.marketDraw && htDrawRes.fairDraw < htDrawRes.marketDraw
      ? [
          {
            title: "HT Neriješeno",
            outcome: htDrawRes.concretePick.pick,
            edge: ((htDrawRes.marketDraw - htDrawRes.fairDraw) / htDrawRes.fairDraw) * 100,
            fair: htDrawRes.fairDraw,
            market: htDrawRes.marketDraw,
            desc: "Tržišni tečaj za ishod poluvremena nudi veću isplatu od izračunatog rizika.",
          },
        ]
      : []),
    ...(csRes
      ? csRes.allScores
          .filter((s) => s.hasValue && s.value && s.value > 0)
          .map((s) => ({
            title: `Točan Rezultat: ${s.score}`,
            outcome: `Rezultat ${s.score}`,
            edge: (s.value || 0) * 100,
            fair: s.fair,
            market: parseFloat(inp.bookScores[s.score] || "0"),
            desc: "Kladionica je podcijenila vjerojatnost ovog točnog rezultata.",
          }))
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Nogometni Prediktor & Poisson 5x5
          </h1>
          <p className="text-sm text-muted-foreground">
            Napredna kalibracija Over/Under 3.5, točnog rezultata i HT/FT tržišta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSharps(!sharps)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              sharps ? "bg-amber-500 text-black shadow-md" : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {sharps ? "🎯 Sharp Consensus: UKLJUČEN" : "Sharp Consensus: ISKLJUČEN"}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
          >
            ⚙️ Postavke API-ja
          </button>
        </div>
      </div>

      {showSettings && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            API Konfiguracija
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Polje
              label="API-Football Key"
              value={keys.football}
              onChange={(v) => saveKeys({ ...keys, football: v })}
              placeholder="Unesite ključ..."
            />
            <Polje
              label="The Odds API Key"
              value={keys.odds}
              onChange={(v) => saveKeys({ ...keys, odds: v })}
              placeholder="Unesite ključ..."
            />
          </div>
        </section>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          {notice}
        </div>
      )}
      {warn && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">
          {warn}
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">
          {err}
        </div>
      )}

      {/* DOHVAT UTAKMICA */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Današnje Utakmice
            </h2>
            <button
              onClick={syncFixtures}
              disabled={loading || cooldown > 0}
              className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Učitavam..." : cooldown > 0 ? `Čekaj (${cooldown}s)` : "Dohvati utakmice"}
            </button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtriraj po klubu ili ligi..."
            className="h-8 w-64 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-ring"
          />
        </div>

        {filteredFixtures.length > 0 && (
          <div className="max-h-48 overflow-y-auto divide-y divide-border/40 text-xs">
            {filteredFixtures.map((f) => (
              <div
                key={f.id}
                onClick={() => pickFixture(f)}
                className={`flex items-center justify-between p-2.5 transition hover:bg-muted cursor-pointer ${
                  selected === f.id ? "bg-primary/10 font-bold" : ""
                }`}
              >
                <div>
                  <span className="font-semibold text-foreground">{f.home}</span> vs{" "}
                  <span className="font-semibold text-foreground">{f.away}</span>
                  <span className="ml-2 text-muted-foreground font-normal">({f.league})</span>
                </div>
                <div className="text-right text-muted-foreground">
                  {formatZagrebTime(f.time)} · {f.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* UNOS TEČAJEVA */}
      <Kartica
        title="Unos Osnovnih Tečajeva Kladionice"
        right={
          <button
            onClick={() => runAll(inp)}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-500 cursor-pointer"
          >
            ⚡ IZRAČUNAJ SVE MODELE
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Polje label="1 (Domaćin)" value={inp.f1} onChange={set("f1")} />
          <Polje label="X (Neriješeno)" value={inp.fX} onChange={set("fX")} />
          <Polje label="2 (Gost)" value={inp.f2} onChange={set("f2")} />
          <Polje label="Više 2.5" value={inp.over} onChange={set("over")} />
          <Polje label="Manje 2.5" value={inp.under} onChange={set("under")} />
          <Polje label="GG (BTTS Da)" value={inp.bttsYes} onChange={set("bttsYes")} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Polje label="Over 3.5 (Opcija)" value={inp.over35} onChange={set("over35")} />
          <Polje label="Under 3.5 (Opcija)" value={inp.under35} onChange={set("under35")} />
          <Polje label="HT X: DA (Opcija)" value={inp.htDrawYes} onChange={set("htDrawYes")} />
          <Polje label="HT X: NE (Opcija)" value={inp.htDrawNo} onChange={set("htDrawNo")} />
        </div>
      </Kartica>

      {/* TAB NAVIGACIJA */}
      <div className="my-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("correctscore")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "correctscore"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>🎯</span> Točan Rezultat (Poisson 5x5)
        </button>
        <button
          onClick={() => setActiveTab("ou35")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "ou35"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>⚡</span> Over / Under 3.5
        </button>
        <button
          onClick={() => setActiveTab("scanner")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "scanner"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>🔍</span> Value Bet Skener
        </button>
        <button
          onClick={() => setActiveTab("htdraw")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "htdraw"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>⏱️</span> X na Poluvremenu
        </button>
        <button
          onClick={() => setActiveTab("btts")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "btts"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>⚽</span> BTTS
        </button>
        <button
          onClick={() => setActiveTab("ou")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "ou"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>📊</span> Zbroj Golova (2.5)
        </button>
        <button
          onClick={() => setActiveTab("htft")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "htft"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>🔢</span> HT/FT Matrica (9 ishoda)
        </button>
      </div>

      {/* TAB: TOČAN REZULTAT */}
      {activeTab === "correctscore" && (
        <section className="mb-8 space-y-6">
          {csRes ? (
            <>
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-widest text-emerald-400 font-bold">
                      POISSONOVA DISTRIBUCIJA S OVER 3.5 KALIBRACIJOM
                    </span>
                    <h2 className="font-display text-xl font-extrabold text-foreground">
                      Top 3 Prijedloga za Točan Rezultat
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">
                    Glavni favorit: {csRes.bestScore.score}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {csRes.top3.map((s, idx) => (
                    <div
                      key={s.score}
                      className={`rounded-xl border p-4 text-center ${
                        idx === 0
                          ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <span className="text-xs font-semibold text-muted-foreground uppercase">
                        Opcija #{idx + 1}
                      </span>
                      <div className="my-2 font-display text-3xl font-black text-foreground">
                        {s.score}
                      </div>
                      <div className="text-sm font-semibold">
                        Vjerojatnost: {(s.prob * 100).toFixed(1)}%
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono">
                        Fer tečaj: {s.fair.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <h3 className="mb-1 text-sm font-bold text-foreground">
                    Value Tablica Točnih Rezultata
                  </h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Unesite tečajeve kladionica za točne rezultate kako bi algoritam izračunao vrijednost (+EV).
                  </p>
                  <table className="w-full text-left text-sm font-mono">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                        <th className="py-2.5">Rezultat</th>
                        <th className="py-2.5">Vjerojatnost</th>
                        <th className="py-2.5">Pošteni Tečaj</th>
                        <th className="py-2.5">Tečaj Kladionice</th>
                        <th className="py-2.5">Value Indikator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {TOP_SCORES.map((score) => {
                        const cell = csRes.allScores.find((s) => s.score === score);
                        if (!cell) return null;
                        return (
                          <tr
                            key={score}
                            className={cell.hasValue ? "bg-emerald-500/10" : "hover:bg-muted/40"}
                          >
                            <td className="py-2.5 font-bold text-foreground">{score}</td>
                            <td className="py-2.5 font-semibold">{(cell.prob * 100).toFixed(1)}%</td>
                            <td className="py-2.5 text-muted-foreground">{cell.fair.toFixed(2)}</td>
                            <td className="py-2.5">
                              <input
                                inputMode="decimal"
                                value={inp.bookScores[score] || ""}
                                placeholder="Tečaj..."
                                onChange={(e) => setBookScore(score)(e.target.value)}
                                className="h-8 w-24 rounded border border-input bg-background px-2 text-xs font-mono outline-none focus:border-ring"
                              />
                            </td>
                            <td className="py-2.5">
                              {cell.value !== null ? (
                                cell.hasValue ? (
                                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                                    🟢 Value (+{(cell.value * 100).toFixed(1)}%)
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {(cell.value * 100).toFixed(1)}%
                                  </span>
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite <strong>"IZRAČUNAJ SVE MODELE"</strong>.
            </div>
          )}
        </section>
      )}

      {/* TAB: OVER/UNDER 3.5 */}
      {activeTab === "ou35" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              Zbroj Golova (Više / Manje 3.5)
            </h2>
            <p className="text-xs text-muted-foreground">
              Analiza tržišta 3.5 gola definira očekivanja golijade i direktno utječe na preokrete (1/2 i 2/1).
            </p>
          </div>

          {ou35Res ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                  <span className="text-xs font-bold uppercase text-muted-foreground">VIŠE OD 3.5 GOLA</span>
                  <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                    {(ou35Res.probOver * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Fer tečaj: <strong>{ou35Res.fairOver.toFixed(2)}</strong>
                    {ou35Res.marketOver && ` · Kladionica: ${ou35Res.marketOver.toFixed(2)}`}
                  </div>
                  {ou35Res.valueOver && ou35Res.valueOver > 0 && (
                    <div className="mt-3 inline-block rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(ou35Res.valueOver * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                  <span className="text-xs font-bold uppercase text-muted-foreground">MANJE OD 3.5 GOLA</span>
                  <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                    {(ou35Res.probUnder * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Fer tečaj: <strong>{ou35Res.fairUnder.toFixed(2)}</strong>
                    {ou35Res.marketUnder && ` · Kladionica: ${ou35Res.marketUnder.toFixed(2)}`}
                  </div>
                  {ou35Res.valueUnder && ou35Res.valueUnder > 0 && (
                    <div className="mt-3 inline-block rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(ou35Res.valueUnder * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
                <span className="font-bold text-primary">Obrazloženje: </span>
                {ou35Res.explanation}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite "Izračunaj".
            </div>
          )}
        </section>
      )}

      {/* TAB: AUTOMATSKI VALUE BET SKENER */}
      {activeTab === "scanner" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                Automatski Value Bet Skener
              </h2>
              <p className="text-xs text-muted-foreground">
                Prikazuje ISKLJUČIVO oklade za odabranu utakmicu gdje je utvrđena stvarna matematička prednost (+EV).
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">
              {scanFindings.length} Value Oklada
            </span>
          </div>

          {scanFindings.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              ⚠️ <strong>Nema Value Betova za ovu utakmicu.</strong> Kladionice nemaju matematičku grešku u postavljenim tečajevima.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {scanFindings.map((f, i) => (
                <div key={i} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-muted-foreground">{f.title}</span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      +{f.edge.toFixed(1)}% Vrijednost
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-foreground">{f.outcome}</h3>
                  <div className="mt-2 flex gap-4 text-xs font-mono">
                    <span>Fer tečaj: <strong>{f.fair.toFixed(2)}</strong></span>
                    <span>Kladionica: <strong>{f.market.toFixed(2)}</strong></span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB: X NA POLUVREMENU */}
      {activeTab === "htdraw" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              X na Poluvremenu (Neriješeno na odmoru: DA ili NE)
            </h2>
          </div>

          {htDrawRes ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div
                  className={`rounded-xl border p-5 text-center ${
                    htDrawRes.concretePick.pick.startsWith("DA")
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    X NA POLUVREMENU: DA
                  </span>
                  <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                    {(htDrawRes.probDraw * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Fer tečaj: <strong>{htDrawRes.fairDraw.toFixed(2)}</strong>
                    {htDrawRes.marketDraw && ` · Kladionica: ${htDrawRes.marketDraw.toFixed(2)}`}
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-5 text-center ${
                    htDrawRes.concretePick.pick.startsWith("NE")
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    X NA POLUVREMENU: NE
                  </span>
                  <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                    {((1 - htDrawRes.probDraw) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Fer tečaj: <strong>{(1 / (1 - htDrawRes.probDraw)).toFixed(2)}</strong>
                    {htDrawRes.marketNo && ` · Kladionica: ${htDrawRes.marketNo.toFixed(2)}`}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
                <span className="font-bold text-primary">Preporuka: </span>
                {htDrawRes.concretePick.explanation}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite "Izračunaj".
            </div>
          )}
        </section>
      )}

      {/* TAB: BTTS */}
      {activeTab === "btts" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">Oba Daju Gol (BTTS)</h2>
          </div>
          {bttsRes ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                <span className="text-xs font-bold uppercase text-muted-foreground">BTTS: DA (GG)</span>
                <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                  {(bttsRes.probYes * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Fer tečaj: <strong>{bttsRes.fairYes.toFixed(2)}</strong>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                <span className="text-xs font-bold uppercase text-muted-foreground">BTTS: NE (NG)</span>
                <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                  {(bttsRes.probNo * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Fer tečaj: <strong>{bttsRes.fairNo.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite "Izračunaj".
            </div>
          )}
        </section>
      )}

      {/* TAB: OVER/UNDER 2.5 */}
      {activeTab === "ou" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">Zbroj Golova (2.5)</h2>
          </div>
          {ouRes ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                <span className="text-xs font-bold uppercase text-muted-foreground">VIŠE OD 2.5</span>
                <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                  {(ouRes.probOver * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Fer tečaj: <strong>{ouRes.fairOver.toFixed(2)}</strong>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                <span className="text-xs font-bold uppercase text-muted-foreground">MANJE OD 2.5</span>
                <div className="my-2 font-display text-3xl font-extrabold text-foreground">
                  {(ouRes.probUnder * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Fer tečaj: <strong>{ouRes.fairUnder.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite "Izračunaj".
            </div>
          )}
        </section>
      )}

      {/* TAB: HT/FT MATRICA */}
      {activeTab === "htft" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              HT/FT Matrica (9 ishoda)
            </h2>
          </div>
          {res ? (
            <div className="grid grid-cols-3 gap-3">
              {OUTCOMES.map((o) => (
                <div key={o} className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <span className="text-xs font-bold uppercase text-muted-foreground">{o}</span>
                  <div className="my-1 font-display text-xl font-bold text-foreground">
                    {pct(res.probs[o])}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Fer: {res.fairOdds[o].toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Unesite tečajeve i pritisnite "Izračunaj".
            </div>
          )}
        </section>
      )}
    </div>
  );
}
