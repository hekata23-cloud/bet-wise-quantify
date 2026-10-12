import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Brain,
  Dribbble,
  Calculator,
  Clock,
  Flame,
  Goal,
  MessageCircle,
  Radar,
  Radio,
  Settings,
  Sparkles,
  Target,
  Thermometer,
  Ticket,
  Trophy,
  Wrench,
} from "lucide-react";
import { formatZagreb } from "@/lib/zagreb-time";
import { SharpFilterToggle } from "@/components/SharpFilterToggle";
import { useSharpFilter, SHARP_PRESETS } from "@/lib/sharp-filter";

const NAV = [
  { to: "/", label: "Početna", icon: Sparkles },
  { to: "/ht-ft", label: "HT/FT Sharp", icon: Clock },
  { to: "/btts-over", label: "2.5 & BTTS Sharp", icon: Flame },
  { to: "/tiket-arhitekt", label: "Tiket Arhitekt", icon: Ticket },
  { to: "/golovi", label: "Golovi Pro", icon: Goal },
  { to: "/kosarka", label: "Košarka Sharp", icon: Dribbble },
  { to: "/kalkulator", label: "Kalkulator", icon: Calculator },
  { to: "/radar", label: "Kvote Radar", icon: Radar },
  { to: "/over-under", label: "2.5 Termometar", icon: Thermometer },
  { to: "/zlatni-tip", label: "Zlatni tip", icon: Trophy },
  { to: "/prediktor", label: "Prediktor 3.5 & CS", icon: Target },
  { to: "/pro", label: "Pro Sharp", icon: Target },
  { to: "/pro-alati", label: "Pro Alati", icon: Wrench },
  { to: "/ai-prognoza", label: "AI Prognoza", icon: Brain },
  { to: "/chat", label: "AI Chat", icon: MessageCircle },
  { to: "/uzivo", label: "Uživo", icon: Radio },
  { to: "/postavke", label: "Postavke", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [now, setNow] = useState<string>("");
  const { enabled, settings } = useSharpFilter();

  useEffect(() => {
    setNow(formatZagreb());
    const t = setInterval(() => setNow(formatZagreb()), 1000);
    return () => clearInterval(t);
  }, []);

  const activePreset = SHARP_PRESETS[settings.preset];

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          {/* Logo i naziv */}
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "#12131a",
                boxShadow: "0 0 22px rgba(225,29,46,0.45)",
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <polygon points="12,3 22,21 12,21" fill="#ffffff" />
                <polygon points="12,3 12,21 2,21" fill="#e11d2e" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight text-sm sm:text-base">
                Andromeda AI
              </div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">
                AI predikcije · HR
              </div>
            </div>
          </Link>

          {/* Sredina: Sharp Filter Toggle (glavno dugme) */}
          <div className="flex items-center gap-2">
            <SharpFilterToggle />
          </div>

          {/* Desno: Vrijeme */}
          <div className="hidden lg:block text-xs text-muted-foreground tabular-nums shrink-0">
            {now}
          </div>
        </div>

        {/* Notifikacijska traka kad je filter aktivan */}
        {enabled && (
          <div className="bg-emerald-950/40 border-y border-emerald-500/30 px-4 py-1 text-center text-[11px] text-emerald-300 flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              <strong>Sharp Sindikat aktivan:</strong> {activePreset?.name} (Vjerojatnost ≥ {(settings.minProb * 100).toFixed(0)}%, EV ≥ {settings.minEV > 0 ? "+" : ""}{settings.minEV}%, Max Vig {settings.maxMargin}%)
            </span>
          </div>
        )}

        {/* Desktop Navigacija */}
        <nav className="hidden md:flex items-center gap-1 border-t border-border/40 px-4 py-1.5 overflow-x-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active =
              path === n.to || (n.to !== "/" && path.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobilna Navigacija */}
        <nav className="md:hidden flex overflow-x-auto gap-1 border-t border-border/60 px-2 py-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active =
              path === n.to || (n.to !== "/" && path.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 w-full flex-1">
        {children}
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-muted-foreground border-t border-border/20 mt-auto w-full">
        <div className="mb-1 font-medium">Aplikaciju izradio Goran Pavić</div>
        <div>Andromeda AI · Kladi se odgovorno · 18+</div>
      </footer>
    </div>
  );
}



