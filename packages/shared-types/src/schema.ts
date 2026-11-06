/**
 * Canonical lesson data schema (v1). Single source of truth: zod schemas, with TypeScript types
 * inferred from them. Changes here are shared-interface changes and require review (AGENTS.md).
 *
 * Conventions
 * - PDF coordinates are PDF user-space points, origin bottom-left, per 1-based page number.
 * - Board coordinates are logical units on a 1920x1080 canvas, origin top-left.
 * - `t` is milliseconds on the lesson clock (0 = start of first recording segment).
 */
import { z } from 'zod';

export const LESSON_FORMAT_VERSION = 1 as const;
export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;

const id = z.string().min(1).max(128);
const ms = z.number().int().nonnegative();
const isoDate = z.string().datetime();

export const RectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});
export type Rect = z.infer<typeof RectSchema>;

export const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export type Point = z.infer<typeof PointSchema>;

// ---- Sources (PDF traceability) ----

export const PdfSourceSchema = z.object({
  id,
  fileName: z.string().min(1),
  /** Hex SHA-256 of the PDF bytes; proves selections map to the exact file. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive(),
});
export type PdfSource = z.infer<typeof PdfSourceSchema>;

export const SelectionKindSchema = z.enum(['text', 'formula', 'crop']);
export type SelectionKind = z.infer<typeof SelectionKindSchema>;

/** A teacher selection in a PDF. Keeps a source crop as fallback; text is never rewritten. */
export const SourceSelectionSchema = z.object({
  id,
  sourceId: id,
  page: z.number().int().positive(),
  bbox: RectSchema,
  kind: SelectionKindSchema,
  /** Extracted text, verbatim from the PDF. Absent for scanned/crop-only selections. */
  text: z.string().optional(),
  /** Optional explicitly teacher-corrected display text; never overwrites PDF-extracted original. */
  displayText: z.string().optional(),
  /** Raw, ordered text-layer fragments before layout-based whitespace reconstruction. */
  sourceChunks: z.array(z.string()).optional(),
  /** Asset key of the stored source crop image fallback. */
  cropAssetId: id.optional(),
});
export type SourceSelection = z.infer<typeof SourceSelectionSchema>;

// ---- Board (event-sourced) ----

export const StrokeSchema = z.object({
  points: z.array(PointSchema.extend({ pressure: z.number().min(0).max(1).optional() })).min(2),
  width: z.number().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Pen-down duration in ms at 1x pace. */
  durationMs: ms,
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const BoardPageSchema = z.object({ id, index: z.number().int().nonnegative() });
export type BoardPage = z.infer<typeof BoardPageSchema>;

const base = { id, t: ms };

export const BoardActionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('page.add'), pageId: id }),
  z.object({ ...base, type: z.literal('page.show'), pageId: id }),
  z.object({
    ...base,
    type: z.literal('content.place'),
    pageId: id,
    selectionId: id,
    target: RectSchema,
    mode: z.enum(['handwriting', 'crop']),
  }),
  z.object({
    ...base,
    type: z.literal('stroke.write'),
    pageId: id,
    contentId: id,
    stroke: StrokeSchema,
  }),
  z.object({ ...base, type: z.literal('board.clear'), pageId: id }),
  z.object({ ...base, type: z.literal('pace.set'), speed: z.number().min(0.25).max(4) }),
  // Phase 04: reversible, event-sourced board controls. Never mutate stored source selections.
  z.object({ ...base, type: z.literal('ink.draw'), pageId: id, stroke: StrokeSchema }),
  z.object({ ...base, type: z.literal('ink.erase'), pageId: id, strokeIds: z.array(id).min(1) }),
  z.object({ ...base, type: z.literal('content.move'), pageId: id, contentId: id, target: RectSchema }),
  z.object({ ...base, type: z.literal('content.remove'), pageId: id, contentId: id }),
  z.object({ ...base, type: z.literal('board.theme.set'), theme: z.enum(['green', 'black', 'white']) }),
  z.object({ ...base, type: z.literal('history.undo'), targetActionId: id }),
  z.object({ ...base, type: z.literal('history.redo'), targetActionId: id }),
]);
export type BoardAction = z.infer<typeof BoardActionSchema>;
export type BoardActionType = BoardAction['type'];

// ---- Recording segments ----

export const SegmentStatusSchema = z.enum(['recording', 'complete', 'recovered', 'discarded']);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const RecordingSegmentSchema = z.object({
  id,
  startMs: ms,
  endMs: ms.optional(),
  status: SegmentStatusSchema,
  /** Ordered ids of persisted media chunks (saved progressively for crash recovery). */
  audioChunkIds: z.array(id),
  videoChunkIds: z.array(id),
});
export type RecordingSegment = z.infer<typeof RecordingSegmentSchema>;

// ---- Lesson ----

export const LessonSchema = z
  .object({
    formatVersion: z.literal(LESSON_FORMAT_VERSION),
    id,
    title: z.string().min(1).max(200),
    createdAt: isoDate,
    updatedAt: isoDate,
    sources: z.array(PdfSourceSchema),
    selections: z.array(SourceSelectionSchema),
    pages: z.array(BoardPageSchema),
    actions: z.array(BoardActionSchema),
    segments: z.array(RecordingSegmentSchema),
  })
  .superRefine((lesson, ctx) => {
    const sources = new Map(lesson.sources.map((s) => [s.id, s]));
    const selections = new Set(lesson.selections.map((s) => s.id));
    const pages = new Set(lesson.pages.map((p) => p.id));
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    lesson.selections.forEach((sel, i) => {
      const src = sources.get(sel.sourceId);
      if (!src) issue(['selections', i, 'sourceId'], `unknown source "${sel.sourceId}"`);
      else if (sel.page > src.pageCount)
        issue(['selections', i, 'page'], `page ${sel.page} exceeds source page count`);
    });
    let prevT = 0;
    const seen = new Set<string>();
    lesson.actions.forEach((a, i) => {
      if (a.t < prevT) issue(['actions', i, 't'], 'actions must be ordered by time');
      prevT = a.t;
      if (seen.has(a.id)) issue(['actions', i, 'id'], `duplicate action id "${a.id}"`);
      seen.add(a.id);
      if ('pageId' in a && a.type !== 'page.add' && !pages.has(a.pageId))
        issue(['actions', i, 'pageId'], `unknown page "${a.pageId}"`);
      if (a.type === 'content.place' && !selections.has(a.selectionId))
        issue(['actions', i, 'selectionId'], `unknown selection "${a.selectionId}"`);
      if ((a.type === 'history.undo' || a.type === 'history.redo') && !seen.has(a.targetActionId))
        issue(['actions', i, 'targetActionId'], 'history target must be an earlier action');
    });
    lesson.segments.forEach((s, i) => {
      if (s.endMs !== undefined && s.endMs < s.startMs)
        issue(['segments', i, 'endMs'], 'endMs precedes startMs');
    });
  });
export type Lesson = z.infer<typeof LessonSchema>;
