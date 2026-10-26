import type { LessonKind, StoreState, UnitProgress, UserProgress } from "./types";
import { CEFR_ORDER, LESSON_KINDS } from "./types";
import { ACHIEVEMENTS, type AchievementDef, type AchievementStats } from "./content/achievements";
import { getAvailableCourses, getCourse, KIND_LABELS } from "./content/curriculum";

export const XP_BY_KIND: Record<LessonKind, number> = {
  vocabulary: 20,
  grammar: 25,
  listening: 25,
  shadowing: 30,
};

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dayKey(date.getTime());
}

export function todayKey(): string {
  return dayKey(Date.now());
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function emptyProgress(): UserProgress {
  return {
    xp: 0,
    streakDays: 0,
    lastActiveDay: "",
    units: {},
    activity: {},
    unlockedAchievements: [],
    activeCourses: [],
  };
}

export function isUnitComplete(unit: UnitProgress | undefined): boolean {
  return !!unit && unit.completed.length >= LESSON_KINDS.length;
}

function masteryOf(scores: Partial<Record<LessonKind, number>>): number {
  const values = Object.values(scores).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export interface ActivityInput {
  topicId: string;
  languageCode: string;
  level: UnitProgress["level"];
  kind: LessonKind;
  /** 0-100 */
  score: number;
  now?: number;
}

export interface ActivityOutcome {
  progress: UserProgress;
  xpGained: number;
  unitCompleted: boolean;
}

/** Fold one finished activity into the learner's progress. */
export function applyActivity(progress: UserProgress, input: ActivityInput): ActivityOutcome {
  const now = input.now ?? Date.now();
  const today = dayKey(now);
  const score = Math.max(0, Math.min(100, Math.round(input.score)));

  const next: UserProgress = {
    ...progress,
    units: { ...progress.units },
    activity: { ...progress.activity },
    activeCourses: [...progress.activeCourses],
  };

  // Streak bookkeeping.
  if (next.lastActiveDay !== today) {
    next.streakDays = next.lastActiveDay === shiftDay(today, -1) ? next.streakDays + 1 : 1;
    next.lastActiveDay = today;
  }

  const xpGained = Math.max(4, Math.round((XP_BY_KIND[input.kind] * score) / 100));
  next.xp += xpGained;
  next.activity[today] = (next.activity[today] ?? 0) + xpGained;

  if (!next.activeCourses.includes(input.languageCode)) {
    next.activeCourses.push(input.languageCode);
  }

  const prev = progress.units[input.topicId];
  const wasComplete = isUnitComplete(prev);
  const completed = new Set(prev?.completed ?? []);
  completed.add(input.kind);

  const scores: Partial<Record<LessonKind, number>> = { ...(prev?.scores ?? {}) };
  scores[input.kind] = Math.max(scores[input.kind] ?? 0, score);

  const unit: UnitProgress = {
    topicId: input.topicId,
    languageCode: input.languageCode,
    level: input.level,
    completed: LESSON_KINDS.filter((k) => completed.has(k)),
    scores,
    mastery: masteryOf(scores),
    bestScore: Math.max(prev?.bestScore ?? 0, score),
    attempts: (prev?.attempts ?? 0) + 1,
    lastAt: now,
  };
  next.units[input.topicId] = unit;

  return { progress: next, xpGained, unitCompleted: !wasComplete && isUnitComplete(unit) };
}

/* ------------------------------------------------------------------ */
/* Stats & achievements                                                */
/* ------------------------------------------------------------------ */

export function computeStats(
  progress: UserProgress,
  postsWritten: number,
  repliesWritten: number,
): AchievementStats {
  const units = Object.values(progress.units);
  let lessonsCompleted = 0;
  let perfectLessons = 0;
  for (const unit of units) {
    lessonsCompleted += unit.completed.length;
    perfectLessons += Object.values(unit.scores).filter((v) => v === 100).length;
  }

  let levelsCompleted = 0;
  let coursesCompleted = 0;
  for (const course of getAvailableCourses()) {
    let courseDone = course.levels.length > 0;
    for (const level of course.levels) {
      const done = level.units.every((u) => isUnitComplete(progress.units[u.topicId]));
      if (done) levelsCompleted += 1;
      else courseDone = false;
    }
    if (courseDone) coursesCompleted += 1;
  }

  return {
    lessonsCompleted,
    unitsCompleted: units.filter(isUnitComplete).length,
    levelsCompleted,
    coursesCompleted,
    perfectLessons,
    xp: progress.xp,
    streakDays: progress.streakDays,
    activeCourses: progress.activeCourses.length,
    postsWritten,
    repliesWritten,
  };
}

/** Returns the badge definitions newly earned, in catalog order. */
export function findNewAchievements(stats: AchievementStats, unlocked: string[]): AchievementDef[] {
  const owned = new Set(unlocked);
  return ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.check(stats));
}

/* ------------------------------------------------------------------ */
/* Skill & course analytics                                            */
/* ------------------------------------------------------------------ */

export function skillMastery(
  progress: UserProgress,
  languageCode: string,
): Record<LessonKind, number> {
  const totals = Object.fromEntries(LESSON_KINDS.map((k) => [k, { sum: 0, n: 0 }])) as Record<
    LessonKind,
    { sum: number; n: number }
  >;
  for (const unit of Object.values(progress.units)) {
    if (unit.languageCode !== languageCode) continue;
    for (const kind of LESSON_KINDS) {
      const score = unit.scores[kind];
      if (typeof score === "number") {
        totals[kind].sum += score;
        totals[kind].n += 1;
      }
    }
  }
  return Object.fromEntries(
    LESSON_KINDS.map((k) => [k, totals[k].n ? Math.round(totals[k].sum / totals[k].n) : 0]),
  ) as Record<LessonKind, number>;
}

export interface LevelStat {
  level: string;
  completed: number;
  total: number;
  percent: number;
}

export interface CourseProgress {
  completedUnits: number;
  totalUnits: number;
  completedLessons: number;
  totalLessons: number;
  percent: number;
  levels: LevelStat[];
  /** Units that are started but not yet finished. */
  inProgressUnitIds: string[];
}

export function courseProgress(progress: UserProgress, languageCode: string): CourseProgress {
  const course = getCourse(languageCode);
  let completedUnits = 0;
  let completedLessons = 0;
  const inProgressUnitIds: string[] = [];
  const levels: LevelStat[] = [];

  for (const level of course.levels) {
    let levelDone = 0;
    for (const unit of level.units) {
      const up = progress.units[unit.topicId];
      completedLessons += up?.completed.length ?? 0;
      if (isUnitComplete(up)) levelDone += 1;
      else if (up && up.completed.length > 0) inProgressUnitIds.push(unit.topicId);
    }
    completedUnits += levelDone;
    levels.push({
      level: level.level,
      completed: levelDone,
      total: level.units.length,
      percent: level.units.length ? Math.round((levelDone / level.units.length) * 100) : 0,
    });
  }

  return {
    completedUnits,
    totalUnits: course.unitCount,
    completedLessons,
    totalLessons: course.lessonCount,
    percent: course.unitCount ? Math.round((completedUnits / course.unitCount) * 100) : 0,
    levels,
    inProgressUnitIds,
  };
}

export interface XpPoint {
  day: string;
  label: string;
  xp: number;
}

export function xpSeries(progress: UserProgress, days = 14): XpPoint[] {
  const today = todayKey();
  const points: XpPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    const [, m, d] = day.split("-");
    points.push({ day, label: `${d}/${m}`, xp: progress.activity[day] ?? 0 });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export type RecommendationKind = "continue" | "next" | "review" | "skill" | "explore" | "streak";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  reason: string;
  languageCode: string;
  topicId?: string;
  lessonKind?: LessonKind;
  weight: number;
}

const KIND_LABEL_LOWER: Record<LessonKind, string> = {
  vocabulary: "vocabulary",
  grammar: "grammar",
  listening: "listening",
  shadowing: "speaking",
};

/**
 * A lightweight, explainable recommendation engine: it ranks the next best
 * action from the learner's own progress, weakest skills and streak state.
 */
export function buildRecommendations(progress: UserProgress, limit = 4): Recommendation[] {
  const available = getAvailableCourses();
  const active = progress.activeCourses.filter((code) =>
    available.some((c) => c.languageCode === code),
  );
  const focus =
    active.length > 0 ? active : available.length > 0 ? [available[0].languageCode] : [];
  const out: Recommendation[] = [];
  const today = todayKey();

  for (const code of focus) {
    const course = getCourse(code);
    const cp = courseProgress(progress, code);

    // 1. Continue a unit that is already underway.
    if (cp.inProgressUnitIds.length > 0) {
      const topicId = cp.inProgressUnitIds[0];
      const unit = course.levels.flatMap((l) => l.units).find((u) => u.topicId === topicId);
      const done = progress.units[topicId]?.completed ?? [];
      const nextKind = LESSON_KINDS.find((k) => !done.includes(k));
      if (unit && nextKind) {
        out.push({
          id: `continue-${topicId}`,
          kind: "continue",
          title: `Continue "${unit.title}"`,
          reason: `You've finished ${done.length} of 4 activities — pick up with ${KIND_LABEL_LOWER[nextKind]}.`,
          languageCode: code,
          topicId,
          lessonKind: nextKind,
          weight: 100,
        });
      }
    }

    // 2. Otherwise the next unseen unit, lowest level first.
    const nextUnit = course.levels.flatMap((l) => l.units).find((u) => !progress.units[u.topicId]);
    if (nextUnit && !cp.inProgressUnitIds.includes(nextUnit.topicId)) {
      out.push({
        id: `next-${nextUnit.topicId}`,
        kind: "next",
        title: `Start "${nextUnit.title}" (${nextUnit.level})`,
        reason:
          cp.completedUnits > 0
            ? `You've completed ${cp.completedUnits} of ${cp.totalUnits} units. Keep the ${code.toUpperCase()} curve moving.`
            : `Your first ${code.toUpperCase()} unit — a gentle, high-value starting point.`,
        languageCode: code,
        topicId: nextUnit.topicId,
        lessonKind: "vocabulary",
        weight: 80,
      });
    }

    // 3. Review the weakest finished unit.
    const weakest = Object.values(progress.units)
      .filter((u) => u.languageCode === code && isUnitComplete(u) && u.mastery < 75)
      .sort((a, b) => a.mastery - b.mastery)[0];
    if (weakest) {
      const unit = course.levels.flatMap((l) => l.units).find((u) => u.topicId === weakest.topicId);
      const weakestKind = LESSON_KINDS.slice().sort(
        (a, b) => (weakest.scores[a] ?? 101) - (weakest.scores[b] ?? 101),
      )[0];
      out.push({
        id: `review-${weakest.topicId}`,
        kind: "review",
        title: `Review "${unit?.title ?? weakest.topicId}"`,
        reason: `Mastery is ${weakest.mastery}% — a short ${KIND_LABEL_LOWER[weakestKind]} replay will lift it.`,
        languageCode: code,
        topicId: weakest.topicId,
        lessonKind: weakestKind,
        weight: 70,
      });
    }

    // 4. Target the weakest skill across the course.
    const mastery = skillMastery(progress, code);
    const ranked = LESSON_KINDS.slice().sort((a, b) => mastery[a] - mastery[b]);
    const weakestSkill = ranked[0];
    if (mastery[weakestSkill] > 0 && mastery[weakestSkill] < 85) {
      const target = course.levels
        .flatMap((l) => l.units)
        .find((u) => !(progress.units[u.topicId]?.completed ?? []).includes(weakestSkill));
      if (target) {
        out.push({
          id: `skill-${code}-${weakestSkill}`,
          kind: "skill",
          title: `Boost your ${KIND_LABEL_LOWER[weakestSkill]}`,
          reason: `${KIND_LABELS[weakestSkill]} averages ${mastery[weakestSkill]}% — your lowest skill in ${code.toUpperCase()}.`,
          languageCode: code,
          topicId: target.topicId,
          lessonKind: weakestSkill,
          weight: 60,
        });
      }
    }
  }

  // 5. Nudge toward a second language for breadth.
  if (active.length < 2 && available.length > 1) {
    const candidate = available.find((c) => !active.includes(c.languageCode));
    if (candidate) {
      out.push({
        id: `explore-${candidate.languageCode}`,
        kind: "explore",
        title: `Explore ${candidate.title}`,
        reason: "Studying a second language compounds your vocabulary reflexes.",
        languageCode: candidate.languageCode,
        topicId: candidate.levels[0]?.units[0]?.topicId,
        lessonKind: "vocabulary",
        weight: 40,
      });
    }
  }

  // 6. Protect the streak.
  if (progress.streakDays >= 2 && progress.lastActiveDay !== today) {
    out.push({
      id: "streak",
      kind: "streak",
      title: `Keep your ${progress.streakDays}-day streak alive`,
      reason: "One short activity today keeps the chain going.",
      languageCode: focus[0] ?? "en",
      topicId: Object.values(progress.units).sort((a, b) => b.lastAt - a.lastAt)[0]?.topicId,
      lessonKind: "vocabulary",
      weight: 95,
    });
  }

  const seen = new Set<string>();
  return out
    .sort((a, b) => b.weight - a.weight)
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  streakDays: number;
  isCurrentUser: boolean;
}

export function buildLeaderboard(state: StoreState): LeaderboardRow[] {
  const rows = state.users.map((u) => {
    const p = state.progress[u.id];
    return {
      userId: u.id,
      name: u.name,
      avatar: u.avatar,
      xp: p?.xp ?? 0,
      streakDays: p?.streakDays ?? 0,
      isCurrentUser: u.id === state.currentUserId,
    };
  });
  return rows.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
}

export const CEFR_LEVELS = CEFR_ORDER;
