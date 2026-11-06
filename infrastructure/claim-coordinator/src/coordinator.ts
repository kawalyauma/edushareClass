import type { ClaimRecord, ClaimStore, ClaimsFile } from './types.js';
import { LEASE_TTL_MS } from './types.js';

export type ClaimRequest = {
  issueNumber: number;
  agentId: string;
  provider: string;
  branch: string;
};

export type ClaimResult =
  | { ok: true; claim: ClaimRecord; renewed: boolean }
  | { ok: false; reason: 'held'; holder: ClaimRecord }
  | { ok: false; reason: 'expired-needs-confirmation'; holder: ClaimRecord }
  | { ok: false; reason: 'contention' };

export interface CoordinatorOptions {
  store: ClaimStore;
  now?: () => Date;
  ttlMs?: number;
  maxAttempts?: number;
  /**
   * Called before taking over an EXPIRED lease held by someone else. Must confirm there is no
   * active PR/branch for the issue. Default: refuse (expiry alone never authorises stealing).
   */
  confirmTakeover?: (expired: ClaimRecord) => Promise<boolean>;
}

const iso = (d: Date) => d.toISOString();

export class ClaimCoordinator {
  private readonly store: ClaimStore;
  private readonly now: () => Date;
  private readonly ttl: number;
  private readonly maxAttempts: number;
  private readonly confirmTakeover: (r: ClaimRecord) => Promise<boolean>;

  constructor(o: CoordinatorOptions) {
    this.store = o.store;
    this.now = o.now ?? (() => new Date());
    this.ttl = o.ttlMs ?? LEASE_TTL_MS;
    this.maxAttempts = o.maxAttempts ?? 10;
    this.confirmTakeover = o.confirmTakeover ?? (async () => false);
  }

  /** Run a read-modify-write with CAS, retrying on conflict with fresh state each time. */
  private async mutate<T>(
    fn: (data: ClaimsFile) => Promise<{ next?: ClaimsFile; result: T }>,
  ): Promise<T | { contention: true }> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const { data, version } = await this.store.read();
      const { next, result } = await fn(structuredClone(data));
      if (!next) return result;
      const w = await this.store.write(next, version);
      if (w.ok) return result;
    }
    return { contention: true };
  }

  private isLive(c: ClaimRecord): boolean {
    return c.status === 'claimed' && new Date(c.expires_at).getTime() > this.now().getTime();
  }

  async claim(req: ClaimRequest): Promise<ClaimResult> {
    const out = await this.mutate<ClaimResult>(async (data) => {
      const key = String(req.issueNumber);
      const existing = data.claims[key];
      const now = this.now();
      const fresh = (claimedAt: string): ClaimRecord => ({
        issue_number: req.issueNumber,
        agent_id: req.agentId,
        provider: req.provider,
        claimed_at: claimedAt,
        expires_at: iso(new Date(now.getTime() + this.ttl)),
        heartbeat_at: iso(now),
        branch: req.branch,
        status: 'claimed',
      });

      if (existing?.status === 'completed') {
        return { result: { ok: false, reason: 'held', holder: existing } };
      }
      if (existing && existing.status === 'claimed') {
        if (existing.agent_id === req.agentId) {
          const claim = { ...fresh(existing.claimed_at), branch: existing.branch };
          data.claims[key] = claim;
          return { next: data, result: { ok: true, claim, renewed: true } };
        }
        if (this.isLive(existing)) {
          return { result: { ok: false, reason: 'held', holder: existing } };
        }
        if (!(await this.confirmTakeover(existing))) {
          return { result: { ok: false, reason: 'expired-needs-confirmation', holder: existing } };
        }
      }
      const claim = fresh(iso(now));
      data.claims[key] = claim;
      return { next: data, result: { ok: true, claim, renewed: false } };
    });
    return 'contention' in out ? { ok: false, reason: 'contention' } : out;
  }

  /** Extend the lease. Only the current holder of a live-or-expired-but-unstolen claim may. */
  async heartbeat(issueNumber: number, agentId: string): Promise<boolean> {
    const out = await this.mutate<boolean>(async (data) => {
      const c = data.claims[String(issueNumber)];
      if (!c || c.status !== 'claimed' || c.agent_id !== agentId) return { result: false };
      const now = this.now();
      data.claims[String(issueNumber)] = {
        ...c,
        heartbeat_at: iso(now),
        expires_at: iso(new Date(now.getTime() + this.ttl)),
      };
      return { next: data, result: true };
    });
    return out === true;
  }

  private async finish(issueNumber: number, agentId: string, status: 'released' | 'completed') {
    const out = await this.mutate<boolean>(async (data) => {
      const c = data.claims[String(issueNumber)];
      if (!c || c.status !== 'claimed' || c.agent_id !== agentId) return { result: false };
      data.claims[String(issueNumber)] = { ...c, status, heartbeat_at: iso(this.now()) };
      return { next: data, result: true };
    });
    return out === true;
  }

  /** Abandon a claim (explicit abandonment). */
  release(issueNumber: number, agentId: string) {
    return this.finish(issueNumber, agentId, 'released');
  }

  /** Mark done after PR merge; the issue can no longer be claimed. */
  complete(issueNumber: number, agentId: string) {
    return this.finish(issueNumber, agentId, 'completed');
  }

  async list(): Promise<ClaimRecord[]> {
    const { data } = await this.store.read();
    return Object.values(data.claims).sort((a, b) => a.issue_number - b.issue_number);
  }
}
