import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaimCoordinator, FileClaimStore, GitHubClaimStore, MemoryClaimStore } from './index.js';
import type { ClaimsFile } from './index.js';

const req = (agentId: string, issueNumber = 9) => ({
  issueNumber,
  agentId,
  provider: 'test',
  branch: `agent/${agentId}/p01-claim`,
});

function clock(start = '2026-01-01T00:00:00Z') {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe('exclusive claims', () => {
  it('exactly one of 10 racing agents wins the same issue', async () => {
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), maxAttempts: 50 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => c.claim(req(`a${i}`))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const losers = results.filter((r) => !r.ok);
    expect(losers.every((r) => !r.ok && r.reason === 'held')).toBe(true);
  });

  it('distinct issues can all be claimed concurrently', async () => {
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), maxAttempts: 50 });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => c.claim(req(`a${i}`, i + 1))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await c.list()).toHaveLength(10);
  });

  it('same agent renews its own lease without changing branch', async () => {
    const clk = clock();
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), now: clk.now });
    const first = await c.claim(req('a'));
    clk.advance(60_000);
    const again = await c.claim({ ...req('a'), branch: 'other' });
    expect(again.ok && again.renewed).toBe(true);
    if (first.ok && again.ok) {
      expect(again.claim.branch).toBe(first.claim.branch);
      expect(again.claim.claimed_at).toBe(first.claim.claimed_at);
    }
  });
});

describe('leases', () => {
  it('uses a 30-minute TTL and heartbeat extends it', async () => {
    const clk = clock();
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), now: clk.now });
    await c.claim(req('a'));
    clk.advance(5 * 60_000);
    expect(await c.heartbeat(9, 'a')).toBe(true);
    const [rec] = await c.list();
    expect(new Date(rec!.expires_at).getTime() - clk.now().getTime()).toBe(30 * 60_000);
    expect(await c.heartbeat(9, 'intruder')).toBe(false);
  });

  it('expiry alone does not authorise takeover', async () => {
    const clk = clock();
    const c = new ClaimCoordinator({ store: new MemoryClaimStore(), now: clk.now });
    await c.claim(req('a'));
    clk.advance(31 * 60_000);
    const r = await c.claim(req('b'));
    expect(r).toMatchObject({ ok: false, reason: 'expired-needs-confirmation' });
  });

  it('takeover succeeds only after confirmation (e.g. no active PR)', async () => {
    const clk = clock();
    const c = new ClaimCoordinator({
      store: new MemoryClaimStore(),
      now: clk.now,
      confirmTakeover: async () => true,
    });
    await c.claim(req('a'));
    clk.advance(31 * 60_000);
    const r = await c.claim(req('b'));
    expect(r.ok && r.claim.agent_id).toBe('b');
  });

  it('live lease blocks others; release frees; complete is final', async () => {
    const c = new ClaimCoordinator({ store: new MemoryClaimStore() });
    await c.claim(req('a'));
    expect(await c.claim(req('b'))).toMatchObject({ ok: false, reason: 'held' });
    expect(await c.release(9, 'b')).toBe(false);
    expect(await c.release(9, 'a')).toBe(true);
    expect((await c.claim(req('b'))).ok).toBe(true);
    expect(await c.complete(9, 'b')).toBe(true);
    expect(await c.claim(req('c'))).toMatchObject({ ok: false, reason: 'held' });
  });

  it('reports contention instead of assuming a claim', async () => {
    const store = new MemoryClaimStore();
    const hostile = { read: () => store.read(), write: async () => ({ ok: false as const }) };
    const c = new ClaimCoordinator({ store: hostile, maxAttempts: 3 });
    expect(await c.claim(req('a'))).toEqual({ ok: false, reason: 'contention' });
  });
});

describe('FileClaimStore', () => {
  it('serialises concurrent claims across store instances', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'claims-')), 'coordination', 'claims.json');
    const coords = Array.from(
      { length: 8 },
      () => new ClaimCoordinator({ store: new FileClaimStore(path), maxAttempts: 100 }),
    );
    const results = await Promise.all(coords.map((c, i) => c.claim(req(`a${i}`))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await coords[0]!.list()).toHaveLength(1);
  });
});

describe('GitHubClaimStore (mocked API)', () => {
  it('uses blob sha as CAS token and maps 409 to a conflict', async () => {
    let sha = 'sha0';
    let file: ClaimsFile | null = null;
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (!init?.method || init.method === 'GET') {
        if (!file) return new Response('{}', { status: 404 });
        return Response.json({
          sha,
          content: Buffer.from(JSON.stringify(file)).toString('base64'),
        });
      }
      const body = JSON.parse(init.body as string);
      if (file && body.sha !== sha) return new Response('{}', { status: 409 });
      file = JSON.parse(Buffer.from(body.content, 'base64').toString());
      sha = `sha${calls.length}`;
      return Response.json({ content: { sha } });
    }) as unknown as typeof fetch;
    const store = new GitHubClaimStore({ owner: 'o', repo: 'r', token: 't', fetchImpl });
    const c = new ClaimCoordinator({ store });
    expect((await c.claim(req('a'))).ok).toBe(true);
    expect(await c.claim(req('b'))).toMatchObject({ ok: false, reason: 'held' });
    const stale = await store.write({ version: 1, claims: {} }, 'stale-sha');
    expect(stale.ok).toBe(false);
    expect(calls.some((u) => u.includes('ref=coordination'))).toBe(true);
  });
});
