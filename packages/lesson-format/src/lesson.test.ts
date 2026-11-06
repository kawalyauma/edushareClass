import { describe, expect, it } from 'vitest';
import type { Lesson } from '@edushare/shared-types';
import { createLesson, deserializeLesson, parseLesson, replay, serializeLesson } from './index.js';

const SHA = 'a'.repeat(64);
export const sampleLesson = (): Lesson => ({
  ...createLesson({ id: 'l1', title: 'Fractions', now: new Date('2026-01-01T00:00:00Z') }),
  sources: [{ id: 's1', fileName: 'book.pdf', sha256: SHA, pageCount: 10 }],
  selections: [
    {
      id: 'sel1',
      sourceId: 's1',
      page: 3,
      bbox: { x: 10, y: 20, width: 100, height: 20 },
      kind: 'text',
      text: '1/2 + 1/4 = 3/4',
    },
  ],
  pages: [{ id: 'p1', index: 0 }],
  actions: [
    { id: 'a1', t: 0, type: 'page.add', pageId: 'p1' },
    {
      id: 'a2',
      t: 100,
      type: 'content.place',
      pageId: 'p1',
      selectionId: 'sel1',
      target: { x: 0, y: 0, width: 500, height: 80 },
      mode: 'handwriting',
    },
    {
      id: 'a3',
      t: 200,
      type: 'stroke.write',
      pageId: 'p1',
      contentId: 'a2',
      stroke: {
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        width: 3,
        color: '#112233',
        durationMs: 120,
      },
    },
    { id: 'a4', t: 900, type: 'board.clear', pageId: 'p1' },
  ],
  segments: [
    {
      id: 'seg1',
      startMs: 0,
      endMs: 1000,
      status: 'complete',
      audioChunkIds: ['c1'],
      videoChunkIds: ['c2'],
    },
  ],
});

describe('lesson format', () => {
  it('round-trips through JSON', () => {
    const l = sampleLesson();
    expect(deserializeLesson(serializeLesson(l))).toEqual({ ok: true, lesson: l });
  });

  it('handles an empty lesson', () => {
    const l = createLesson({ id: 'x', title: 'Empty' });
    expect(parseLesson(l).ok).toBe(true);
    expect(replay(l).pages).toEqual([]);
  });

  it('rejects non-objects, bad JSON and wrong versions with readable errors', () => {
    expect(parseLesson(null)).toEqual({ ok: false, errors: ['lesson must be an object'] });
    expect(deserializeLesson('{nope')).toEqual({ ok: false, errors: ['invalid JSON'] });
    const r = parseLesson({ formatVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/unsupported formatVersion 99/);
  });

  it('enforces source fidelity and referential integrity', () => {
    const l = sampleLesson();
    l.selections[0]!.page = 11;
    (l.actions[1] as { selectionId: string }).selectionId = 'missing';
    l.actions[2]!.t = 50;
    const r = parseLesson(l);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join('\n');
      expect(all).toMatch(/exceeds source page count/);
      expect(all).toMatch(/unknown selection/);
      expect(all).toMatch(/ordered by time/);
    }
  });

  it('rejects unknown source, duplicate action ids and inverted segments', () => {
    const l = sampleLesson();
    l.selections[0]!.sourceId = 'nope';
    l.actions[1]!.id = 'a1';
    l.segments[0]!.startMs = 2000;
    const r = parseLesson(l);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join('\n');
      expect(all).toMatch(/unknown source/);
      expect(all).toMatch(/duplicate action id/);
      expect(all).toMatch(/endMs precedes startMs/);
    }
  });
});

describe('deterministic replay', () => {
  it('gives identical state for identical input and supports seeking', () => {
    const l = sampleLesson();
    expect(replay(l)).toEqual(replay(structuredClone(l)));
    expect(replay(l, 300).pages[0]?.content[0]?.strokes).toHaveLength(1);
    expect(replay(l, 50).pages[0]?.content).toHaveLength(0);
    expect(replay(l).pages[0]?.content).toHaveLength(0);
  });

  it('tracks pace changes', () => {
    const l = sampleLesson();
    l.actions.push({ id: 'a5', t: 950, type: 'pace.set', speed: 2 });
    expect(replay(l).speed).toBe(2);
  });
});
