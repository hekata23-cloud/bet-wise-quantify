import { createFileRoute } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze } from "@/lib/zlatni-engine";
import { getApiKey, guarded, resetGuard, zagrebDay, readState } from "@/lib/zlatni-guard";
import {
  extractEdgesFromAnalysis,
  buildOptimalTickets,
  formatTicketForSharing,
  type EdgeBet,
  type TicketRecommendation,
} from "@/lib/tiket-arhitekt";
import { Check, Copy, RefreshCw, ShieldAlert, Sparkles, Ticket, TrendingUp } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const guard = readState();

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
        setStatusMsg(`Greška: ${res.error}`);
      } else {
        const playable = res.fixtures.filter((f) =>
          ["NS", "TBD", "1H", "HT", "2H"].includes(f.status)
        );
        setFixtures(playable);
        setStatusMsg(`Učitano ${playable.length} utakmica. Kliknite na utakmice za analizu vrijednosti.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Neuspjelo učitavanje utakmica");
    } finally {
      setLoading(false);
    }
  };

  // Analiza jedne utakmice i traženje Edge-ova
  const handleAnalyzeMatch = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    setLoading(true);
    setStatusMsg(`Analiziram kvote za: ${f.home} — ${f.away}...`);

    try {
      const res = await guarded(
        `match.${f.id}`,
        2,
        () => getZtMatch({ data: { id: f.id, apiKey } }),
        handleWait
      );

      if (res.error) {
        setStatusMsg(`API napomena: ${res.error}`);
        return;
      }

      if (!Object.keys(res.markets).length) {
        setStatusMsg(`Za utakmicu ${f.home} — ${f.away} kladionice još nisu ponudile kvote.`);
        return;
      }

      const analysis = analyze(res.markets, res.home, res.away);
      const newEdges = extractEdgesFromAnalysis(
        f.id,
        `${f.home} vs ${f.away}`,
        f.league,
        f.time,
        analysis
      );

      startTransition(() => {
        setAnalyzedEdges((prev) => {
          // Zamijeni ili dodaj nove edge-ove za ovu utakmicu
          const filtered = prev.filter((e) => e.fixtureId !== f.id);
          const combined = [...filtered, ...newEdges].sort((a, b) => b.evPercent - a.evPercent);
          setTickets(buildOptimalTickets(combined));
          return combined;
        });
      });

      setStatusMsg(
        newEdges.length > 0
          ? `Pronađeno ${newEdges.length} oklada s matematičkom prednošću (EV > 0%) za ${f.home} — ${f.away}!`
          : `Analizirano: Kladionice su točno postavile kvote, nema sigurnog matematičkog odstupanja.`
      );
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Greška pri analizi utakmice");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTicket = (ticket: TicketRecommendation, index: number) => {
    const text = formatTicketForSharing(ticket);
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Tiket Arhitekt & Value Finder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Matematički skener za sastavljanje tiketa s dokazanim očekivanim prinosom (EV &gt; 0%) i bez korelacije rizika.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
                    <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                      EV +{t.expectedValuePercent}%
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">{t.description}</p>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    {t.bets.map((b, bi) => (
                      <div key={bi} className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1">
                        <div className="font-semibold text-foreground truncate">{b.match}</div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-primary font-medium">{b.selection}</span>
                          <span className="font-mono text-foreground font-semibold">@{b.bookmakerOdd.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>Šansa: {(b.probability * 100).toFixed(0)}%</span>
                          <span className="text-emerald-400">Edge: +{b.evPercent}%</span>
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

      {/* Tablica svih pronađenih Edge-ova */}
      {analyzedEdges.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Sve Pronađene Value Oklade ({analyzedEdges.length})
            </h3>
            <span className="text-xs text-muted-foreground">Sortirano po najvećem matematičkom povratu</span>
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
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-400">+{e.evPercent}%</td>
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
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
          <h3 className="font-semibold text-base">Današnje Utakmice — Odaberite za proračun Edge-a</h3>
          <p className="text-xs text-muted-foreground">
            Kliknite "Analiziraj" na utakmicama koje vas zanimaju. Model odmah pronalazi nepodudarnosti u kvotama i ažurira listiće.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
            {fixtures.slice(0, 30).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-semibold text-xs text-foreground truncate">
                    {f.home} — {f.away}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {f.league} · {f.time}
                  </div>
                </div>

                <button
                  onClick={() => handleAnalyzeMatch(f)}
                  disabled={loading}
                  className="shrink-0 rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                >
                  Analiziraj
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

