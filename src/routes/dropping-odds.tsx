import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, TrendingDown, Radio, ShieldCheck, Star } from "lucide-react";
import { LeagueTierFilter, type LeagueTier, getFavoriteLeagues, setFavoriteLeague } from "@/components/LeagueTierFilter";
import { isTier1League } from "@/lib/league-tiers";
import { detectDroppingOdds, loadOddsSnapshots, saveOddsSnapshots, type OddsSnapshot } from "@/lib/smart-money";

export const Route = createFileRoute("/dropping-odds")({
  head: () => ({ meta: [{ title: "Smart Money & Dropping Odds · Andromeda AI" }] }),
  component: DroppingOddsPage,
});

const SAMPLE_ODDS: OddsSnapshot[] = [
  { fixtureId: 501, match: "Arsenal - Aston Villa", league: "Premier League", kickoff: "18:30", market: "1X2", selection: "1", openingOdds: 2.15, currentOdds: 1.78, capturedAt: Date.now() },
  { fixtureId: 502, match: "Real Madrid - Sevilla", league: "La Liga", kickoff: "21:00", market: "Over 2.5", selection: "Over 2.5", openingOdds: 1.95, currentOdds: 1.76, capturedAt: Date.now() },
  { fixtureId: 503, match: "Dinamo Zagreb - Gorica", league: "HNL", kickoff: "17:00", market: "1X2", selection: "1", openingOdds: 1.70, currentOdds: 1.55, capturedAt: Date.now() },
];

export function DroppingOddsPage() {
  const [tier, setTier] = useState<LeagueTier>("tier1");
  const [odds, setOdds] = useState<OddsSnapshot[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = () => {
    // Cache contains no API keys. Actual API odds are supplied by the existing odds pipeline.
    const stored = loadOddsSnapshots();
    const source = stored.length ? stored : SAMPLE_ODDS;
    setOdds(source);
    if (!stored.length) saveOddsSnapshots(source);
    setUpdatedAt(new Date());
  };

  useEffect(() => { refresh(); }, []);

  const modelProbabilities: Record<string, number> = {};
  const signals = useMemo(() => detectDroppingOdds(odds, modelProbabilities), [odds]);
  const favorites = getFavoriteLeagues();
  const filtered = signals.filter((signal) => {
    if (tier === "tier1") return isTier1League(signal.league);
    if (tier === "favorites") return favorites.includes(signal.league);
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
            <Radio className="h-4 w-4 animate-pulse" /> SMART MONEY TRACKER
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Radar Pametnog Novca</h1>
          <p className="mt-1 text-sm text-muted-foreground">Praćenje pomaka kvota ≥8% u proteklih 12 sati, uz usporedbu sa SARP modelom.</p>
        </div>
        <div className="flex items-center gap-3">
          <LeagueTierFilter value={tier} onChange={setTier} />
          <button onClick={refresh} className="rounded-lg border border-border/60 p-2 hover:bg-muted" aria-label="Osvježi kvote">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Prag signala: pad ≥ 8% · prozor: 12 sati</span>
        <span>{updatedAt ? `Ažurirano ${updatedAt.toLocaleTimeString("hr-HR")}` : "Nema podataka"}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((signal) => (
          <article key={`${signal.fixtureId}-${signal.market}-${signal.selection}`} className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground/80">{signal.league}</span><span>•</span><span>{signal.kickoff}</span></div>
                <h2 className="mt-1 font-bold">{signal.match}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{signal.market}: <span className="font-semibold text-foreground">{signal.selection}</span></p>
              </div>
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-right text-red-400">
                <div className="flex items-center gap-1 text-[10px] font-bold"><TrendingDown className="h-3 w-3" /> STEAM / SHARP DROP</div>
                <div className="font-mono text-xl font-bold">-{signal.dropPercent}%</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-center">
              <div><div className="text-[10px] text-muted-foreground">Početna kvota</div><div className="font-mono text-lg">@{signal.openingOdds.toFixed(2)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">Trenutna kvota</div><div className="font-mono text-lg font-bold text-emerald-400">@{signal.currentOdds.toFixed(2)}</div></div>
            </div>

            {signal.modelAgrees && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400">
                <ShieldCheck className="h-4 w-4" /> SHARP CONSENSUS VERIFIED (High EV)
              </div>
            )}

            <button onClick={() => setFavoriteLeague(signal.league, !favorites.includes(signal.league))} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Star className="h-3.5 w-3.5" /> {favorites.includes(signal.league) ? "Ukloni iz favorita" : "Dodaj ligu u favorite"}
            </button>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
            Nema potvrđenih pomaka kvota za odabrani filter. Učitani primjeri nisu trenutni podaci kladionica.
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Napomena: pad kvote može ukazivati na promjenu tržišnih očekivanja, ali sam po sebi ne potvrđuje profesionalno ulaganje. U demonstracijskom prikazu koriste se primjeri dok se ne poveže izvor povijesnih kvota.</p>
    </div>
  );
}
