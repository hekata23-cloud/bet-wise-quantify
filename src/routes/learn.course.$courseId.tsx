import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Layers,
  Lock,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonLink, ProgressLine, SectionTitle } from "@/learn/components/learn-ui";
import { KIND_DESCRIPTIONS, KIND_LABELS, getCourse } from "@/learn/content/curriculum";
import { LANGUAGES } from "@/learn/content/languages";
import { courseProgress, isUnitComplete } from "@/learn/engine";
import { LESSON_KINDS } from "@/learn/types";
import { startCourse, useLearnerStats } from "@/learn/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/course/$courseId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.courseId.toUpperCase()} course — Lingua` },
      { name: "description", content: "Leveled units and interactive activities for this course." },
    ],
  }),
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const { progress } = useLearnerStats();
  const language = LANGUAGES.find((l) => l.code === courseId);
  const course = getCourse(courseId);

  if (!language || course.unitCount === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
        <h1 className="text-lg font-semibold">Course not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We do not have content for “{courseId}” yet.
        </p>
        <Link to="/learn/courses" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to catalog
          </Button>
        </Link>
      </div>
    );
  }

  const cp = courseProgress(progress, courseId);
  const enrolled = progress.activeCourses.includes(courseId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/learn/courses"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All courses
        </Link>
      </div>

      <section className="rounded-3xl border border-border/60 bg-card/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{language.flag}</span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{language.name}</h1>
              <p className="text-sm text-muted-foreground">
                {language.nativeName} · {course.levels.length} CEFR levels · {course.unitCount} units
              </p>
            </div>
          </div>
          {!enrolled && (
            <Button onClick={() => startCourse(courseId)}>
              <Sparkles className="mr-2 h-4 w-4" /> Enrol in this course
            </Button>
          )}
        </div>

        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{language.blurb}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Course progress</span>
              <span className="font-semibold text-primary">{cp.percent}%</span>
            </div>
            <ProgressLine value={cp.percent} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {cp.levels.map((lvl) => (
              <div key={lvl.level} className="rounded-xl border border-border/60 bg-background/40 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{lvl.level}</div>
                <div className="text-sm font-semibold text-foreground">{lvl.percent}%</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {course.levels.map((level, levelIndex) => {
        const unlocked = levelIndex === 0 || (cp.levels[levelIndex - 1]?.percent ?? 0) >= 50;
        const levelStat = cp.levels[levelIndex];

        return (
          <section key={level.level}>
            <SectionTitle
              title={`Level ${level.level}`}
              description={`${level.units.length} units · ${levelStat?.completed ?? 0} mastered`}
              action={
                unlocked ? (
                  <span className="text-xs text-muted-foreground">{levelStat?.percent ?? 0}% complete</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Reach 50% of {cp.levels[levelIndex - 1]?.level} to unlock
                  </span>
                )
              }
            />

            <div className={cn("grid gap-3", !unlocked && "pointer-events-none opacity-45")}>
              {level.units.map((unit) => {
                const up = progress.units[unit.topicId];
                const complete = isUnitComplete(up);
                return (
                  <div key={unit.id} className="rounded-2xl border border-border/60 bg-card/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {complete ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-semibold text-foreground">{unit.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{unit.summary}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Mastery</div>
                        <div className={cn("text-sm font-semibold", complete && "text-emerald-300")}>
                          {up?.mastery ?? 0}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {LESSON_KINDS.map((kind) => {
                        const score = up?.scores[kind];
                        const done = up?.completed.includes(kind);
                        return (
                          <LessonLink
                            key={kind}
                            topicId={unit.topicId}
                            kind={kind}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border p-2.5 transition-colors",
                              done
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : "border-border/60 bg-background/40 hover:border-primary/50",
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            ) : (
                              <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-foreground">
                                {KIND_LABELS[kind]}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {done ? `Best ${score}%` : "Not started"}
                              </div>
                            </div>
                          </LessonLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">How each unit works</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LESSON_KINDS.map((kind) => (
            <div key={kind} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="text-xs font-semibold text-foreground">{KIND_LABELS[kind]}</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{KIND_DESCRIPTIONS[kind]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Complete all four activities to master a unit. Your mastery is the average of your best score in
          each activity.
        </p>
      </section>
    </div>
  );
}
