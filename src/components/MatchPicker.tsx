import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Download, Filter, Loader2, RotateCcw, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadKey } from "@/lib/api-football-storage";
import { getFixtureOdds, getFixtures, type FixtureItem, type OddsResult } from "@/lib/api-football-data.functions";
import { canCall, DAILY_LIMIT, getCache, readGuard, recordCall, resetGuard, setCache } from "@/lib/api-guard";
import { getApiKey } from "@/lib/zlatni-guard";
import { isoDateZagreb } from "@/lib/zagreb-time";

export interface LoadedMatchOdds {
  k22?: number;
  over?: number;
  gg?: number;
  exact?: Record<string, number>;
  label: string;
  bookmaker?: string;
}

interface Props {
  onLoaded: (odds: LoadedMatchOdds) => void;
}

function localDate() {
  // POPRAVAK: početni datum mora pratiti Zagreb, ne vremensku zonu uređaja.
  return isoDateZagreb();
}

export function MatchPicker({ onLoaded }: Props) {
  const [key, setKey] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState(0);

  const fetchFixtures = useServerFn(getFixtures);
  const fetchOdds = useServerFn(getFixtureOdds);

  useEffect(() => {
    const k = loadKey();
    const primary = k?.active ? k.key : null;
    const universal = getApiKey();
    setKey(primary || universal || null);
    setDate(localDate());
    setUsed(readGuard().count);
  }, []);

  async function loadFixtures() {
    const activeKey = key || getApiKey();
    if (!activeKey) {
      setMsg("API ključ nije pronađen. Unesi ga u Postavkama.");
      return;
    }
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
      const res = await fetchFixtures({ data: { key: activeKey, date } });
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
    const activeKey = key || getApiKey();
    if (!activeKey) return;
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

      const note = o.k22Estimated ? " (2:2 procijenjen iz modela)" : "";
      setMsg(`Kvote upisane: ${label} (${o.bookmaker ?? "Kladionica"})${fromCache ? " [memorija]" : ""}${note}.`);
    };

    const cacheKey = `odds.${f.id}`;
    const cached = getCache<OddsResult>(cacheKey, 12 * 60 * 60 * 1000);
    if (cached) return apply(cached, true);

    const block = canCall();
    if (block) return setMsg(block);

    setBusy(true);
    try {
      const res = await fetchOdds({ data: { key: activeKey, fixture: f.id } });
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

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">API-Football · Birač utakmica dana</h3>
          <p className="text-xs text-muted">
            1 klik = sve utakmice dana u keš · klik na par = povlači stvarne kvote
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">
            Danas: <strong className="text-cyan">{used}</strong>/{DAILY_LIMIT}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              resetGuard();
              setUsed(0);
              setMsg("Zaštita poništena — možeš ponovno učitavati.");
            }}
            className="h-7 px-2 text-xs text-muted hover:text-ink"
            title="Poništi limit ili hlađenje"
          >
            <RotateCcw className="mr-1 size-3" /> Poništi zaštitu
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Calendar className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
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
                      {new Date(f.time).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" })}
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
    </div>
  );
}
