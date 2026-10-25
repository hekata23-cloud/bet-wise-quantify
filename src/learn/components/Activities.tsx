import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Ear,
  Headphones,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { LanguageDef, Topic, VocabItem } from "@/learn/types";
import {
  cancelSpeech,
  isRecognitionSupported,
  listenOnce,
  pronunciationVerdict,
  similarity,
  speak,
} from "@/learn/speech";

export interface ActivityProps {
  topic: Topic;
  language: LanguageDef;
  /** Invoked exactly once, with a 0-100 score, when the learner finishes. */
  onFinish: (score: number) => void;
}

function ActivityHeader({
  icon,
  label,
  detail,
  percent,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  percent: number;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wider">
          {icon}
          {label}
        </span>
        <span>{detail}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, percent))} className="h-1.5" />
    </div>
  );
}

function SpeakButton({
  text,
  language,
  className,
}: {
  text: string;
  language: LanguageDef;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 shrink-0 text-muted-foreground hover:text-primary", className)}
      aria-label="Play pronunciation"
      onClick={async () => {
        setBusy(true);
        await speak(text, language.speechTag);
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Vocabulary — active-recall flashcards with a re-queue pass       */
/* ------------------------------------------------------------------ */

export function VocabularyTrainer({ topic, language, onFinish }: ActivityProps) {
  const byId = useMemo(
    () => Object.fromEntries(topic.vocab.map((v) => [v.id, v])) as Record<string, VocabItem>,
    [topic],
  );
  const [queue, setQueue] = useState<string[]>(() => topic.vocab.map((v) => v.id));
  const [cursor, setCursor] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [requeued, setRequeued] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);

  const total = topic.vocab.length;
  const item = byId[queue[cursor]];
  const masteredCount = Object.keys(scores).length;

  function rate(score: number) {
    if (!item) return;
    const nextScores = { ...scores, [item.id]: Math.max(scores[item.id] ?? 0, score) };
    let nextQueue = queue;
    if (score < 70 && !requeued.includes(item.id)) {
      nextQueue = [...queue, item.id];
      setRequeued((prev) => [...prev, item.id]);
    }
    setScores(nextScores);
    setRevealed(false);
    setQueue(nextQueue);

    if (cursor + 1 >= nextQueue.length) {
      const values = Object.values(nextScores);
      onFinish(Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)));
    } else {
      setCursor((c) => c + 1);
    }
  }

  if (!item) return null;

  return (
    <div>
      <ActivityHeader
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="Vocabulary"
        detail={`Card ${Math.min(cursor + 1, queue.length)} of ${queue.length} · ${masteredCount}/${total} seen`}
        percent={(masteredCount / total) * 100}
      />

      <div className="rounded-3xl border border-border/60 bg-card/60 p-6 text-center sm:p-10">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {item.term}
          </span>
          <SpeakButton text={item.term} language={language} />
        </div>
        {item.reading && (
          <div className="mt-1 text-sm italic text-muted-foreground">{item.reading}</div>
        )}
        <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">{item.pos}</div>

        {revealed ? (
          <div className="mt-6 space-y-3">
            <div className="text-lg font-medium text-primary">{item.translation}</div>
            {item.example && (
              <div className="mx-auto max-w-lg rounded-xl border border-border/50 bg-background/50 p-3 text-left">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm text-foreground">{item.example}</p>
                  <SpeakButton text={item.example} language={language} />
                </div>
                {item.exampleTranslation && (
                  <p className="mt-1 text-xs text-muted-foreground">{item.exampleTranslation}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <Button className="mt-6" variant="secondary" onClick={() => setRevealed(true)}>
            Show meaning
          </Button>
        )}
      </div>

      {revealed && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => rate(30)} className="border-destructive/40 text-destructive">
            <X className="mr-1.5 h-4 w-4" /> Missed it
          </Button>
          <Button variant="outline" onClick={() => rate(70)} className="border-amber-400/40 text-amber-200">
            Almost
          </Button>
          <Button onClick={() => rate(100)} className="bg-emerald-600 text-white hover:bg-emerald-500">
            <Check className="mr-1.5 h-4 w-4" /> Knew it
          </Button>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Cards you miss come back once more before the unit closes.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Grammar — pick the correct form, with explanations               */
/* ------------------------------------------------------------------ */

export function GrammarTrainer({ topic, language, onFinish }: ActivityProps) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const total = topic.grammar.length;
  const question = topic.grammar[index];

  useEffect(() => {
    cancelSpeech();
  }, [index]);

  if (!question) return null;

  const answered = picked !== null;
  const isRight = picked === question.answer;

  function next() {
    if (isRight) setCorrect((c) => c + 1);
    const nextCorrect = isRight ? correct + 1 : correct;
    setPicked(null);
    if (index + 1 >= total) {
      onFinish(Math.round((nextCorrect / total) * 100));
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <div>
      <ActivityHeader
        icon={<Check className="h-3.5 w-3.5" />}
        label="Grammar"
        detail={`Question ${index + 1} of ${total}`}
        percent={(index / total) * 100}
      />

      <div className="rounded-3xl border border-border/60 bg-card/60 p-6 sm:p-8">
        <p className="text-center text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
          {question.prompt}
        </p>
        <div className="mt-4 flex justify-center">
          <SpeakButton text={question.prompt.replace(/___/g, "")} language={language} />
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const chosen = picked === option;
            const isAnswer = option === question.answer;
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                onClick={() => setPicked(option)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                  "border-border/60 bg-background/40 hover:border-primary/50 hover:bg-primary/5",
                  answered && isAnswer && "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
                  answered && chosen && !isAnswer && "border-destructive/60 bg-destructive/10 text-destructive",
                  answered && !isAnswer && !chosen && "opacity-50",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>

        {answered && (
          <div
            className={cn(
              "mt-5 rounded-xl border p-3 text-sm",
              isRight
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-amber-500/40 bg-amber-500/10 text-amber-100",
            )}
          >
            <div className="flex items-center gap-2 font-medium">
              {isRight ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {isRight ? "Correct" : `Not quite — the answer is "${question.answer}"`}
            </div>
            <p className="mt-1 text-xs opacity-90">{question.explanation}</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={next} disabled={!answered}>
          {index + 1 >= total ? "Finish" : "Next question"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Listening — TTS audio, then comprehension questions              */
/* ------------------------------------------------------------------ */

export function ListeningTrainer({ topic, language, onFinish }: ActivityProps) {
  const task = topic.listening;
  const [rate, setRate] = useState(0.95);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    return () => cancelSpeech();
  }, []);

  const total = task.questions.length;
  const correct = task.questions.filter((q) => answers[q.id] === q.answer).length;
  const allAnswered = task.questions.every((q) => answers[q.id]);

  async function play() {
    setPlaying(true);
    setPlays((p) => p + 1);
    await speak(task.transcript, language.speechTag, { rate });
    setPlaying(false);
  }

  return (
    <div>
      <ActivityHeader
        icon={<Headphones className="h-3.5 w-3.5" />}
        label="Listening"
        detail={`${total} questions · ${plays} play${plays === 1 ? "" : "s"}`}
        percent={(Object.keys(answers).length / total) * 100}
      />

      <div className="rounded-3xl border border-border/60 bg-card/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Listen and answer. Replay as often as you like — real ears need repetition.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={play} disabled={playing} size="lg">
            {playing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
            {plays === 0 ? "Play audio" : "Play again"}
          </Button>
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1">
            {[0.75, 0.95, 1.1].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  rate === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {r === 1.1 ? "1.1×" : `${r}×`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {task.questions.map((q, qi) => (
          <div key={q.id} className="rounded-2xl border border-border/60 bg-card/50 p-4">
            <div className="mb-3 flex items-start gap-2">
              <Ear className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {qi + 1}. {q.question}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((option) => {
                const chosen = answers[q.id] === option;
                const isAnswer = option === q.answer;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                      "border-border/60 bg-background/40 hover:border-primary/50",
                      chosen && !submitted && "border-primary bg-primary/10",
                      submitted && isAnswer && "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
                      submitted && chosen && !isAnswer && "border-destructive/60 bg-destructive/10 text-destructive",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {submitted && (
        <div className="mt-5 rounded-2xl border border-border/60 bg-background/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcript</div>
          <p className="mt-2 text-sm text-foreground">{task.transcript}</p>
          <p className="mt-1 text-xs text-muted-foreground">{task.translation}</p>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          disabled={!allAnswered || submitted}
          onClick={() => {
            setSubmitted(true);
            onFinish(Math.round((correct / total) * 100));
          }}
        >
          {submitted ? "Finished" : "Check answers"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Shadowing — speak along, get an accuracy score                   */
/* ------------------------------------------------------------------ */

export function ShadowingTrainer({ topic, language, onFinish }: ActivityProps) {
  const task = topic.shadowing;
  const supported = isRecognitionSupported();
  const [status, setStatus] = useState<"idle" | "listening" | "scoring">("idle");
  const [transcript, setTranscript] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => cancelSpeech();
  }, []);

  async function record() {
    setError(null);
    setStatus("listening");
    setTranscript("");
    try {
      const said = await listenOnce(language.speechTag);
      const s = Math.round(similarity(task.text, said, language.code) * 100);
      setTranscript(said);
      setScore((prev) => (prev === null ? s : Math.max(prev, s)));
      setAttempts((a) => a + 1);
      setStatus("scoring");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed.");
      setStatus("idle");
    }
  }

  function selfRate(s: number) {
    setScore((prev) => (prev === null ? s : Math.max(prev, s)));
    setAttempts((a) => a + 1);
    setStatus("scoring");
  }

  const verdict = score !== null ? pronunciationVerdict(score) : null;
  const canFinish = score !== null;

  return (
    <div>
      <ActivityHeader
        icon={<Mic className="h-3.5 w-3.5" />}
        label="Shadowing"
        detail={`${attempts} attempt${attempts === 1 ? "" : "s"}${score !== null ? ` · best ${score}%` : ""}`}
        percent={score ?? 0}
      />

      <div className="rounded-3xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Listen, then repeat</div>
            <p className="mt-1 text-xl font-medium leading-relaxed text-foreground">{task.text}</p>
            <p className="mt-1 text-sm text-muted-foreground">{task.translation}</p>
          </div>
          <SpeakButton text={task.text} language={language} className="h-10 w-10" />
        </div>
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs text-foreground">
          <span className="font-semibold">Coaching tip: </span>
          {task.tip}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {supported ? (
          <>
            <Button onClick={record} disabled={status === "listening"}>
              {status === "listening" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Listening…
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" /> Record &amp; compare
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => speak(task.text, language.speechTag, { rate: 0.8 })}>
              <Volume2 className="mr-2 h-4 w-4" /> Slow playback
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Speech recognition isn&apos;t available in this browser — rate yourself honestly:
            </span>
            <Button variant="outline" onClick={() => selfRate(40)}>
              Hard
            </Button>
            <Button variant="outline" onClick={() => selfRate(70)}>
              Close
            </Button>
            <Button onClick={() => selfRate(100)}>Nailed it</Button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {transcript && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            We heard
          </div>
          <p className="mt-1 text-sm text-foreground">{transcript}</p>
        </div>
      )}

      {score !== null && verdict && (
        <div
          className={cn(
            "mt-4 flex items-center justify-between rounded-2xl border p-4",
            verdict.tone === "success" && "border-emerald-500/40 bg-emerald-500/10",
            verdict.tone === "warning" && "border-amber-500/40 bg-amber-500/10",
            verdict.tone === "danger" && "border-destructive/40 bg-destructive/10",
          )}
        >
          <div>
            <div className="text-sm font-semibold text-foreground">{verdict.label}</div>
            <div className="text-xs text-muted-foreground">Pronunciation match {score}%</div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-foreground">{score}%</div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => speak(task.text, language.speechTag)}>
          <RotateCcw className="mr-2 h-4 w-4" /> Hear it once more
        </Button>
        <Button disabled={!canFinish} onClick={() => canFinish && onFinish(score)}>
          Finish activity
        </Button>
      </div>
    </div>
  );
}
