import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Download, Filter, Loader2, Search, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { loadKey } from "@/lib/api-football-storage";
import { getFixtureOdds, getFixtures, type FixtureItem, type OddsResult } from "@/lib/api-football-data.functions";
import { canCall, DAILY_LIMIT, getCache, readGuard, recordCall, setCache } from "@/lib/api-guard";

export type LoadedOdds = {
  k22?: number | undefined;
  over?: number | undefined;
  gg?: number | undefined;
  exact?: Record<string, number> | undefined;
  label: string;
  bookmaker?: string | undefined;
};

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MatchPicker({ onLoaded }: { onLoaded: (odds: LoadedOdds) => void }) {
  const fetchFixtures = useServerFn(getFixtures);
  const fetchOdds = useServerFn(getFixtureOdds);
  const [key, setKey] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    const k = loadKey();
    setKey(k?.active ? k.key : null);
    setDate(localDate());
    setUsed(readGuard().count);
  }, []);

  async function loadFixtures() {
    if (!key) return;
    const cacheKey = `fx.all.${date}`;
    const cached = getCache<FixtureItem[]>(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) {
      setFixtures(cached);
      setMsg(`Popis za ovaj dan je već u memoriji (${cached.length} utakmica) — 0 potrošenih kredita.`);
      return;
    }

    const block = canCall();
    if (block) return setMsg(block);

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchFixtures({ data: { key, date } });
      recordCall(res.remaining);
      setUsed(readGuard().count);

      if (!res.ok) return setMsg(res.message ?? "Greška pri dohvatu.");
      setFixtures(res.fixtures);
      setCache(cacheKey, res.fixtures);
      setMsg(res.fixtures.length ? `Učitano ${res.fixtures.length} utakmica iz svih liga svijeta! (1 kredit)` : "Nema zakazanih utakmica za taj dan.");
    } catch {
      setMsg("Dohvat nije uspio. Provjeri vezu ili pričekaj trenutak.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(f: FixtureItem) {
    if (!key) return;
    const label = `${f.home} – ${f.away}`;

    const apply = (o: OddsResult, fromCache: boolean) => {
      if (!o.ok) return setMsg(o.message ?? "Kvote nisu dostupne.");
      onLoaded({
        k22: o.exact?.["2:2"],
        over: o.over25,
        gg: o.gg,
        exact: o.exact,
        label,
        bookmaker: o.bookmaker,
      });

      const note = o.k22Estimated ? " (2:2 precizno procijenjen iz modela)" : "";
      setMsg(`Kvote upisane za: ${label} (${o.bookmaker ?? "Kladionica"})${fromCache ? " [iz memorije]" : ""}${note}.`);
    };

    const cacheKey = `odds.${f.id}`;
    const cached = getCache<OddsResult>(cacheKey, 12 * 60 * 60 * 1000);
    if (cached) return apply(cached, true);

    const block = canCall();
    if (block) return setMsg(block);

    setBusy(true);
    try {
      const res = await fetchOdds({ data: { key, fixture: f.id } });
      recordCall(res.remaining);
      setUsed(readGuard().count);

      if (res.ok) setCache(cacheKey, res);
      apply(res, false);
    } catch {
      setMsg("Neuspješno preuzimanje kvota za ovu utakmicu.");
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? fixtures.filter((f) => `${f.home} ${f.away} ${f.league} ${f.country}`.toLowerCase().includes(q))
      : fixtures;
    return list.slice(0, 100);
  }, [fixtures, query]);

  if (!key) {
    return (
      <p className="mt-3 rounded-md border border-line bg-surface/40 p-3 text-sm text-ink/80">
        Želiš automatsko učitavanje svih liga? Unesi i aktiviraj API-Football ključ u{" "}
        <Link to="/over-under/postavke" className="font-semibold text-cyan underline">Postavkama</Link>.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <CalendarDays className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-full rounded-md border border-line bg-surface/65 pl-10 pr-2 text-ink outline-none focus:border-cyan"
          />
        </label>
        <Button type="button" onClick={loadFixtures} disabled={busy || !date} className="h-11 shadow-button">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Učitaj dan (1 kredit)
        </Button>
      </div>

      {fixtures.length > 0 && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Traži tim, ligu ili državu (npr. Premier, HNL, Real)..."
              className="h-11 w-full rounded-md border border-line bg-surface/65 pl-10 pr-3 text-sm text-ink outline-none focus:border-cyan"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted">
            <span>Prikazano {shown.length} od ukupno {fixtures.length} utakmica</span>
            <span className="flex items-center gap-1"><Filter className="size-3" /> Brzi odabir klikom</span>
          </div>

          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {shown.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(f)}
                  className="w-full rounded-md border border-line/60 bg-surface/40 p-2.5 text-left text-sm transition hover:border-cyan hover:bg-surface/70 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{f.home} – {f.away}</span>
                    <span className="font-mono text-xs text-cyan">
                      {new Date(f.time).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <Trophy className="size-3 text-gold" />
                    <span>{f.country}: {f.league}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {msg && (
        <p role="status" className="rounded-md border border-line bg-surface/40 px-3 py-2 text-xs font-semibold text-ink/85">
          {msg}
        </p>
      )}

      <div className="flex items-center justify-between rounded border border-line/50 bg-surface/30 px-2.5 py-1.5 text-[11px] text-muted">
        <span>Iskorišteno danas: <strong>{used} / {DAILY_LIMIT}</strong> zahtjeva</span>
        <span className="text-win font-semibold">Zaštita od suspenzije: AKTIVNA</span>
      </div>
    </div>
  );
}
