import { parseLesson } from '@edushare/lesson-format';
import type { Lesson } from '@edushare/shared-types';

export const DB_NAME = 'edushareclass';
export const DB_VERSION = 1;
export const LESSONS = 'lessons';
/** Reserved for Phase 06: progressively persisted media chunks keyed by chunk id. */
export const MEDIA_CHUNKS = 'mediaChunks';

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Local storage (IndexedDB) is not available in this browser or mode.');
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

export interface LessonSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type LoadResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'corrupt'; errors: string[] };

export interface ProjectStorage {
  list(): Promise<LessonSummary[]>;
  load(id: string): Promise<LoadResult>;
  save(lesson: Lesson): Promise<void>;
  remove(id: string): Promise<void>;
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

export class IndexedDbProjectStorage implements ProjectStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  private db(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new StorageUnavailableError());
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.factory!.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(new StorageUnavailableError(e));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LESSONS))
          db.createObjectStore(LESSONS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(MEDIA_CHUNKS)) db.createObjectStore(MEDIA_CHUNKS);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Let other tabs upgrade/delete the DB instead of blocking them.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(new StorageUnavailableError(req.error));
      req.onblocked = () => reject(new StorageUnavailableError('open blocked'));
    });
    this.dbPromise.catch(() => (this.dbPromise = null));
    return this.dbPromise;
  }

  async list(): Promise<LessonSummary[]> {
    const db = await this.db();
    const rows = await wrap<unknown[]>(db.transaction(LESSONS).objectStore(LESSONS).getAll());
    const out: LessonSummary[] = [];
    for (const row of rows) {
      const r = row as Partial<Lesson>;
      if (typeof r.id === 'string') {
        out.push({
          id: r.id,
          title: typeof r.title === 'string' ? r.title : '(untitled)',
          updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
        });
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<LoadResult> {
    const db = await this.db();
    const row = await wrap<unknown>(db.transaction(LESSONS).objectStore(LESSONS).get(id));
    if (row === undefined) return { ok: false, reason: 'not-found' };
    const parsed = parseLesson(row);
    return parsed.ok
      ? { ok: true, lesson: parsed.lesson }
      : { ok: false, reason: 'corrupt', errors: parsed.errors };
  }

  async save(lesson: Lesson): Promise<void> {
    const check = parseLesson(lesson);
    if (!check.ok) throw new Error(`Refusing to save invalid lesson: ${check.errors.join('; ')}`);
    const db = await this.db();
    const tx = db.transaction(LESSONS, 'readwrite');
    tx.objectStore(LESSONS).put({ ...lesson, updatedAt: new Date().toISOString() });
    await done(tx);
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(LESSONS, 'readwrite');
    tx.objectStore(LESSONS).delete(id);
    await done(tx);
  }
}
