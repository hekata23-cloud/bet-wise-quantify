import type { Course, Lesson, LessonKind, Level, Topic, Unit } from "../types";
import { CEFR_ORDER, LESSON_KINDS } from "../types";
import { LANGUAGES } from "./languages";
import { DE_TOPICS } from "./topics/de";
import { EN_TOPICS } from "./topics/en";
import { ES_TOPICS } from "./topics/es";
import { FR_TOPICS } from "./topics/fr";
import { JA_TOPICS } from "./topics/ja";
import { KO_TOPICS } from "./topics/ko";

/** Every authored topic across every language, in catalog order. */
export const ALL_TOPICS: Topic[] = [
  ...EN_TOPICS,
  ...ES_TOPICS,
  ...FR_TOPICS,
  ...DE_TOPICS,
  ...JA_TOPICS,
  ...KO_TOPICS,
];

export const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(
  ALL_TOPICS.map((t) => [t.id, t]),
);

export const KIND_LABELS: Record<LessonKind, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  listening: "Listening",
  shadowing: "Shadowing",
};

export const KIND_DESCRIPTIONS: Record<LessonKind, string> = {
  vocabulary: "Memorise new words with active-recall flashcards.",
  grammar: "Fix the sentence by choosing the right form.",
  listening: "Train your ear on native-speed audio, then answer.",
  shadowing: "Repeat out loud and get pronunciation feedback.",
};

export function topicsForLanguage(code: string): Topic[] {
  return ALL_TOPICS.filter((t) => t.id.startsWith(`${code}-`));
}

const courseCache = new Map<string, Course>();

/** Assemble the leveled course structure for one language. */
export function getCourse(code: string): Course {
  const cached = courseCache.get(code);
  if (cached) return cached;

  const topics = topicsForLanguage(code);
  const levels: Level[] = [];

  for (const level of CEFR_ORDER) {
    const inLevel = topics.filter((t) => t.level === level);
    if (inLevel.length === 0) continue;

    const units: Unit[] = inLevel.map((topic) => ({
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      level: topic.level,
      topicId: topic.id,
      lessons: LESSON_KINDS.map((kind) => ({
        id: `${topic.id}:${kind}`,
        topicId: topic.id,
        languageCode: code,
        level: topic.level,
        kind,
        title: `${topic.title} · ${KIND_LABELS[kind]}`,
      })),
    }));

    levels.push({ level, units });
  }

  const unitCount = levels.reduce((n, l) => n + l.units.length, 0);
  const course: Course = {
    languageCode: code,
    title: LANGUAGES.find((l) => l.code === code)?.name ?? code,
    levels,
    unitCount,
    lessonCount: unitCount * LESSON_KINDS.length,
  };

  courseCache.set(code, course);
  return course;
}

/** Courses for every language that has authored content. */
export function getAvailableCourses(): Course[] {
  return LANGUAGES.map((l) => getCourse(l.code)).filter((c) => c.unitCount > 0);
}

export function isCourseAvailable(code: string): boolean {
  return getCourse(code).unitCount > 0;
}

export interface LessonLocation {
  topic: Topic;
  lesson: Lesson;
  unit: Unit;
  level: Level;
}

/** Resolve a `${topicId}:${kind}` lesson id back to its place in the curriculum. */
export function resolveLesson(topicId: string, kind: string): LessonLocation | undefined {
  const topic = TOPIC_BY_ID[topicId];
  if (!topic) return undefined;
  if (!LESSON_KINDS.includes(kind as LessonKind)) return undefined;

  const course = getCourse(topic.id.split("-")[0]);
  const level = course.levels.find((l) => l.level === topic.level);
  const unit = level?.units.find((u) => u.topicId === topic.id);
  const lesson = unit?.lessons.find((l) => l.kind === kind);
  if (!level || !unit || !lesson) return undefined;

  return { topic, lesson, unit, level };
}
