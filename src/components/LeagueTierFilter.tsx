import { useEffect, useState } from "react";
import { Flame, Globe2, Star } from "lucide-react";

export type LeagueTier = "tier1" | "all" | "favorites";

const FAVORITES_KEY = "pc.favoriteLeagues.v1";

export function getFavoriteLeagues(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setFavoriteLeague(league: string, favorite: boolean) {
  const current = new Set(getFavoriteLeagues());
  if (favorite) current.add(league);
  else current.delete(league);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...current]));
  window.dispatchEvent(new CustomEvent("pc:league-favorites"));
}

export function LeagueTierFilter({ value, onChange }: { value: LeagueTier; onChange: (value: LeagueTier) => void }) {
  const [favoriteCount, setFavoriteCount] = useState(0);
  useEffect(() => {
    const refresh = () => setFavoriteCount(getFavoriteLeagues().length);
    refresh();
    window.addEventListener("pc:league-favorites", refresh);
    return () => window.removeEventListener("pc:league-favorites", refresh);
  }, []);

  const options: Array<{ value: LeagueTier; label: string; icon: typeof Flame }> = [
    { value: "tier1", label: "🔥 Top Lige", icon: Flame },
    { value: "all", label: "🌍 Sve Lige", icon: Globe2 },
    { value: "favorites", label: `⭐ Moji Favoriti${favoriteCount ? ` (${favoriteCount})` : ""}`, icon: Star },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card/70 p-1">
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            value === option ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={value === option}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
