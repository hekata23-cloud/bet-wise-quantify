import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressLine } from "@/learn/components/learn-ui";
import {
  GrammarTrainer,
  ListeningTrainer,
  ShadowingTrainer,
  VocabularyTrainer,
  type ActivityProps,
} from "@/learn/components/Activities";
import type { AchievementDef } from "@/learn/content/achievements";
import { KIND_DESCRIPTIONS, KIND_LABELS, resolveLesson } from "@/learn/content/curriculum";
import { LANGUAGES } from "@/learn/content/languages";
import { learnerLevel } from "@/learn/components/learn-ui";
import { recordActivity } from "@/learn/store";
import { LESSON_KINDS, type LessonKind } from "@/learn/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/lesson/$topicId/$kind")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.kind} · lesson — Lingua` },
      {
        name: "description",
        content: "Interactive language activity: vocabulary, grammar, listening or shadowing.",
      },
    ],
  }),
  component: LessonPage,
});

interface FinishResult {
  score: number;
  xpGained: number;
  unlocked: AchievementDef[];
}

const TRAINERS: Record<LessonKind, (props: ActivityProps) => React.ReactElement | null> = {
  vocabulary: VocabularyTrainer,
  grammar: GrammarTrainer,
  listening: ListeningTrainer,
  shadowing: ShadowingTrainer,
};

function scoreVerdict(score: number): { label: string; className: string } {
  if (score >= 90) return { label: "Outstanding", className: "text-emerald-300" };
  if (score >= 75) return { label: "Solid work", className: "text-emerald-200" };
  if (score >= 55) return { label: "Getting there", className: "text-amber-200" };
  return { label: "Worth another pass", className: "text-destructive" };
}

function LessonPage() {
  const { topicId, kind } = Route.useParams();
  const navigate = useNavigate();
  const location = resolveLesson(topicId, kind);
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<FinishResult | null>(null);

  if (!location) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
        <h1 className="text-lg font-semibold">Activity not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The lesson “{topicId} / {kind}” does not exist in the curriculum.
        </p>
        <Link to="/learn/courses" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to courses
          </Button>
        </Link>
      </div>
    );
  }

  const { topic, lesson, unit } = location;
  const language = LANGUAGES.find((l) => l.code === lesson.languageCode)!;
  const Trainer = TRAINERS[lesson.kind];
  const kindIndex = LESSON_KINDS.indexOf(lesson.kind);
  const nextKind = LESSON_KINDS[kindIndex + 1];

  function handleFinish(score: number) {
    const outcome = recordActivity({
      topicId: topic.id,
      languageCode: lesson.languageCode,
      level: topic.level,
      kind: lesson.kind,
      score,
    });
    setResult({ score, xpGained: outcome.xpGained, unlocked: outcome.unlocked });
    for (const badge of outcome.unlocked) {
      toast.success(`${badge.icon} Achievement unlocked: ${badge.name}`, {
        description: `${badge.description} +${badge.xp} XP`,
      });
    }
    if (outcome.unlocked.length === 0) {
      toast.success(`+${outcome.xpGained} XP earned`, {
        description: `${KIND_LABELS[lesson.kind]} · ${score}%`,
      });
    }
  }

  const verdict = result ? scoreVerdict(result.score) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/learn/course/$courseId"
          params={{ courseId: lesson.languageCode }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {language.flag} {language.name}
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-border/60 px-2.5 py-1 text-muted-foreground">
            {topic.level}
          </span>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-foreground">
            {KIND_LABELS[lesson.kind]}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Unit · {unit.title}
        </p>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{unit.summary}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{KIND_DESCRIPTIONS[lesson.kind]}</p>
      </div>

      {result ? (
        <div className="rounded-3xl border border-border/60 bg-card/50 p-6 text-center sm:p-8">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary/40">
            <span className="text-3xl font-bold tabular-nums text-foreground">{result.score}%</span>
          </div>
          <div className={cn("mt-3 text-sm font-semibold", verdict?.className)}>
            {verdict?.label}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> XP earned
              </div>
              <div className="mt-1 text-2xl font-bold text-foreground">+{result.xpGained}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Activity
              </div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {lesson.kind === "shadowing"
                  ? "🎙️"
                  : lesson.kind === "listening"
                    ? "🎧"
                    : lesson.kind === "grammar"
                      ? "🧩"
                      : "🃏"}
              </div>
            </div>
          </div>

          {result.unlocked.length > 0 && (
            <div className="mt-5 space-y-2 text-left">
              {result.unlocked.map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3"
                >
                  <Trophy className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {badge.icon} {badge.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{badge.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setAttempt((a) => a + 1);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Try again
            </Button>
            {nextKind ? (
              <Button
                onClick={() =>
                  navigate({
                    to: "/learn/lesson/$topicId/$kind",
                    params: { topicId: topic.id, kind: nextKind },
                  })
                }
              >
                Next: {KIND_LABELS[nextKind]} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() =>
                  navigate({
                    to: "/learn/course/$courseId",
                    params: { courseId: lesson.languageCode },
                  })
                }
              >
                Back to course <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
          <Link
            to="/learn/course/$courseId"
            params={{ courseId: lesson.languageCode }}
            className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            View unit progress
          </Link>
        </div>
      ) : (
        <div key={attempt}>
          <Trainer topic={topic} language={language} onFinish={handleFinish} />
        </div>
      )}
    </div>
  );
}
