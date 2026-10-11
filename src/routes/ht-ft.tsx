import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze } from "@/lib/zlatni-engine";
import { getApiKey, guarded, resetGuard, zagrebDay, readState } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";
import { computeHtFtAnalysis, type HtFtAnalysis } from "@/lib/ht-ft";
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/ht-ft")({
  head: () => ({
    meta: [
      { title: "HT/FT Sharp Matrix · Poluvrijeme / Kraj · Andromeda AI" },
      {
        name: "description",
        content: "Kvantitativni model za poluvrijeme/kraj (HT/FT) s fer tečajevima, detektorom taktičkih prijelaza X/1 i X/2 i radarom za preokrete.",
      },
      { property: "og:title", content: "HT/FT Sharp Matrix · Poluvrijeme / Kraj · Andromeda AI" },
      { property: "og:description", content: "Profesionalne prognoze poluvremena i kraja bez marže kladionica." },
    ],
  }),
  component: HtFtPage,
});

export function HtFtPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<ZtFixture | null>(null);
  const [analysisResult, setAnalysisResult] = useState<HtFtAnalysis | null>(null);

  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const guard = readState();

  const formatMatchTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString("hr-HR", {
        timeZone: "Europe/Zagreb",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const handleWait = (ms: number, reason: string) => {
    setStatusMsg(`Zaštita API-ja: ${reason} — čekanje ${Math.ceil(ms / 1000)}s…`);
  };

  const handleResetGuard = () => {
    resetGuard();
    setStatusMsg("Zaštita poništena. Možete nastaviti.");
  };

  // Učitavanje utakmica dana (1 kredit dnevno)
  const handleLoadFixtures = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setStatusMsg("Molimo unesite API-Football ključ u Postavkama.");
      return;
    }

    setLoading(true);
    setStatusMsg("Učitavam današnje utakmice...");
    try {
      const res = await guarded(
        "fixtures",
        1,
        () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }),
        handleWait
      );

      if (res.error) {
        setStatusMsg(`Greška: ${res.error === "RATE_LIMIT" ? "API limit — kratka pauza 15 s." : res.error}`);
      } else {
        const playable = res.fixtures.filter((f) =>
          ["NS", "TBD", "1H", "HT", "2H"].includes(f.status)
        );
        setFixtures(playable);
        setStatusMsg(`Učitano ${playable.length} utakmica. Kliknite "Analiziraj" za proračun HT/FT ishoda.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Neuspjelo učitavanje utakmica");
    } finally {
      setLoading(false);
    }
  };

  // Analiza utakmice s "lite: true" (1 kredit, točno, bez usporavanja)
  const handleAnalyzeMatch = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setStatusMsg("Molimo unesite API-Football ključ.");
      return;
    }

    setAnalyzingId(f.id);
    setSelectedFixture(f);
    const timeFormatted = formatMatchTime(f.time);
    setStatusMsg(`Dekomponiram poluvremena za: ${f.home} — ${f.away}…`);

    try {
      const res = await guarded(
        `lite.${f.id}`,
        1,
        () => getZtMatch({ data: { fixtureId: f.id, apiKey, lite: true } }),
        handleWait
      );

      if (res.error || !res.match) {
        setStatusMsg(`Greška: ${res.error || "Nema podataka za utakmicu"}`);
      } else {
        const fullAnalysis = analyze(res.match.markets, res.match.home, res.match.away);
        const htFtRes = computeHtFtAnalysis(
          fullAnalysis,
          `${f.home} vs ${f.away}`,
          f.league,
          timeFormatted
        );
        setAnalysisResult(htFtRes);
        setStatusMsg(`Analiza dovršena za ${f.home} vs ${f.away}.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Greška pri analizi utakmice");
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
    <div className="space-y-6">
      {/* HEADER KARTICE */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight">HT/FT Sharp Matrix</h1>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-500">
                Poluvrijeme / Kraj
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Bivarijatni model dekompozicije golova po poluvremenima. Svih 9 HT/FT ishoda bez marže kladionice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" />
              Postavke
            </button>
            <button
              onClick={handleResetGuard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Poništi blokadu
            </button>
            <button
              onClick={handleLoadFixtures}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Učitavam…" : "Učitaj utakmice dana"}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center justify-between">
            <span>{statusMsg}</span>
            <span className="text-[10px] text-muted-foreground">Danas poziva: {guard.callsToday}/95</span>
          </div>
        )}
      </div>

      {/* POPIS DANAŠNJIH UTAKMICA */}
      {fixtures.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-3">
            <div className="text-xs font-semibold text-muted-foreground">
              Dostupne utakmice ({filteredFixtures.length})
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Traži klub ili ligu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/50 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
            {filteredFixtures.map((f) => {
              const isSelected = selectedFixture?.id === f.id;
              const isAnalyzing = analyzingId === f.id;
              return (
                <div
                  key={f.id}
                  className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border/60 bg-card/40 hover:border-border"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-[10px] text-muted-foreground truncate">{f.league}</div>
                    <div className="text-xs font-medium truncate">
                      {f.home} — {f.away}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {formatMatchTime(f.time)} Zagreb
                    </div>
                  </div>
                  <button
                    onClick={() => handleAnalyzeMatch(f)}
                    disabled={isAnalyzing}
                    className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {isAnalyzing ? "Računam…" : "Analiziraj"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* REZULTAT DETALJNE ANALIZE */}
      {analysisResult && (
        <div className="space-y-6">
          {/* NASLOVNA KARTICA UTAKMICE */}
          <div className="rounded-2xl border border-border/60 bg-card/70 p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs text-muted-foreground">{analysisResult.league}</span>
                <h2 className="text-xl font-bold tracking-tight mt-0.5">{analysisResult.match}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Početak: {analysisResult.time}</span>
                  <span>•</span>
                  <span>xG Utakmice: {(analysisResult.lh + analysisResult.la).toFixed(2)} (Domaći: {analysisResult.lh} | Gost: {analysisResult.la})</span>
                </div>
              </div>

              {/* POLUVRIJEME 1X2 I 0:0 METRIKA */}
              <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-xl border border-border/40">
                <div className="text-center px-2">
                  <div className="text-[10px] text-muted-foreground">1 na 1H</div>
                  <div className="text-xs font-bold">{analysisResult.ht1X2.home}%</div>
                  <div className="text-[9px] text-muted-foreground">kv. {analysisResult.ht1X2.fairHome}</div>
                </div>
                <div className="text-center px-2 border-x border-border/60">
                  <div className="text-[10px] text-muted-foreground">X na 1H</div>
                  <div className="text-xs font-bold text-amber-500">{analysisResult.ht1X2.draw}%</div>
                  <div className="text-[9px] text-muted-foreground">kv. {analysisResult.ht1X2.fairDraw}</div>
                </div>
                <div className="text-center px-2">
                  <div className="text-[10px] text-muted-foreground">2 na 1H</div>
                  <div className="text-xs font-bold">{analysisResult.ht1X2.away}%</div>
                  <div className="text-[9px] text-muted-foreground">kv. {analysisResult.ht1X2.fairAway}</div>
                </div>
                <div className="text-center pl-3 border-l border-border/60">
                  <div className="text-[10px] text-muted-foreground">0:0 na odmoru</div>
                  <div className="text-xs font-bold text-primary">{analysisResult.p00AtHalf}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 GLAVNE SHARP PREPORUKE */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. GLAVNI TIP */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">Glavni HT/FT Tip</span>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {analysisResult.mainTip.confidence}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-foreground">
                  {analysisResult.mainTip.pick}
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  {analysisResult.mainTip.description}
                </div>
                <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {analysisResult.mainTip.reasoning}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-primary/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Šansa: </span>
                  <span className="font-bold">{(analysisResult.mainTip.prob * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fer kvota: </span>
                  <span className="font-bold text-primary">{analysisResult.mainTip.fairOdd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 2. SHARP VALUE TIP */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wide">Sharp Value Ishod</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    {analysisResult.sharpValueTip?.ev ? `+${analysisResult.sharpValueTip.ev}% EV` : "Value"}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-emerald-500">
                  {analysisResult.sharpValueTip?.pick ?? "X/1"}
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  {analysisResult.sharpValueTip?.description}
                </div>
                <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {analysisResult.sharpValueTip?.reasoning}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-500/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Šansa: </span>
                  <span className="font-bold">{((analysisResult.sharpValueTip?.prob ?? 0) * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fer tečaj: </span>
                  <span className="font-bold text-emerald-500">{analysisResult.sharpValueTip?.fairOdd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 3. SIGURNA LINIJA (HEDGE) */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-500 uppercase tracking-wide">Sigurnosni Hedge</span>
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-500">
                    Ograda
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-sky-500">
                  {analysisResult.safeHedgeTip.pick}
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  {analysisResult.safeHedgeTip.title}
                </div>
                <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {analysisResult.safeHedgeTip.reasoning}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-sky-500/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Sigurnost: </span>
                  <span className="font-bold">{((analysisResult.safeHedgeTip.prob) * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fer tečaj: </span>
                  <span className="font-bold text-sky-500">{analysisResult.safeHedgeTip.fairOdd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 4. RADAR PREOKRETA (2/1 ili 1/2) */}
            <div className={`rounded-2xl border p-4 flex flex-col justify-between ${
              analysisResult.reversalRadar.hasReversalSignal
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border/60 bg-card/40"
            }`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Radar Preokreta
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    analysisResult.reversalRadar.hasReversalSignal
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {analysisResult.reversalRadar.hasReversalSignal ? "Mogući Preokret" : "Nema Signala"}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-foreground">
                  {analysisResult.reversalRadar.pick}
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  Preporučeni ulog: {analysisResult.reversalRadar.recommendedStake}
                </div>
                <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {analysisResult.reversalRadar.note}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Šansa: </span>
                  <span className="font-bold">{(analysisResult.reversalRadar.prob * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fer kvota: </span>
                  <span className="font-bold text-amber-500">{analysisResult.reversalRadar.fairOdd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* MATRICA SVIH 9 HT/FT ISHODA S FER KVOTAMA I EV% */}
          <div className="rounded-2xl border border-border/60 bg-card/70 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
              Kompletna Matrica: Svih 9 HT/FT Ishoda
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {analysisResult.outcomes.map((o) => {
                const isMain = o.code === analysisResult.mainTip.pick;
                const isValue = o.isValue;
                const isTrap = o.isTrap;

                return (
                  <div
                    key={o.code}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isMain
                        ? "border-primary bg-primary/10 shadow-sm"
                        : isValue
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-border/60 bg-card/40 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black tracking-tight">{o.code}</span>
                      <div className="flex items-center gap-1.5">
                        {isMain && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                            GLAVNI
                          </span>
                        )}
                        {isValue && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500">
                            VALUE (+{o.ev}%)
                          </span>
                        )}
                        {isTrap && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-500 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            ZAMKA
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {o.categoryLabel}
                        </span>
                      </div>
                    </div>

                    {/* VJEROJATNOST BAR */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Vjerojatnost:</span>
                        <span className="font-bold tabular-nums">{o.probPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isMain
                              ? "bg-primary"
                              : isValue
                              ? "bg-emerald-500"
                              : o.category === "reversal"
                              ? "bg-amber-500"
                              : "bg-muted-foreground/60"
                          }`}
                          style={{ width: `${Math.min(100, o.probPercent * 2)}%` }}
                        />
                      </div>
                    </div>

                    {/* FER KVOTA VS KLADIONICA */}
                    <div className="mt-3 pt-2.5 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Fer kvota:</div>
                        <div className="font-bold">{o.fairOdd.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Kladionica:</div>
                        <div className="font-bold text-primary tabular-nums">
                          {o.bookieOdd ? o.bookieOdd.toFixed(2) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZA POSTAVKE / API KLJUČ */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

