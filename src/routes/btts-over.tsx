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
  ShieldCheck,
  Clock,
  Layers,
  Sliders,
  Trophy,
} from "lucide-react";

export const Route = createFileRoute("/btts-over")({
  head: () => ({
    meta: [
      { title: "2.5 & BTTS Sharp Matrix · Andromeda AI" },
      {
        name: "description",
        content:
          "Kvantitativna analiza 2.5 Over/Under linija, Azijskih hendikepa golova, 1H dinamike i Oba Daju Gol (GG/NG).",
      },
      { property: "og:title", content: "2.5 & BTTS Sharp Matrix · Andromeda AI" },
      {
        property: "og:description",
        content:
          "Profesionalni model za oklade na golove s azijskim linijama, pobjednik+GG tržištima i de-vig fer kvotama.",
      },
    ],
  }),
  component: BttsOverPage,
});

export function BttsOverPage() {
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<ZtFixture | null>(null);
  const [analysisResult, setAnalysisResult] = useState<BttsOverAnalysis | null>(null);
  const [analyzedList, setAnalyzedList] = useState<BttsOverAnalysis[]>([]);

  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ručni xG simulator
  const [simHome, setSimHome] = useState("Arsenal");
  const [simAway, setSimAway] = useState("Chelsea");
  const [simXgHome, setSimXgHome] = useState("1.85");
  const [simXgAway, setSimXgAway] = useState("1.30");

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

  // Učitavanje utakmica dana
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
        setStatusMsg(`Učitano ${playable.length} utakmica. Kliknite "Analiziraj" za proračun.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Neuspjelo učitavanje utakmica");
    } finally {
      setLoading(false);
    }
  };

  // Analiza pojedinačne utakmice s API-ja
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
    setStatusMsg(`Modeliram golove, azijske linije i korelacije za: ${f.home} — ${f.away}…`);

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
      setAnalyzedList((prev) => {
        const filtered = prev.filter((item) => item.match !== bttsOverData.match);
        return [bttsOverData, ...filtered];
      });
      setStatusMsg(`✅ Izračunano: ${f.home} — ${f.away} (${res.bookmaker ?? "Kladionica"}).`);
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Greška pri analizi utakmice");
    } finally {
      setAnalyzingId(null);
    }
  };

    // Brzi simulator bez trošenja API poziva
  const handleSimulateCustom = () => {
    const hXg = parseFloat(simXgHome.replace(",", ".")) || 1.5;
    const aXg = parseFloat(simXgAway.replace(",", ".")) || 1.2;

    const fakeMarkets = {
      "Goals Over/Under": {
        "Over 2.5": 1.85,
        "Under 2.5": 1.95,
      },
      "Both Teams to Score": {
        "Yes": 1.75,
        "No": 2.05,
      },
      "Match Winner": {
        "Home": 1.95,
        "Draw": 3.40,
        "Away": 3.80,
      },
    };

    const engineAnalysis = analyze(fakeMarkets, null, null);
    engineAnalysis.lh = hXg;
    engineAnalysis.la = aXg;

    const res = computeBttsOverAnalysis(
      engineAnalysis,
      `${simHome} — ${simAway}`,
      "Ručna xG Simulacija",
      "Danas"
    );

    setAnalysisResult(res);
    setSelectedFixture({
      id: 999999,
      home: simHome,
      away: simAway,
      league: "Simulacija",
      leagueId: 0,
      season: 2026,
      homeId: 1,
      awayId: 2,
      time: new Date().toISOString(),
      status: "NS",
    });
    setAnalyzedList((prev) => [res, ...prev.filter((i) => i.match !== res.match)]);
    setStatusMsg(`✅ Izračunat kompletan model za ${simHome} — ${simAway} (xG ${hXg} : ${aXg})`);
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

  // Dnevni Radar liste
  const topOverRockets = useMemo(
    () => [...analyzedList].sort((a, b) => b.over25Prob - a.over25Prob).slice(0, 5),
    [analyzedList]
  );
  const topUnderBunkers = useMemo(
    () => [...analyzedList].sort((a, b) => b.under25Prob - a.under25Prob).slice(0, 5),
    [analyzedList]
  );
  const topBttsLocks = useMemo(
    () => [...analyzedList].sort((a, b) => b.bttsYesProb - a.bttsYesProb).slice(0, 5),
    [analyzedList]
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Zaglavlje */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary font-medium mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Sindikatski Kvantitativni Model Golova
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Flame className="h-7 w-7 text-amber-500" /> 2.5 & BTTS Sharp Matrix Pro
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Sveobuhvatna analitika golova: Azijske linije (refund na 2 gola), Pobjednik + GG,
            Dinamika 1. poluvremena i Radar golova.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" /> API Ključ
          </button>

          <button
            onClick={handleResetGuard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
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

      {/* BRZI xG SIMULATOR (Može se koristiti uvijek bez trošenja API-ja) */}
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Ekspresni xG Simulator Golova (Bez trošenja API-ja)</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">Trenutni proračun za bilo koji par</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Domaćin</label>
            <input
              type="text"
              value={simHome}
              onChange={(e) => setSimHome(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Gost</label>
            <input
              type="text"
              value={simAway}
              onChange={(e) => setSimAway(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">xG Domaćin (λH)</label>
            <input
              type="text"
              inputMode="decimal"
              value={simXgHome}
              onChange={(e) => setSimXgHome(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">xG Gost (λA)</label>
            <input
              type="text"
              inputMode="decimal"
              value={simXgAway}
              onChange={(e) => setSimXgAway(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            />
          </div>
          <button
            onClick={handleSimulateCustom}
            className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs py-2 px-3 transition-colors shadow-sm"
          >
            ⚡ Izračunaj Model
          </button>
        </div>
      </section>

      {/* PRIKAZ REZULTATA ANALIZE */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Upozorenje na zamku ako postoji */}
          {analysisResult.trapWarning && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider block text-amber-300">
                  ⚠️ Upozorenje: Kladioničarska Zamka Detektirana
                </span>
                <p className="mt-1 leading-relaxed">{analysisResult.trapWarning}</p>
              </div>
            </div>
          )}

          {/* Glavni Dashboard Kartice */}
          <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-6 shadow-md">
            {/* Header utakmice */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  Kvantitativni Golovni Profil & Matrica
                </span>
                <h2 className="text-2xl font-extrabold mt-0.5">{analysisResult.match}</h2>
                <p className="text-xs text-muted-foreground">
                  {analysisResult.league} · Status: {analysisResult.time}
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="bg-muted/40 rounded-xl p-2 px-3">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">xG Domaći</div>
                  <div className="font-mono font-bold text-base text-foreground">{analysisResult.lh.toFixed(2)}</div>
                </div>
                <div className="text-lg font-bold text-muted-foreground">:</div>
                <div className="bg-muted/40 rounded-xl p-2 px-3">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">xG Gosti</div>
                  <div className="font-mono font-bold text-base text-foreground">{analysisResult.la.toFixed(2)}</div>
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-2 px-3">
                  <div className="text-[10px] text-primary uppercase font-bold">Ukupni xG</div>
                  <div className="font-mono font-extrabold text-base text-primary">{analysisResult.totalXg}</div>
                </div>
              </div>
            </div>

            {/* Dva stupa: Standardni 2.5 O/U i BTTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Više / Manje 2.5 Gola */}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" /> Tržište: 2.5 Više / Manje
                  </h3>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary">
                    Preporuka: {analysisResult.mainOverUnderTip.pick}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div
                    className={`rounded-xl p-3 border ${
                      analysisResult.over25Prob >= 0.5
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/30 bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Više 2.5</span>
                      <span className="font-mono font-bold">{(analysisResult.over25Prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground font-semibold">{analysisResult.fairOver25}</span>
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

                  <div
                    className={`rounded-xl p-3 border ${
                      analysisResult.under25Prob >= 0.5
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/30 bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Manje 2.5</span>
                      <span className="font-mono font-bold">{(analysisResult.under25Prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground font-semibold">{analysisResult.fairUnder25}</span>
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
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-400" /> Tržište: Oba Daju Gol (BTTS)
                  </h3>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    Preporuka: {analysisResult.mainBttsTip.pick.includes("GG") ? "GG (Da)" : "NG (Ne)"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div
                    className={`rounded-xl p-3 border ${
                      analysisResult.bttsYesProb >= 0.5
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-border/30 bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">GG (Oba daju)</span>
                      <span className="font-mono font-bold">{(analysisResult.bttsYesProb * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground font-semibold">{analysisResult.fairBttsYes}</span>
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

                  <div
                    className={`rounded-xl p-3 border ${
                      analysisResult.bttsNoProb >= 0.5
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-border/30 bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">NG (Barem 1 ne daje)</span>
                      <span className="font-mono font-bold">{(analysisResult.bttsNoProb * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Fer kvota: <span className="font-mono text-foreground font-semibold">{analysisResult.fairBttsNo}</span>
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

            {/* PROFESIONALNI MODUL 1: Azijske Linije Golova (Asian Goal Lines) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" /> 1. Azijske Linije Golova (Asian Totals)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Profesionalna zaštita uloga: Azijski 2.0 vraća novac ako padnu točno 2 gola.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="p-3 font-semibold">Linija</th>
                      <th className="p-3 font-semibold text-center">Šansa Više (%)</th>
                      <th className="p-3 font-semibold text-center">Fer Kvota Više</th>
                      <th className="p-3 font-semibold text-center">Šansa Manje (%)</th>
                      <th className="p-3 font-semibold text-center">Fer Kvota Manje</th>
                      <th className="p-3 font-semibold">Profil Rizika / Zaštita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {analysisResult.asianLines.map((al) => (
                      <tr
                        key={al.line}
                        className={al.isRecommended ? "bg-emerald-500/10 font-semibold" : "hover:bg-muted/20"}
                      >
                        <td className="p-3 font-bold flex items-center gap-1.5">
                          {al.line}
                          {al.isRecommended && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400 uppercase">
                              Preporučeno
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-foreground">
                          {(al.overProb * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-center font-mono text-primary font-semibold">
                          @{al.fairOver.toFixed(2)}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-foreground">
                          {(al.underProb * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-center font-mono text-muted-foreground">
                          @{al.fairUnder.toFixed(2)}
                        </td>
                        <td className="p-3 text-muted-foreground text-[11px]">{al.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PROFESIONALNI MODUL 2 & 3: Pobjednik + GG i Dinamika 1. Poluvremena */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
              {/* MODUL 2: Pobjednik + GG / Win to Nil */}
              <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" /> 2. Pobjednik + GG & Win to Nil
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Visoke kvote kombiniranjem ishoda i golova.
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Top: {analysisResult.topCombo.shortLabel}
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {analysisResult.combos.map((c) => (
                    <div
                      key={c.key}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/40 hover:border-amber-500/40 transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-xs text-foreground truncate">{c.label}</div>
                        <div className="text-[10px] text-muted-foreground">{c.tag}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold text-amber-400">@ {c.fairOdd.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{(c.prob * 100).toFixed(1)}% šanse</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MODUL 3: Dinamika 1. poluvremena */}
              <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" /> 3. Dinamika 1. Poluvremena (1H)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Očekivani golovi u prvih 45 min: <strong className="text-foreground">{analysisResult.firstHalf.lambda1H}</strong>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="text-[11px] text-muted-foreground">1. poluvrijeme Više 0.5 (I1+)</div>
                    <div className="text-lg font-bold font-mono text-primary mt-1">
                      {(analysisResult.firstHalf.over05Prob * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Fer kvota: @{analysisResult.firstHalf.fairOver05}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="text-[11px] text-muted-foreground">1. poluvrijeme Više 1.5 (I2+)</div>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">
                      {(analysisResult.firstHalf.over15Prob * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Fer kvota: @{analysisResult.firstHalf.fairOver15}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="text-[11px] text-muted-foreground">Točno 1 ili 2 gola u 1H (I1-2)</div>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">
                      {(analysisResult.firstHalf.oneToTwoGoalsProb * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Fer kvota: @{analysisResult.firstHalf.fairOneToTwo}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="text-[11px] text-muted-foreground">Više golova u 2. poluvremenu</div>
                    <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                      {(analysisResult.firstHalf.moreGoals2HProb * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Fer kvota: @{analysisResult.firstHalf.fairMoreGoals2H}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-primary/10 p-2.5 text-[11px] text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    Šansa da 1. poluvrijeme završi 0:0 je samo{" "}
                    <strong>{(analysisResult.firstHalf.firstHalfCleanSheetProb * 100).toFixed(0)}%</strong>.
                  </span>
                </div>
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
            <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
          </div>
        </div>
      )}

      {/* PROFESIONALNI MODUL 4: Dnevni Radar Golova (Top liste dana) */}
      {analyzedList.length >= 2 && (
        <section className="rounded-3xl border border-border/80 bg-card p-6 space-y-5 shadow-sm">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" /> 4. Dnevni Radar Golova (Sortirana Top Lista)
            </h3>
            <p className="text-xs text-muted-foreground">
              Automatski rangirane utakmice prema Poissonovoj vjerojatnosti iz vaših analiza.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top Over 2.5 */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2.5">
              <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
                🚀 Top Over 2.5 Rakete
              </h4>
              <div className="space-y-1.5">
                {topOverRockets.map((m) => (
                  <div key={m.match} className="flex justify-between items-center text-xs p-2 rounded-lg bg-background/60">
                    <span className="font-semibold truncate max-w-[140px]">{m.match}</span>
                    <span className="font-mono font-bold text-primary">{(m.over25Prob * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Under 2.5 */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                🔒 Top Under 2.5 Bunkeri
              </h4>
              <div className="space-y-1.5">
                {topUnderBunkers.map((m) => (
                  <div key={m.match} className="flex justify-between items-center text-xs p-2 rounded-lg bg-background/60">
                    <span className="font-semibold truncate max-w-[140px]">{m.match}</span>
                    <span className="font-mono font-bold text-emerald-400">{(m.under25Prob * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top BTTS */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2.5">
              <h4 className="font-bold text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                🤝 Top BTTS (GG) Ziceri
              </h4>
              <div className="space-y-1.5">
                {topBttsLocks.map((m) => (
                  <div key={m.match} className="flex justify-between items-center text-xs p-2 rounded-lg bg-background/60">
                    <span className="font-semibold truncate max-w-[140px]">{m.match}</span>
                    <span className="font-mono font-bold text-amber-400">{(m.bttsYesProb * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Popis utakmica s API-ja */}
      {fixtures.length > 0 && (
        <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base">Današnje Utakmice — Odaberite par za analizu</h3>
              <p className="text-xs text-muted-foreground">
                Kliknite "Analiziraj" za trenutni proračun azijskih linija, oba daju gol i provjeru zamki.
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


