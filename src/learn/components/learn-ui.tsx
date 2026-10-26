import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { AchievementDef } from "@/learn/content/achievements";
import { TIER_STYLES } from "@/learn/content/achievements";
import type { LessonKind } from "@/learn/types";
import { cn } from "@/lib/utils";

/** Renders children only after mount so localStorage-backed state never breaks SSR hydration. */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

export function LearnLoading({ label = "Loading your learning space…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        {label}
      </div>
    </div>
  );
}

export function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ProgressLine({ value, className }: { value: number; className?: string }) {
  return <Progress value={Math.max(0, Math.min(100, value))} className={cn("h-2", className)} />;
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AchievementBadge({ def, unlocked }: { def: AchievementDef; unlocked: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        unlocked ? TIER_STYLES[def.tier] : "border-border/50 bg-card/40 text-muted-foreground",
      )}
    >
      <span className={cn("text-2xl leading-none", !unlocked && "opacity-40")}>
        {unlocked ? def.icon : <Lock className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{def.name}</div>
        <div className="text-xs opacity-80">{def.description}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/30 p-8 text-center">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Typed link straight into a specific activity of a unit. */
export function LessonLink({
  topicId,
  kind,
  className,
  children,
}: {
  topicId: string;
  kind: LessonKind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to="/learn/lesson/$topicId/$kind" params={{ topicId, kind }} className={className}>
      {children}
    </Link>
  );
}

export function CourseLink({
  courseId,
  className,
  children,
}: {
  courseId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to="/learn/course/$courseId" params={{ courseId }} className={className}>
      {children}
    </Link>
  );
}

/** 1 level per 500 XP; returns the level number and progress toward the next. */
export function learnerLevel(xp: number): {
  level: number;
  into: number;
  needed: number;
  percent: number;
} {
  const needed = 500;
  const level = Math.floor(xp / needed) + 1;
  const into = xp % needed;
  return { level, into, needed, percent: Math.round((into / needed) * 100) };
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
