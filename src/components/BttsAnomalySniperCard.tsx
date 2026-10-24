import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Crosshair,
  Flame,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Zap,
  Clock,
  Sparkles,
  MessageCircle,
  Plus,
  Check,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeSniperAnomaly,
  type SniperAnalysisResult,
  type SniperMatchInput,
} from "@/lib/anomaly-sniper";
import { dodajUKorpu, loadKorpa } from "@/lib/korpa";
import { spremiKontekstMeca } from "@/lib/ai-context";

const CACHE_KEY = "andromeda.sniper.cache.v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 sati

interface CachedSniperData {
  timestamp: number;
  results: SniperAnalysisResult[];
}

export function BttsAnomalySniperCard({
  analyzedMatches = [],
  onSelectMatch,
}: {
  analyzedMatches?: SniperAnalysisResult[];
  onSelectMatch?: (match: SniperAnalysisResult) => void;
}) {
  const [items, setItems] = useState<SniperAnalysisResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"all" | "golden" | "clash">("all");
  const [showQuickAdder, setShowQuickAdder] = useState(false);

  // Stanje za brzi ručni unosi / testiranje kvota 2.20 - 2.60
  const [customHome, setCustomHome] = useState("Arsenal");
  const [customAway, setCustomAway] = useState("Chelsea");
  const [customXgHome, setCustomXgHome] = useState("1.65");
  const [customXgAway, setCustomXgAway] = useState("1.35");
  const [customOddOver, setCustomOddOver] = useState("2.40");
  const [customOddBtts, setCustomOddBtts] = useState("2.25");
  const [customPpdaHome, setCustomPpdaHome] = useState("8.2");
  const [customPpdaAway, setCustomPpdaAway] = useState("8.9");
  const [customRefPens, setCustomRefPens] = useState("0.42");
  const [customRefCards, setCustomRefCards] = useState("5.1");

  // Provjeri selekcije koje su već u košarici
  const refreshAdded = useCallback(() => {
    const k = loadKorpa();
    setAddedIds(new Set(k.map((x) => x.id)));
  }, []);

  useEffect(() => {
    refreshAdded();
    window.addEventListener("andromeda:korpa", refreshAdded);
    return () => window.removeEventListener("andromeda:korpa", refreshAdded);
  }, [refreshAdded]);

  // Učitaj iz 12h lokalnog keša pri montiranju
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedSniperData;
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.results)) {
          setItems(parsed.results);
        }
      }
    } catch {
      // Ignoriraj greške čitanja
    }
  }, []);

  // Kad stignu analize s vanjske stranice, spoji ih u listu
  useEffect(() => {
    if (analyzedMatches.length > 0) {
      setItems((prev) => {
        const map = new Map<string, SniperAnalysisResult>();
        for (const item of analyzedMatches) map.set(item.match, item);
        for (const item of prev) if (!map.has(item.match)) map.set(item.match, item);
        const merged = Array.from(map.values());
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), results: merged })
          );
        } catch {
          // localStorage pun
        }
        return merged;
      });
    }
  }, [analyzedMatches]);

  // Dodavanje oklade izravno u Korpu (Virtual Bet Slip)
  const handleAddToSlip = (
    item: SniperAnalysisResult,
    cell: SniperAnalysisResult["oddsCells"]["over25"] | SniperAnalysisResult["oddsCells"]["bttsYes"]
  ) => {
    const tipId = `nogomet|${item.match}|${cell.market}|${cell.tip}`;
    dodajUKorpu({
      id: tipId,
      sport: "nogomet",
      utakmica: item.match,
      liga: item.league,
      trziste: cell.market,
      tip: cell.tip,
      kvota: cell.odd,
      vjerojatnost: cell.prob,
      fixtureId: item.fixtureId,
    });
    setAddedIds((prev) => new Set(prev).add(tipId));
    toast.success(`Dodano na listić: ${cell.tip} @${cell.odd.toFixed(2)} (${item.match})`);
  };

  // Slanje u AI chat (Luna & Orion sinkronizacija)
  const handleAskAI = (item: SniperAnalysisResult) => {
    spremiKontekstMeca({
      naslov: item.match,
      liga: item.league,
      vrijeme: item.time,
      kvote: {
        o25: item.oddsCells.over25.odd,
        u25: item.oddsCells.under25.odd,
        bttsDa: item.oddsCells.bttsYes.odd,
        bttsNe: item.oddsCells.bttsNo.odd,
      },
      lambdaDom: item.lambdaHome,
      lambdaGost: item.lambdaAway,
      lambdaUkupno: item.lambdaTotal,
      konsenzus: {
        o25: item.probOver25,
        bttsDa: item.probBttsYes,
      },
      coreTip: {
        label: item.goldenSniper
          ? item.oddsCells.over25.isGoldenSniper
            ? "Over 2.5 (Golden Sniper)"
            : "BTTS GG (Golden Sniper)"
          : item.probBttsYes >= item.probOver25
            ? "BTTS GG"
            : "Over 2.5",
        p: Math.max(item.probBttsYes, item.probOver25),
        kvota: item.probBttsYes >= item.probOver25 ? item.oddsCells.bttsYes.odd : item.oddsCells.over25.odd,
        edge: item.probBttsYes >= item.probOver25 ? item.oddsCells.bttsYes.edge : item.oddsCells.over25.edge,
        kellyPct: 2.5,
        kljuc: "sniper",
      },
      altTip: {
        label: item.probOver25 >= 0.5 ? "Over 2.5" : "BTTS GG",
        p: Math.min(item.probBttsYes, item.probOver25),
      },
      mc: {
        btts: item.probBttsYes,
        o15: Math.min(0.95, item.probOver25 + 0.20),
        o25: item.probOver25,
        o35: Math.max(0.15, item.probOver25 - 0.22),
        p1: 0.45,
        pX: 0.25,
        p2: 0.30,
      },
      ocjena: item.goldenSniper ? "A+" : "A",
      povjerenje: item.anomalyScore,
      brojIzvora: 3,
      rizici: [
        item.tacticalClash.hasClash ? "Visoki tempo presinga" : "Standardna varijanca",
      ],
      sniperAnomaly: item,
    });
    toast.success(`Kontekst spremljen za Lunu i Oriona: "${item.match}"`);
  };

  // Ručni izračun za brzi test
  const handleCalculateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const lH = parseFloat(customXgHome.replace(",", ".")) || 1.5;
    const lA = parseFloat(customXgAway.replace(",", ".")) || 1.2;
    const ppdaH = parseFloat(customPpdaHome.replace(",", ".")) || null;
    const ppdaA = parseFloat(customPpdaAway.replace(",", ".")) || null;
    const o25 = parseFloat(customOddOver.replace(",", ".")) || 2.40;
    const btts = parseFloat(customOddBtts.replace(",", ".")) || 2.25;
    const pens = parseFloat(customRefPens.replace(",", ".")) || null;
    const cards = parseFloat(customRefCards.replace(",", ".")) || null;

    const res = computeSniperAnomaly({
      match: `${customHome} — ${customAway}`,
      homeTeam: customHome,
      awayTeam: customAway,
      league: "Custom / Simulacija",
      time: "Danas",
      lambdaHome: lH,
      lambdaAway: lA,
      ppdaHome: ppdaH,
      ppdaAway: ppdaA,
      referee: pens != null || cards != null ? {
        name: "Glavni sudac",
        penaltiesPerGame: pens ?? undefined,
        yellowCardsPerGame: cards ?? undefined,
      } : null,
      bookieOdds: {
        over25: o25,
        bttsYes: btts,
      },
    });

    setItems((prev) => {
      const filtered = prev.filter((x) => x.match !== res.match);
      const next = [res, ...filtered];
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), results: next })
        );
      } catch {
        // ignore
      }
      return next;
    });

    toast.success(`Izračunana anomalija za ${res.match} (Anomaly score: ${res.anomalyScore}%)`);
    setShowQuickAdder(false);
  };

  const filteredItems = useMemo(() => {
    if (activeTab === "golden") return items.filter((x) => x.goldenSniper);
    if (activeTab === "clash") return items.filter((x) => x.tacticalClash.hasClash);
    return items;
  }, [items, activeTab]);

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card/90 via-card to-amber-950/10 p-5 shadow-lg space-y-4">
      {/* Zaglavlje kartice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner">
            <Crosshair className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                BTTS & Over 2.5 Anomaly Master
              </h2>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 border border-amber-500/40">
                v9 Snajper
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Izolacija anomalija šuma, PPDA taktički sudar i Frank kopula za prolaze na kvotama 2.20 – 2.60.
            </p>
          </div>
        </div>

        {/* Kartični filtri i gumb za simulator */}
        <div className="flex items-center gap-1.5 self-start sm:self-center flex-wrap">
          <button
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "all"
                ? "bg-amber-500 text-black font-bold"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Sve ({items.length})
          </button>
          <button
            onClick={() => setActiveTab("golden")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1 ${
              activeTab === "golden"
                ? "bg-amber-400 text-black font-bold"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3 w-3 text-amber-300" />
            Golden ({items.filter((x) => x.goldenSniper).length})
          </button>
          <button
            onClick={() => setActiveTab("clash")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1 ${
              activeTab === "clash"
                ? "bg-amber-400 text-black font-bold"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-3 w-3 text-amber-300" />
            PPDA ({items.filter((x) => x.tacticalClash.hasClash).length})
          </button>

          <button
            onClick={() => setShowQuickAdder(!showQuickAdder)}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors flex items-center gap-1"
          >
            <Sliders className="h-3 w-3" />
            Simulator kvota
            {showQuickAdder ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Brzi simulator kvota 2.40 i anomalija */}
      {showQuickAdder && (
        <form
          onSubmit={handleCalculateCustom}
          className="rounded-xl border border-amber-500/30 bg-background/60 p-4 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Testiranje anomalija & Kvote 2.40 (Offline detektor)
            </span>
            <span className="text-[11px] text-muted-foreground">Bez trošenja API poziva</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Domaćin</label>
              <input
                type="text"
                value={customHome}
                onChange={(e) => setCustomHome(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-foreground"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Gost</label>
              <input
                type="text"
                value={customAway}
                onChange={(e) => setCustomAway(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-foreground"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">xG Dom / Gost</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={customXgHome}
                  onChange={(e) => setCustomXgHome(e.target.value)}
                  className="w-1/2 rounded border border-border bg-card px-2 py-1 text-foreground"
                />
                <input
                  type="text"
                  value={customXgAway}
                  onChange={(e) => setCustomXgAway(e.target.value)}
                  className="w-1/2 rounded border border-border bg-card px-2 py-1 text-foreground"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">PPDA Dom / Gost</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={customPpdaHome}
                  onChange={(e) => setCustomPpdaHome(e.target.value)}
                  className="w-1/2 rounded border border-border bg-card px-2 py-1 text-foreground"
                  placeholder="8.5"
                />
                <input
                  type="text"
                  value={customPpdaAway}
                  onChange={(e) => setCustomPpdaAway(e.target.value)}
                  className="w-1/2 rounded border border-border bg-card px-2 py-1 text-foreground"
                  placeholder="9.0"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Kvota Over 2.5</label>
              <input
                type="text"
                value={customOddOver}
                onChange={(e) => setCustomOddOver(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-amber-300 font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Kvota BTTS GG</label>
              <input
                type="text"
                value={customOddBtts}
                onChange={(e) => setCustomOddBtts(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-amber-300 font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Sudac Penali / meč</label>
              <input
                type="text"
                value={customRefPens}
                onChange={(e) => setCustomRefPens(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-foreground"
                placeholder="0.42"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Sudac Žuti / meč</label>
              <input
                type="text"
                value={customRefCards}
                onChange={(e) => setCustomRefCards(e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1 text-foreground"
                placeholder="5.1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black px-3.5 py-1.5 text-xs font-bold transition-colors shadow-sm"
            >
              Pokreni Sniper izračun
            </button>
          </div>
        </form>
      )}

      {/* Prikaz popisa utakmica */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-8 text-center space-y-2">
          <Crosshair className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
          <p className="text-sm font-medium text-foreground">
            Nema još analiziranih parova u Sniper registru.
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Kliknite "Analiziraj" na bilo kojoj utakmici s liste ispod ili otvorite simulator kvota iznad.
            Model automatski izolira lažne defenzivne serije i provjerava suca.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isO25InSlip = addedIds.has(`nogomet|${item.match}|O/U 2.5|Over 2.5`);
            const isBttsInSlip = addedIds.has(`nogomet|${item.match}|BTTS|GG`);

            return (
              <div
                key={item.match}
                className={`rounded-xl border p-4 transition-all duration-200 ${
                  item.goldenSniper
                    ? "border-amber-500/60 bg-amber-500/10 shadow-sm"
                    : "border-border/60 bg-card/60 hover:border-border"
                }`}
              >
                {/* Gornji red: Utakmica, liga, bedževi */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{item.match}</span>
                      <span className="text-[11px] text-muted-foreground">({item.league})</span>
                      <span className="text-[11px] text-muted-foreground">· {item.time}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Anomaly Score */}
                    <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                      <span>ANOMALY:</span>
                      <span>{item.anomalyScore}%</span>
                    </div>

                    {/* Game-State Hazard */}
                    <div className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                      <span>HAZARD:</span>
                      <span>{(item.hazardRate * 100).toFixed(0)}%</span>
                    </div>

                    {/* Golden Sniper Badge */}
                    {item.goldenSniper && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-sm animate-pulse">
                        <Sparkles className="h-3 w-3" />
                        HIGH ODDS HIDDEN VALUE
                      </span>
                    )}

                    {/* High Odds Value Alert ako nije golden */}
                    {!item.goldenSniper && item.highOddsAlert && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                        ⚡ VALUE ALERT (P≥56% @2.10+)
                      </span>
                    )}
                  </div>
                </div>

                {/* Srednji red: Taktički indikatori */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-background/50 rounded-lg p-2.5 mb-3 border border-border/40">
                  <div className="flex items-start gap-2">
                    <Zap className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">Taktički sudar: </span>
                      <span className="text-muted-foreground">{item.tacticalClash.description}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">Sudac & Penali: </span>
                      <span className="text-muted-foreground">{item.refereeImpact.description}</span>
                    </div>
                  </div>
                </div>

                {/* Donji red: Kvote s izravnim slanjem na listić */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/30">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Over 2.5 gumb */}
                    <button
                      onClick={() => handleAddToSlip(item, item.oddsCells.over25)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                        isO25InSlip
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : item.oddsCells.over25.isGoldenSniper
                            ? "bg-amber-400 text-black border-amber-500 font-bold hover:bg-amber-300"
                            : "bg-background/80 hover:bg-muted text-foreground border-border/60"
                      }`}
                    >
                      {isO25InSlip ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      <span>Over 2.5:</span>
                      <span className="font-mono">{item.oddsCells.over25.odd.toFixed(2)}</span>
                      <span className="text-[10px] opacity-75">
                        ({(item.probOver25 * 100).toFixed(0)}% · Edge{" "}
                        {item.oddsCells.over25.edge >= 0 ? "+" : ""}
                        {(item.oddsCells.over25.edge * 100).toFixed(0)}%)
                      </span>
                    </button>

                    {/* BTTS GG gumb */}
                    <button
                      onClick={() => handleAddToSlip(item, item.oddsCells.bttsYes)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                        isBttsInSlip
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : item.oddsCells.bttsYes.isGoldenSniper
                            ? "bg-amber-400 text-black border-amber-500 font-bold hover:bg-amber-300"
                            : "bg-background/80 hover:bg-muted text-foreground border-border/60"
                      }`}
                    >
                      {isBttsInSlip ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      <span>BTTS GG:</span>
                      <span className="font-mono">{item.oddsCells.bttsYes.odd.toFixed(2)}</span>
                      <span className="text-[10px] opacity-75">
                        ({(item.probBttsYes * 100).toFixed(0)}% · Edge{" "}
                        {item.oddsCells.bttsYes.edge >= 0 ? "+" : ""}
                        {(item.oddsCells.bttsYes.edge * 100).toFixed(0)}%)
                      </span>
                    </button>
                  </div>

                  {/* Akcija: Pitaj Lunu / Orion */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAskAI(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Spremi u AI kontekst za analizu u AI Chatu"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-primary" />
                      Pitaj Lunu / Orion
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
