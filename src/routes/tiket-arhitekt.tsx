import { createFileRoute } from "@tanstack/react-router";
import { evaluatePredictionIntegrity, integrityClass, footballContradiction } from "@/lib/prediction-integrity";
import { useState, useTransition, useMemo } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze, type Analysis } from "@/lib/zlatni-engine";
import { getApiKey, guarded, resetGuard, zagrebDay, readState } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";
import {
  extractEdgesFromAnalysis,
  buildOptimalTickets,
  formatTicketForSharing,
  type EdgeBet,
  type TicketRecommendation,
} from "@/lib/tiket-arhitekt";
import {
  Check,
  Copy,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Ticket,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/tiket-arhitekt")({
  head: () => ({
    meta: [
      { title: "Tiket Arhitekt · Monte Carlo Value Finder · Andromeda AI" },
      {
        name: "description",
        content: "Automatski kvantitativni skener za sastavljanje dobitnih tiketa s matematičkom prednošću (EV > 0%) i eliminacijom rizika korelacije.",
      },
      { property: "og:title", content: "Tiket Arhitekt · Andromeda AI" },
      { property: "og:description", content: "Kvantitativni skener i automatski sastavljač tiketa dana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TiketArhitektPage,
});

export function TiketArhitektPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [analyzedEdges, setAnalyzedEdges] = useState<EdgeBet[]>([]);
  const [tickets, setTickets] = useState<TicketRecommendation[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<{
    fixture: ZtFixture;
    analysis: Analysis;
    edges: EdgeBet[];
    bookmaker: string | null;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, startTransition] = useTransition();

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

  // Učitavanje utakmica dana (troši 1 kredit jednom dnevno)
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
        setStatusMsg(`Učitano ${playable.length} utakmica. Kliknite "Analiziraj" na utakmicama za detalje i listić.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Neuspjelo učitavanje utakmica");
    } finally {
      setLoading(false);
    }
  };

  // Analiza jedne utakmice (troši točno 1 kredit s "lite: true", bez zastoja)
  const handleAnalyzeMatch = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setStatusMsg("Molimo unesite API-Football ključ.");
      return;
    }

    setAnalyzingId(f.id);
    const timeFormatted = formatMatchTime(f.time);
    setStatusMsg(`Učitavam kvote i model za: ${f.home} — ${f.away}…`);

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

      const analysis = analyze(res.markets, res.home, res.away);
      const newEdges = extractEdgesFromAnalysis(
        f.id,
        `${f.home} vs ${f.away}`,
        f.league,
        timeFormatted,
        analysis
      );

      setSelectedMatch({
        fixture: f,
        analysis,
        edges: newEdges,
        bookmaker: res.bookmaker,
      });

      startTransition(() => {
        setAnalyzedEdges((prev) => {
          const filtered = prev.filter((e) => e.fixtureId !== f.id);
          const combined = [...filtered, ...newEdges].sort((a, b) => b.evPercent - a.evPercent);
          setTickets(buildOptimalTickets(combined));
          return combined;
        });
      });

      setStatusMsg(
        `✅ Analizirano: ${f.home} — ${f.away} (${res.bookmaker ?? "Kladionica"}). Učitano ${Object.keys(res.markets).length} tržišta.`
      );
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Greška pri analizi utakmice");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleCopyTicket = (ticket: TicketRecommendation, index: number) => {
    const text = formatTicketForSharing(ticket);
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Tiket Arhitekt & Value Finder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Matematički skener za sastavljanje tiketa s očekivanim prinosom i eliminacijom koreliranog rizika.
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

      {/* Detaljna analiza odabrane utakmice */}
      {selectedMatch && (
        <div className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Detaljna analiza utakmice</span>
              <h2 className="text-xl font-bold">
                {selectedMatch.fixture.home} — {selectedMatch.fixture.away}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedMatch.fixture.league} · {formatMatchTime(selectedMatch.fixture.time)} · Kladionica: {selectedMatch.bookmaker ?? "Standard"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Očekivani golovi (xG):</span>
              <div className="text-lg font-mono font-bold text-primary">
                {selectedMatch.analysis.lh.toFixed(2)} : {selectedMatch.analysis.la.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {selectedMatch.analysis.golden && (
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 space-y-1">
                <div className="text-[11px] font-semibold text-primary uppercase">🎯 Glavni tip utakmice</div>
                <div className="font-bold text-sm">{selectedMatch.analysis.golden.outcome.label}</div>
                <div className="text-xs text-muted-foreground">
                  Kvota: @{selectedMatch.analysis.golden.outcome.odd?.toFixed(2)} · Šansa: {(selectedMatch.analysis.golden.outcome.p * 100).toFixed(0)}%
                </div>
              </div>
            )}

            {selectedMatch.analysis.safe && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase">🛡️ Najsigurnija linija</div>
                <div className="font-bold text-sm">{selectedMatch.analysis.safe.outcome.label}</div>
                <div className="text-xs text-muted-foreground">
                  Kvota: @{selectedMatch.analysis.safe.outcome.odd?.toFixed(2)} · Šansa: {(selectedMatch.analysis.safe.outcome.p * 100).toFixed(0)}%
                </div>
              </div>
            )}

            <div className="rounded-xl bg-muted/40 p-3 space-y-1">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase">⚽ Najvjerojatniji rezultat</div>
              <div className="font-bold text-sm">
                {selectedMatch.analysis.topScores.slice(0, 2).map((s) => `${s.score} (${(s.p * 100).toFixed(0)}%)`).join(" ili ")}
              </div>
              <div className="text-xs text-muted-foreground">Ukupno golova: {(selectedMatch.analysis.lh + selectedMatch.analysis.la).toFixed(2)}</div>
            </div>
          </div>

          {/* Brzi pregled svih tržišta za tu utakmicu */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tržišta i fer kvote bez marže</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {selectedMatch.analysis.markets.slice(0, 6).map((mk) => (
                <div key={mk.name} className="rounded-lg bg-muted/30 p-2.5 text-xs space-y-1.5 border border-border/30">
                  <div className="font-semibold text-foreground flex justify-between">
                    <span>{mk.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">{mk.source}</span>
                  </div>
                  <div className="space-y-1">
                    {mk.outcomes.map((o) => {
                      const ev = o.odd ? (o.p * o.odd - 1) * 100 : 0;
                      const isBest = o.label === mk.pick.label;
                      return (
                        <div
                          key={o.label}
                          className={`flex items-center justify-between rounded px-1.5 py-0.5 ${
                            isBest ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground"
                          }`}
                        >
                          <span>{o.label}</span>
                          <span className="font-mono text-[11px]">
                            {(o.p * 100).toFixed(0)}% · fer {(1 / o.p).toFixed(2)}
                            {o.odd ? ` · @${o.odd.toFixed(2)}` : ""}
                            {ev > 0 ? <span className="text-emerald-400 font-bold ml-1">+{ev.toFixed(0)}%</span> : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sekcija s generiranim tiketima */}
      {tickets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold">Matematički Optimizirani Listići Dana</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tickets.map((t, idx) => (
              <div
                key={t.type}
                className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:border-primary/50 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">{t.title}</span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        t.expectedValuePercent >= 0
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      EV {t.expectedValuePercent >= 0 ? "+" : ""}{t.expectedValuePercent}%
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">{t.description}</p>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    {t.bets.map((b, bi) => (
                      <div key={bi} className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1">
                        <div className="font-semibold text-foreground truncate">{b.match}</div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-primary font-medium">{b.market}: {b.selection}</span>
                          <span className="font-mono text-foreground font-semibold">@{b.bookmakerOdd.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>Šansa: {(b.probability * 100).toFixed(0)}%</span>
                          <span className={b.evPercent > 0 ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                            Edge: {b.evPercent > 0 ? "+" : ""}{b.evPercent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <div className="text-muted-foreground text-[10px]">Ukupna kvota</div>
                      <div className="text-base font-bold text-primary font-mono">{t.combinedOdd.toFixed(2)}</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <div className="text-muted-foreground text-[10px]">Preporučeni ulog</div>
                      <div className="text-base font-bold text-foreground font-mono">{t.recommendedStakePercent}%</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyTicket(t, idx)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/60 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" /> Kopirano u međuspremnik!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Kopiraj listić
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tablica svih pronađenih oklada */}
      {analyzedEdges.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Analizirane Oklade za Tiket ({analyzedEdges.length})
            </h3>
            <span className="text-xs text-muted-foreground">Sortirano po matematičkom prinosu</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/60 text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">Utakmica</th>
                  <th className="py-2.5 px-3">Tržište</th>
                  <th className="py-2.5 px-3">Tip</th>
                  <th className="py-2.5 px-3 text-right">Šansa</th>
                  <th className="py-2.5 px-3 text-right">Fer kvota</th>
                  <th className="py-2.5 px-3 text-right">Ponuđeno</th>
                  <th className="py-2.5 px-3 text-right">Edge (EV)</th>
                  <th className="py-2.5 px-3 text-right">Kelly ulog</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {analyzedEdges.map((e, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-medium">
                      <div>{e.match}</div>
                      <div className="text-[10px] text-muted-foreground">{e.league} · {e.time}</div>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{e.market}</td>
                    <td className="py-2.5 px-3 font-semibold text-primary">{e.selection}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{(e.probability * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{e.fairOdd.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-foreground">@{e.bookmakerOdd.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-400">
                      {e.evPercent > 0 ? "+" : ""}{e.evPercent}%
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{e.recommendedKellyPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista utakmica za analizu */}
      {fixtures.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base">Današnje Utakmice — Odaberite za analizu</h3>
              <p className="text-xs text-muted-foreground">
                Kliknite "Analiziraj" na željenoj utakmici. Model odmah izračunava fer kvote i automatski slaže listiće.
              </p>
            </div>

            {/* Tražilica klubova ili liga */}
            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Traži tim ili ligu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 max-h-[500px] overflow-y-auto">
            {filteredFixtures.slice(0, 60).map((f) => {
              const isThisAnalyzing = analyzingId === f.id;
              const isSelected = selectedMatch?.fixture.id === f.id;

              return (
                <div
                  key={f.id}
                  className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10"
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
                    className="shrink-0 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {isThisAnalyzing ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Učitavam…
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


