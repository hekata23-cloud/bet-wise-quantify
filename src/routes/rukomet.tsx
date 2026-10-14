import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, RefreshCw, Search, Settings, ShieldAlert, Trophy } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getRukometGames, getRukometOdds, type RukometGame } from "@/lib/rukomet.functions";
import { analyzeRukomet, type RukometAnalysis, type Tip } from "@/lib/rukomet-engine";
import { rukometGuarded, readRukometState, resetRukometGuard, zagrebDay } from "@/lib/rukomet-guard";
import { getApiKey } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/rukomet")({
  head: () => ({
    meta: [
      { title: "Rukomet Sharp · 1X2, Zbroj golova, Timski golovi · Andromeda AI" },
      {
        name: "description",
        content:
          "Profesionalna analiza rukometnih utakmica: 1X2, 1 2 pobjednik, ukupni zbroj golova, golovi domaćina i gosta po zagrebačkom vremenu.",
      },
      { property: "og:title", content: "Rukomet Sharp · Andromeda AI" },
      {
        property: "og:description",
        content: "Kvantitativni rukometni model bez kladioničarske marže: fer kvote, EV i zbrojevi golova.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RukometPage,
});

const MIN_DATE = "2026-01-01";
const DONE = ["FT", "AOT", "CANC", "POST", "ABD", "AWD"];
const time = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function RukometPage() {
  const [date, setDate] = useState(() => (zagrebDay() < MIN_DATE ? MIN_DATE : zagrebDay()));
  const [games, setGames] = useState<RukometGame[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sel, setSel] = useState<RukometGame | null>(null);
  const [an, setAn] = useState<RukometAnalysis | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  const onWait = (ms: number, r: string) =>
    setMsg(`Zaštita API-ja: ${r}. Čekam ${Math.ceil(ms / 1000)} s…`);

  const load = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettings(true);
      setMsg("Unesi API ključ (api-sports.io) u Postavkama.");
      return;
    }
    setLoading(true);
    setMsg("Učitavam sve rukometne utakmice dana…");
    try {
      const r = await rukometGuarded(
        `games.${date}`,
        () => getRukometGames({ data: { date, apiKey } }),
        onWait
      );
      if (r.error) {
        setMsg(r.error === "RATE_LIMIT" ? "Limit API-ja — pričekaj 15 s." : `Greška: ${r.error}`);
        return;
      }
      const list = r.games
        .filter((g) => !DONE.includes(g.status))
        .sort((a, b) => a.time.localeCompare(b.time));
      setGames(list);
      setMsg(`Učitano ${list.length} rukometnih utakmica (${r.games.length} ukupno). Odaberi utakmicu za analizu.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Greška");
    } finally {
      setLoading(false);
    }
  };

  const open = async (g: RukometGame) => {
    if (busyId) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettings(true);
      return;
    }
    setBusyId(g.id);
    setSel(g);
    setAn(null);
    setMsg(`Analiziram ${g.home} — ${g.away}…`);
    try {
      const r = await rukometGuarded(
        `odds.${g.id}`,
        () => getRukometOdds({ data: { id: g.id, apiKey } }),
        onWait
      );
      if (r.error) {
        setMsg(r.error === "RATE_LIMIT" ? "Limit API-ja — pričekaj 15 s." : r.error);
        return;
      }
      const a = analyzeRukomet(r.markets, g.league);
      setBook(r.bookmaker);
      if (!a) {
        setMsg("Nema dovoljno kvota za izračun rukometnog modela.");
        return;
      }
      setAn(a);
      setMsg("");
    } catch (e: any) {
      setMsg(e?.message ?? "Greška");
    } finally {
      setBusyId(null);
    }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => `${g.home} ${g.away} ${g.league}`.toLowerCase().includes(s)) : games;
  }, [games, q]);

  const st = typeof window !== "undefined" ? readRukometState() : null;

  return (
    <div className="space-y-5">
      {/* Zaglavlje */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🤾 Rukomet Sharp</h1>
          <p className="text-sm text-muted-foreground">
            1X2 · 1 2 Pobjednik · Zbroj golova · Golovi domaćina i gosta · Zagreb vrijeme
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            min={MIN_DATE}
            value={date}
            onChange={(e) => setDate(e.target.value < MIN_DATE ? MIN_DATE : e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Učitaj utakmice
          </button>
          <button
            onClick={() => setSettings(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <Settings className="h-4 w-4" /> Postavke
          </button>
          <button
            onClick={() => {
              resetRukometGuard();
              setMsg("Blokada i pauza zaštite su uspješno poništene.");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <ShieldAlert className="h-4 w-4 text-emerald-400" /> Poništi blokadu
          </button>
        </div>
      </div>

      {/* Info traka zaštite */}
      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
        Zaštita: 1 kredit po utakmici, dnevni cache, razmak 2.5 s, max 8/min · Danas potrošeno: {st?.used ?? 0}
        {st && st.dayRemaining >= 0 ? ` · Preostalo rukometnih kredita: ${st.dayRemaining}` : ""}
      </div>

      {msg && <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{msg}</div>}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Lijevi stupac: Popis utakmica */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Traži klub ili ligu…"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto">
            {shown.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Klikni „Učitaj utakmice" za prikaz rasporeda.
              </div>
            )}
            {shown.map((g) => (
              <button
                key={g.id}
                onClick={() => open(g)}
                disabled={!!busyId}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  sel?.id === g.id ? "bg-primary/15" : ""
                }`}
              >
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="truncate">{g.league}</span>
                  <span className="tabular-nums">{g.status === "NS" ? time(g.time) : g.status}</span>
                </div>
                <div className="font-medium">
                  {g.home} — {g.away}
                  {busyId === g.id ? " …" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Desni stupac: Profesionalna analiza */}
        <div className="space-y-4">
          {!an && (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Odaberi utakmicu s lijevog popisa za uvid u profesionalne tipove.
            </div>
          )}

          {an && sel && (
            <>
              {/* Zaglavlje utakmice */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">
                  {sel.league} · {time(sel.time)} · izvor kvota: {book ?? "Tržišni prosjek"}
                </div>
                <div className="text-xl font-bold mt-0.5">
                  {sel.home} — {sel.away}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Stat k="Očekivani ukupni zbroj" v={`${an.muTotal.toFixed(1)} golova`} />
                  <Stat k="Očekivano Domaćin" v={`${an.muHome.toFixed(1)} golova`} />
                  <Stat k="Očekivano Gost" v={`${an.muAway.toFixed(1)} golova`} />
                  <Stat k="Vjerojatnost remija" v={pct(an.pDraw)} />
                </div>
              </div>

              {/* 1) OBAVEZNI TIP: ZBROJ GOLOVA */}
              <div className="rounded-xl border-2 border-primary bg-primary/15 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Obavezan tip · Zbroj golova
                </div>
                <div className="text-2xl font-bold mt-1">{an.totalPick.pick}</div>
                <div className="text-sm tabular-nums mt-0.5">
                  Šansa {pct(an.totalPick.prob)} · fer kvota {an.totalPick.fair.toFixed(2)}
                  {an.totalPick.odd
                    ? ` · kvota kladionice ${an.totalPick.odd.toFixed(2)} · EV ${an.totalPick.ev!.toFixed(1)}%`
                    : " · (model procjena)"}
                  {" · "}očekivano ukupno {an.muTotal.toFixed(1)} golova
                </div>
              </div>

              {/* 2) TIMSKI GOLOVI: DOMAĆIN I GOST */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs uppercase font-medium text-muted-foreground">
                    Tip · Golovi domaćina
                  </div>
                  <div className="text-lg font-bold mt-0.5 text-primary">
                    {an.homeTotalPick.pick}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                    Šansa: <strong>{pct(an.homeTotalPick.prob)}</strong> · Fer: {an.homeTotalPick.fair.toFixed(2)}
                    {an.homeTotalPick.odd ? ` · Kvota: ${an.homeTotalPick.odd.toFixed(2)}` : ""}
                    {" · "}Model: {an.muHome.toFixed(1)} gola
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs uppercase font-medium text-muted-foreground">
                    Tip · Golovi gosta
                  </div>
                  <div className="text-lg font-bold mt-0.5 text-primary">
                    {an.awayTotalPick.pick}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                    Šansa: <strong>{pct(an.awayTotalPick.prob)}</strong> · Fer: {an.awayTotalPick.fair.toFixed(2)}
                    {an.awayTotalPick.odd ? ` · Kvota: ${an.awayTotalPick.odd.toFixed(2)}` : ""}
                    {" · "}Model: {an.muAway.toFixed(1)} gola
                  </div>
                </div>
              </div>

              {/* VALUE I NAJSIGURNIJI TIP */}
              <div className="grid gap-3 sm:grid-cols-2">
                {an.best && <Pick title="Value tip (najbolji omjer kvote i šanse)" icon t={an.best} />}
                {an.safest && <Pick title="Najsigurniji tip (najviša vjerojatnost)" t={an.safest} />}
              </div>

              {/* TABLICE ISHODA */}
              <Table title="1X2 (regularno vrijeme 60 min)" rows={an.x12} best={an.best} />
              <Table title="Dupla šansa" rows={an.dc} best={an.best} />
              <Table title="Pobjednik 1 2 (uključujući hendikep/remi no bet)" rows={an.ml} best={an.best} />
              <Table title="Ukupni zbroj golova (više / manje linije)" rows={an.totals} best={an.best} />
              <Table title="Zbroj golova: Domaćin" rows={an.homeTotals} best={an.best} />
              <Table title="Zbroj golova: Gost" rows={an.awayTotals} best={an.best} />
            </>
          )}
        </div>
      </div>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}

function Pick({ title, icon, t }: { title: string; icon?: boolean; t: Tip }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon && <Trophy className="h-3.5 w-3.5 text-yellow-400" />} {title}
      </div>
      <div className="font-semibold">{t.market} · {t.pick}</div>
      <div className="text-xs tabular-nums text-muted-foreground">
        Šansa {pct(t.prob)} · fer {t.fair.toFixed(2)}
        {t.odd ? ` · kvota ${t.odd.toFixed(2)} · EV ${t.ev! > 0 ? "+" : ""}${t.ev!.toFixed(1)}%` : ""}
      </div>
    </div>
  );
}

function Table({ title, rows, best }: { title: string; rows: Tip[]; best: Tip | null }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border/40 text-sm">
        {rows.map((r, i) => {
          const isBest = best && best.market === r.market && best.pick === r.pick;
          return (
            <div
              key={i}
              className={`flex items-center justify-between py-1.5 ${isBest ? "font-semibold text-primary" : ""}`}
            >
              <div>
                {r.pick}
                {isBest && <span className="ml-2 text-[10px] uppercase text-yellow-400">★ Value</span>}
              </div>
              <div className="flex items-center gap-3 tabular-nums text-xs">
                <span>šansa {pct(r.prob)}</span>
                <span className="text-muted-foreground">fer {r.fair.toFixed(2)}</span>
                <span className="font-semibold">{r.odd ? r.odd.toFixed(2) : "—"}</span>
                {r.ev != null && (
                  <span className={r.ev > 0 ? "text-emerald-400" : "text-muted-foreground"}>
                    {r.ev > 0 ? "+" : ""}
                    {r.ev.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

