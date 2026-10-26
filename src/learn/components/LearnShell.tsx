import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Flame,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Route as RouteIcon,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCurrentUser, useLearnState, logout } from "@/learn/store";
import { learnerLevel } from "@/learn/components/learn-ui";
import { cn } from "@/lib/utils";

interface NavItem {
  to: "/learn" | "/learn/courses" | "/learn/path" | "/learn/progress" | "/learn/community";
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: "/learn", label: "Dashboard", icon: LayoutDashboard },
  { to: "/learn/courses", label: "Courses", icon: BookOpen },
  { to: "/learn/path", label: "My Path", icon: RouteIcon },
  { to: "/learn/progress", label: "Progress", icon: BarChart3 },
  { to: "/learn/community", label: "Community", icon: Users },
];

export function LearnShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const state = useLearnState();
  const user = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const progress = user ? state.progress[user.id] : undefined;
  const xp = progress?.xp ?? 0;
  const streak = progress?.streakDays ?? 0;
  const { level, percent } = learnerLevel(xp);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/learn" className="flex shrink-0 items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              style={{ boxShadow: "0 0 20px rgba(225,29,46,0.35)" }}
            >
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight sm:text-base">Lingua</span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                Immersive language learning
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-lg border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs font-semibold text-orange-200 sm:inline-flex">
              <Flame className="h-3.5 w-3.5" />
              {streak}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-foreground">{xp.toLocaleString()} XP</span>
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/60"
              >
                <span className="text-base leading-none">{user?.avatar ?? "🙂"}</span>
                <span className="hidden max-w-24 truncate sm:inline">{user?.name ?? "Guest"}</span>
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  Lv {level}
                </span>
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border/60 bg-popover p-3 shadow-xl">
                    <div className="mb-2">
                      <div className="text-sm font-medium">{user?.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                    </div>
                    <div className="mb-2 rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Level {level}</span>
                        <span>{percent}% to next</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background/70">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                    <Link
                      to="/learn/progress"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> My progress
                    </Link>
                    <Link
                      to="/"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to Andromeda AI
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="border-t border-border/40 bg-card/30">
          <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5">
            {NAV.map((item) => {
              const active = item.to === "/learn" ? pathname === "/learn" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        Lingua · Immersive language learning · English, Spanish, French, German, Japanese &amp; Korean
      </footer>
    </div>
  );
}
