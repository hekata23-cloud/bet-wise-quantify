import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Edit3, RefreshCw, Search, Settings, ShieldAlert, Trophy } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getRukometGames, getRukometOdds, type RukometGame, type RukometMarkets } from "@/lib/rukomet.functions";
import { analyzeRukomet, type RukometAnalysis, type Tip } from "@/lib/rukomet-engine";
import { rukometGuarded, readRukometState, resetRukometGuard, zagrebDay } from "@/lib/rukomet-guard";
import { getApiKey } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/rukomet")({
  head: () => ({
    meta: [
      { title: "Rukomet Sharp · 1X2, Zbroj golova, Timski golovi · Andromeda AI" },
      {
        name: "description",
        content:
          "Profesionalna analiza rukometnih utakmica: 1X2, 1 2 pobjednik, ukupni zbroj golova, golovi domaćina i gosta po zagrebačkom vremenu.",
      },
      { property: "og:title", content: "Rukomet Sharp · Andromeda AI" },
      {
        property: "og:description",
        content: "Kvantitativni rukometni model bez kladioničarske marže: fer kvote, EV i zbrojevi golova.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RukometPage,
});

const MIN_DATE = "2026-01-01";
const DONE = ["FT", "AOT", "CANC", "POST", "ABD", "AWD"];
const time = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function RukometPage() {
  const [date, setDate] = useState(() => (zagrebDay() < MIN_DATE ? MIN_DATE : zagrebDay()));
  const [games, setGames] = useState<RukometGame[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sel, setSel] = useState<RukometGame | null>(null);
  const [an, setAn] = useState<RukometAnalysis | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  // Ručni unos kvota kad API nema kvote za utakmicu
  const [manualMode, setManualMode] = useState(false);
  const [m1, setM1] = useState("1.45");
  const [mX, setMX] = useState("9.50");
  const [m2, setM2] = useState("3.40");
  const [mLine, setMLine] = useState("56.5");
  const [mOver, setMOver] = useState("1.85");
  const [mUnder, setMUnder] = useState("1.85");

  const onWait = (ms: number, r: string) =>
    setMsg(`Zaštita API-ja: ${r}. Čekam ${Math.ceil(ms / 1000)} s…`);

  const load = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettings(true);
      setMsg("Unesi API ključ (api-sports.io) u Postavkama.");
      return;
    }
    setLoading(true);
    setMsg("Učitavam sve rukometne utakmice dana…");
    try {
      const r = await rukometGuarded(
        `games.${date}`,
        () => getRukometGames({ data: { date, apiKey } }),
        onWait
      );
      if (r.error) {
        setMsg(r.error === "RATE_LIMIT" ? "Limit API-ja — pričekaj 15 s." : `Greška: ${r.error}`);
        return;
      }
      const list = r.games
        .filter((g) => !DONE.includes(g.status))
        .sort((a, b) => a.time.localeCompare(b.time));
      setGames(list);
      setMsg(`Učitano ${list.length} rukometnih utakmica (${r.games.length} ukupno). Odaberi utakmicu za analizu.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Greška");
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = (markets: RukometMarkets, leagueName: string, bookName: string | null) => {
    const a = analyzeRukomet(markets, leagueName);
    setBook(bookName);
    if (!a) {
      setMsg("Nema dovoljno kvota za izračun rukometnog modela. Možeš unijeti kvote ručno.");
      setManualMode(true);
      return;
    }
    setAn(a);
    setMsg("");
    setManualMode(false);
  };

  const handleManualAnalyze = () => {
    const o1 = parseFloat(m1);
    const oX = parseFloat(mX);
    const o2 = parseFloat(m2);
    if (!o1 || !o2 || o1 <= 1 || o2 <= 1) {
      setMsg("Molimo unesi ispravne 1 i 2 kvote (veće od 1.00).");
      return;
    }

    const mk: RukometMarkets = {
      "Match Winner": {
        Home: o1,
        Draw: oX > 1 ? oX : 9.5,
        Away: o2,
      },
    };

    const lineVal = parseFloat(mLine);
    const oOv = parseFloat(mOver);
    const oUn = parseFloat(mUnder);
    if (lineVal && oOv > 1 && oUn > 1) {
      mk["Over/Under"] = {
        [`Over ${lineVal}`]: oOv,
        [`Under ${lineVal}`]: oUn,
      };
    }

    runAnalysis(mk, sel?.league ?? "Rukomet", "Ručni unos");
  };

  const open = async (g: RukometGame) => {
    if (busyId) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettings(true);
      return;
    }
    setBusyId(g.id);
    setSel(g);
    setAn(null);
    setManualMode(false);
    setMsg(`Analiziram ${g.home} — ${g.away}…`);
    try {
      const r = await rukometGuarded(
        `odds.${g.id}`,
        () => getRukometOdds({ data: { id: g.id, apiKey } }),
        onWait
      );
      if (r.error) {
        setMsg(
          r.error === "RATE_LIMIT"
            ? "Limit API-ja — pričekaj 15 s."
            : `${r.error} Unesi kvote ručno u nastavku:`
        );
        setManualMode(true);
        return;
      }
      runAnalysis(r.markets, g.league, r.bookmaker);
    } catch (e: any) {
      setMsg(`${e?.message ?? "Greška"}. Možeš unijeti kvote ručno:`);
      setManualMode(true);
    } finally {
      setBusyId(null);
    }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => `${g.home} ${g.away} ${g.league}`.toLowerCase().includes(s)) : games;
  }, [games, q]);

  const st = typeof window !== "undefined" ? readRukometState() : null;

  return (
    <div className="space-y-5">
      {/* Zaglavlje */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🤾 Rukomet Sharp</h1>
          <p className="text-sm text-muted-foreground">
            1X2 · 1 2 Pobjednik · Zbroj golova · Golovi domaćina i gosta · Zagreb vrijeme
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            min={MIN_DATE}
            value={date}
            onChange={(e) => setDate(e.target.value < MIN_DATE ? MIN_DATE : e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Učitavam…" : "Učitaj utakmice"}
          </button>
          <button
            onClick={() => setSettings(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            Postavke
          </button>
        </div>
      </div>

      {/* Status i zaštita */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <span>
            Zaštita API-ja: <strong>{st?.blocked ? "Blokirano (cooldown)" : "Aktivna"}</strong> · Poziva danas:{" "}
            <strong>{st?.countToday ?? 0}</strong> / 85 · Preostalo u minuti:{" "}
            <strong>{st?.minuteRemaining ?? "—"}</strong>
          </span>
        </div>
        {st?.blocked && (
          <button
            onClick={() => {
              resetRukometGuard();
              setMsg("Zaštita poništena.");
            }}
            className="rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-medium text-destructive hover:bg-destructive/20"
          >
            Poništi blokadu
          </button>
        )}
      </div>

      {msg && <div className="rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">{msg}</div>}

      {/* Popis utakmica */}
      {games.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pretraži klub ili ligu…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>

          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((g) => {
              const active = sel?.id === g.id;
              const isBusy = busyId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => open(g)}
                  disabled={isBusy}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  }`}
                >
                  <div className="flex w-full items-center justify-between text-muted-foreground">
                    <span className="truncate text-[11px] font-medium">{g.league}</span>
                    <span className="font-mono text-[11px] font-semibold">{time(g.time)}</span>
                  </div>
                  <div className="font-semibold text-foreground">
                    {g.home} — {g.away}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Status: {g.status}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ručni unos kvota kada API nema kvote */}
      {sel && manualMode && (
        <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">
                Ručni unos kvota za: {sel.home} — {sel.away}
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">Kladionica nema API kvote</span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 text-xs">
            <div>
              <label className="text-[10px] text-muted-foreground">1 (Domaćin)</label>
              <input
                type="number"
                step="0.01"
                value={m1}
                onChange={(e) => setM1(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">X (Remi)</label>
              <input
                type="number"
                step="0.01"
                value={mX}
                onChange={(e) => setMX(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">2 (Gost)</label>
              <input
                type="number"
                step="0.01"
                value={m2}
                onChange={(e) => setM2(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Zbroj linija</label>
              <input
                type="number"
                step="0.5"
                value={mLine}
                onChange={(e) => setMLine(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Više kvota</label>
              <input
                type="number"
                step="0.01"
                value={mOver}
                onChange={(e) => setMOver(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Manje kvota</label>
              <input
                type="number"
                step="0.01"
                value={mUnder}
                onChange={(e) => setMUnder(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            </div>
          </div>

          <button
            onClick={handleManualAnalyze}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Activity className="h-3.5 w-3.5" />
            Pokreni kvantitativnu analizu
          </button>
        </div>
      )}

      {/* Rezultati analize */}
      {sel && an && (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <div className="text-xs text-muted-foreground">{sel.league} · {time(sel.time)}</div>
              <h2 className="text-lg font-bold">
                {sel.home} — {sel.away}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                Izvor kvota: {book ?? "Analitički model"}
              </span>
              <button
                onClick={() => setManualMode(!manualMode)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {manualMode ? "Sakrij ručni unos" : "Prilagodi kvote ručno"}
              </button>
            </div>
          </div>

          {/* Istaknuti tipovi */}
          <div className="grid gap-3 sm:grid-cols-2">
            {an.best && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Trophy className="h-4 w-4" /> Najbolji Value Tip (+EV)
                </div>
                <div className="mt-1 text-base font-bold">{an.best.pick}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Tržište: <strong>{an.best.market}</strong> · Vjerojatnost: <strong>{pct(an.best.prob)}</strong> · Fer kvota:{" "}
                  <strong>{an.best.fair.toFixed(2)}</strong>
                  {an.best.odd && (
                    <>
                      {" "}· Ponuđena: <strong>{an.best.odd.toFixed(2)}</strong> · EV:{" "}
                      <strong className="text-emerald-600">+{an.best.ev?.toFixed(1)}%</strong>
                    </>
                  )}
                </div>
              </div>
            )}
            {an.safest && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <ShieldAlert className="h-4 w-4" /> Najsigurniji Tip (Najveća vjerojatnost)
                </div>
                <div className="mt-1 text-base font-bold">{an.safest.pick}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Tržište: <strong>{an.safest.market}</strong> · Vjerojatnost:{" "}
                  <strong className="text-emerald-600">{pct(an.safest.prob)}</strong> · Fer kvota:{" "}
                  <strong>{an.safest.fair.toFixed(2)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Očekivani golovi i tempo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-lg bg-muted/40 p-3 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Očekivano golova</div>
              <div className="text-base font-bold font-mono">{an.muTotal.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Očekivano domaćin</div>
              <div className="text-base font-bold font-mono text-primary">{an.muHome.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Očekivano gost</div>
              <div className="text-base font-bold font-mono text-primary">{an.muAway.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Predviđena razlika</div>
              <div className="text-base font-bold font-mono">
                {an.muDiff > 0 ? `+${an.muDiff.toFixed(1)} dom.` : `${an.muDiff.toFixed(1)} gost`}
              </div>
            </div>
          </div>

          {/* Tržišta tabela */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* 1X2 & Pobjednik */}
            <div className="rounded-lg border p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                1X2 & Pobjednik (1 2)
              </h3>
              <div className="mt-2 divide-y text-xs">
                {an.x12.map((t) => (
                  <Row key={t.pick} tip={t} />
                ))}
                {an.ml.map((t) => (
                  <Row key={t.pick} tip={t} label={`Pobjednik ${t.pick}`} />
                ))}
              </div>
            </div>

            {/* Dupla šansa */}
            <div className="rounded-lg border p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Dupla šansa (1X, 12, X2)
              </h3>
              <div className="mt-2 divide-y text-xs">
                {an.dc.map((t) => (
                  <Row key={t.pick} tip={t} />
                ))}
              </div>
            </div>

            {/* Ukupni zbroj golova */}
            <div className="rounded-lg border p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ukupni zbroj golova (Više / Manje)
              </h3>
              <div className="mt-2 divide-y text-xs">
                {an.totals.slice(0, 6).map((t) => (
                  <Row key={t.pick} tip={t} />
                ))}
              </div>
            </div>

            {/* Timski golovi domaćina i gosta */}
            <div className="rounded-lg border p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Timski golovi ({sel.home} & {sel.away})
              </h3>
              <div className="mt-2 divide-y text-xs">
                {an.homeTotals.slice(0, 3).map((t) => (
                  <Row key={t.pick} tip={t} label={`${sel.home} ${t.pick}`} />
                ))}
                {an.awayTotals.slice(0, 3).map((t) => (
                  <Row key={t.pick} tip={t} label={`${sel.away} ${t.pick}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Row({ tip, label }: { tip: Tip; label?: string }) {
  const isValue = (tip.ev ?? 0) > 2;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-medium text-foreground">{label ?? tip.pick}</span>
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="text-muted-foreground">{pct(tip.prob)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">Fer {tip.fair.toFixed(2)}</span>
        {tip.odd && (
          <span className={`rounded px-1.5 py-0.5 font-bold ${isValue ? "bg-emerald-500/15 text-emerald-600" : "bg-card"}`}>
            @{tip.odd.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}


