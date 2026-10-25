import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
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
  Zap,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { formatZagreb } from "@/lib/zagreb-time";
import { SharpFilterToggle } from "@/components/SharpFilterToggle";
import { useSharpFilter, SHARP_PRESETS } from "@/lib/sharp-filter";

const NAV = [
  { to: "/", label: "Početna", icon: Sparkles },
  { to: "/ht-ft-predikcija", label: "HT/FT Predikcija", icon: Zap },
  { to: "/ht-ft", label: "HT/FT Sharp", icon: Clock },
  { to: "/btts-over", label: "2.5 & BTTS Sharp", icon: Flame },
  { to: "/tiket-arhitekt", label: "Tiket Arhitekt", icon: Ticket },
  { to: "/golovi", label: "Golovi Pro", icon: Goal },
  { to: "/kosarka", label: "Košarka Sharp", icon: Dribbble },
  { to: "/rukomet", label: "Rukomet Sharp", icon: Activity },
  { to: "/obrnute-kvote", label: "Obrnute kvote", icon: Radar },
  { to: "/kalkulator", label: "Kalkulator", icon: Calculator },
  { to: "/radar", label: "Kvote Radar", icon: Radar },
  { to: "/over-under", label: "2.5 Termometar", icon: Thermometer },
  { to: "/zlatni-tip", label: "Zlatni tip", icon: Trophy },
  { to: "/prediktor", label: "Prediktor 3.5 & CS", icon: Target },
  { to: "/pro", label: "Pro Sharp", icon: Target },
  { to: "/pro-alati", label: "Pro Alati", icon: Wrench },
  { to: "/dnb-asian-master", label: "DNB & Hendikep", icon: ShieldCheck },
  { to: "/dropping-odds", label: "Smart Money Radar", icon: TrendingDown },
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
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                Kvantitativni analitički sustav
              </div>
            </div>
          </Link>

          {/* Središnji dio: Sharp Filter Prekidač */}
          <div className="flex items-center gap-2">
            <SharpFilterToggle />
          </div>

          {/* Desni dio: Zagreb Vrijeme */}
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground shrink-0">
            <span className="hidden md:inline">Zagreb:</span>
            <span className="px-2 py-1 rounded-md bg-card/60 border border-border/50 text-foreground font-semibold">
              {now || "00:00:00"}
            </span>
          </div>
        </div>

        {/* Notifikacijska traka kada je Sharp Filter uključen */}
        {enabled && (
          <div className="bg-emerald-500/10 border-t border-b border-emerald-500/30 px-4 py-1 text-center text-xs text-emerald-300 flex items-center justify-center gap-2 font-medium">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Sharp Filter Aktivan:{" "}
              <strong className="text-white">{activePreset.name}</strong> —
              Minimalna vjerojatnost {Math.round(settings.minProb * 100)}%, Min EV {settings.minEV}%
            </span>
          </div>
        )}

        {/* Horizontalna navigacija s karticama */}
        <nav className="border-t border-border/40 bg-card/30 overflow-x-auto scrollbar-none">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-3 py-1.5 min-w-max">
            {NAV.map((item) => {
              const active = path === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        Andromeda AI © 2026 · Kvantitativno modeliranje sportskih tržišta
      </footer>
    </div>
  );
}

