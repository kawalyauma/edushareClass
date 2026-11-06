/**
 * Phase 1 integration gate: contracts, storage, replay and claim coordination work together.
 */
import { ClaimCoordinator, MemoryClaimStore } from '@edushare/claim-coordinator';
import { createLesson, replay } from '@edushare/lesson-format';
import type { Lesson } from '@edushare/shared-types';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbProjectStorage } from '../apps/web/src/storage/projectStorage';

const lesson = (): Lesson => ({
  ...createLesson({ id: 'gate', title: 'Gate lesson' }),
  sources: [{ id: 's', fileName: 'x.pdf', sha256: 'b'.repeat(64), pageCount: 2 }],
  selections: [
    {
      id: 'sel',
      sourceId: 's',
      page: 1,
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      kind: 'text',
      text: 'x + 1 = 2',
    },
  ],
  pages: [{ id: 'p', index: 0 }],
  actions: [
    { id: 'a1', t: 0, type: 'page.add', pageId: 'p' },
    {
      id: 'a2',
      t: 10,
      type: 'content.place',
      pageId: 'p',
      selectionId: 'sel',
      target: { x: 0, y: 0, width: 9, height: 9 },
      mode: 'crop',
    },
  ],
  segments: [{ id: 'seg', startMs: 0, status: 'recording', audioChunkIds: [], videoChunkIds: [] }],
});

describe('Phase 1 integration gate', () => {
  it('lesson survives IndexedDB round-trip and replays identically', async () => {
    const factory = new IDBFactory();
    const storage = new IndexedDbProjectStorage(factory);
    const original = lesson();
    await storage.save(original);
    const loaded = await new IndexedDbProjectStorage(factory).load('gate');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(replay(loaded.lesson)).toEqual(replay(original));
      expect(loaded.lesson.selections[0]?.text).toBe('x + 1 = 2'); // source text untouched
      expect(loaded.lesson.segments[0]?.status).toBe('recording'); // interrupted segment preserved
    }
  });

  it('claim coordinator hands each Phase 1 issue to exactly one agent', async () => {
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), maxAttempts: 100 });
    const issues = Array.from({ length: 10 }, (_, i) => i + 1);
    const results = await Promise.all(
      issues.flatMap((n) =>
        ['alpha', 'beta', 'gamma'].map((agent) =>
          c.claim({
            issueNumber: n,
            agentId: agent,
            provider: 'test',
            branch: `agent/${agent}/p01-${n}`,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(await c.list()).toHaveLength(10);
  });
});
