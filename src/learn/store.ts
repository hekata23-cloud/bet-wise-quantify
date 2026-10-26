import { useMemo, useSyncExternalStore } from "react";
import { loadJSON, saveJSON } from "@/lib/storage";
import type { AchievementDef, AchievementStats } from "./content/achievements";
import {
  applyActivity,
  computeStats,
  dayKey,
  emptyProgress,
  findNewAchievements,
  type ActivityInput,
} from "./engine";
import type { CommunityPost, StoreState, UserAccount, UserProgress } from "./types";

const STORAGE_KEY = "lingua.state.v1";
const STATE_VERSION = 1;

const AVATARS = ["🦊", "🐼", "🦉", "🐙", "🦁", "🐳", "🦄", "🐝", "🦖", "🐨"];

/** Tiny non-cryptographic hash. This store is a local prototype, never send it anywhere. */
function hashPassword(password: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < password.length; i++) {
    h ^= password.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */

interface SeedLearner {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  xp: number;
  streak: number;
  activeCourses: string[];
}

const SEED_LEARNERS: SeedLearner[] = [
  {
    id: "u-mei",
    name: "Mei Lin",
    avatar: "🐼",
    bio: "Learning Japanese alongside Mandarin. Shadowing is my favourite drill.",
    xp: 2450,
    streak: 12,
    activeCourses: ["ja", "ko"],
  },
  {
    id: "u-carlos",
    name: "Carlos Ruiz",
    avatar: "⚽",
    bio: "Native Spanish speaker picking up Korean for work.",
    xp: 1830,
    streak: 5,
    activeCourses: ["ko", "en"],
  },
  {
    id: "u-sofia",
    name: "Sofia Novak",
    avatar: "🌟",
    bio: "Polyglot challenge: three languages in one year.",
    xp: 1210,
    streak: 21,
    activeCourses: ["es", "fr"],
  },
  {
    id: "u-kenji",
    name: "Kenji Sato",
    avatar: "🎌",
    bio: "English B2 aiming for C1 before the exchange programme.",
    xp: 640,
    streak: 3,
    activeCourses: ["en"],
  },
];

function createSeedPosts(now: number): CommunityPost[] {
  return [
    {
      id: "p-seed-1",
      authorId: "u-sofia",
      authorName: "Sofia Novak",
      authorAvatar: "🌟",
      body: "Just finished every unit of Spanish A2. The shadowing drills finally made the rolled R click for me. Palabra difícil, but worth it!",
      languageCode: "es",
      achievementId: "level-complete",
      createdAt: now - 3 * 3600_000,
      likes: ["u-mei", "u-kenji"],
      replies: [
        {
          id: "r-seed-1",
          authorId: "u-carlos",
          authorName: "Carlos Ruiz",
          authorAvatar: "⚽",
          body: "¡Bien hecho! Now try reading the transcript out loud before you listen — it doubles the shadowing benefit.",
          createdAt: now - 2 * 3600_000,
        },
      ],
    },
    {
      id: "p-seed-2",
      authorId: "u-mei",
      authorName: "Mei Lin",
      authorAvatar: "🐼",
      body: "12-day streak! Does anyone have a trick for keeping Japanese pitch accent in the listening module? The long vowels keep catching me out.",
      languageCode: "ja",
      createdAt: now - 9 * 3600_000,
      likes: ["u-sofia"],
      replies: [
        {
          id: "r-seed-2",
          authorId: "u-kenji",
          authorName: "Kenji Sato",
          authorAvatar: "🎌",
          body: "Repeat the sentence at 0.8 speed three times, then once at normal speed. The contrast trains your ear fast.",
          createdAt: now - 8 * 3600_000,
        },
      ],
    },
    {
      id: "p-seed-3",
      authorId: "u-carlos",
      authorName: "Carlos Ruiz",
      authorAvatar: "⚽",
      body: "Korean honorifics are humbling, but the vocabulary flashcards make the words stick. 300 XP today.",
      languageCode: "ko",
      createdAt: now - 26 * 3600_000,
      likes: ["u-mei", "u-sofia", "u-kenji"],
      replies: [],
    },
  ];
}

function createInitialState(): StoreState {
  const now = Date.now();
  const users: UserAccount[] = SEED_LEARNERS.map((l) => ({
    id: l.id,
    name: l.name,
    email: `${l.id.replace("u-", "")}@lingua.example`,
    passwordHash: "seeded",
    avatar: l.avatar,
    bio: l.bio,
    createdAt: now - 30 * 86_400_000,
  }));

  const progress: Record<string, UserProgress> = {};
  for (const l of SEED_LEARNERS) {
    progress[l.id] = {
      ...emptyProgress(),
      xp: l.xp,
      streakDays: l.streak,
      lastActiveDay: dayKey(now - 86_400_000),
      activeCourses: [...l.activeCourses],
    };
  }

  return {
    version: STATE_VERSION,
    users,
    currentUserId: null,
    progress,
    posts: createSeedPosts(now),
  };
}

function loadState(): StoreState {
  const loaded = loadJSON<StoreState | null>(STORAGE_KEY, null);
  if (!loaded || loaded.version !== STATE_VERSION) return createInitialState();
  return loaded;
}

/* ------------------------------------------------------------------ */
/* Store plumbing                                                      */
/* ------------------------------------------------------------------ */

let state: StoreState = loadState();
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLearnState(): StoreState {
  return state;
}

function commit(next: StoreState): void {
  state = next;
  saveJSON(STORAGE_KEY, next);
  for (const listener of listeners) listener();
}

function progressFor(current: StoreState, userId: string): UserProgress {
  return current.progress[userId] ?? emptyProgress();
}

function socialCounts(current: StoreState, userId: string): { posts: number; replies: number } {
  let posts = 0;
  let replies = 0;
  for (const post of current.posts) {
    if (post.authorId === userId) posts += 1;
    replies += post.replies.filter((r) => r.authorId === userId).length;
  }
  return { posts, replies };
}

/** Re-evaluate badges after any progress change and grant the bonus XP. */
function syncAchievements(
  next: StoreState,
  userId: string,
): { state: StoreState; unlocked: AchievementDef[] } {
  const progress = progressFor(next, userId);
  const counts = socialCounts(next, userId);
  const stats = computeStats(progress, counts.posts, counts.replies);
  const unlocked = findNewAchievements(stats, progress.unlockedAchievements);
  if (unlocked.length === 0) return { state: next, unlocked };

  const bonus = unlocked.reduce((sum, a) => sum + a.xp, 0);
  const updated: UserProgress = {
    ...progress,
    xp: progress.xp + bonus,
    unlockedAchievements: [...progress.unlockedAchievements, ...unlocked.map((a) => a.id)],
  };
  return {
    state: { ...next, progress: { ...next.progress, [userId]: updated } },
    unlocked,
  };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useLearnState(): StoreState {
  return useSyncExternalStore(subscribe, getLearnState, getLearnState);
}

export function useCurrentUser(): UserAccount | null {
  const current = useLearnState();
  return current.users.find((u) => u.id === current.currentUserId) ?? null;
}

/** Current learner's progress plus the derived achievement statistics. */
export function useLearnerStats(): { progress: UserProgress; stats: AchievementStats } {
  const state = useLearnState();
  const userId = state.currentUserId;
  return useMemo(() => {
    const progress = userId ? progressFor(state, userId) : emptyProgress();
    const counts = userId ? socialCounts(state, userId) : { posts: 0, replies: 0 };
    return { progress, stats: computeStats(progress, counts.posts, counts.replies) };
  }, [state, userId]);
}

/* ------------------------------------------------------------------ */
/* Auth actions                                                        */
/* ------------------------------------------------------------------ */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export function register(input: RegisterInput): ActionResult {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: "Please tell us your name (2+ characters)." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "That email address does not look valid." };
  if (input.password.length < 6)
    return { ok: false, error: "Choose a password with at least 6 characters." };
  if (state.users.some((u) => u.email === email))
    return { ok: false, error: "An account with that email already exists." };

  const user: UserAccount = {
    id: newId("u"),
    name,
    email,
    passwordHash: hashPassword(input.password),
    avatar: input.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)],
    bio: "",
    createdAt: Date.now(),
  };

  commit({
    ...state,
    users: [...state.users, user],
    currentUserId: user.id,
    progress: { ...state.progress, [user.id]: emptyProgress() },
  });
  return { ok: true };
}

export function login(email: string, password: string): ActionResult {
  const user = state.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return { ok: false, error: "No account found with that email." };
  if (user.passwordHash !== hashPassword(password))
    return { ok: false, error: "That password is not correct." };
  commit({ ...state, currentUserId: user.id });
  return { ok: true };
}

export function continueAsGuest(): ActionResult {
  const n = state.users.filter((u) => u.email.endsWith("@guest.lingua")).length + 1;
  const user: UserAccount = {
    id: newId("u"),
    name: `Guest Learner ${n}`,
    email: `guest${n}@guest.lingua`,
    passwordHash: hashPassword(newId("pw")),
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    bio: "Exploring Lingua as a guest.",
    createdAt: Date.now(),
  };
  commit({
    ...state,
    users: [...state.users, user],
    currentUserId: user.id,
    progress: { ...state.progress, [user.id]: emptyProgress() },
  });
  return { ok: true };
}

export function logout(): void {
  commit({ ...state, currentUserId: null });
}

export function updateProfile(patch: { name?: string; bio?: string; avatar?: string }): void {
  const userId = state.currentUserId;
  if (!userId) return;
  commit({
    ...state,
    users: state.users.map((u) => (u.id === userId ? { ...u, ...patch, name: patch.name?.trim() || u.name } : u)),
  });
}

/* ------------------------------------------------------------------ */
/* Learning actions                                                    */
/* ------------------------------------------------------------------ */

export interface ActivityResult {
  xpGained: number;
  unlocked: AchievementDef[];
}

export function recordActivity(input: ActivityInput): ActivityResult {
  const userId = state.currentUserId;
  if (!userId) return { xpGained: 0, unlocked: [] };

  const outcome = applyActivity(progressFor(state, userId), input);
  const withProgress: StoreState = {
    ...state,
    progress: { ...state.progress, [userId]: outcome.progress },
  };
  const { state: next, unlocked } = syncAchievements(withProgress, userId);
  commit(next);

  return {
    xpGained: outcome.xpGained + unlocked.reduce((sum, a) => sum + a.xp, 0),
    unlocked,
  };
}

export function startCourse(languageCode: string): void {
  const userId = state.currentUserId;
  if (!userId) return;
  const progress = progressFor(state, userId);
  if (progress.activeCourses.includes(languageCode)) return;
  commit({
    ...state,
    progress: {
      ...state.progress,
      [userId]: { ...progress, activeCourses: [...progress.activeCourses, languageCode] },
    },
  });
}

export function resetProgress(): void {
  const userId = state.currentUserId;
  if (!userId) return;
  commit({ ...state, progress: { ...state.progress, [userId]: emptyProgress() } });
}

/* ------------------------------------------------------------------ */
/* Community actions                                                   */
/* ------------------------------------------------------------------ */

export interface PostInput {
  body: string;
  languageCode?: string;
  achievementId?: string;
}

export function createPost(input: PostInput): ActivityResult & ActionResult {
  const userId = state.currentUserId;
  const user = state.users.find((u) => u.id === userId);
  const body = input.body.trim();
  if (!user) return { ok: false, error: "Sign in to post.", xpGained: 0, unlocked: [] };
  if (body.length < 3) return { ok: false, error: "Write a little more first.", xpGained: 0, unlocked: [] };

  const post: CommunityPost = {
    id: newId("p"),
    authorId: user.id,
    authorName: user.name,
    authorAvatar: user.avatar,
    body,
    languageCode: input.languageCode,
    achievementId: input.achievementId,
    createdAt: Date.now(),
    likes: [],
    replies: [],
  };

  const withPost: StoreState = { ...state, posts: [post, ...state.posts] };
  const { state: next, unlocked } = syncAchievements(withPost, user.id);
  commit(next);

  return { ok: true, xpGained: unlocked.reduce((sum, a) => sum + a.xp, 0), unlocked };
}

export function toggleLike(postId: string): void {
  const userId = state.currentUserId;
  if (!userId) return;
  commit({
    ...state,
    posts: state.posts.map((p) =>
      p.id === postId
        ? {
            ...p,
            likes: p.likes.includes(userId)
              ? p.likes.filter((id) => id !== userId)
              : [...p.likes, userId],
          }
        : p,
    ),
  });
}

export function addReply(postId: string, body: string): ActivityResult & ActionResult {
  const userId = state.currentUserId;
  const user = state.users.find((u) => u.id === userId);
  const text = body.trim();
  if (!user) return { ok: false, error: "Sign in to reply.", xpGained: 0, unlocked: [] };
  if (text.length < 2) return { ok: false, error: "Write a little more first.", xpGained: 0, unlocked: [] };

  const withReply: StoreState = {
    ...state,
    posts: state.posts.map((p) =>
      p.id === postId
        ? {
            ...p,
            replies: [
              ...p.replies,
              {
                id: newId("r"),
                authorId: user.id,
                authorName: user.name,
                authorAvatar: user.avatar,
                body: text,
                createdAt: Date.now(),
              },
            ],
          }
        : p,
    ),
  };
  const { state: next, unlocked } = syncAchievements(withReply, user.id);
  commit(next);

  return { ok: true, xpGained: unlocked.reduce((sum, a) => sum + a.xp, 0), unlocked };
}

export function deletePost(postId: string): void {
  const userId = state.currentUserId;
  if (!userId) return;
  commit({ ...state, posts: state.posts.filter((p) => !(p.id === postId && p.authorId === userId)) });
}

export { findNewAchievements };
