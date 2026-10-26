import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseLink, ProgressLine, SectionTitle } from "@/learn/components/learn-ui";
import { LANGUAGES } from "@/learn/content/languages";
import { getCourse } from "@/learn/content/curriculum";
import { courseProgress } from "@/learn/engine";
import { startCourse, useLearnerStats } from "@/learn/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/courses")({
  head: () => ({
    meta: [
      { title: "Courses — Lingua" },
      { name: "description", content: "Browse every leveled language course available on Lingua." },
    ],
  }),
  component: CoursesPage,
});

function CoursesPage() {
  const { progress } = useLearnerStats();

  return (
    <div>
      <SectionTitle
        title="Course catalog"
        description="Each course is split into CEFR levels, units and four activity types per unit."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {LANGUAGES.map((language) => {
          const course = getCourse(language.code);
          if (course.unitCount === 0) return null;
          const cp = courseProgress(progress, language.code);
          const active = progress.activeCourses.includes(language.code);

          return (
            <div
              key={language.code}
              className="flex flex-col rounded-2xl border border-border/60 bg-card/50 p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{language.flag}</span>
                  <div>
                    <div className="text-base font-semibold text-foreground">{language.name}</div>
                    <div className="text-xs text-muted-foreground">{language.nativeName}</div>
                  </div>
                </div>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Enrolled
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{language.blurb}</p>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> {course.levels.length} levels
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> {course.unitCount} units
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {course.lessonCount} activities
                </span>
              </div>

              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {cp.completedUnits} / {cp.totalUnits} units complete
                  </span>
                  <span className={cn("font-semibold", cp.percent > 0 && "text-primary")}>
                    {cp.percent}%
                  </span>
                </div>
                <ProgressLine value={cp.percent} />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <CourseLink courseId={language.code} className="flex-1">
                  <Button className="w-full" variant={active ? "outline" : "default"}>
                    {cp.completedUnits > 0 ? "Continue course" : "View course"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CourseLink>
                {!active && (
                  <Button variant="ghost" onClick={() => startCourse(language.code)}>
                    Enrol
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
