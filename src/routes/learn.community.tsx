import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Flame,
  Heart,
  Medal,
  MessageCircle,
  Send,
  Share2,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AchievementBadge,
  EmptyState,
  SectionTitle,
  formatRelativeTime,
  learnerLevel,
} from "@/learn/components/learn-ui";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from "@/learn/content/achievements";
import { LANGUAGES } from "@/learn/content/languages";
import { buildLeaderboard } from "@/learn/engine";
import {
  addReply,
  createPost,
  deletePost,
  toggleLike,
  useCurrentUser,
  useLearnerStats,
  useLearnState,
} from "@/learn/store";
import type { CommunityPost } from "@/learn/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/community")({
  head: () => ({
    meta: [
      { title: "Community — Lingua" },
      {
        name: "description",
        content: "Share wins, cheer on other learners and climb the Lingua XP leaderboard.",
      },
    ],
  }),
  component: CommunityPage,
});

function PostCard({ post, currentUserId }: { post: CommunityPost; currentUserId: string | null }) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");

  const language = LANGUAGES.find((l) => l.code === post.languageCode);
  const achievement = post.achievementId ? ACHIEVEMENT_BY_ID[post.achievementId] : undefined;
  const liked = currentUserId ? post.likes.includes(currentUserId) : false;
  const mine = post.authorId === currentUserId;

  function submitReply() {
    const outcome = addReply(post.id, replyText);
    if (!outcome.ok) {
      toast.error(outcome.error ?? "Could not post your reply.");
      return;
    }
    setReplyText("");
    setReplying(false);
    for (const badge of outcome.unlocked) {
      toast.success(`${badge.icon} Achievement unlocked: ${badge.name}`, {
        description: `${badge.description} +${badge.xp} XP`,
      });
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{post.authorAvatar}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{post.authorName}</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(post.createdAt)}
            </span>
            {language && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {language.flag} {language.name}
              </span>
            )}
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{post.body}</p>

          {achievement && (
            <div className="mt-3">
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5">
                <span className="text-lg">{achievement.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Share2 className="h-3 w-3 text-primary" /> Shared achievement
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {achievement.name} — {achievement.description}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleLike(post.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                liked
                  ? "bg-primary/15 text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", liked && "fill-current text-primary")} />
              {post.likes.length}
            </button>
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.replies.length}
            </button>
            {mine && (
              <button
                type="button"
                onClick={() => deletePost(post.id)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>

          {post.replies.length > 0 && (
            <div className="mt-3 space-y-2 border-l border-border/60 pl-3">
              {post.replies.map((reply) => (
                <div key={reply.id} className="flex items-start gap-2">
                  <span className="text-base leading-none">{reply.authorAvatar}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {reply.authorName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(reply.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{reply.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {replying && (
            <div className="mt-3 flex items-start gap-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a helpful reply…"
                className="min-h-[44px]"
              />
              <Button size="sm" onClick={submitReply} disabled={replyText.trim().length < 2}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommunityPage() {
  const state = useLearnState();
  const user = useCurrentUser();
  const { progress } = useLearnerStats();

  const [body, setBody] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [achievementId, setAchievementId] = useState("");

  const leaderboard = useMemo(() => buildLeaderboard(state), [state]);
  const posts = useMemo(
    () => state.posts.slice().sort((a, b) => b.createdAt - a.createdAt),
    [state.posts],
  );
  const unlocked = ACHIEVEMENTS.filter((a) => progress.unlockedAchievements.includes(a.id));
  const level = learnerLevel(progress.xp);

  function submitPost() {
    const outcome = createPost({
      body,
      languageCode: languageCode || undefined,
      achievementId: achievementId || undefined,
    });
    if (!outcome.ok) {
      toast.error(outcome.error ?? "Could not publish your post.");
      return;
    }
    setBody("");
    setAchievementId("");
    toast.success("Posted to the community");
    for (const badge of outcome.unlocked) {
      toast.success(`${badge.icon} Achievement unlocked: ${badge.name}`, {
        description: `${badge.description} +${badge.xp} XP`,
      });
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/50 p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" /> Community
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Learn out loud with the others
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Share a win, ask for help or celebrate a badge. Every post and reply earns XP — and the
          leaderboard is watching.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">{user?.avatar ?? "🙂"}</span>
              <div className="min-w-0 flex-1">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`What are you working on, ${user?.name?.split(" ")[0] ?? "learner"}?`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  >
                    <option value="">No language tag</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={achievementId}
                    onChange={(e) => setAchievementId(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  >
                    <option value="">Don&apos;t share a badge</option>
                    {unlocked.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={submitPost}
                    disabled={body.trim().length < 3}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" /> Post
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {posts.length === 0 ? (
            <EmptyState
              title="No posts yet"
              description="Be the first to share something with the Lingua community."
            />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUserId={state.currentUserId} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">XP leaderboard</span>
            </div>
            <div className="space-y-2">
              {leaderboard.map((row, i) => (
                <div
                  key={row.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-2.5",
                    row.isCurrentUser
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/50 bg-background/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      i === 0
                        ? "bg-yellow-400/20 text-yellow-200"
                        : i === 1
                          ? "bg-slate-300/20 text-slate-200"
                          : i === 2
                            ? "bg-amber-600/20 text-amber-300"
                            : "bg-muted/60 text-muted-foreground",
                    )}
                  >
                    {i < 3 ? <Medal className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="text-lg leading-none">{row.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {row.name}
                      {row.isCurrentUser && <span className="ml-1 text-primary">(you)</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>Lv {learnerLevel(row.xp).level}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Flame className="h-3 w-3" /> {row.streakDays}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {row.xp.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Medal className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Your badges</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {unlocked.length}/{ACHIEVEMENTS.length}
              </span>
            </div>
            {unlocked.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Finish an activity to earn your first badge, then share it here.
              </p>
            ) : (
              <div className="space-y-2">
                {unlocked.map((def) => (
                  <AchievementBadge key={def.id} def={def} unlocked />
                ))}
              </div>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              You are level {level.level} with {progress.xp.toLocaleString()} XP.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
