import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, CheckCircle2, Flame, RotateCcw, Sparkles, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AchievementBadge,
  CourseLink,
  EmptyState,
  ProgressLine,
  SectionTitle,
  StatTile,
  learnerLevel,
} from "@/learn/components/learn-ui";
import { ACHIEVEMENTS } from "@/learn/content/achievements";
import { KIND_LABELS, TOPIC_BY_ID } from "@/learn/content/curriculum";
import { LANGUAGES } from "@/learn/content/languages";
import {
  courseProgress,
  isUnitComplete,
  skillMastery,
  xpSeries,
  type CourseProgress,
} from "@/learn/engine";
import { resetProgress, useLearnerStats } from "@/learn/store";
import { LESSON_KINDS, type LessonKind } from "@/learn/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Lingua" },
      {
        name: "description",
        content: "Detailed learning analytics: XP, streaks, skill mastery and CEFR coverage.",
      },
    ],
  }),
  component: ProgressPage,
});

const KIND_ICONS: Record<LessonKind, string> = {
  vocabulary: "🃏",
  grammar: "🧩",
  listening: "🎧",
  shadowing: "🎙️",
};

function CourseBreakdown({ courseId, cp }: { courseId: string; cp: CourseProgress }) {
  const language = LANGUAGES.find((l) => l.code === courseId);
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{language?.flag}</span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{language?.name}</div>
          <div className="text-xs text-muted-foreground">
            {cp.completedUnits}/{cp.totalUnits} units · {cp.completedLessons}/{cp.totalLessons}{" "}
            activities
          </div>
        </div>
        <span className="text-lg font-bold tabular-nums text-primary">{cp.percent}%</span>
      </div>
      <div className="mt-3">
        <ProgressLine value={cp.percent} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {cp.levels.map((lvl) => (
          <div key={lvl.level} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{lvl.level}</span>
              <span className="text-muted-foreground">
                {lvl.completed}/{lvl.total}
              </span>
            </div>
            <div className="mt-2">
              <ProgressLine value={lvl.percent} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressPage() {
  const { progress, stats } = useLearnerStats();
  const [confirming, setConfirming] = useState(false);

  const series = xpSeries(progress, 14);
  const unlocked = new Set(progress.unlockedAchievements);
  const level = learnerLevel(progress.xp);
  const activeCourses = progress.activeCourses.filter((code) =>
    LANGUAGES.some((l) => l.code === code),
  );
  const maxDay = Math.max(...series.map((p) => p.xp), 1);
  const earnedThisWeek = series.slice(-7).reduce((sum, p) => sum + p.xp, 0);
  const units = Object.values(progress.units).sort((a, b) => b.lastAt - a.lastAt);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Progress report
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Level {level.level} · {progress.xp.toLocaleString()} XP
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {earnedThisWeek.toLocaleString()} XP in the last 7 days · {stats.lessonsCompleted}{" "}
              activities completed overall
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-sm font-semibold text-orange-200">
              <Flame className="h-4 w-4" /> {progress.streakDays}-day streak
            </span>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Level {level.level} progress</span>
            <span>
              {level.into} / {level.needed} XP to level {level.level + 1}
            </span>
          </div>
          <ProgressLine value={level.percent} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Total XP"
          value={progress.xp.toLocaleString()}
          hint={`Level ${level.level}`}
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Activities"
          value={stats.lessonsCompleted}
          hint={`${stats.perfectLessons} scored 100%`}
        />
        <StatTile
          icon={<Target className="h-3.5 w-3.5" />}
          label="Units mastered"
          value={stats.unitsCompleted}
          hint={`${stats.levelsCompleted} CEFR levels finished`}
        />
        <StatTile
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Achievements"
          value={`${unlocked.size}/${ACHIEVEMENTS.length}`}
          hint={`${stats.coursesCompleted} courses completed`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">XP over the last 14 days</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="progressXpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.585 0.232 25.5)" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="oklch(0.585 0.232 25.5)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.07)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                  interval={1}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.016 20)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                  formatter={(value: number) => [`${value} XP`, ""]}
                />
                <Area
                  type="monotone"
                  dataKey="xp"
                  stroke="oklch(0.585 0.232 25.5)"
                  strokeWidth={2}
                  fill="url(#progressXpFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-300" />
            <span className="text-sm font-semibold text-foreground">Daily activity</span>
          </div>
          <div className="flex h-40 items-end gap-1">
            {series.map((point) => (
              <div key={point.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn("w-full rounded-t bg-primary/70", point.xp === 0 && "bg-muted/40")}
                  style={{ height: `${Math.max(4, (point.xp / maxDay) * 100)}%` }}
                  title={`${point.label}: ${point.xp} XP`}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Best day: {maxDay} XP · {series.filter((p) => p.xp > 0).length}/14 active days
          </p>
        </div>
      </section>

      <section>
        <SectionTitle
          title="Skill mastery"
          description="Your average best score per activity type, across every course."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LESSON_KINDS.map((kind) => {
            const totals = Object.values(progress.units).map((u) => u.scores[kind]);
            const values = totals.filter((v): v is number => typeof v === "number");
            const avg = values.length
              ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
              : 0;
            return (
              <div key={kind} className="rounded-2xl border border-border/60 bg-card/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {KIND_ICONS[kind]} {KIND_LABELS[kind]}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      avg >= 85 ? "text-emerald-300" : "text-foreground",
                    )}
                  >
                    {avg}%
                  </span>
                </div>
                <div className="mt-3">
                  <ProgressLine value={avg} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {values.length} attempt{values.length === 1 ? "" : "s"} recorded
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Course coverage"
          description="Completion by CEFR level for each course you have started."
        />
        {activeCourses.length === 0 ? (
          <EmptyState
            title="No course started yet"
            description="Enrol in a course and finish an activity — your coverage will appear here."
            action={
              <CourseLink courseId="en">
                <Button>
                  Browse courses <Target className="ml-2 h-4 w-4" />
                </Button>
              </CourseLink>
            }
          />
        ) : (
          <div className="space-y-4">
            {activeCourses.map((code) => (
              <CourseBreakdown key={code} courseId={code} cp={courseProgress(progress, code)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          title="Achievements"
          description={`${unlocked.size} of ${ACHIEVEMENTS.length} badges unlocked.`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((def) => (
            <AchievementBadge key={def.id} def={def} unlocked={unlocked.has(def.id)} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Recent units"
          description="Your most recently touched units and their mastery."
        />
        {units.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nothing here yet. Finish an activity to start building your history.
          </p>
        ) : (
          <div className="space-y-2">
            {units.slice(0, 8).map((unit) => {
              const language = LANGUAGES.find((l) => l.code === unit.languageCode);
              const topic = TOPIC_BY_ID[unit.topicId];
              const done = unit.completed.length;
              return (
                <div
                  key={unit.topicId}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4"
                >
                  <span className="text-xl">{language?.flag}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {topic?.title ?? unit.topicId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {unit.level} · {done}/4 activities · {unit.attempts} attempt
                      {unit.attempts === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isUnitComplete(unit) ? "text-emerald-300" : "text-muted-foreground",
                    )}
                  >
                    {isUnitComplete(unit) ? "Mastered" : `${unit.mastery}% mastery`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Reset progress</div>
            <p className="text-xs text-muted-foreground">
              Clears XP, streaks, unit history and badges for this account. Your account stays.
            </p>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  resetProgress();
                  setConfirming(false);
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Confirm reset
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
