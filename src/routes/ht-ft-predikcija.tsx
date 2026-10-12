import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Sparkles,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Layers,
  TrendingUp,
  AlertTriangle,
  Award,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import {
  getZtFixtures,
  getZtMatch,
  type ZtFixture,
} from "@/lib/zlatni-tip.functions";
import { analyze } from "@/lib/zlatni-engine";
import {
  getApiKey,
  guarded,
  readState,
  resetGuard,
  zagrebDay,
} from "@/lib/zlatni-guard";
import {
  computeQuantumHtFt,
  type MasterHtFtPrediction,
} from "@/lib/ht-ft-predikcija";

export const Route = createFileRoute("/ht-ft-predikcija")({
  head: () => ({
    meta: [
      {
        title: "HT/FT Kvantni Prediktor · Egzaktna Predikcija Poluvrijeme / Kraj",
      },
      {
        name: "description",
        content:
          "Profesionalni matematički HT/FT prediktor s Markovljevim lancima, Dixon-Coles vremenskim modelom i točnim tipom.",
      },
      {
        property: "og:title",
        content: "HT/FT Kvantni Prediktor · Andromeda AI",
      },
      {
        property: "og:description",
        content:
          "Algoritamska sinteza 4 posebne metode za točnu i preciznu HT/FT prognozu.",
      },
    ],
  }),
  component: QuantumHtFtPage,
});

function formatMatchTime(isoString: string) {
  try {
    return new Date(isoString).toLocaleTimeString("hr-HR", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function QuantumHtFtPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<ZtFixture | null>(null);
  const [prediction, setPrediction] = useState<MasterHtFtPrediction | null>(null);

  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const guard = readState();

  const handleWait = (ms: number, reason: string) => {
    setStatusMsg(
      `Zaštita API-ja: ${reason}. Kratko čekanje ${Math.ceil(ms / 1000)} s…`
    );
  };

  const handleResetGuard = () => {
    resetGuard();
    setStatusMsg("Zaštita API-ja je resetirana. Možete nastaviti s radom.");
  };

  const handleLoadFixtures = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatusMsg("Unesite API-Football ključ u Postavkama.");
      setSettingsOpen(true);
      return;
    }

    setLoadingFixtures(true);
    setStatusMsg("Učitavam utakmice dana po zagrebačkom vremenu…");

    try {
      const today = zagrebDay();
      const res = await guarded(
        `zt.fixtures.${today}`,
        1,
        () => getZtFixtures({ data: { date: today, apiKey } }),
        handleWait
      );

      if (res && res.fixtures) {
        setFixtures(res.fixtures);
        setStatusMsg(
          `Učitano ${res.fixtures.length} utakmica. Odaberite utakmicu za egzaktnu HT/FT analizu.`
        );
      } else {
        setStatusMsg("Nema dostupnih utakmica za danas ili je došlo do zastoja.");
      }
    } catch (err: any) {
      setStatusMsg(`Greška: ${err?.message || "Neuspjelo učitavanje utakmica"}`);
    } finally {
      setLoadingFixtures(false);
    }
  };

  const handleAnalyzeFixture = async (f: ZtFixture) => {
    if (analyzingId) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    setSelectedFixture(f);
    setAnalyzingId(f.id);
    setStatusMsg(`Kvantna analiza za ${f.home} vs ${f.away} u tijeku…`);

    try {
      const res = await guarded(
        `zt.match.lite.${f.id}`,
        1,
        () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }),
        handleWait
      );

      if (res?.error) {
        setStatusMsg(`Zaštita API-ja: ${res.error}`);
        return;
      }

      if (!res?.markets || Object.keys(res.markets).length === 0) {
        setStatusMsg("Za ovu utakmicu kladionice još nisu objavile kompletne kvote.");
        return;
      }

      // Pokretanje internog modeliranja
      const basicAnalysis = analyze(res.markets, res.home ?? null, res.away ?? null);
      const matchName = `${f.home} – ${f.away}`;
      const timeStr = formatMatchTime(f.date);

      const qResult = computeQuantumHtFt(basicAnalysis, matchName, f.league, timeStr);
      setPrediction(qResult);
      setStatusMsg("Analiza uspješno dovršena s 4 posebne metode.");
    } catch (err: any) {
      setStatusMsg(`Greška analize: ${err?.message || "Provjerite vezu s API-jem"}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const filteredFixtures = useMemo(() => {
    if (!searchQuery.trim()) return fixtures;
    const q = searchQuery.toLowerCase();
    return fixtures.filter(
      (f) =>
        f.home.toLowerCase().includes(q) ||
        f.away.toLowerCase().includes(q) ||
        f.league.toLowerCase().includes(q)
    );
  }, [fixtures, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-6">
      {/* Zaglavlje kartice */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Clock className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              HT/FT Kvantni Prediktor
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Egzaktan i točan tip poluvrijeme/kraj izračunat pomoću 4 posebne interne metode (Dixon-Coles, Markovljevi lanci, Shannonova entropija i Bayesov model).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLoadFixtures}
            disabled={loadingFixtures}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition disabled:opacity-50 shadow-lg shadow-emerald-900/30"
          >
            <RefreshCw className={`h-4 w-4 ${loadingFixtures ? "animate-spin" : ""}`} />
            {loadingFixtures ? "Učitavam…" : "Učitaj utakmice dana"}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-border bg-card/60 hover:bg-card transition"
          >
            <Settings className="h-4 w-4" />
            Postavke
          </button>
        </div>
      </div>

      {/* Status i zaštita kvota */}
      {statusMsg && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-200 text-xs sm:text-sm">
          <span>{statusMsg}</span>
          {guard.suspendedUntil && guard.suspendedUntil > Date.now() && (
            <button
              onClick={handleResetGuard}
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold text-xs hover:bg-red-500"
            >
              Poništi blokadu
            </button>
          )}
        </div>
      )}

      {/* Popis utakmica */}
      {fixtures.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              Dostupne utakmice ({filteredFixtures.length})
            </span>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Traži klub ili ligu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {filteredFixtures.map((f) => {
              const isSelected = selectedFixture?.id === f.id;
              const isAnalyzing = analyzingId === f.id;

              return (
                <button
                  key={f.id}
                  onClick={() => handleAnalyzeFixture(f)}
                  disabled={isAnalyzing}
                  className={`text-left p-3 rounded-xl border transition flex flex-col justify-between ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-950/30"
                      : "border-border/60 bg-background/50 hover:border-emerald-500/50 hover:bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="font-medium truncate max-w-[170px]">{f.league}</span>
                    <span className="font-mono text-emerald-400">{formatMatchTime(f.date)}</span>
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {f.home} <span className="text-muted-foreground font-normal">vs</span> {f.away}
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-xs font-semibold text-emerald-400 hover:underline">
                      {isAnalyzing ? "Analiziram…" : "Generiraj Master Tip →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GLAVNI REZULTAT: KONKRETNA I PRECIZNA HT/FT PREDIKCIJA */}
      {prediction && (
        <div className="space-y-6">
          {/* Velika Master Kartica Tipa */}
          <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 via-card to-background p-6 shadow-2xl shadow-emerald-950/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/50">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="h-3.5 w-3.5" />
                  Kvantni Konsenzus: {prediction.consensusRate}
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-2">
                  {prediction.match}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {prediction.league} · Početak: {prediction.time}
                </p>
              </div>

              {/* Status certifikata */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Ocjena Izvjesnosti</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {prediction.concreteTip.confidenceGrade}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
                  <Award className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Središnji blok s točnim tipom */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6 items-center">
              <div className="md:col-span-2 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Službena Odluka Modela (Konkretan Tip)
                </span>
                <div className="flex flex-wrap items-baseline gap-4">
                  <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight font-mono">
                    {prediction.concreteTip.code}
                  </span>
                  <div className="text-base sm:text-lg font-semibold text-foreground">
                    {prediction.concreteTip.label}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed bg-background/60 p-3.5 rounded-xl border border-border/50">
                  <strong className="text-emerald-400">Taktičko-matematičko obrazloženje:</strong>{" "}
                  {prediction.concreteTip.tacticalReason}
                </p>
              </div>

              {/* Kvote i vjerojatnost */}
              <div className="p-4 rounded-2xl bg-card border border-border/70 flex flex-col justify-center space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Matematička Vjerojatnost:</span>
                  <span className="font-bold text-foreground text-sm font-mono">
                    {prediction.concreteTip.probPercent}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Fer Tečaj (bez marže):</span>
                  <span className="font-bold text-emerald-400 text-sm font-mono">
                    {prediction.concreteTip.fairOdd.toFixed(2)}
                  </span>
                </div>
                {prediction.concreteTip.bookieOdd && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Kladioničarski Tečaj:</span>
                    <span className="font-bold text-foreground text-sm font-mono">
                      {prediction.concreteTip.bookieOdd.toFixed(2)}
                    </span>
                  </div>
                )}
                {prediction.concreteTip.ev != null && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Value Prednost (EV%):</span>
                    <span
                      className={`font-bold font-mono ${
                        prediction.concreteTip.ev > 0 ? "text-emerald-400" : "text-muted-foreground"
                      }`}
                    >
                      {prediction.concreteTip.ev > 0 ? "+" : ""}
                      {prediction.concreteTip.ev}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Sigurnosni dupli tip (Zaštitna oklada) */}
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs text-emerald-300 font-semibold">
                    Alternativni Sigurnosni Tip (Hedge oklada):
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {prediction.safeHedge.pick} — {prediction.safeHedge.description}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground">Sigurnost: </span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {prediction.safeHedge.probPercent}% (kvota {prediction.safeHedge.fairOdd.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* 4 POSEBNE METODE — DETALJNI PREGLED */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Rezultati 4 Specijalne Kvantne Metode
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {prediction.methods.map((m, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-border bg-card/60 space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">
                      {m.name}
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-black font-mono text-foreground">
                        {m.pickedCode}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {m.certaintyPercent}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                    {m.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* TABLICA SVIH 9 HT/FT ISHODA S KVOTAMA I VJEROJATNOSTIMA */}
          <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3 backdrop-blur-md">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              Distribucija svih 9 ishoda (HT/FT Matrica)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="py-2.5 px-3">Ishod</th>
                    <th className="py-2.5 px-3">Opis</th>
                    <th className="py-2.5 px-3 text-right">Vjerojatnost</th>
                    <th className="py-2.5 px-3 text-right">Fer Kvota</th>
                    <th className="py-2.5 px-3 text-right">Kladionica</th>
                    <th className="py-2.5 px-3 text-right">Value (EV)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {prediction.allOutcomes.map((o) => {
                    const isConcrete = o.code === prediction.concreteTip.code;

                    return (
                      <tr
                        key={o.code}
                        className={`transition ${
                          isConcrete
                            ? "bg-emerald-950/30 font-bold text-emerald-300"
                            : "hover:bg-card/80 text-foreground"
                        }`}
                      >
                        <td className="py-2.5 px-3 flex items-center gap-1.5">
                          {isConcrete && <Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
                          {o.code}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-xs text-muted-foreground">
                          {o.label}
                        </td>
                        <td className="py-2.5 px-3 text-right">{o.probPercent}%</td>
                        <td className="py-2.5 px-3 text-right">{o.fairOdd.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right">
                          {o.bookieOdd ? o.bookieOdd.toFixed(2) : "—"}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right ${
                            o.ev != null && o.ev > 0
                              ? "text-emerald-400 font-bold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {o.ev != null ? `${o.ev > 0 ? "+" : ""}${o.ev}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Postavke prozor */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setStatusMsg("Postavke spremljene. Možete učitati utakmice.");
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}

