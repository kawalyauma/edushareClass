# ADR 0004 — Exclusive issue claims via compare-and-swap

**Status:** accepted (Phase 01)

## Decision

GitHub comments/labels are not locks. Claims are records in `coordination/claims.json`, mutated only
through a store that provides **compare-and-swap**: a write succeeds only if the stored version is
unchanged. `ClaimCoordinator` re-reads and retries on conflict and returns an explicit
success/failure; contention exhaustion is reported as failure, never assumed success.

Stores (`infrastructure/claim-coordinator`):

- `GitHubClaimStore` — production. Uses the Contents API on the protected `coordination` branch;
  the blob `sha` is the CAS token (409/422 ⇒ conflict). Needs `GITHUB_TOKEN` and `CLAIMS_GITHUB_REPO`.
- `FileClaimStore` — single machine, multiple processes (O_EXCL lock + content hash).
- `MemoryClaimStore` — tests / single-process dispatcher.

Lease rules follow AGENTS.md: 30-minute TTL, 5-minute heartbeat, the same agent may renew, and an
**expired lease alone never authorises takeover** — another agent may take over only if
`confirmTakeover` (no active PR/branch) approves, which defaults to refusing.

## Owner action required

Create the protected `coordination` branch before using `GitHubClaimStore`. Until then use the
single-claim dispatcher mode (`FileClaimStore`) as described in `ROADMAP.md`.
