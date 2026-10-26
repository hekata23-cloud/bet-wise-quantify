import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Compass, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseLink, LessonLink, ProgressLine, SectionTitle } from "@/learn/components/learn-ui";
import { ACHIEVEMENTS } from "@/learn/content/achievements";
import { KIND_DESCRIPTIONS, KIND_LABELS } from "@/learn/content/curriculum";
import { LANGUAGES } from "@/learn/content/languages";
import { getCourse } from "@/learn/content/curriculum";
import {
  buildRecommendations,
  courseProgress,
  isUnitComplete,
  skillMastery,
  type Recommendation,
} from "@/learn/engine";
import { LESSON_KINDS } from "@/learn/types";
import { useLearnerStats } from "@/learn/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/path")({
  head: () => ({
    meta: [
      { title: "My Path — Lingua" },
      { name: "description", content: "Your personalised language-learning path and weekly plan." },
    ],
  }),
  component: PathPage,
});

const KIND_ICONS: Record<string, string> = {
  vocabulary: "🃏",
  grammar: "🧩",
  listening: "🎧",
  shadowing: "🎙️",
};

function PathItem({ step, rec }: { step: number; rec: Recommendation }) {
  const language = LANGUAGES.find((l) => l.code === rec.languageCode);
  const target = rec.topicId && rec.lessonKind;

  const body = (
    <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold text-foreground">
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{language?.flag ?? "🌍"}</span>
          <span className="text-sm font-semibold text-foreground">{rec.title}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
        {rec.lessonKind && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {KIND_ICONS[rec.lessonKind]} {KIND_LABELS[rec.lessonKind]}
          </span>
        )}
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );

  return target ? (
    <LessonLink topicId={rec.topicId!} kind={rec.lessonKind!} className="block">
      {body}
    </LessonLink>
  ) : (
    <CourseLink courseId={rec.languageCode} className="block">
      {body}
    </CourseLink>
  );
}

function PathPage() {
  const { progress, stats } = useLearnerStats();
  const recommendations = buildRecommendations(progress, 6);
  const activeCourses = progress.activeCourses.filter((c) => LANGUAGES.some((l) => l.code === c));
  const focusCourse = activeCourses[0] ?? LANGUAGES[0].code;
  const mastery = skillMastery(progress, focusCourse);
  const weakest = LESSON_KINDS.slice().sort((a, b) => mastery[a] - mastery[b])[0];
  const nextBadge = ACHIEVEMENTS.find((a) => !progress.unlockedAchievements.includes(a.id));

  // Turn the recommendations into a simple, honest week plan: one focus per day.
  const weekPlan = recommendations.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/50 p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3.5 w-3.5 text-primary" /> Personalized learning path
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          What to study next, and why
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Lingua ranks your next actions from your own data: unfinished units first, then your
          weakest skill, then a nudge to broaden or protect your streak. Nothing here is random.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 lg:col-span-2">
          <SectionTitle
            title="Your next steps"
            description="Work top to bottom — each step is one activity."
          />
          {recommendations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Enrol in a course to unlock your personalised path.
            </p>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <PathItem key={rec.id} step={i + 1} rec={rec} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Weakest skill</span>
            </div>
            <div className="mt-3 text-2xl">
              {KIND_ICONS[weakest]}{" "}
              <span className="text-lg font-semibold">{KIND_LABELS[weakest]}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Averaging {mastery[weakest]}% in {LANGUAGES.find((l) => l.code === focusCourse)?.name}
              . {KIND_DESCRIPTIONS[weakest]}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Skill mastery</span>
            </div>
            <div className="mt-3 space-y-3">
              {LESSON_KINDS.map((kind) => (
                <div key={kind}>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {KIND_ICONS[kind]} {KIND_LABELS[kind]}
                    </span>
                    <span
                      className={cn("font-semibold", mastery[kind] >= 85 && "text-emerald-300")}
                    >
                      {mastery[kind]}%
                    </span>
                  </div>
                  <ProgressLine value={mastery[kind]} />
                </div>
              ))}
            </div>
          </div>

          {nextBadge && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Next badge
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl">{nextBadge.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{nextBadge.name}</div>
                  <div className="text-xs text-muted-foreground">{nextBadge.description}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Suggested week"
          description="One focused activity per day keeps the streak and spreads the skills."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {weekPlan.length === 0 && (
            <p className="text-sm text-muted-foreground">No plan yet — start a course first.</p>
          )}
          {weekPlan.map((rec, i) => {
            const language = LANGUAGES.find((l) => l.code === rec.languageCode);
            return (
              <div key={rec.id} className="rounded-2xl border border-border/60 bg-card/50 p-4">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <CalendarDays className="h-3 w-3" /> Day {i + 1}
                </div>
                <div className="mt-2 text-lg">{language?.flag}</div>
                <div className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                  {rec.title}
                </div>
                {rec.lessonKind && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {KIND_LABELS[rec.lessonKind]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Course coverage"
          description="How much of each enrolled course you have mastered."
        />
        <div className="space-y-3">
          {activeCourses.length === 0 && (
            <p className="text-sm text-muted-foreground">You have not enrolled in a course yet.</p>
          )}
          {activeCourses.map((code) => {
            const language = LANGUAGES.find((l) => l.code === code);
            const course = getCourse(code);
            const cp = courseProgress(progress, code);
            return (
              <div key={code} className="rounded-2xl border border-border/60 bg-card/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{language?.flag}</span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{language?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {cp.completedUnits}/{cp.totalUnits} units · {stats.lessonsCompleted}{" "}
                        activities overall
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {course.levels.map((lvl) => {
                      const done = lvl.units.filter((u) =>
                        isUnitComplete(progress.units[u.topicId]),
                      ).length;
                      const complete = done === lvl.units.length;
                      return (
                        <span
                          key={lvl.level}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                            complete
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                              : "border-border/60 text-muted-foreground",
                          )}
                        >
                          {lvl.level} {done}/{lvl.units.length}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressLine value={cp.percent} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <CourseLink courseId={focusCourse}>
            <Button variant="outline">
              Open {LANGUAGES.find((l) => l.code === focusCourse)?.name} course
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CourseLink>
        </div>
      </section>
    </div>
  );
}
