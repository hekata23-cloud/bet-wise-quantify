// Domain model for the Lingua language-learning module (mounted at /learn).
// Pure data types shared by curriculum content, the store and the UI.

/** CEFR proficiency band used to level the courses. */
export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1";

export const CEFR_ORDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1"];

/** The four interactive activity types a learner works through inside a unit. */
export type LessonKind = "vocabulary" | "grammar" | "listening" | "shadowing";

export const LESSON_KINDS: LessonKind[] = ["vocabulary", "grammar", "listening", "shadowing"];

export interface LanguageDef {
  /** ISO 639-1 code, also used as the course id. */
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  /** BCP-47 tag handed to the Web Speech API. */
  speechTag: string;
  /** True when the script is written right-to-left. */
  rtl?: boolean;
  blurb: string;
}

export interface VocabItem {
  id: string;
  term: string;
  /** Reading aid (romaji, kana, pinyin, transliteration…). */
  reading?: string;
  /** English gloss. */
  translation: string;
  pos: string;
  example?: string;
  exampleTranslation?: string;
}

export interface GrammarQuestion {
  id: string;
  /** Sentence with a ___ blank, or a direct question. */
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface ListeningQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
}

export interface ListeningTask {
  id: string;
  transcript: string;
  translation: string;
  questions: ListeningQuestion[];
}

export interface ShadowingTask {
  id: string;
  text: string;
  translation: string;
  /** Pronunciation coaching hint. */
  tip: string;
}

/** One themed unit of the curriculum, carrying every activity it needs. */
export interface Topic {
  /** Globally unique: `${languageCode}-${level}-${slug}`. */
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: CEFR;
  vocab: VocabItem[];
  grammar: GrammarQuestion[];
  listening: ListeningTask;
  shadowing: ShadowingTask;
}

export interface Lesson {
  /** `${topicId}:${kind}`. */
  id: string;
  topicId: string;
  languageCode: string;
  level: CEFR;
  kind: LessonKind;
  title: string;
}

export interface Unit {
  id: string;
  title: string;
  summary: string;
  level: CEFR;
  topicId: string;
  lessons: Lesson[];
}

export interface Level {
  level: CEFR;
  units: Unit[];
}

export interface Course {
  languageCode: string;
  title: string;
  levels: Level[];
  unitCount: number;
  lessonCount: number;
}

/* ------------------------------------------------------------------ */
/* Learner state                                                       */
/* ------------------------------------------------------------------ */

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  /** Never store a real password; this is a local-only prototype hash. */
  passwordHash: string;
  avatar: string;
  bio: string;
  createdAt: number;
}

export interface UnitProgress {
  topicId: string;
  languageCode: string;
  level: CEFR;
  completed: LessonKind[];
  /** Best score (0-100) achieved for each activity type. */
  scores: Partial<Record<LessonKind, number>>;
  /** 0-100 mastery: the mean of the best scores of the attempted activities. */
  mastery: number;
  bestScore: number;
  attempts: number;
  lastAt: number;
}

export interface UserProgress {
  xp: number;
  streakDays: number;
  /** yyyy-mm-dd of the last day with activity. */
  lastActiveDay: string;
  units: Record<string, UnitProgress>;
  /** yyyy-mm-dd -> XP earned that day. */
  activity: Record<string, number>;
  unlockedAchievements: string[];
  activeCourses: string[];
}

export interface CommunityReply {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  createdAt: number;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  languageCode?: string;
  achievementId?: string;
  createdAt: number;
  likes: string[];
  replies: CommunityReply[];
}

export interface StoreState {
  version: number;
  users: UserAccount[];
  currentUserId: string | null;
  progress: Record<string, UserProgress>;
  posts: CommunityPost[];
}
