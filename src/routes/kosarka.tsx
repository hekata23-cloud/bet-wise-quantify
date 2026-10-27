import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Search, Settings, ShieldAlert, Trophy } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getKosGames, getKosOdds, type KosGame } from "@/lib/kosarka.functions";
import { analyzeKos, type KosAnalysis, type Tip } from "@/lib/kosarka-engine";
import { kosGuarded, readKosState, resetKosGuard, zagrebDay } from "@/lib/kosarka-guard";
import { getApiKey } from "@/lib/zlatni-guard";
import { evaluatePredictionIntegrity, noVigProbability, twoWayMarginPercent, type IntegrityResult } from "@/lib/prediction-integrity";
import { IntegrityPanel } from "@/components/IntegrityPanel";
import { SarpSportPanel } from "@/components/SarpSportPanel";
import type { KosMarkets } from "@/lib/kosarka.functions";

export const Route = createFileRoute("/kosarka")({
  head: () => ({
    meta: [
      { title: "Košarka Sharp · 1X2, dupla šansa, zbroj poena · Andromeda AI Beta" },
      { name: "description", content: "Profesionalna analiza košarkaških utakmica: 1X2, dupla šansa i zbroj poena uključujući produžetke, po zagrebačkom vremenu." },
      { property: "og:title", content: "Košarka Sharp · Andromeda AI Beta" },
      { property: "og:description", content: "Fer kvote bez marže i EV za 1X2, duplu šansu i više/manje poena." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KosarkaPage,
});

const MIN_DATE = "2026-01-01";
const DONE = ["FT", "AOT", "CANC", "POST", "ABD", "AWD"];
const time = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function tipIntegrity(t: Tip, group: Tip[]): IntegrityResult {
  const same = group.filter((x) => x.market === t.market);
  let marketProbability: number | null = null;
  let marginPercent: number | null = null;
  if (same.length === 2) {
    const opp = same.find((x) => x !== t);
    if (t.odd && opp?.odd) {
      marketProbability = noVigProbability(t.odd, opp.odd);
      marginPercent = twoWayMarginPercent(t.odd, opp.odd);
    }
  }
  return evaluatePredictionIntegrity({
    probability: t.prob,
    odds: t.odd,
    marketProbability,
    marginPercent,
    dataQuality: t.odd ? 0.9 : 0.45,
    fallbackModel: !t.odd,
    market: t.market,
  });
}

function KosarkaPage() {
  const [date, setDate] = useState(() => (zagrebDay() < MIN_DATE ? MIN_DATE : zagrebDay()));
  const [games, setGames] = useState<KosGame[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sel, setSel] = useState<KosGame | null>(null);
  const [an, setAn] = useState<KosAnalysis | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [brojKlad, setBrojKlad] = useState<number | null>(null);
  const [mk, setMk] = useState<KosMarkets | null>(null);
  const [settings, setSettings] = useState(false);
  const onWait = (ms: number, r: string) => setMsg(`Zaštita API-ja: ${r}. Čekam ${Math.ceil(ms / 1000)} s…`);

  const load = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setSettings(true); setMsg("Unesi API ključ (api-sports.io) u Postavkama."); return; }
    setLoading(true); setMsg("Učitavam sve utakmice dana…");
    try {
      const r = await kosGuarded(`games.${date}`, () => getKosGames({ data: { date, apiKey } }), onWait);
      if (r.error) { setMsg(r.error === "RATE_LIMIT" ? "Limit API-ja — pričekaj 15 s." : `Greška: ${r.error}`); return; }
      const list = r.games.filter((g) => !DONE.includes(g.status)).sort((a, b) => a.time.localeCompare(b.time));
      setGames(list);
      setMsg(`Učitano ${list.length} utakmica (${r.games.length} ukupno). Klikni utakmicu za tipove.`);
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setLoading(false); }
  };

  const open = async (g: KosGame) => {
    if (busyId) return;
    const apiKey = getApiKey();
    if (!apiKey) { setSettings(true); return; }
    setBusyId(g.id); setSel(g); setAn(null); setMsg(`Analiziram ${g.home} — ${g.away}…`);
    try {
      const r = await kosGuarded(`odds.${g.id}`, () => getKosOdds({ data: { id: g.id, apiKey } }), onWait);
      setBrojKlad(r.error ? 0 : (r.brojKladionica ?? 0));
      if (r.error) { setMsg(r.error === "RATE_LIMIT" ? "Limit API-ja — pričekaj 15 s." : r.error); return; }
      const a = analyzeKos(r.markets, g.league);
      setBook(r.bookmaker);
      setMk(r.markets);
      if (!a) { setMsg("Nema kvota na pobjednika — analiza nije moguća."); return; }
      setAn(a); setMsg("");
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusyId(null); }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => `${g.home} ${g.away} ${g.league}`.toLowerCase().includes(s)) : games;
  }, [games, q]);
  const st = typeof window !== "undefined" ? readKosState() : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🏀 Košarka Sharp</h1>
          <p className="text-sm text-muted-foreground">1X2 · Dupla šansa · Zbroj poena (uklj. produžetke) · vrijeme Zagreb</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" min={MIN_DATE} value={date} onChange={(e) => setDate(e.target.value < MIN_DATE ? MIN_DATE : e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Učitaj utakmice
          </button>
          <button onClick={() => setSettings(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Settings className="h-4 w-4" /> Postavke</button>
          <button onClick={() => { resetKosGuard(); setMsg("Zaštita poništena."); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><ShieldAlert className="h-4 w-4" /> Poništi blokadu</button>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
        Zaštita: 1 kredit po utakmici, dnevni cache, razmak 2.5 s, max 8/min · Danas potrošeno: {st?.used ?? 0}
        {st && st.dayRemaining >= 0 ? ` · Preostalo: ${st.dayRemaining}` : ""}
      </div>
      {msg && <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{msg}</div>}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Traži tim ili ligu…" className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto">
            {shown.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Klikni „Učitaj utakmice".</div>}
            {shown.map((g) => (
              <button key={g.id} onClick={() => open(g)} disabled={!!busyId}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${sel?.id === g.id ? "bg-primary/15" : ""}`}>
                <div className="flex justify-between text-xs text-muted-foreground"><span className="truncate">{g.league}</span><span className="tabular-nums">{g.status === "NS" ? time(g.time) : g.status}</span></div>
                <div className="font-medium">{g.home} — {g.away}{busyId === g.id ? " …" : ""}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!an && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Odaberi utakmicu za profesionalne tipove.</div>}
          {an && sel && (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{sel.league} · {time(sel.time)} · kvote: {book ?? "—"} · kladionica: {brojKlad ?? 0}</div>
                <div className="text-lg font-semibold">{sel.home} — {sel.away}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Stat k="Očekivana razlika" v={`${an.mu >= 0 ? "+" : ""}${an.mu.toFixed(1)} (domaćin)`} />
                  <Stat k="Očekivani zbroj" v={an.total.toFixed(1)} />
                  <Stat k="Šansa produžetka" v={pct(an.pDraw)} />
                  <Stat k="Pobjeda uklj. OT" v={`${pct(an.pHomeOT)} / ${pct(an.pAwayOT)}`} />
                </div>
              </div>
              <SarpSportPanel sport="kosarka" utakmica={{ id: sel.id, home: sel.home, away: sel.away, league: sel.league, time: sel.time }} an={an} mk={mk} book={book} brojKladionica={brojKlad ?? undefined} />
              <div className="rounded-xl border-2 border-primary bg-primary/15 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Obavezan tip · zbroj koševa uklj. produžetke</div>
                <div className="text-2xl font-bold">{an.totalPick.pick.startsWith("Više") ? "VIŠE OD" : "MANJE OD"} {an.totalPick.market.replace("Zbroj ", "")}</div>
                <div className="text-sm tabular-nums">
                  Šansa {pct(an.totalPick.prob)} · fer {an.totalPick.fair.toFixed(2)}
                  {an.totalPick.odd ? ` · kvota ${an.totalPick.odd.toFixed(2)} · EV ${an.totalPick.ev!.toFixed(1)}%` : " · (bez kvote, procjena modela)"}
                  {" · "}očekivano {an.total.toFixed(1)} koševa
                </div>
                <IntegrityPanel result={tipIntegrity(an.totalPick, an.totals)} title="Integritet: glavni tip" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {an.best && <Pick title="Value tip" icon t={an.best} integrity={tipIntegrity(an.best, [...an.x12, ...an.dc, ...an.ml, ...an.totals])} />}
                {an.safest && <Pick title="Najsigurniji tip" t={an.safest} integrity={tipIntegrity(an.safest, [...an.x12, ...an.dc, ...an.ml, ...an.totals])} />}
              </div>
              <Table title="1X2 (regularno vrijeme, 4 četvrtine)" rows={an.x12} best={an.best} group={an.x12} />
              <Table title="Dupla šansa (regularno vrijeme)" rows={an.dc} best={an.best} group={an.dc} />
              <Table title="Pobjednik uključujući produžetke" rows={an.ml} best={an.best} group={an.ml} />
              <Table title="Zbroj poena više/manje (uklj. produžetke)" rows={an.totals} best={an.best} group={an.totals} />
              {an.notes.map((n) => <div key={n} className="text-xs text-muted-foreground">• {n}</div>)}
            </>
          )}
        </div>
      </div>
      <SettingsModal open={settings} onClose={() => setSettings(false)} onSaved={() => setSettings(false)} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-muted/50 p-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>;
}

function Pick({ title, t, icon, integrity }: { title: string; t: Tip; icon?: boolean; integrity?: IntegrityResult }) {
  return (
    <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon && <Trophy className="h-3.5 w-3.5" />}{title}</div>
      <div className="text-lg font-semibold">{t.market}: {t.pick}</div>
      <div className="text-sm tabular-nums">Šansa {pct(t.prob)} · kvota {t.odd?.toFixed(2)} · fer {t.fair.toFixed(2)} · EV {t.ev?.toFixed(1)}%</div>
      <IntegrityPanel result={integrity} compact title={title} />
    </div>
  );
}

function Table({ title, rows, best, group }: { title: string; rows: Tip[]; best: Tip | null; group: Tip[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Tip</th><th>Šansa</th><th>Fer</th><th>Kvota</th><th>EV</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.market + r.pick} className={best && best.market === r.market && best.pick === r.pick ? "text-primary font-semibold" : ""}>
              <td className="py-1">{r.pick}</td><td className="text-center">{pct(r.prob)}</td><td className="text-center">{r.fair.toFixed(2)}</td>
              <td className="text-center">{r.odd ? r.odd.toFixed(2) : "—"}</td>
              <td className={`text-center ${r.ev != null && r.ev > 0 ? "text-primary" : "text-muted-foreground"}`}>{r.ev != null ? `${r.ev > 0 ? "+" : ""}${r.ev.toFixed(1)}%` : "—"}</td>
              <td className="text-center"><IntegrityPanel result={tipIntegrity(r, group)} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
