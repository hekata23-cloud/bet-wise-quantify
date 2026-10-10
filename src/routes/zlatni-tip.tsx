import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze, type Analysis } from "@/lib/zlatni-engine";
import { getApiKey, guarded, pruneCache, readState, resetGuard, zagrebDay, RESERVE } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/zlatni-tip")({
  head: () => ({
    meta: [
      { title: "Zlatni tip — Andromeda AI" },
      { name: "description", content: "Zlatni tip: bet365 kvote se učitavaju automatski, Dixon-Coles model za sva tržišta." },
      { property: "og:title", content: "Zlatni tip — Andromeda AI" },
      { property: "og:description", content: "Automatske bet365 kvote, precizne predikcije i zaštita API računa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZlatniTip,
});

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const time = (t: string) => new Date(t).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });

function ZlatniTip() {
  const [list, setList] = useState<ZtFixture[]>([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ZtFixture | null>(null);
  const [res, setRes] = useState<Analysis | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const [settings, setSettings] = useState(false);
  const [credits, setCredits] = useState("");
  const [group, setGroup] = useState("Sve");

  const refreshCredits = () => {
    const s = readState();
    setCredits(s.dayRemaining >= 0 ? `Preostalo danas: ${s.dayRemaining}${s.dayLimit > 0 ? "/" + s.dayLimit : ""} · potrošeno ovdje: ${s.used} · rezerva ${RESERVE}` : `Potrošeno danas: ${s.used}`);
  };

  const loadFixtures = async (force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) return setSettings(true);
    setBusy(true);
    try {
      const r = await guarded(`fixtures`, 1, () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }), (ms, why) => setMsg(`${why} — čekam ${Math.ceil(ms / 1000)} s…`), force);
      if (r.error) return setMsg(`Greška: ${r.error === "RATE_LIMIT" ? "API limit — zaštita je uključila hlađenje." : r.error}`);
      setList(r.fixtures);
      setMsg(`${r.fixtures.length} utakmica dana učitano jednim pozivom (1 kredit, zatim iz memorije).`);
    } catch (e: any) {
      setMsg(`🛡️ ${e.message}`);
    } finally {
      setBusy(false);
      refreshCredits();
    }
  };

  useEffect(() => {
    pruneCache();
    refreshCredits();
    if (getApiKey()) loadFixtures(false); // automatski: iz memorije ili 1 kredit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) return setSettings(true);
    setSel(f); setRes(null); setWarn([]); setBusy(true);
    setMsg(`Učitavam bet365 kvote i statistiku: ${f.home} — ${f.away}…`);
    try {
      const r = await guarded(`match.${f.id}`, 2, () => getZtMatch({ data: { id: f.id, apiKey } }), (ms, why) => setMsg(`🛡️ ${why} — čekam ${Math.ceil(ms / 1000)} s…`));
      if (r.error === "RATE_LIMIT" || r.error?.startsWith("ACCOUNT")) return setMsg(`🛡️ Zaštita aktivna: ${r.error}`);
      const w: string[] = [];
      if (r.error) w.push(r.error);
      if (r.statsError) w.push(`Statistika: ${r.statsError}`);
      const a = analyze(r.markets, r.home, r.away);
      setRes(a); setWarn([...w, ...a.notes]);
      setMsg(r.bookmaker ? `✅ ${Object.keys(r.markets).length} bet365 tržišta učitano automatski.` : "⚠️ bet365 kvote nisu dostupne.");
    } catch (e: any) {
      setMsg(`🛡️ ${e.message}`);
    } finally {
      setBusy(false);
      refreshCredits();
    }
  };

  const shown = list.filter((f) => `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(filter.toLowerCase()));
  const groups = useMemo(() => ["Sve", ...new Set(res?.markets.map((m) => m.group) ?? [])], [res]);

  return (
    <div className="flex flex-col gap-4 p-2 md:p-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-card-foreground">🏆 Zlatni tip · {zagrebDay()}</h2>
          <div className="flex gap-2">
            <button onClick={() => setSettings(true)} className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">⚙️ API ključ</button>
            <button disabled={busy} onClick={() => loadFixtures(list.length > 0)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
              {list.length ? "Osvježi utakmice (1 kredit)" : "Učitaj utakmice dana (1 kredit)"}
            </button>
          </div>
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">🛡️ Zaštita od suspenzije: {credits}</p>
        {list.length > 0 && (
          <>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="🔍 Tim ili liga…" className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground" />
            <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {shown.map((f) => (
                <button key={f.id} disabled={busy} onClick={() => pick(f)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary ${sel?.id === f.id ? "bg-secondary" : ""}`}>
                  <span><b className="text-foreground">{f.home} — {f.away}</b><span className="block text-muted-foreground">{f.league}</span></span>
                  <span className="font-mono text-primary">{f.status === "NS" ? time(f.time) : f.status}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {sel && res && (
        <section className="flex flex-col gap-3">
          <div className="rounded-2xl border-2 border-primary bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Zlatni tip · {sel.home} — {sel.away}</p>
            {res.golden ? (
              <>
                <p className="mt-1 text-2xl font-black text-primary">{res.golden.market}: {res.golden.outcome.label}</p>
                <p className="text-sm text-card-foreground">
                  Vjerojatnost {pct(res.golden.outcome.p)} · bet365 {res.golden.outcome.odd?.toFixed(2) ?? "—"} · fer kvota {res.golden.outcome.fair.toFixed(2)}
                  {res.golden.outcome.ev !== undefined && ` · EV ${(res.golden.outcome.ev * 100).toFixed(1)}%`}
                </p>
                <p className="text-xs text-muted-foreground">{res.golden.kind}</p>
              </>
            ) : <p className="mt-1 text-sm text-muted-foreground">Nema dovoljno bet365 kvota za zlatni tip.</p>}
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-secondary p-2 text-secondary-foreground">Očekivani golovi: <b>{res.lh.toFixed(2)} : {res.la.toFixed(2)}</b></div>
              {res.safe && <div className="rounded-lg bg-secondary p-2 text-secondary-foreground">Najsigurnije: <b>{res.safe.market} — {res.safe.outcome.label}</b> ({pct(res.safe.outcome.p)}, {res.safe.outcome.odd?.toFixed(2)})</div>}
              {res.value && <div className="rounded-lg bg-secondary p-2 text-secondary-foreground">Najveći value: <b>{res.value.market} — {res.value.outcome.label}</b> (EV {((res.value.outcome.ev ?? 0) * 100).toFixed(1)}%)</div>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Najvjerojatniji rezultati: {res.topScores.map((s) => `${s.score} (${pct(s.p)})`).join(" · ")}</p>
            {warn.map((w) => <p key={w} className="text-[11px] text-muted-foreground">• {w}</p>)}
          </div>

          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <button key={g} onClick={() => setGroup(g)} className={`rounded-full px-3 py-1 text-xs font-semibold ${group === g ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{g}</button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {res.markets.filter((m) => group === "Sve" || m.group === group).map((m) => (
              <div key={m.name} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-card-foreground">{m.name}</p>
                  <span className="rounded bg-primary px-2 py-0.5 text-xs font-black text-primary-foreground">{m.pick.label}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {m.outcomes.map((o) => (
                    <div key={o.label} className="flex items-center gap-2 text-[11px]">
                      <span className={`w-16 shrink-0 ${o === m.pick ? "font-bold text-primary" : "text-muted-foreground"}`}>{o.label}</span>
                      <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, o.p * 100)}%` }} /></div>
                      <span className="w-12 text-right text-foreground">{pct(o.p)}</span>
                      <span className="w-10 text-right font-mono text-muted-foreground">{o.odd ? o.odd.toFixed(2) : "—"}</span>
                    </div>
                  ))}
                </div>
                {m.source === "tržište" && <p className="mt-1 text-[10px] text-muted-foreground">Izvor: bet365 bez marže</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <SettingsModal open={settings} onClose={() => { setSettings(false); if (!list.length && getApiKey()) loadFixtures(false); }} />
    </div>
  );
}
