import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Compass,
  Flame,
  GraduationCap,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AchievementBadge,
  CourseLink,
  EmptyState,
  LessonLink,
  ProgressLine,
  SectionTitle,
  StatTile,
  learnerLevel,
} from "@/learn/components/learn-ui";
import { ACHIEVEMENTS } from "@/learn/content/achievements";
import { KIND_LABELS } from "@/learn/content/curriculum";
import { LANGUAGES } from "@/learn/content/languages";
import {
  buildRecommendations,
  courseProgress,
  xpSeries,
  type Recommendation,
} from "@/learn/engine";
import { startCourse, useCurrentUser, useLearnerStats } from "@/learn/store";

export const Route = createFileRoute("/learn/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Lingua" },
      {
        name: "description",
        content: "Your daily language-learning dashboard, streak and recommendations.",
      },
    ],
  }),
  component: DashboardPage,
});

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const language = LANGUAGES.find((l) => l.code === rec.languageCode);
  const inner = (
    <div className="flex h-full items-start gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/50">
      <span className="text-2xl">{language?.flag ?? "🌍"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{rec.title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
        {rec.lessonKind && (
          <span className="mt-2 inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {KIND_LABELS[rec.lessonKind]}
          </span>
        )}
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );

  if (rec.topicId && rec.lessonKind) {
    return (
      <LessonLink topicId={rec.topicId} kind={rec.lessonKind} className="block">
        {inner}
      </LessonLink>
    );
  }
  return (
    <CourseLink courseId={rec.languageCode} className="block">
      {inner}
    </CourseLink>
  );
}

function DashboardPage() {
  const user = useCurrentUser();
  const { progress, stats } = useLearnerStats();

  const recommendations = buildRecommendations(progress, 4);
  const series = xpSeries(progress, 14);
  const activeCourses = progress.activeCourses.filter((code) =>
    LANGUAGES.some((l) => l.code === code),
  );
  const unlocked = new Set(progress.unlockedAchievements);
  const level = learnerLevel(progress.xp);
  const earnedThisWeek = series.slice(-7).reduce((sum, p) => sum + p.xp, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{greeting()}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {user?.name?.split(" ")[0] ?? "Learner"}, level {level.level}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats.lessonsCompleted} activities finished · {stats.unitsCompleted} units mastered ·{" "}
              {earnedThisWeek} XP in the last 7 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-sm font-semibold text-orange-200">
              <Flame className="h-4 w-4" /> {progress.streakDays}-day streak
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> {progress.xp.toLocaleString()} XP
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

      <section>
        <SectionTitle
          title="Recommended for you"
          description="Ranked from your progress, weakest skills and streak."
          action={
            <Link to="/learn/path" className="text-xs font-medium text-primary hover:underline">
              Full learning path
            </Link>
          }
        />
        {recommendations.length === 0 ? (
          <EmptyState
            title="Your path is empty"
            description="Enrol in a course to generate personalised recommendations."
            action={
              <Link to="/learn/courses">
                <Button>
                  Browse courses <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Total XP"
          value={progress.xp.toLocaleString()}
          hint={`Level ${level.level}`}
        />
        <StatTile
          icon={<Flame className="h-3.5 w-3.5" />}
          label="Streak"
          value={`${progress.streakDays} days`}
          hint="Consecutive active days"
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
          hint="Badges unlocked"
        />
      </section>

      {activeCourses.length > 0 && (
        <section>
          <SectionTitle title="Your courses" description="Keep each language moving forward." />
          <div className="grid gap-3 sm:grid-cols-2">
            {activeCourses.map((code) => {
              const language = LANGUAGES.find((l) => l.code === code);
              const cp = courseProgress(progress, code);
              return (
                <CourseLink key={code} courseId={code} className="block">
                  <div className="rounded-2xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{language?.flag}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">
                          {language?.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {cp.completedUnits}/{cp.totalUnits} units · {cp.completedLessons}/
                          {cp.totalLessons} activities
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-primary">{cp.percent}%</span>
                    </div>
                    <div className="mt-3">
                      <ProgressLine value={cp.percent} />
                    </div>
                  </div>
                </CourseLink>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">XP over the last 14 days</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
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
                  interval={2}
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
                  fill="url(#xpFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Latest achievements</span>
            </div>
            <Link to="/learn/progress" className="text-xs text-primary hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {ACHIEVEMENTS.filter((a) => unlocked.has(a.id))
              .slice(-3)
              .map((a) => (
                <AchievementBadge key={a.id} def={a} unlocked />
              ))}
            {unlocked.size === 0 && (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Finish your first activity to start collecting badges.
              </p>
            )}
          </div>
        </div>
      </section>

      {activeCourses.length === 0 && (
        <section>
          <SectionTitle
            title="Pick a language"
            description="Start with any course — you can switch or add more later."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {LANGUAGES.slice(0, 3).map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => startCourse(language.code)}
                className="rounded-2xl border border-border/60 bg-card/50 p-4 text-left transition-colors hover:border-primary/50"
              >
                <span className="text-3xl">{language.flag}</span>
                <div className="mt-2 text-sm font-semibold text-foreground">{language.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{language.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <GraduationCap className="h-3.5 w-3.5" /> Enrol &amp; start
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/learn/courses" className="block">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Browse all courses</span>
          </div>
        </Link>
        <Link to="/learn/community" className="block">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40">
            <Compass className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Community &amp; leaderboard</span>
          </div>
        </Link>
        <Link to="/learn/progress" className="block">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Detailed progress report</span>
          </div>
        </Link>
      </section>
    </div>
  );
}
