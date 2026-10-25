import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  TrendingUp,
  Percent,
  PlusCircle,
  Check,
  Flame,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { generateDnbAsianPicks, type DnbAsianPick } from "@/lib/dnb-asian-master";
import { LeagueTierFilter, type LeagueTier } from "@/components/LeagueTierFilter";
import { isTier1League } from "@/lib/league-tiers";

export const Route = createFileRoute("/dnb-asian-master")({
  head: () => ({
    meta: [
      { title: "DNB & Hendikep Master · Andromeda AI" },
      {
        name: "description",
        content: "DNB i Azijski Hendikep sigurnice s preko 78% vjerojatnosti i Skellam kalkulacijom povrata uloga.",
      },
    ],
  }),
  component: DnbAsianMasterPage,
});

// Reprezentativne utakmice s naprednim Skellam distribucijama
const SAMPLE_MATCHES = [
  { id: 101, home: "Arsenal", away: "Aston Villa", league: "Premier League", time: "18:30", lh: 2.15, la: 0.95, bookieOdds: { dnbHome: 1.36, homeOrDraw: 1.18 } },
  { id: 102, home: "Real Madrid", away: "Sevilla", league: "La Liga", time: "21:00", lh: 2.40, la: 0.70, bookieOdds: { dnbHome: 1.25, homeOrDraw: 1.12 } },
  { id: 103, home: "Dinamo Zagreb", away: "Gorica", league: "HNL", time: "17:00", lh: 2.10, la: 0.65, bookieOdds: { dnbHome: 1.22, homeOrDraw: 1.10 } },
  { id: 104, home: "Inter", away: "Lazio", league: "Serie A", time: "20:45", lh: 1.95, la: 0.90, bookieOdds: { dnbHome: 1.42, homeOrDraw: 1.22 } },
  { id: 105, home: "Bayern Munich", away: "Eintracht Frankfurt", league: "Bundesliga", time: "15:30", lh: 2.65, la: 0.85, bookieOdds: { dnbHome: 1.20, homeOrDraw: 1.09 } },
  { id: 106, home: "Paris Saint-Germain", away: "Lens", league: "Ligue 1", time: "21:00", lh: 2.30, la: 0.80, bookieOdds: { dnbHome: 1.30, homeOrDraw: 1.14 } },
  { id: 107, home: "Sporting CP", away: "Braga", league: "Primeira Liga", time: "21:30", lh: 2.05, la: 0.90, bookieOdds: { dnbHome: 1.38, homeOrDraw: 1.20 } },
  { id: 108, home: "Feyenoord", away: "Utrecht", league: "Eredivisie", time: "16:45", lh: 2.20, la: 0.80, bookieOdds: { dnbHome: 1.32, homeOrDraw: 1.16 } },
];

export function DnbAsianMasterPage() {
  const [tier, setTier] = useState<LeagueTier>("tier1");
  const [activeIds, setActiveIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pc.dnb-master-picks.v1") || "[]").map((x: { id: string }) => x.id)); } catch { return new Set(); }
  });

  const rawPicks = generateDnbAsianPicks(SAMPLE_MATCHES);
  const filteredPicks = rawPicks.filter((p) => {
    if (tier === "tier1") return isTier1League(p.league);
    return true;
  });

  const handleDodajNogu = (pick: DnbAsianPick) => {
    const slipId = `nogomet|${pick.match}|${pick.marketType}|${pick.selection}`;
    const saved = (() => { try { return JSON.parse(localStorage.getItem("pc.dnb-master-picks.v1") || "[]"); } catch { return []; } })();
    if (!saved.some((item: { id: string }) => item.id === slipId)) saved.push({ id: slipId, match: pick.match, league: pick.league, market: pick.marketType, selection: pick.selection, odds: pick.bookieOdd, probability: pick.trueProbability, fixtureId: pick.fixtureId });
    localStorage.setItem("pc.dnb-master-picks.v1", JSON.stringify(saved));
    setActiveIds((prev) => new Set([...prev, slipId]));
    toast.success(`${pick.selection} (@${pick.bookieOdd.toFixed(2)}) spremljen u lokalnu DNB listu.`);
  };

  const anchorCount = filteredPicks.filter((p) => p.isBankrollBuilder).length;
  const avgProb =
    filteredPicks.length > 0
      ? filteredPicks.reduce((acc, p) => acc + p.trueProbability, 0) / filteredPicks.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Zaglavlje stranice */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20 mb-2">
            <ShieldCheck className="h-4 w-4" /> SARP Brain v4.0 · Skellam Distribution
          </div>
          <h1 className="text-3xl font-bold tracking-tight">DNB & Hendikep Master</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Najsigurnija tržišta za građenje listića. Bira parove s pravom vjerojatnosti ≥ 78% uz Skellam zaštitu od remija.
          </p>
        </div>

        <LeagueTierFilter value={tier} onChange={setTier} />
      </div>

      {/* KPI traka */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Percent className="h-4 w-4 text-emerald-400" /> Prosječna Sigurnost
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {(avgProb * 100).toFixed(1)}%
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Flame className="h-4 w-4 text-amber-400" /> Bankroll Builders
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {anchorCount} <span className="text-xs text-muted-foreground font-normal">sidra za 30-par listić</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <ShieldCheck className="h-4 w-4 text-sky-400" /> DNB Zaštita
          </div>
          <div className="text-2xl font-bold text-sky-400">
            ⚪ Kvota 1.00
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Remi ne ruši listić</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-primary" /> Filter Sigurnosti
          </div>
          <div className="text-2xl font-bold text-primary">
            ≥ 78.0%
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Matematički cut-off</div>
        </div>
      </div>

      {/* Kartice parova */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPicks.map((pick) => {
          const slipId = `nogomet|${pick.match}|${pick.marketType}|${pick.selection}`;
          const isSelected = activeIds.has(slipId);

          return (
            <div
              key={pick.id}
              className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 hover:border-border transition-all shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-semibold text-foreground/80">{pick.league}</span>
                    <span>•</span>
                    <span>{pick.time}</span>
                  </div>
                  <h3 className="text-base font-bold tracking-tight mt-1">{pick.match}</h3>
                </div>

                {pick.isBankrollBuilder && (
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                    <ShieldCheck className="h-3 w-3" /> ANCHOR LEG
                  </span>
                )}
              </div>

              {/* Analitički prikaz vjerojatnosti i Skellama */}
              <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Prava matematička vjerojatnost:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {(pick.trueProbability * 100).toFixed(1)}%
                  </span>
                </div>
                {pick.pushRate > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Skellam rizik remija (Push):</span>
                    <span className="font-mono text-sky-400 font-medium">
                      {(pick.pushRate * 100).toFixed(1)}% (kvota 1.00)
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Fer kvota vs Kladionica:</span>
                  <span className="font-mono">
                    @{pick.fairOdd.toFixed(2)} vs <strong className="text-foreground">@{pick.bookieOdd.toFixed(2)}</strong> (EV {pick.evPercent >= 0 ? "+" : ""}{pick.evPercent}%)
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground/90 italic flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <span>{pick.reasoning}</span>
              </div>

              {/* Clickable odds cell pushing directly into Virtual Bet Slip */}
              <button
                type="button"
                onClick={() => handleDodajNogu(pick)}
                className={`w-full flex items-center justify-between rounded-xl px-4 py-3 font-semibold text-sm transition-all border ${
                  isSelected
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                    : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected ? <Check className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                  <span>{pick.selection}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-normal">{pick.line}</span>
                  <span className="font-mono text-base font-bold">@{pick.bookieOdd.toFixed(2)}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
