import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio, RefreshCw, AlertCircle } from "lucide-react";
import {
  getFixturesByDate,
  getLiveFixtures,
  apiFootballQuotaUsed,
  apiFootballQuotaLimit,
  type Fixture,
} from "@/lib/api-football";
import { hasKey } from "@/lib/storage";
import { isoDateZagreb } from "@/lib/zagreb-time";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/uzivo")({
  head: () => ({
    meta: [
      { title: "Uživo utakmice · Andromeda AI" },
      {
        name: "description",
        content:
          "Live nogomet iz API-Football-a s pametnim keširanjem i throttlingom protiv suspenzije.",
      },
    ],
  }),
  component: UzivoPage,
});

function UzivoPage() {
  const [mode, setMode] = useState<"live" | "today">("live");
  const [data, setData] = useState<Fixture[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState({ used: 0, limit: 100 });

  async function load(force = false) {
    if (!hasKey("apiFootball")) {
      setError("Nedostaje API-Football ključ. Otvori Postavke.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list =
        mode === "live" ? await getLiveFixtures() : await getFixturesByDate(isoDateZagreb());
      setData(list);
      if (force) toast.success(`Učitano ${list.length} utakmica.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setQuota({ used: apiFootballQuotaUsed(), limit: apiFootballQuotaLimit() });
    }
  }

  useEffect(() => {
    void load();
    setQuota({ used: apiFootballQuotaUsed(), limit: apiFootballQuotaLimit() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg, oklch(0.7 0.2 280), oklch(0.68 0.19 320))" }}
          >
            <Radio className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Uživo utakmice</h1>
            <p className="text-sm text-muted-foreground">
              Pametan keš · dnevni brojač {quota.used}/{quota.limit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-secondary p-0.5 text-xs">
            <button
              onClick={() => setMode("live")}
              className={`rounded-md px-3 py-1.5 ${mode === "live" ? "bg-primary text-primary-foreground" : ""}`}
            >
              Uživo
            </button>
            <button
              onClick={() => setMode("today")}
              className={`rounded-md px-3 py-1.5 ${mode === "today" ? "bg-primary text-primary-foreground" : ""}`}
            >
              Danas
            </button>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Osvježi
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-none mt-0.5" />
          <div>
            {error}{" "}
            <Link to="/postavke" className="underline">
              Otvori Postavke
            </Link>
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {loading ? "Učitavam…" : "Nema podataka."}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          Nema utakmica za odabrani prikaz.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((f) => (
            <div key={f.fixture.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {f.league.country} · {f.league.name}
                </span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                  {f.fixture.status.short}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <TeamCell name={f.teams.home.name} logo={f.teams.home.logo} />
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums">
                    {f.goals.home ?? "–"}
                    <span className="mx-1 text-muted-foreground">:</span>
                    {f.goals.away ?? "–"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(f.fixture.date).toLocaleTimeString("hr-HR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Zagreb",
                    })}
                  </div>
                </div>
                <TeamCell name={f.teams.away.name} logo={f.teams.away.logo} right />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCell({ name, logo, right }: { name: string; logo: string; right?: boolean }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
      {logo ? (
        <img src={logo} alt="" className="h-7 w-7 rounded" loading="lazy" />
      ) : (
        <div className="h-7 w-7 rounded bg-muted" />
      )}
      <div className="text-sm font-medium truncate">{name}</div>
    </div>
  );
}