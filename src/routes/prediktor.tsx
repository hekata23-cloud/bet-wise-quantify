import { createFileRoute } from "@tanstack/react-router";
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

const COOLDOWN_SECONDS = 30;
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
      if (k) setKeys(JSON.parse(k));
    } catch {
      /* ignore */
    }

    // Učitaj zadnje unesene podatke iz memorije ako postoje
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
    // Automatski spremi za Lunu u chatu
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
      const { list, cached, date } = await fetchFixtures(keys, true);
      setFixtures(list);
      setNotice(
        cached
          ? `Učitano iz memorije (${date}) — 0 kredita.`
          : `Dohvaćeno ${list.length} utakmica za ${date} (Zagreb) uz točno 1 kredit!`
      );
    } catch (e) {
      handleErr(e);
    } finally {
      setLoading(false);
    }
  };

  const pickMatch = async (f: Fixture) => {
    if (loading) return;
    setSelected(f.id);
    setLoading(true);
    setWarn(null);
    try {
      const { inputs, cached } = await fetchMatchOdds(keys, f);
      if (!cached) setCooldown(COOLDOWN_SECONDS);
      setInp(inputs);
      runAll(inputs);
      setNotice(`${f.home} vs ${f.away} — ${cached ? "iz memorije" : "tečajevi ažurirani (uključujući 3.5)"}`);
    } catch (e) {
      handleErr(e);
    } finally {
      setLoading(false);
    }
  };

  const shown = fixtures
    .filter((f) => `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 200);

  const oA = parseFloat(inp.book[dA]);
  const oB = parseFloat(inp.book[dB]);
  const st = parseFloat(stake);
  const dres = oA > 1 && oB > 1 && st > 0 && dA !== dB ? dutch(st, oA, oB) : null;

  const VALUE_THRESHOLD = 0.035;
  const scanFindings: { title: string; outcome: string; fair: number; market: number; edge: number; desc: string }[] = [];
  if (res) {
    res.rows
      .filter((r) => r.hasValue && r.value && r.market && r.value >= VALUE_THRESHOLD)
      .forEach((r) => {
        scanFindings.push({
          title: "Poluvrijeme / Kraj (HT/FT)",
          outcome: r.outcome,
          fair: r.fair,
          market: r.market!,
          edge: r.value! * 100,
          desc: `Kladionica podcjenjuje ishod ${r.outcome}. Fer tečaj je ${r.fair.toFixed(2)}, ponuđeno je ${(r.market ?? 0).toFixed(2)}.`,
        });
      });
  }
  if (bttsRes) {
    if (bttsRes.valueYes && bttsRes.valueYes >= VALUE_THRESHOLD && bttsRes.marketYes) {
      scanFindings.push({
        title: "Oba Daju Gol (BTTS)",
        outcome: "DA (Oba daju)",
        fair: bttsRes.fairYes,
        market: bttsRes.marketYes,
        edge: bttsRes.valueYes * 100,
        desc: `Dixon-Coles xG model pokazuje veću ofenzivnu efikasnost od očekivanja tržišta.`,
      });
    }
    if (bttsRes.valueNo && bttsRes.valueNo >= VALUE_THRESHOLD && bttsRes.marketNo) {
      scanFindings.push({
        title: "Oba Daju Gol (BTTS)",
        outcome: "NE (Barem jedan ne daje)",
        fair: bttsRes.fairNo,
        market: bttsRes.marketNo,
        edge: bttsRes.valueNo * 100,
        desc: `Obrambeni parametri daju veću vjerojatnost za opciju NE nego što nudi kladionica.`,
      });
    }
  }
  if (ouRes) {
    if (ouRes.valueOver && ouRes.valueOver >= VALUE_THRESHOLD && ouRes.marketOver) {
      scanFindings.push({
        title: "Zbroj Golova (2.5)",
        outcome: "Više od 2.5 gola",
        fair: ouRes.fairOver,
        market: ouRes.marketOver,
        edge: ouRes.valueOver * 100,
        desc: `Očekivani broj golova prelazi granicu od 2.5 uz povoljniji tečaj kod kladionice.`,
      });
    }
    if (ouRes.valueUnder && ouRes.valueUnder >= VALUE_THRESHOLD && ouRes.marketUnder) {
      scanFindings.push({
        title: "Zbroj Golova (2.5)",
        outcome: "Manje od 2.5 gola",
        fair: ouRes.fairUnder,
        market: ouRes.marketUnder,
        edge: ouRes.valueUnder * 100,
        desc: `Model predviđa manju vjerojatnost za više od 2 gola.`,
      });
    }
  }
  if (ou35Res) {
    if (ou35Res.valueOver && ou35Res.valueOver >= VALUE_THRESHOLD && ou35Res.marketOver) {
      scanFindings.push({
        title: "Zbroj Golova (3.5)",
        outcome: "Više od 3.5 gola",
        fair: ou35Res.fairOver,
        market: ou35Res.marketOver,
        edge: ou35Res.valueOver * 100,
        desc: `Visok tempo utakmice stvara matematički value na okladu Više od 3.5 gola.`,
      });
    }
    if (ou35Res.valueUnder && ou35Res.valueUnder >= VALUE_THRESHOLD && ou35Res.marketUnder) {
      scanFindings.push({
        title: "Zbroj Golova (3.5)",
        outcome: "Manje od 3.5 gola",
        fair: ou35Res.fairUnder,
        market: ou35Res.marketUnder,
        edge: ou35Res.valueUnder * 100,
        desc: `Tečaj kladionice za Manje 3.5 podcjenjuje stvarnu defenzivnu vjerojatnost.`,
      });
    }
  }
  if (htDrawRes) {
    if (htDrawRes.valueDraw && htDrawRes.valueDraw >= VALUE_THRESHOLD && htDrawRes.marketDraw) {
      scanFindings.push({
        title: "X na Poluvremenu",
        outcome: "DA (Neriješeno na HT)",
        fair: htDrawRes.fairDraw,
        market: htDrawRes.marketDraw,
        edge: htDrawRes.valueDraw * 100,
        desc: `Visoka vjerojatnost neriješenog poluvremena u odnosu na ponuđeni tečaj.`,
      });
    }
  }
  if (csRes) {
    csRes.allScores
      .filter((s) => s.hasValue && s.value && s.market && s.value >= VALUE_THRESHOLD)
      .slice(0, 3)
      .forEach((s) => {
        scanFindings.push({
          title: "Točan Rezultat",
          outcome: `Rezultat ${s.score}`,
          fair: s.fair,
          market: s.market!,
          edge: s.value! * 100,
          desc: `Poissonov model otkriva pozitivnu prednost (+EV) za točan rezultat ${s.score}.`,
        });
      });
  }

  const maxMatrixProb = csRes ? Math.max(...csRes.allScores.map((s) => s.prob)) : 0.15;

  return (
    <div className={`transition-all duration-700 ${sharps ? "sharps-aura rounded-2xl" : ""}`}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Nogometni Centar · Vremenska zona Zagreb
            </p>
          </div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl text-foreground">
            Točan Rezultat, HT/FT & Over/Under 3.5
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const nv = !sharps;
              setSharps(nv);
              if (res || bttsRes || csRes) runAll(inp, nv);
            }}
            aria-pressed={sharps}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
              sharps
                ? "border-amber-400 bg-amber-400/15 text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]"
                : "border-border bg-card text-muted-foreground hover:border-amber-400/60 hover:text-amber-300"
            }`}
          >
            🔥 SHARPS MODE {sharps ? "· ON" : "· OFF"}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            ⚙ Postavke Ključa
          </button>
          <button
            onClick={syncFixtures}
            disabled={cooldown > 0 || loading}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Učitavam..." : cooldown > 0 ? `Pričekajte (${cooldown}s)` : "Učitaj utakmice (1 kredit)"}
          </button>
        </div>
      </header>

      {warn && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-300">
          ⚠️ {warn}
        </div>
      )}
      {notice && !warn && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs font-medium text-primary">
          ✓ {notice}
        </div>
      )}

      {showSettings && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Postavke API Ključa (Pohranjeno na vašem uređaju)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Football API Ključ (API-Sports / RapidAPI)</label>
              <input
                type="password"
                value={keys.football}
                onChange={(e) => saveKeys({ ...keys, football: e.target.value })}
                placeholder="Unesite API ključ..."
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">The Odds API Ključ (Pinnacle O/U 2.5 i 3.5)</label>
              <input
                type="password"
                value={keys.odds}
                onChange={(e) => saveKeys({ ...keys, odds: e.target.value })}
                placeholder="Opcionalno za Pinnacle linije..."
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring"
              />
            </div>
          </div>
        </section>
      )}

      {fixtures.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Današnje Utakmice ({fixtures.length}) · Kliknite za automatsko učitavanje
            </h2>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pretraži klub ili ligu..."
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:border-ring"
            />
          </div>
          <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
            {shown.map((f) => (
              <button
                key={f.id}
                onClick={() => pickMatch(f)}
                className={`flex flex-col items-start rounded-lg border p-2 text-left transition ${
                  selected === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-background/50 hover:bg-muted"
                }`}
              >
                <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{f.league}</span>
                  <span className="font-mono font-semibold">{formatZagrebTime(f.time)}</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-foreground truncate w-full">
                  {f.home} vs {f.away}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 1.5 Goals Predictor */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">1.5 Goals Predictor</h2>
          {sharps && <SharpBadge />}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            <Polje label="Više 1.5 (kladionica)" value={inp.o15} onChange={set("o15")} />
            <Polje label="Manje 1.5 (kladionica)" value={inp.u15} onChange={set("u15")} />
            {(["0:0", "1:0", "0:1"] as const).map((sc) => (
              <Polje key={sc} label={`Točan rezultat ${sc}`} value={inp.bookScores[sc] || ""} onChange={setBookScore(sc)} />
            ))}
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-border bg-background/60 p-4 text-center">
            {ou15Res ? (
              <>
                <div className={`text-2xl font-black sm:text-3xl ${ou15Res.isOver ? "text-emerald-400" : "text-red-400"}`}>
                  {ou15Res.isOver ? "🔥 TIP: OVER 1.5 GOALS" : "🛑 TIP: UNDER 1.5 GOALS"}
                </div>
                <div className="mx-auto mt-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                  Confidence: {ou15Res.confidence}%
                </div>
                <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Fer: Više {ou15Res.fairOver.toFixed(2)} · Manje {ou15Res.fairUnder.toFixed(2)}
                  {ou15Res.isOver && ou15Res.valueOver !== null && ou15Res.valueOver > 0 && ` · 🟢 Value +${(ou15Res.valueOver * 100).toFixed(1)}%`}
                  {!ou15Res.isOver && ou15Res.valueUnder !== null && ou15Res.valueUnder > 0 && ` · 🟢 Value +${(ou15Res.valueUnder * 100).toFixed(1)}%`}
                </div>
                <div className="mt-3 rounded-md border border-border bg-muted/40 p-2 text-left font-mono text-[10px] text-muted-foreground">
                  {ou15Res.breakdown}
                  {ou15Res.lowOddsShift && <div>• Kvote niskih rezultata (0:0, 1:0, 0:1, 1:1) uključene u model</div>}
                  {ou15Res.sharpsBuffer && <div>• Sharps derbi: pojačana korelacija niskih rezultata (izjednačena utakmica)</div>}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Unesite tečajeve i kliknite Izračunaj.</p>
            )}
          </div>
        </div>
      </section>

      {/* Unos Tečajeva */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Kartica title="1. Ishod na Kraju (FT 1X2)">
          <div className="grid grid-cols-3 gap-2">
            <Polje label="FT 1" value={inp.ft1} onChange={set("ft1")} />
            <Polje label="FT X" value={inp.ftx} onChange={set("ftx")} />
            <Polje label="FT 2" value={inp.ft2} onChange={set("ft2")} />
          </div>
          {sharps && (
            <div className="mt-2">
              <Polje label="FT 1 otvarajuća kvota (Sharps)" value={inp.ft1Open} onChange={set("ft1Open")} />
            </div>
          )}
        </Kartica>

        <Kartica title="2. Zbroj Golova (2.5 & 3.5)">
          <div className="grid grid-cols-2 gap-2">
            <Polje label="Više 2.5" value={inp.o25} onChange={set("o25")} />
            <Polje label="Manje 2.5" value={inp.u25} onChange={set("u25")} />
            <Polje label="Više 3.5" value={inp.o35} onChange={set("o35")} />
            <Polje label="Manje 3.5" value={inp.u35} onChange={set("u35")} />
            <Polje label="Više 1.5" value={inp.o15} onChange={set("o15")} />
            <Polje label="Manje 1.5" value={inp.u15} onChange={set("u15")} />
          </div>
        </Kartica>

        <Kartica title="3. BTTS & Poluvrijeme">
          <div className="grid grid-cols-2 gap-2">
            <Polje label="BTTS DA (GG)" value={inp.bttsYes} onChange={set("bttsYes")} />
            <Polje label="BTTS NE (NG)" value={inp.bttsNo} onChange={set("bttsNo")} />
            <Polje label="HT 1" value={inp.ht1} onChange={set("ht1")} />
            <Polje label="HT X" value={inp.htx} onChange={set("htx")} />
          </div>
        </Kartica>
      </div>

      <div className="mb-8 flex justify-center">
        <button
          onClick={() => runAll(inp)}
          className="rounded-xl bg-emerald-500 px-8 py-3.5 font-display text-sm font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95 cursor-pointer"
        >
          IZRAČUNAJ SVE MODELE I PREDIKCIJE
        </button>
      </div>

      {err && (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">
          {err}
        </div>
      )}

      {/* 6 KONKRETNIH TIPOVA */}
      {(csRes || bttsRes || ouRes || ou35Res || htDrawRes || res) && (
        <section className="mb-8 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-950/20 to-card p-5 sm:p-6 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400 font-bold">
                ★ ANALITIČKI ZAKLJUČAK
              </span>
              <h2 className="font-display text-xl font-extrabold text-foreground">
                Glavni Konkretni Tipovi Najviše Sigurnosti
              </h2>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">
              Poisson + 3.5 Tail-End Kalibracija
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {csRes && (
              <div className="rounded-xl border border-emerald-500/40 bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">1. Točan Rezultat</span>
                <div className="mt-1 text-2xl font-black text-foreground">{csRes.bestScore.score}</div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {(csRes.bestScore.prob * 100).toFixed(1)}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{csRes.bestScore.fair.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-emerald-500/20 py-0.5 text-[10px] font-bold text-emerald-400">
                  STRIKTNO REALNO
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}

            {ou35Res && (
              <div className="rounded-xl border border-border bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">2. Golovi (3.5)</span>
                <div className="mt-1 text-base font-black text-foreground">
                  {ou35Res.concretePick.pick.includes("VIŠE") ? (
                    <span className="text-emerald-400">VIŠE 3.5</span>
                  ) : (
                    <span className="text-sky-400">MANJE 3.5</span>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {ou35Res.concretePick.confidenceScore}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{ou35Res.concretePick.fairOdds.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-muted py-0.5 text-[10px] font-bold text-muted-foreground">
                  {ou35Res.concretePick.confidenceLevel}
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}

            {htDrawRes && (
              <div className="rounded-xl border border-border bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">3. X na HT</span>
                <div className="mt-1 text-base font-black text-foreground">
                  {htDrawRes.concretePick.pick.startsWith("DA") ? (
                    <span className="text-emerald-400">DA (X na HT)</span>
                  ) : (
                    <span className="text-rose-400">NE (Vodi netko)</span>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {htDrawRes.concretePick.confidenceScore}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{htDrawRes.concretePick.fairOdds.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-muted py-0.5 text-[10px] font-bold text-muted-foreground">
                  {htDrawRes.concretePick.confidenceLevel}
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}

            {bttsRes && (
              <div className="rounded-xl border border-border bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">4. BTTS</span>
                <div className="mt-1 text-base font-black text-foreground">
                  {bttsRes.concretePick.pick.startsWith("DA") ? (
                    <span className="text-emerald-400">BTTS: DA</span>
                  ) : (
                    <span className="text-rose-400">BTTS: NE</span>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {bttsRes.concretePick.confidenceScore}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{bttsRes.concretePick.fairOdds.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-muted py-0.5 text-[10px] font-bold text-muted-foreground">
                  {bttsRes.concretePick.confidenceLevel}
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}

            {ouRes && (
              <div className="rounded-xl border border-border bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">5. Golovi (2.5)</span>
                <div className="mt-1 text-base font-black text-foreground">
                  {ouRes.concretePick.pick.includes("VIŠE") ? (
                    <span className="text-emerald-400">VIŠE 2.5</span>
                  ) : (
                    <span className="text-sky-400">MANJE 2.5</span>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {ouRes.concretePick.confidenceScore}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{ouRes.concretePick.fairOdds.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-muted py-0.5 text-[10px] font-bold text-muted-foreground">
                  {ouRes.concretePick.confidenceLevel}
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}

            {res && (
              <div className="rounded-xl border border-border bg-card/90 p-4 text-center shadow">
                <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">6. HT/FT</span>
                <div className="mt-1 text-2xl font-black text-foreground">{res.concretePick.pick}</div>
                <div className="mt-1 text-xs font-bold text-emerald-400">
                  {res.concretePick.confidenceScore}% šanse
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                  Fer: <strong>{res.concretePick.fairOdds.toFixed(2)}</strong>
                </div>
                <div className="mt-2 rounded bg-muted py-0.5 text-[10px] font-bold text-muted-foreground">
                  {res.concretePick.confidenceLevel}
                </div>
                {sharps && <SharpBadge />}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Navigacijski Tabovi */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab("correctscore")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "correctscore"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
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
          <span>🔥</span> Zbroj Golova (3.5)
        </button>
        <button
          onClick={() => setActiveTab("scanner")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "scanner"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground hover:bg-muted"
          }`}
        >
          <span>⚡</span> Automatski Skener ({scanFindings.length})
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
                      className={`rounded-xl border p-5 text-center shadow relative overflow-hidden ${
                        s.score === csRes.bestScore.score
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="absolute top-2 left-3 font-mono text-[11px] font-bold text-muted-foreground">
                        #{idx + 1} PICK
                      </span>
                      <div className="mt-3 text-4xl font-black text-foreground">{s.score}</div>
                      <div className="mt-2 text-sm font-bold text-emerald-400">
                        {(s.prob * 100).toFixed(1)}% Vjerojatnost
                      </div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground">
                        Pošteni tečaj: <strong>{s.fair.toFixed(2)}</strong>
                      </div>
                      {s.value !== null && s.value > 0 && (
                        <div className="mt-2 rounded-md bg-emerald-500/20 py-1 text-xs font-bold text-emerald-400">
                          🟢 Value Bet (+{(s.value * 100).toFixed(1)}%)
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground font-mono">
                  {csRes.explanation}
                </div>
              </div>

              {/* 5x5 HEATMAP */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      Matrica Vjerojatnosti (Heatmap 5x5)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Ćelije s visokim brojem golova automatski su korigirane uz Over 3.5 liniju.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                    <span>Manja šansa</span>
                    <div className="h-3 w-16 rounded bg-gradient-to-r from-emerald-950 to-emerald-500" />
                    <span>Veća šansa</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center font-mono text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-muted-foreground">Dom \ Gost</th>
                        {[0, 1, 2, 3, 4].map((a) => (
                          <th key={a} className="p-2 text-foreground font-bold">
                            Gost: {a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csRes.matrix.map((row, h) => (
                        <tr key={h}>
                          <th className="p-2 text-foreground font-bold">Dom: {h}</th>
                          {row.map((cell) => {
                            const intensity = Math.min(1, Math.max(0.08, cell.prob / maxMatrixProb));
                            return (
                              <td
                                key={cell.score}
                                style={{
                                  backgroundColor: `rgba(16, 185, 129, ${intensity * 0.4})`,
                                }}
                                className="p-3 border border-border/40 transition hover:scale-105 hover:border-emerald-400 cursor-default"
                              >
                                <div className="font-bold text-foreground">{cell.score}</div>
                                <div className="text-[11px] text-emerald-400 font-semibold">
                                  {(cell.prob * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {cell.fair.toFixed(2)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* VALUE TABLICA */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4">
                  <h3 className="font-display text-base font-bold text-foreground">
                    Value Tablica Točnih Rezultata
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Unesite tečajeve kladionica za točne rezultate kako bi algoritam izračunao vrijednost (+EV).
                  </p>
                </div>

                <div className="overflow-x-auto">
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
                <div className={`rounded-xl border p-5 text-center ${
                  ou35Res.concretePick.pick.includes("VIŠE")
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase text-muted-foreground">VIŠE OD 3.5 GOLA</span>
                  <div className="mt-2 text-3xl font-extrabold text-foreground">
                    {(ou35Res.probOver * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{ou35Res.fairOver.toFixed(2)}</strong>
                    {ou35Res.marketOver && ` · Kladionica: ${ou35Res.marketOver.toFixed(2)}`}
                  </div>
                  {ou35Res.valueOver && ou35Res.valueOver > 0 && (
                    <div className="mt-2 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(ou35Res.valueOver * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>

                <div className={`rounded-xl border p-5 text-center ${
                  !ou35Res.concretePick.pick.includes("VIŠE")
                    ? "border-sky-500/60 bg-sky-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase text-muted-foreground">MANJE OD 3.5 GOLA</span>
                  <div className="mt-2 text-3xl font-extrabold text-foreground">
                    {(ou35Res.probUnder * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{ou35Res.fairUnder.toFixed(2)}</strong>
                    {ou35Res.marketUnder && ` · Kladionica: ${ou35Res.marketUnder.toFixed(2)}`}
                  </div>
                  {ou35Res.valueUnder && ou35Res.valueUnder > 0 && (
                    <div className="mt-2 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(ou35Res.valueUnder * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-primary">Obrazloženje: </span>
                {ou35Res.explanation}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Unesite tečajeve i pritisnite "Izračunaj".</p>
          )}
        </section>
      )}

      {/* TAB: AUTOMATSKI VALUE BET SKENER */}
      {activeTab === "scanner" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
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
                <div className={`rounded-xl border p-5 text-center ${
                  htDrawRes.concretePick.pick.startsWith("DA")
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    X NA POLUVREMENU: DA
                  </span>
                  <div className="mt-2 text-4xl font-extrabold text-foreground">
                    {(htDrawRes.probDraw * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{htDrawRes.fairDraw.toFixed(2)}</strong>
                    {htDrawRes.marketDraw && ` · Kladionica: ${htDrawRes.marketDraw.toFixed(2)}`}
                  </div>
                  {htDrawRes.valueDraw && htDrawRes.valueDraw > 0 && (
                    <div className="mt-2 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(htDrawRes.valueDraw * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>

                <div className={`rounded-xl border p-5 text-center ${
                  !htDrawRes.concretePick.pick.startsWith("DA")
                    ? "border-rose-500/60 bg-rose-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    X NA POLUVREMENU: NE
                  </span>
                  <div className="mt-2 text-4xl font-extrabold text-foreground">
                    {(htDrawRes.probNotDraw * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{htDrawRes.fairNotDraw.toFixed(2)}</strong>
                  </div>
                  {htDrawRes.valueNotDraw && htDrawRes.valueNotDraw > 0 && (
                    <div className="mt-2 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      🟢 Value Bet (+{(htDrawRes.valueNotDraw * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-primary">Obrazloženje: </span>
                {htDrawRes.explanation}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Unesite tečajeve i pritisnite "Izračunaj".</p>
          )}
        </section>
      )}

      {/* TAB: BTTS */}
      {activeTab === "btts" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              BTTS (Oba Daju Gol)
            </h2>
          </div>

          {bttsRes ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div className={`rounded-xl border p-5 text-center ${
                  bttsRes.concretePick.pick.startsWith("DA")
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">BTTS: DA</span>
                  <div className="mt-2 text-4xl font-extrabold text-emerald-400">
                    {(bttsRes.probYes * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{bttsRes.fairYes.toFixed(2)}</strong>
                  </div>
                </div>

                <div className={`rounded-xl border p-5 text-center ${
                  !bttsRes.concretePick.pick.startsWith("DA")
                    ? "border-rose-500/60 bg-rose-500/10"
                    : "border-border bg-muted/20"
                }`}>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">BTTS: NE</span>
                  <div className="mt-2 text-4xl font-extrabold text-rose-400">
                    {(bttsRes.probNo * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{bttsRes.fairNo.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-primary">Obrazloženje: </span>
                {bttsRes.explanation}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Unesite tečajeve i pritisnite "Izračunaj".</p>
          )}
        </section>
      )}

      {/* TAB: OVER/UNDER 2.5 */}
      {activeTab === "ou" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              Zbroj Golova (Više / Manje 2.5)
            </h2>
          </div>

          {ouRes ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                  <span className="text-xs font-bold uppercase text-muted-foreground">VIŠE OD 2.5 GOLA</span>
                  <div className="mt-2 text-3xl font-extrabold text-foreground">
                    {(ouRes.probOver * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{ouRes.fairOver.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                  <span className="text-xs font-bold uppercase text-muted-foreground">MANJE OD 2.5 GOLA</span>
                  <div className="mt-2 text-3xl font-extrabold text-foreground">
                    {(ouRes.probUnder * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">
                    Fer tečaj: <strong>{ouRes.fairUnder.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-primary">Obrazloženje: </span>
                {ouRes.explanation}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Unesite tečajeve i pritisnite "Izračunaj".</p>
          )}
        </section>
      )}

      {/* TAB: HT/FT MATRICA */}
      {activeTab === "htft" && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-foreground">
            HT/FT 9 Ishoda — Točno 100% Normalizirana Matrica (s 3.5 preokretima)
          </h2>

          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-9">
            {OUTCOMES.map((o) => (
              <Polje key={o} label={o} value={inp.book[o]} onChange={setBook(o)} />
            ))}
          </div>

          {res && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase font-mono">
                    <th className="py-2.5">Ishod</th>
                    <th className="py-2.5">Vjerojatnost</th>
                    <th className="py-2.5">Pošteni Tečaj</th>
                    <th className="py-2.5">Kladionica</th>
                    <th className="py-2.5">Value Indikator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {res.rows.map((r) => (
                    <tr
                      key={r.outcome}
                      className={r.hasValue ? "bg-emerald-500/10" : "hover:bg-muted/40"}
                    >
                      <td className="py-3 font-bold text-foreground">{r.outcome}</td>
                      <td className="py-3 font-semibold">{pct(r.prob)}</td>
                      <td className="py-3 text-muted-foreground">{r.fair.toFixed(2)}</td>
                      <td className="py-3">{r.market ? r.market.toFixed(2) : "—"}</td>
                      <td className="py-3">
                        {r.value !== null ? (
                          r.hasValue ? (
                            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                              🟢 Value (+{(r.value * 100).toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{(r.value * 100).toFixed(1)}%</span>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Dutching Sekcija */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Dutching Kalkulator
          </h2>
          <button
            onClick={() => setDutchOn(!dutchOn)}
            className="text-xs font-semibold text-primary underline cursor-pointer"
          >
            {dutchOn ? "Sakrij" : "Prikaži"}
          </button>
        </div>

        {dutchOn && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Ukupan Ulog (€)</label>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prvi Ishod</label>
              <select
                value={dA}
                onChange={(e) => setDA(e.target.value as Outcome)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm bg-card text-foreground"
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o} (Tečaj: {inp.book[o] || "—"})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Drugi Ishod</label>
              <select
                value={dB}
                onChange={(e) => setDB(e.target.value as Outcome)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm bg-card text-foreground"
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o} (Tečaj: {inp.book[o] || "—"})</option>
                ))}
              </select>
            </div>

            {dres && (
              <div className="col-span-full mt-2 rounded-lg bg-muted/50 p-4 font-mono text-xs">
                <p>Ulog na <strong>{dA}</strong>: {dres.sA.toFixed(2)} € | Ulog na <strong>{dB}</strong>: {dres.sB.toFixed(2)} €</p>
                <p className="mt-1 text-emerald-400 font-bold">Zajamčeni profit: +{dres.profit.toFixed(2)} € ({dres.roi.toFixed(1)}% ROI)</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

