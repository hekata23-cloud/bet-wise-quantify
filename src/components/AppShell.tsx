import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Brain,
  Calculator,
  MessageCircle,
  Radio,
  Settings,
  Sparkles,
  Target,
  Radar,
  Thermometer,
  Trophy,
  Wrench,
  Goal,
  Ticket,
  Flame,
} from "lucide-react";
import { formatZagreb } from "@/lib/zagreb-time";

const NAV = [
  { to: "/", label: "Početna", icon: Sparkles },
  { to: "/tiket-arhitekt", label: "Tiket Arhitekt", icon: Ticket },
  { to: "/btts-over", label: "2.5 & BTTS Sharp", icon: Flame },
  { to: "/kalkulator", label: "Kalkulator", icon: Calculator },
  { to: "/radar", label: "Kvote Radar", icon: Radar },
  { to: "/over-under", label: "2.5 Termometar", icon: Thermometer },
  { to: "/zlatni-tip", label: "Zlatni tip", icon: Trophy },
  { to: "/prediktor", label: "Prediktor 3.5 & CS", icon: Target },
  { to: "/pro", label: "Pro Sharp", icon: Target },
  { to: "/pro-alati", label: "Pro Alati", icon: Wrench },
  { to: "/golovi", label: "Golovi Pro", icon: Goal },
  { to: "/ai-prognoza", label: "AI Prognoza", icon: Brain },
  { to: "/chat", label: "AI Chat", icon: MessageCircle },
  { to: "/uzivo", label: "Uživo", icon: Radio },
  { to: "/postavke", label: "Postavke", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    setNow(formatZagreb());
    const t = setInterval(() => setNow(formatZagreb()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="relative min-h-screen"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 group">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "#12131a", boxShadow: "0 0 22px rgba(225,29,46,0.45)" }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <polygon points="12,3 22,21 12,21" fill="#ffffff" />
                <polygon points="12,3 12,21 2,21" fill="#e11d2e" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Andromeda AI</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">
                AI predikcije · HR
              </div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden lg:block text-xs text-muted-foreground tabular-nums">{now}</div>
        </div>
        <nav className="md:hidden flex overflow-x-auto gap-1 border-t border-border/60 px-2 py-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap ${
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-muted-foreground border-t border-border/20 mt-auto">
        <div className="mb-1 font-medium">Aplikaciju izradio Goran Pavić</div>
        <div>Andromeda AI · Kladi se odgovorno · 18+</div>
      </footer>
    </div>
  );
}



