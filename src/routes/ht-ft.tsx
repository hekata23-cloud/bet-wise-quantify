import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock, RefreshCw, Search, Settings, ShieldAlert, Zap } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { computeHtFtAnalysis, type HtFtAnalysis } from "@/lib/ht-ft";
import { evaluatePredictionIntegrity, footballContradiction } from "@/lib/prediction-integrity";
import { IntegrityPanel } from "@/components/IntegrityPanel";
import { analyze } from "@/lib/zlatni-engine";
import { getApiKey, guarded, readState, resetGuard, zagrebDay } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/ht-ft")({
  head: () => ({
    meta: [
      {
        title: "HT/FT Sharp Matrix · Poluvrijeme / Kraj · Andromeda AI",
      },
      {
        name: "description",
        content:
          "Profesionalna HT/FT analiza s fer kvotama, modelom golova po poluvremenima i zaštitom API-Football računa.",
      },
      {
        property: "og:title",
        content: "HT/FT Sharp Matrix · Andromeda AI",
      },
      {
        property: "og:description",
        content: "Kvantitativna analiza svih devet HT/FT ishoda bez kladioničarske marže.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HtFtPage,
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

export function HtFtPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<ZtFixture | null>(null);
  const [analysisResult, setAnalysisResult] = useState<HtFtAnalysis | null>(null);

  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const guard = readState();

  const handleWait = (ms: number, reason: string) => {
    setStatusMsg(`Zaštita API-ja: ${reason}. Kratko čekanje ${Math.ceil(ms / 1000)} s…`);
  };

  const handleResetGuard = () => {
    resetGuard();
    setStatusMsg(
      "Zaštita API-ja je poništena. Sada možete ponovno učitati ili analizirati utakmicu.",
    );
  };

  const handleLoadFixtures = async () => {
    const apiKey = getApiKey();

    if (!apiKey) {
      setStatusMsg(
        "Prvo unesite API-Football ključ u Postavkama, zatim kliknite Spremi i aktiviraj.",
      );
      setSettingsOpen(true);
      return;
    }

    setLoadingFixtures(true);
    setStatusMsg("Učitavam današnje utakmice…");

    try {
      const result = await guarded(
        "htft.fixtures",
        1,
        () =>
          getZtFixtures({
            data: {
              date: zagrebDay(),
              apiKey,
            },
          }),
        handleWait,
      );

      if (result.error) {
        const message =
          result.error === "RATE_LIMIT"
            ? "API-Football je privremeno ograničio pozive. Pričekajte 15 sekundi, kliknite Poništi blokadu i pokušajte ponovno."
            : result.error;

        setFixtures([]);
        setStatusMsg(`Učitavanje nije uspjelo: ${message}`);
        return;
      }

      const playable = result.fixtures.filter((fixture) =>
        ["NS", "TBD", "1H", "HT", "2H"].includes(fixture.status),
      );

      setFixtures(playable);

      if (playable.length === 0) {
        setStatusMsg("Za današnji dan nema dostupnih utakmica. Pokušajte ponovno kasnije.");
        return;
      }

      setStatusMsg(
        `Učitano je ${playable.length} utakmica. Kliknite Analiziraj pokraj željene utakmice.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Nepoznata greška.";
      setStatusMsg(`Učitavanje nije uspjelo: ${message}`);
    } finally {
      setLoadingFixtures(false);
    }
  };

  const handleAnalyzeMatch = async (fixture: ZtFixture) => {
    const apiKey = getApiKey();

    if (!apiKey) {
      setStatusMsg("Nedostaje API-Football ključ. Unesite ga u Postavkama i spremite.");
      setSettingsOpen(true);
      return;
    }

    setAnalyzingId(fixture.id);
    setSelectedFixture(fixture);
    setAnalysisResult(null);
    setStatusMsg(`Analiziram HT/FT tržište: ${fixture.home} — ${fixture.away}…`);

    try {
      /*
       * Lite način radi samo jedan API poziv:
       * /odds?fixture=ID
       *
       * Ne poziva spori /predictions endpoint i zato ne smije zamrznuti karticu.
       */
      const result = await guarded(
        `htft.lite.${fixture.id}`,
        1,
        () =>
          getZtMatch({
            data: {
              id: fixture.id,
              apiKey,
              lite: true,
            },
          }),
        handleWait,
      );

      if (result.error) {
        const message =
          result.error === "RATE_LIMIT"
            ? "API-Football je privremeno ograničio pozive. Pričekajte 15 sekundi, kliknite Poništi blokadu i pokušajte ponovno."
            : result.error;

        setStatusMsg(`Analiza nije uspjela: ${message}`);
        return;
      }

      const markets = result.markets ?? {};
      const hasMarkets = Object.keys(markets).length > 0;

      if (!hasMarkets) {
        setStatusMsg(
          "Za ovu utakmicu dostupne kladionice još nisu objavile kvote. Odaberite drugu utakmicu ili pokušajte kasnije.",
        );
        return;
      }

      const fullAnalysis = analyze(markets, result.home ?? null, result.away ?? null);

      const htFtAnalysis = computeHtFtAnalysis(
        fullAnalysis,
        `${fixture.home} — ${fixture.away}`,
        fixture.league,
        formatMatchTime(fixture.time),
      );

      setAnalysisResult(htFtAnalysis);

      const bookmaker = result.bookmaker ? ` Izvor kvota: ${result.bookmaker}.` : "";

      setStatusMsg(`HT/FT analiza je dovršena za ${fixture.home} — ${fixture.away}.${bookmaker}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Nepoznata greška.";

      setStatusMsg(`Analiza nije uspjela: ${message}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  // Prediction Integrity Gate — vjerojatnosti punog vremena izvedene iz HT/FT matrice
  const ftProbs = useMemo(() => {
    if (!analysisResult) return null;
    const sum = (codes: string[]) =>
      codes.reduce(
        (total, code) => total + (analysisResult.outcomes.find((o) => o.code === code)?.prob ?? 0),
        0,
      );
    return {
      home: sum(["1/1", "X/1", "2/1"]),
      draw: sum(["1/X", "X/X", "2/X"]),
      away: sum(["1/2", "X/2", "2/2"]),
    };
  }, [analysisResult]);

  const ftSelected = (code: string): "HOME" | "DRAW" | "AWAY" => {
    const final = code.split("/")[1];
    return final === "1" ? "HOME" : final === "X" ? "DRAW" : "AWAY";
  };

  const mainTipIntegrity = useMemo(() => {
    if (!analysisResult || !ftProbs) return null;
    const mt = analysisResult.mainTip;
    return evaluatePredictionIntegrity({
      probability: mt.prob,
      odds: mt.bookieOdd,
      dataQuality: mt.bookieOdd ? 0.75 : 0.45,
      fallbackModel: !mt.bookieOdd,
      contradictory: footballContradiction({ selected: ftSelected(mt.pick), ...ftProbs }),
      market: `HT/FT ${mt.pick}`,
    });
  }, [analysisResult, ftProbs]);

  const sharpValueIntegrity = useMemo(() => {
    if (!analysisResult || !ftProbs || !analysisResult.sharpValueTip) return null;
    const sv = analysisResult.sharpValueTip;
    return evaluatePredictionIntegrity({
      probability: sv.prob,
      odds: sv.bookieOdd,
      dataQuality: sv.bookieOdd ? 0.75 : 0.45,
      fallbackModel: !sv.bookieOdd,
      contradictory: footballContradiction({ selected: ftSelected(sv.pick), ...ftProbs }),
      market: `HT/FT ${sv.pick}`,
    });
  }, [analysisResult, ftProbs]);

  const reversalIntegrity = useMemo(() => {
    if (!analysisResult || !ftProbs || !analysisResult.reversalRadar.hasReversalSignal) return null;
    const rr = analysisResult.reversalRadar;
    return evaluatePredictionIntegrity({
      probability: rr.prob,
      odds: rr.bookieOdd,
      dataQuality: rr.bookieOdd ? 0.7 : 0.45,
      fallbackModel: !rr.bookieOdd,
      contradictory: footballContradiction({
        selected: ftSelected(rr.pick === "Nema signala" ? "2/1" : rr.pick),
        ...ftProbs,
      }),
      market: `HT/FT ${rr.pick}`,
    });
  }, [analysisResult, ftProbs]);

  const outcomeIntegrities = useMemo(() => {
    if (!analysisResult || !ftProbs) return [];
    return analysisResult.outcomes.map((o) =>
      evaluatePredictionIntegrity({
        probability: o.prob,
        odds: o.bookieOdd,
        dataQuality: o.bookieOdd ? 0.7 : 0.45,
        fallbackModel: !o.bookieOdd,
        contradictory: footballContradiction({ selected: ftSelected(o.code), ...ftProbs }),
        market: `HT/FT ${o.code}`,
      }),
    );
  }, [analysisResult, ftProbs]);

  const filteredFixtures = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) {
      return fixtures;
    }

    return fixtures.filter((fixture) => {
      return (
        fixture.home.toLocaleLowerCase().includes(query) ||
        fixture.away.toLocaleLowerCase().includes(query) ||
        fixture.league.toLocaleLowerCase().includes(query)
      );
    });
  }, [fixtures, searchQuery]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Clock className="h-5 w-5" />
              </span>

              <div>
                <h1 className="text-xl font-bold tracking-tight">HT/FT Sharp Matrix</h1>
                <p className="text-xs text-muted-foreground">
                  Poluvrijeme / kraj · svih 9 ishoda · fer kvote bez marže
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" />
              Postavke
            </button>

            <button
              type="button"
              onClick={handleResetGuard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Poništi blokadu
            </button>

            <button
              type="button"
              onClick={handleLoadFixtures}
              disabled={loadingFixtures}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingFixtures ? "animate-spin" : ""}`} />
              {loadingFixtures ? "Učitavam…" : "Učitaj utakmice dana"}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            <span>{statusMsg}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              Pozivi danas: {guard.used}/95
            </span>
          </div>
        )}
      </section>

      {fixtures.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs font-semibold text-muted-foreground">
              Dostupne utakmice: {filteredFixtures.length}
            </p>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Traži klub ili ligu…"
                className="w-full rounded-xl border border-border bg-background/50 py-1.5 pl-8 pr-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              const isAnalyzing = analyzingId === fixture.id;

              return (
                <article
                  key={fixture.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                    isSelected ? "border-amber-500 bg-amber-500/10" : "border-border/60 bg-card/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-muted-foreground">{fixture.league}</p>
                    <p className="truncate text-xs font-semibold text-foreground">
                      {fixture.home} — {fixture.away}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatMatchTime(fixture.time)} · Zagreb
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAnalyzeMatch(fixture)}
                    disabled={analyzingId !== null}
                    className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAnalyzing ? "Računam…" : "Analiziraj"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {analysisResult && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-5">
            <p className="text-xs text-muted-foreground">{analysisResult.league}</p>

            <div className="mt-1 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{analysisResult.match}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Početak: {analysisResult.time} · Ukupni xG:{" "}
                  {(analysisResult.lh + analysisResult.la).toFixed(2)} · Domaći{" "}
                  {analysisResult.lh.toFixed(2)} / Gost {analysisResult.la.toFixed(2)}
                </p>
              </div>

              <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border/50 bg-muted/20 text-center">
                <div className="p-2">
                  <p className="text-[10px] text-muted-foreground">1 na 1H</p>
                  <p className="text-sm font-bold">{analysisResult.ht1X2.home}%</p>
                  <p className="text-[10px] text-muted-foreground">
                    {analysisResult.ht1X2.fairHome}
                  </p>
                </div>

                <div className="p-2">
                  <p className="text-[10px] text-muted-foreground">X na 1H</p>
                  <p className="text-sm font-bold text-amber-500">{analysisResult.ht1X2.draw}%</p>
                  <p className="text-[10px] text-muted-foreground">
                    {analysisResult.ht1X2.fairDraw}
                  </p>
                </div>

                <div className="p-2">
                  <p className="text-[10px] text-muted-foreground">2 na 1H</p>
                  <p className="text-sm font-bold">{analysisResult.ht1X2.away}%</p>
                  <p className="text-[10px] text-muted-foreground">
                    {analysisResult.ht1X2.fairAway}
                  </p>
                </div>

                <div className="p-2">
                  <p className="text-[10px] text-muted-foreground">0:0 na HT</p>
                  <p className="text-sm font-bold text-primary">{analysisResult.p00AtHalf}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Glavni HT/FT tip
              </p>
              <p className="mt-2 text-3xl font-black">{analysisResult.mainTip.pick}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {analysisResult.mainTip.description}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {analysisResult.mainTip.reasoning}
              </p>
              <IntegrityPanel result={mainTipIntegrity} title="Integritet: glavni HT/FT tip" />
              <div className="mt-4 flex justify-between border-t border-primary/20 pt-3 text-xs">
                <span>
                  Šansa: <strong>{(analysisResult.mainTip.prob * 100).toFixed(1)}%</strong>
                </span>
                <span>
                  Fer: <strong>{analysisResult.mainTip.fairOdd.toFixed(2)}</strong>
                </span>
              </div>
            </article>

            <article className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                Sharp value
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-500">
                {analysisResult.sharpValueTip?.pick ?? "—"}
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {analysisResult.sharpValueTip?.description ?? "Nema value tipa"}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {analysisResult.sharpValueTip?.reasoning ?? "Nema dostupne kvote za usporedbu."}
              </p>
              {analysisResult.sharpValueTip && (
                <IntegrityPanel
                  result={sharpValueIntegrity}
                  compact={false}
                  title="Integritet: sharp value"
                />
              )}
              <div className="mt-4 flex justify-between border-t border-emerald-500/20 pt-3 text-xs">
                <span>
                  Šansa:{" "}
                  <strong>{((analysisResult.sharpValueTip?.prob ?? 0) * 100).toFixed(1)}%</strong>
                </span>
                <span>
                  Fer: <strong>{analysisResult.sharpValueTip?.fairOdd.toFixed(2) ?? "—"}</strong>
                </span>
              </div>
            </article>

            <article className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">
                Sigurnosni hedge
              </p>
              <p className="mt-2 text-3xl font-black text-sky-500">
                {analysisResult.safeHedgeTip.pick}
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {analysisResult.safeHedgeTip.title}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {analysisResult.safeHedgeTip.reasoning}
              </p>
              <div className="mt-4 flex justify-between border-t border-sky-500/20 pt-3 text-xs">
                <span>
                  Šansa: <strong>{(analysisResult.safeHedgeTip.prob * 100).toFixed(1)}%</strong>
                </span>
                <span>
                  Fer: <strong>{analysisResult.safeHedgeTip.fairOdd.toFixed(2)}</strong>
                </span>
              </div>
            </article>

            <article
              className={`rounded-2xl border p-4 ${
                analysisResult.reversalRadar.hasReversalSignal
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border/60 bg-card/40"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-semibold uppercase tracking-wide">Radar preokreta</p>
              </div>
              <p className="mt-2 text-3xl font-black">{analysisResult.reversalRadar.pick}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                Ulog: {analysisResult.reversalRadar.recommendedStake}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {analysisResult.reversalRadar.note}
              </p>
              {analysisResult.reversalRadar.hasReversalSignal && (
                <IntegrityPanel
                  result={reversalIntegrity}
                  compact={false}
                  title="Integritet: radar preokreta"
                />
              )}
              <div className="mt-4 flex justify-between border-t border-border/40 pt-3 text-xs">
                <span>
                  Šansa: <strong>{(analysisResult.reversalRadar.prob * 100).toFixed(1)}%</strong>
                </span>
                <span>
                  Fer: <strong>{analysisResult.reversalRadar.fairOdd.toFixed(2)}</strong>
                </span>
              </div>
            </article>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/70 p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Svih 9 HT/FT ishoda
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analysisResult.outcomes.map((outcome, outcomeIdx) => {
                const isMain = outcome.code === analysisResult.mainTip.pick;

                return (
                  <article
                    key={outcome.code}
                    className={`rounded-xl border p-3.5 ${
                      isMain
                        ? "border-primary bg-primary/10"
                        : outcome.isValue
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-border/60 bg-card/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xl font-black">{outcome.code}</p>
                        <p className="text-[10px] text-muted-foreground">{outcome.categoryLabel}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <IntegrityPanel result={outcomeIntegrities[outcomeIdx]} compact />
                        {outcome.isTrap && (
                          <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            ZAMKA
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">Vjerojatnost</span>
                        <strong>{outcome.probPercent}%</strong>
                      </div>

                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, outcome.probPercent * 2)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-2.5 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Fer kvota</p>
                        <strong>{outcome.fairOdd.toFixed(2)}</strong>
                      </div>

                      <div>
                        <p className="text-[10px] text-muted-foreground">Kladionica</p>
                        <strong className="text-primary">
                          {outcome.bookieOdd ? outcome.bookieOdd.toFixed(2) : "—"}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          setStatusMsg("API-Football ključ je spremljen. Sada kliknite „Učitaj utakmice dana”.");
        }}
      />
    </div>
  );
}
