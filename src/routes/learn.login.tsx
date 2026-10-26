import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  GraduationCap,
  Headphones,
  Languages,
  Loader2,
  Mic,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { continueAsGuest, login, register, useLearnState } from "@/learn/store";
import { LANGUAGES } from "@/learn/content/languages";

export const Route = createFileRoute("/learn/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Lingua" },
      {
        name: "description",
        content: "Create your Lingua account and start learning a language today.",
      },
    ],
  }),
  component: LoginPage,
});

const AVATARS = ["🦊", "🐼", "🦉", "🐙", "🦁", "🐳", "🦄", "🐝", "🦖", "🐨"];

const HIGHLIGHTS = [
  {
    icon: Languages,
    title: "Six leveled courses",
    body: "English, Spanish, French, German, Japanese and Korean, mapped to CEFR A1–B1.",
  },
  {
    icon: Headphones,
    title: "Four skill modules",
    body: "Flashcards, grammar drills, listening comprehension and oral shadowing.",
  },
  {
    icon: TrendingUp,
    title: "Progress you can see",
    body: "XP, streaks, per-skill mastery and a recommendation engine for what to do next.",
  },
  {
    icon: Sparkles,
    title: "Achievements & community",
    body: "Unlock badges, climb the leaderboard and swap tips with other learners.",
  },
];

function LoginPage() {
  const navigate = useNavigate();
  const { currentUserId } = useLearnState();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (currentUserId) navigate({ to: "/learn", replace: true });
  }, [currentUserId, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result =
      mode === "register" ? register({ name, email, password, avatar }) : login(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    navigate({ to: "/learn" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2">
        <div>
          <Link to="/" className="mb-8 inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Lingua</span>
          </Link>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Learn a language the way your brain actually works.
          </h1>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground">
            Short, leveled units built around four deliberate modules — recall, grammar, listening
            and shadowing — with a personal path that adapts to your weakest skill.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.title} className="rounded-2xl border border-border/60 bg-card/50 p-4">
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="mt-2 text-sm font-semibold text-foreground">{h.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{h.body}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <span
                key={l.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="text-sm">{l.flag}</span>
                {l.nativeName}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/60 p-6 sm:p-8">
          <div className="mb-5 flex rounded-xl border border-border/60 p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <Label>Pick an avatar</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAvatar(a)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors",
                        avatar === a
                          ? "border-primary bg-primary/15"
                          : "border-border/60 hover:bg-muted/60",
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create my account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border/60" />
            or
            <span className="h-px flex-1 bg-border/60" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              continueAsGuest();
              navigate({ to: "/learn" });
            }}
          >
            <Mic className="mr-2 h-4 w-4" /> Continue as a guest learner
          </Button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Lingua runs entirely in your browser: accounts, progress and posts are stored locally in
            this device. Nothing is uploaded.
          </p>
        </div>
      </div>
    </div>
  );
}
