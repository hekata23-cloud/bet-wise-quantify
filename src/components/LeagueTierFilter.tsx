import { postaviFilter, useLigaFilter, type LigaFilter } from "@/lib/league-tier";

const OPCIJE: { v: LigaFilter; l: string }[] = [
  { v: "tier1", l: "🔥 Top lige" },
  { v: "sve", l: "🌍 Sve lige" },
  { v: "favoriti", l: "⭐ Moji favoriti" },
];

export function LeagueTierFilter() {
  const { filter } = useLigaFilter();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter liga">
      {OPCIJE.map((o) => (
        <button
          key={o.v}
          onClick={() => postaviFilter(o.v)}
          aria-pressed={filter === o.v}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filter === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function LineupAlertBadge({ oznaka }: { oznaka: string | null }) {
  if (!oznaka) return null;
  return <span className="inline-flex rounded-md bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">{oznaka}</span>;
}
