import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { ClaimStore, ClaimsFile } from './types.js';
import { emptyClaims } from './types.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In-process CAS store (tests, single-process dispatcher). */
export class MemoryClaimStore implements ClaimStore {
  private data: ClaimsFile = emptyClaims();
  private n = 0;
  async read() {
    return { data: structuredClone(this.data), version: String(this.n) };
  }
  async write(data: ClaimsFile, expectedVersion: string) {
    if (expectedVersion !== String(this.n)) return { ok: false as const };
    this.data = structuredClone(data);
    this.n += 1;
    return { ok: true as const, version: String(this.n) };
  }
}

/**
 * File-backed CAS store safe across processes on one machine: an O_EXCL lock file serialises the
 * check-and-write; version is the SHA-256 of the file content.
 */
export class FileClaimStore implements ClaimStore {
  constructor(
    private readonly path: string,
    private readonly lockTimeoutMs = 5000,
  ) {}

  private async load(): Promise<{ data: ClaimsFile; version: string }> {
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      return { data: JSON.parse(raw) as ClaimsFile, version: hash(raw) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { data: emptyClaims(), version: 'empty' };
      throw e;
    }
  }

  read() {
    return this.load();
  }

  async write(data: ClaimsFile, expectedVersion: string) {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const lock = `${this.path}.lock`;
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        (await fs.open(lock, 'wx')).close();
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (Date.now() > deadline)
          throw new Error(`claim store lock timeout: ${lock}`, { cause: e });
        await sleep(5);
      }
    }
    try {
      const current = await this.load();
      if (current.version !== expectedVersion) return { ok: false as const };
      const raw = JSON.stringify(data, null, 2) + '\n';
      const tmp = `${this.path}.${process.pid}.tmp`;
      await fs.writeFile(tmp, raw);
      await fs.rename(tmp, this.path);
      return { ok: true as const, version: hash(raw) };
    } finally {
      await fs.rm(lock, { force: true });
    }
  }
}

export interface GitHubStoreOptions {
  owner: string;
  repo: string;
  /** Protected coordination branch holding coordination/claims.json. */
  branch?: string;
  path?: string;
  token: string;
  fetchImpl?: typeof fetch;
}

/**
 * Central CAS via the GitHub Contents API: PUT with the blob `sha` obtained at read time is
 * rejected (409/422) if anyone updated the file since, so the server serialises conflicts.
 * Requires the branch to exist; never uses comments/labels as locks.
 */
export class GitHubClaimStore implements ClaimStore {
  private readonly f: typeof fetch;
  private readonly branch: string;
  private readonly path: string;
  constructor(private readonly o: GitHubStoreOptions) {
    this.f = o.fetchImpl ?? fetch;
    this.branch = o.branch ?? 'coordination';
    this.path = o.path ?? 'coordination/claims.json';
  }
  private url() {
    return `https://api.github.com/repos/${this.o.owner}/${this.o.repo}/contents/${this.path}`;
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.o.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }
  async read() {
    const res = await this.f(`${this.url()}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return { data: emptyClaims(), version: 'new' };
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
    const body = (await res.json()) as { sha: string; content: string };
    const raw = Buffer.from(body.content, 'base64').toString('utf8');
    return { data: JSON.parse(raw) as ClaimsFile, version: body.sha };
  }
  async write(data: ClaimsFile, expectedVersion: string) {
    const res = await this.f(this.url(), {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'coordination: update claims',
        content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'),
        branch: this.branch,
        ...(expectedVersion === 'new' ? {} : { sha: expectedVersion }),
      }),
    });
    if (res.status === 409 || res.status === 422) return { ok: false as const };
    if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`);
    const body = (await res.json()) as { content: { sha: string } };
    return { ok: true as const, version: body.content.sha };
  }
}
