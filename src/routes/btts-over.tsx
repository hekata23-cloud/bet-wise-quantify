import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze } from "@/lib/zlatni-engine";
import { getApiKey, guarded, resetGuard, zagrebDay, readState } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";
import { computeBttsOverAnalysis, type BttsOverAnalysis } from "@/lib/btts-over";
import {
  AlertTriangle,
  Flame,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/btts-over")({
  head: () => ({
    meta: [
      { title: "2.5 & BTTS Sharp Matrix · Andromeda AI" },
      {
        name: "description",
        content: "Kvantitativna analiza 2.5 Over/Under linija i Oba Daju Gol (GG/NG) iz bivarijatne matrice raspodjele golova.",
      },
      { property: "og:title", content: "2.5 & BTTS Sharp Matrix · Andromeda AI" },
      { property: "og:description", content: "Profesionalni model za oklade na golove s fer kvotama i detektorom zamki kladionica." },
    ],
  }),
  component: BttsOverPage,
});

export function BttsOverPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<ZtFixture | null>(null);
  const [analysisResult, setAnalysisResult] = useState<BttsOverAnalysis | null>(null);

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
        setStatusMsg(`Učitano ${playable.length} utakmica. Kliknite "Analiziraj" za proračun 2.5 i GG/NG.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Neuspjelo učitavanje utakmica");
    } finally {
      setLoading(false);
    }
  };

  // Analiza utakmice s "lite: true" (1 kredit, brzo, bez zastoja)
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
    setStatusMsg(`Modeliram golove i korelacije za: ${f.home} — ${f.away}…`);

    try {
      const res = await guarded(
        `lite.${f.id}`,
        1,
        () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }),
        handleWait
      );

      if (res.error === "RATE_LIMIT" || res.error?.startsWith("ACCOUNT")) {
        setStatusMsg(
          res.error === "RATE_LIMIT"
            ? "API traži kratku pauzu (10 poziva/min). Pričekajte 15 s i kliknite ponovno."
            : res.error
        );
        return;
      }

      if (!Object.keys(res.markets).length) {
        setStatusMsg(`Za utakmicu ${f.home} — ${f.away} kladionice još nisu objavile kvote.`);
        return;
      }

      const engineAnalysis = analyze(res.markets, res.home, res.away);
      const bttsOverData = computeBttsOverAnalysis(
        engineAnalysis,
        `${f.home} — ${f.away}`,
        f.league,
        timeFormatted
      );

      setAnalysisResult(bttsOverData);
      setStatusMsg(`✅ Izračunano: ${f.home} — ${f.away} (${res.bookmaker ?? "Kladionica"}).`);
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
      {/* Zaglavlje */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Flame className="h-6 w-6 text-amber-500" /> 2.5 & BTTS Sharp Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Profesionalni sindikatski model za Više/Manje 2.5 gola i Oba Daju Gol (GG/NG) s de-vig fer kvotama i detektorom zamki.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" /> Postavke
          </button>

          <button
            onClick={handleResetGuard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            title="Kliknite ako je API privremeno blokiran"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Poništi blokadu
          </button>

          <button
            onClick={handleLoadFixtures}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Učitaj utakmice dana
          </button>
        </div>
      </div>

      {/* Statusna traka */}
      {statusMsg && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-sm text-foreground flex items-center justify-between">
          <span>{statusMsg}</span>
          <span className="text-xs text-muted-foreground">Preostalo kredita: {guard.dayRemaining >= 0 ? guard.dayRemaining : "—"}</span>
        </div>
      )}

      {/* Prikaz analize za odabranu utakmicu */}
      {analysisResult && selectedFixture && (
        <div className="space-y-5">
          {/* Trap Alert ako postoji */}
          {analysisResult.trapWarning && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider block text-amber-300">⚠️ Upozorenje: Kladioničarska Zamka Detektirana</span>
                <p className="mt-1 leading-relaxed">{analysisResult.trapWarning}</p>
              </div>
            </div>
          )}

          {/* Glavni dashboard kartice */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">Kvantitativni Golovni Profil</span>
                <h2 className="text-xl font-bold">{analysisResult.match}</h2>
                <p className="text-xs text-muted-foreground">
                  {analysisResult.league} · Početak: {analysisResult.time}
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">xG Domaćin</div>
                  <div className="font-mono font-bold text-base text-foreground">{analysisResult.lh.toFixed(2)}</div>
                </div>
                <div className="text-lg font-bold text-muted-foreground">:</div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">xG Gost</div>
                  <div className="font-mono font-bold text-base text-foreground">{analysisResult.la.toFixed(2)}</div>
                </div>
                <div className="border-l border-border/60 pl-3">
                  <div className="text-[10px] text-muted-foreground uppercase">Ukupni xG</div>
                  <div className="font-mono font-bold text-lg text-primary">{analysisResult.totalXg}</div>
                </div>
              </div>
            </div>

            {/* Dva velika stupa: 2.5 O/U i BTTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Više / Manje 2.5 Gola */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" /> Tržište: 2.5 Više / Manje
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    Preporuka: {analysisResult.mainOverUnderTip.pick}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className={`rounded-lg p-3 border ${analysisResult.over25Prob >= 0.5 ? "border-primary/50 bg-primary/10" : "border-border/30 bg-muted/30"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Više 2.5</span>
                      <span className="font-mono font-bold">{(analysisResult.over25Prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground">{analysisResult.fairOver25}</span>
                    </div>
                    {analysisResult.bookieOver25 && (
                      <div className="text-[11px] text-muted-foreground flex justify-between mt-0.5">
                        <span>Kladionica: @{analysisResult.bookieOver25.toFixed(2)}</span>
                        {analysisResult.over25Ev !== undefined && (
                          <span className={analysisResult.over25Ev > 0 ? "text-emerald-400 font-bold" : "text-muted-foreground"}>
                            {analysisResult.over25Ev > 0 ? "+" : ""}{analysisResult.over25Ev}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`rounded-lg p-3 border ${analysisResult.under25Prob >= 0.5 ? "border-primary/50 bg-primary/10" : "border-border/30 bg-muted/30"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Manje 2.5</span>
                      <span className="font-mono font-bold">{(analysisResult.under25Prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground">{analysisResult.fairUnder25}</span>
                    </div>
                    {analysisResult.bookieUnder25 && (
                      <div className="text-[11px] text-muted-foreground flex justify-between mt-0.5">
                        <span>Kladionica: @{analysisResult.bookieUnder25.toFixed(2)}</span>
                        {analysisResult.under25Ev !== undefined && (
                          <span className={analysisResult.under25Ev > 0 ? "text-emerald-400 font-bold" : "text-muted-foreground"}>
                            {analysisResult.under25Ev > 0 ? "+" : ""}{analysisResult.under25Ev}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground italic">{analysisResult.mainOverUnderTip.reasoning}</p>
              </div>

              {/* 2. Oba Daju Gol (GG / NG) */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-400" /> Tržište: Oba Daju Gol (BTTS)
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    Preporuka: {analysisResult.mainBttsTip.pick.includes("GG") ? "GG (Da)" : "NG (Ne)"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className={`rounded-lg p-3 border ${analysisResult.bttsYesProb >= 0.5 ? "border-amber-500/50 bg-amber-500/10" : "border-border/30 bg-muted/30"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">GG (Oba daju)</span>
                      <span className="font-mono font-bold">{(analysisResult.bttsYesProb * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground">{analysisResult.fairBttsYes}</span>
                    </div>
                    {analysisResult.bookieBttsYes && (
                      <div className="text-[11px] text-muted-foreground flex justify-between mt-0.5">
                        <span>Kladionica: @{analysisResult.bookieBttsYes.toFixed(2)}</span>
                        {analysisResult.bttsYesEv !== undefined && (
                          <span className={analysisResult.bttsYesEv > 0 ? "text-emerald-400 font-bold" : "text-muted-foreground"}>
                            {analysisResult.bttsYesEv > 0 ? "+" : ""}{analysisResult.bttsYesEv}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`rounded-lg p-3 border ${analysisResult.bttsNoProb >= 0.5 ? "border-amber-500/50 bg-amber-500/10" : "border-border/30 bg-muted/30"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">NG (Ne daju oba)</span>
                      <span className="font-mono font-bold">{(analysisResult.bttsNoProb * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground">{analysisResult.fairBttsNo}</span>
                    </div>
                    {analysisResult.bookieBttsNo && (
                      <div className="text-[11px] text-muted-foreground flex justify-between mt-0.5">
                        <span>Kladionica: @{analysisResult.bookieBttsNo.toFixed(2)}</span>
                        {analysisResult.bttsNoEv !== undefined && (
                          <span className={analysisResult.bttsNoEv > 0 ? "text-emerald-400 font-bold" : "text-muted-foreground"}>
                            {analysisResult.bttsNoEv > 0 ? "+" : ""}{analysisResult.bttsNoEv}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground italic">{analysisResult.mainBttsTip.reasoning}</p>
              </div>
            </div>

            {/* 4 Kvadranta Matrice Rezultata */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                4 Kvadranta Korelacije (Dixon-Coles Matrica)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl bg-card border border-border/50 p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-primary">{analysisResult.quadrants.ggAndOver.label}</div>
                  <div className="text-lg font-bold font-mono">{(analysisResult.quadrants.ggAndOver.prob * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">Fer kvota: {(1 / analysisResult.quadrants.ggAndOver.prob).toFixed(2)}</div>
                </div>

                <div className="rounded-xl bg-card border border-border/50 p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-emerald-400">{analysisResult.quadrants.ngAndUnder.label}</div>
                  <div className="text-lg font-bold font-mono">{(analysisResult.quadrants.ngAndUnder.prob * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">Fer kvota: {(1 / analysisResult.quadrants.ngAndUnder.prob).toFixed(2)}</div>
                </div>

                <div className="rounded-xl bg-card border border-border/50 p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-amber-400">{analysisResult.quadrants.ggAndUnder.label}</div>
                  <div className="text-lg font-bold font-mono">{(analysisResult.quadrants.ggAndUnder.prob * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">Fer kvota: {(1 / analysisResult.quadrants.ggAndUnder.prob).toFixed(2)}</div>
                </div>

                <div className="rounded-xl bg-card border border-border/50 p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground">{analysisResult.quadrants.ngAndOver.label}</div>
                  <div className="text-lg font-bold font-mono">{(analysisResult.quadrants.ngAndOver.prob * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">Fer kvota: {(1 / analysisResult.quadrants.ngAndOver.prob).toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Sharp Combo preporuka */}
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-primary">Preporučeni Sharp Kombo</span>
                <h4 className="font-bold text-base text-foreground mt-0.5">{analysisResult.sharpComboTip.title}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{analysisResult.sharpComboTip.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">Fer koeficijent</div>
                <div className="text-xl font-bold font-mono text-primary">@{analysisResult.sharpComboTip.fairOdd.toFixed(2)}</div>
              </div>
            </div>

            {/* Distribucija broja golova i Clean Sheet */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/40 text-xs">
              <div>
                <span className="font-semibold text-muted-foreground block mb-2">Vjerojatnost točnog broja golova</span>
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {analysisResult.goalDistribution.map((g) => (
                    <div key={g.goals} className="bg-muted/40 rounded-lg p-2">
                      <div className="text-[10px] text-muted-foreground">{g.goals}</div>
                      <div className="font-mono font-bold mt-0.5">{(g.prob * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-muted-foreground block mb-2">Čista mreža (Clean Sheet)</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded-lg p-2 flex justify-between items-center">
                    <span className="truncate pr-1">Domaćin bez primljenog</span>
                    <span className="font-mono font-bold">{(analysisResult.homeCleanSheet * 100).toFixed(0)}%</span>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2 flex justify-between items-center">
                    <span className="truncate pr-1">Gost bez primljenog</span>
                    <span className="font-mono font-bold">{(analysisResult.awayCleanSheet * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popis utakmica za analizu */}
      {fixtures.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base">Današnje Utakmice — Odaberite par za golovni profil</h3>
              <p className="text-xs text-muted-foreground">
                Kliknite "Analiziraj" za trenutni proračun 2.5 linija, oba daju gol i provjeru zamki.
              </p>
            </div>

            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Traži klub ili ligu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 max-h-[500px] overflow-y-auto">
            {filteredFixtures.slice(0, 60).map((f) => {
              const isThisAnalyzing = analyzingId === f.id;
              const isSelected = selectedFixture?.id === f.id;

              return (
                <div
                  key={f.id}
                  className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border/40 bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-xs text-foreground truncate">
                      {f.home} — {f.away}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {f.league} · {formatMatchTime(f.time)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAnalyzeMatch(f)}
                    disabled={loading || isThisAnalyzing}
                    className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500 hover:text-black transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {isThisAnalyzing ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Računam…
                      </>
                    ) : isSelected ? (
                      "Ažuriraj"
                    ) : (
                      "Analiziraj"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

