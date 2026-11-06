# Phase 1 — autonomous issue coordinator

This is the first implementable Phase 1 module for EduShareClass. It lets **each worker discover** a ready issue instead of requiring the owner to pick an issue number.

## Scope and safety

- Supports Phase 01 only until the Phase 1 integration gate is reviewed.
- Uses canonical Phase 1 GitHub issues, checks dependencies and open pull requests, and excludes issues already leased.
- Stores mutable leases on the **separate** coordination/claims branch as coordination/claims.json (created automatically on first authenticated run), not on main.
- Performs Git Data API non-force ref updates to prevent two competing claims from both winning. Rejected non-fast-forward updates re-read the state and reselect.
- Uses 30-minute leases and expects a heartbeat every 5 minutes; **expiration does not permit automatic theft**. Inspect existing branches/PRs before manually releasing a stale lease.
- Workers require repository owner-approved write permission. No secrets, cloud deployment, or GitHub Actions workflow is required.

## Prerequisites

Node.js 20 or newer, repository checkout, and a short-lived GitHub token with Contents (read/write), Issues (read), and Pull requests (read) repository permissions. Do not commit or print the token. An installation token from a GitHub App also works when correctly scoped. Set GITHUB_TOKEN securely in the worker environment; never copy a literal credential into source or shell history.

## Commands

From the repository root:

~~~sh
# Worker automatically selects a ready, unclaimed issue.
node scripts/agent-claim.cjs next --agent codex-worker-01 --provider codex

# Another worker chooses from the remaining eligible issues.
node scripts/agent-claim.cjs next --agent antigravity-worker-02 --provider antigravity

# Inspect active coordinator records.
node scripts/agent-claim.cjs status

# Send periodically (recommended every five minutes).
node scripts/agent-claim.cjs heartbeat --agent codex-worker-01

# Release after PR merge or explicit abandonment.
node scripts/agent-claim.cjs release --agent codex-worker-01

# Add --repo owner/name to target a fork or test repository.
~~~

A successful next command prints JSON containing issue URL/number, expiry and proposed branch. The worker must create the feature branch, implement, test and open a PR linking that issue (Closes #N), and keep heartbeating. The claim command does not itself start an AI provider, create a feature branch, or close an issue. Launch agents through Codex, Antigravity or an authorised orchestrator.

## Dependency graph

| P01 task | Must be completed first |
|---|---|
| 09 Exclusive issue claims | none |
| 01 Architecture/contracts | none |
| 02 React/Vite scaffold | 01, 09 |
| 03 Shared types | 01, 09 |
| 04 Three-panel studio shell | 02, 03, 09 |
| 05 Design tokens | 02, 03, 09 |
| 06 Router/workspaces | 02, 03, 09 |
| 07 IndexedDB persistence | 03, 09 |
| 08 Test/build tooling | 02, 09 |
| 10 Phase 1 integration gate | all other Phase 1 tasks |

Dependencies require the **canonical original issue** to be closed with GitHub's completed reason. A duplicate closed with duplicate/not_planned cannot unlock work. Only Phase 1 tasks are eligible. Later phases require explicit gate extensions after review.

## Race condition and retry behaviour

An update reads the coordination ref and current claims, creates an immutable child commit, then advances the ref without force. If another worker advances HEAD first, a stale sibling commit is not fast-forward and GitHub rejects it. The loser retries against updated claims and selects a different work item. Comments and labels are informational, **not** locks.

On contention errors, retry rather than assuming success. For ambiguous network timeouts, inspect status before claiming again. Never force-push or manually modify the coordination branch.

## Verification

~~~sh
node --test tests/agent-claim.test.cjs
node scripts/agent-claim.cjs help
~~~

Tests cover discovery, duplicate-task canonicalisation, dependency blockers, active PR avoidance, lease identity/TTL, and stale competing-ref updates. For live integration acceptance, use two independent workers against a test repository; start both simultaneously, verify different issue numbers, then test heartbeat, release, retries and stale claim handling. Review the evidence before enabling 10-way concurrency.

## Interim single-dispatcher rule

Until this code is merged and live contention tests have passed, use a **single dispatcher** for claim decisions. A bootstrap PR is not evidence that 10 simultaneous autonomous agents are running. Phase 02 remains locked.
