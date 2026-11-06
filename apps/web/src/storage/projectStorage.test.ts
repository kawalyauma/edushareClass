import { createLesson } from '@edushare/lesson-format';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DB_NAME,
  IndexedDbProjectStorage,
  LESSONS,
  StorageUnavailableError,
} from './projectStorage';

describe('IndexedDbProjectStorage', () => {
  it('starts empty, saves, lists, loads and removes', async () => {
    const s = new IndexedDbProjectStorage(new IDBFactory());
    expect(await s.list()).toEqual([]);
    const l = createLesson({ id: 'a', title: 'Algebra' });
    await s.save(l);
    expect((await s.list()).map((x) => x.id)).toEqual(['a']);
    const loaded = await s.load('a');
    expect(loaded.ok && loaded.lesson.title).toBe('Algebra');
    await s.remove('a');
    expect(await s.load('a')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('persists across storage instances (reload)', async () => {
    const factory = new IDBFactory();
    await new IndexedDbProjectStorage(factory).save(createLesson({ id: 'p', title: 'Persist' }));
    const again = new IndexedDbProjectStorage(factory);
    expect((await again.list())[0]?.title).toBe('Persist');
  });

  it('refuses to save an invalid lesson', async () => {
    const bad = { ...createLesson({ id: 'b', title: 'x' }), title: '' };
    await expect(new IndexedDbProjectStorage(new IDBFactory()).save(bad)).rejects.toThrow(
      /invalid lesson/,
    );
  });

  it('reports corrupt records instead of crashing', async () => {
    const factory = new IDBFactory();
    const s = new IndexedDbProjectStorage(factory);
    await s.list(); // opens/creates DB
    const db = await new Promise<IDBDatabase>((res) => {
      const r = factory.open(DB_NAME);
      r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const tx = db.transaction(LESSONS, 'readwrite');
      tx.objectStore(LESSONS).put({ id: 'bad', formatVersion: 1, title: 'Broken' });
      tx.oncomplete = () => res();
    });
    const r = await s.load('bad');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'corrupt') expect(r.errors.length).toBeGreaterThan(0);
    expect((await s.list()).some((x) => x.id === 'bad')).toBe(true);
  });

  it('throws StorageUnavailableError when IndexedDB is missing', async () => {
    const s = new IndexedDbProjectStorage(null);
    await expect(s.list()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
