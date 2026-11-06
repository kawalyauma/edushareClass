import { LESSON_FORMAT_VERSION, LessonSchema } from '@edushare/shared-types';
import type { Lesson } from '@edushare/shared-types';

export type ParseResult = { ok: true; lesson: Lesson } | { ok: false; errors: string[] };

export function createLesson(init: { id: string; title: string; now?: Date }): Lesson {
  const now = (init.now ?? new Date()).toISOString();
  return {
    formatVersion: LESSON_FORMAT_VERSION,
    id: init.id,
    title: init.title,
    createdAt: now,
    updatedAt: now,
    sources: [],
    selections: [],
    pages: [],
    actions: [],
    segments: [],
  };
}

/** Validate unknown data (IndexedDB, imported file) into a Lesson, with readable errors. */
export function parseLesson(input: unknown): ParseResult {
  if (input === null || typeof input !== 'object') {
    return { ok: false, errors: ['lesson must be an object'] };
  }
  const version = (input as { formatVersion?: unknown }).formatVersion;
  if (version !== LESSON_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [`unsupported formatVersion ${String(version)} (expected ${LESSON_FORMAT_VERSION})`],
    };
  }
  const r = LessonSchema.safeParse(input);
  if (r.success) return { ok: true, lesson: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

export function serializeLesson(lesson: Lesson): string {
  return JSON.stringify(lesson);
}

export function deserializeLesson(json: string): ParseResult {
  try {
    return parseLesson(JSON.parse(json));
  } catch {
    return { ok: false, errors: ['invalid JSON'] };
  }
}
