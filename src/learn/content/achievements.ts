export type AchievementTier = "bronze" | "silver" | "gold";

export interface AchievementStats {
  lessonsCompleted: number;
  unitsCompleted: number;
  levelsCompleted: number;
  coursesCompleted: number;
  perfectLessons: number;
  xp: number;
  streakDays: number;
  activeCourses: number;
  postsWritten: number;
  repliesWritten: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  /** Bonus XP granted the moment the badge unlocks. */
  xp: number;
  check: (stats: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-lesson",
    name: "First Steps",
    description: "Complete your very first lesson.",
    icon: "🌱",
    tier: "bronze",
    xp: 20,
    check: (s) => s.lessonsCompleted >= 1,
  },
  {
    id: "unit-master",
    name: "Unit Master",
    description: "Finish all four activities of a single unit.",
    icon: "🎯",
    tier: "bronze",
    xp: 60,
    check: (s) => s.unitsCompleted >= 1,
  },
  {
    id: "getting-fluent",
    name: "Getting Fluent",
    description: "Complete 10 lessons.",
    icon: "📚",
    tier: "silver",
    xp: 120,
    check: (s) => s.lessonsCompleted >= 10,
  },
  {
    id: "dedicated",
    name: "Dedicated Learner",
    description: "Complete 50 lessons.",
    icon: "🏅",
    tier: "gold",
    xp: 300,
    check: (s) => s.lessonsCompleted >= 50,
  },
  {
    id: "level-complete",
    name: "Level Complete",
    description: "Finish every unit of a CEFR level.",
    icon: "🧭",
    tier: "silver",
    xp: 150,
    check: (s) => s.levelsCompleted >= 1,
  },
  {
    id: "course-champion",
    name: "Course Champion",
    description: "Complete an entire course, every level included.",
    icon: "🏆",
    tier: "gold",
    xp: 500,
    check: (s) => s.coursesCompleted >= 1,
  },
  {
    id: "flawless",
    name: "Flawless",
    description: "Score 100% on any activity.",
    icon: "💯",
    tier: "bronze",
    xp: 50,
    check: (s) => s.perfectLessons >= 1,
  },
  {
    id: "precision",
    name: "Precision",
    description: "Score 100% on five different activities.",
    icon: "⚡",
    tier: "silver",
    xp: 150,
    check: (s) => s.perfectLessons >= 5,
  },
  {
    id: "rising-star",
    name: "Rising Star",
    description: "Earn 500 XP.",
    icon: "⭐",
    tier: "bronze",
    xp: 0,
    check: (s) => s.xp >= 500,
  },
  {
    id: "scholar",
    name: "Scholar",
    description: "Earn 2000 XP.",
    icon: "🎓",
    tier: "gold",
    xp: 0,
    check: (s) => s.xp >= 2000,
  },
  {
    id: "on-a-roll",
    name: "On a Roll",
    description: "Keep a 3-day learning streak.",
    icon: "🔥",
    tier: "bronze",
    xp: 40,
    check: (s) => s.streakDays >= 3,
  },
  {
    id: "week-warrior",
    name: "Week Warrior",
    description: "Keep a 7-day learning streak.",
    icon: "🔥",
    tier: "silver",
    xp: 100,
    check: (s) => s.streakDays >= 7,
  },
  {
    id: "unstoppable",
    name: "Unstoppable",
    description: "Keep a 30-day learning streak.",
    icon: "🔥",
    tier: "gold",
    xp: 400,
    check: (s) => s.streakDays >= 30,
  },
  {
    id: "polyglot",
    name: "Polyglot",
    description: "Study two or more languages at once.",
    icon: "🌍",
    tier: "silver",
    xp: 150,
    check: (s) => s.activeCourses >= 2,
  },
  {
    id: "community-voice",
    name: "Community Voice",
    description: "Share your first post with the community.",
    icon: "💬",
    tier: "bronze",
    xp: 40,
    check: (s) => s.postsWritten >= 1,
  },
  {
    id: "helpful",
    name: "Helpful",
    description: "Reply to three posts from other learners.",
    icon: "🤝",
    tier: "silver",
    xp: 80,
    check: (s) => s.repliesWritten >= 3,
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const TIER_STYLES: Record<AchievementTier, string> = {
  bronze: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  silver: "border-slate-300/40 bg-slate-300/10 text-slate-200",
  gold: "border-yellow-400/50 bg-yellow-400/10 text-yellow-200",
};
