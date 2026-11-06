export type ClaimStatus = 'claimed' | 'released' | 'completed';

/** Authoritative claim record (AGENTS.md "Claim protocol"). Timestamps are ISO-8601 UTC. */
export interface ClaimRecord {
  issue_number: number;
  agent_id: string;
  provider: string;
  claimed_at: string;
  expires_at: string;
  heartbeat_at: string;
  branch: string;
  status: ClaimStatus;
}

export interface ClaimsFile {
  version: 1;
  claims: Record<string, ClaimRecord>;
}

export const LEASE_TTL_MS = 30 * 60_000;
export const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export const emptyClaims = (): ClaimsFile => ({ version: 1, claims: {} });

/**
 * Compare-and-swap storage. `write` MUST succeed only if the stored version still equals
 * `expectedVersion`, otherwise return `{ ok: false }` with no side effects.
 */
export interface ClaimStore {
  read(): Promise<{ data: ClaimsFile; version: string }>;
  write(
    data: ClaimsFile,
    expectedVersion: string,
  ): Promise<{ ok: true; version: string } | { ok: false }>;
}
