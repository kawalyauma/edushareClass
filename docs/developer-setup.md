# Developer setup

Requirements: Node ≥ 22.22.2 and npm ≥ 10.

```bash
npm install
npm run dev        # web app at http://localhost:5173
npm run check      # format:check + lint + typecheck + test + build (run before every PR)
npm test           # vitest (web/jsdom + node projects)
npm run format     # prettier --write
```

## Canonical autonomous issue coordinator

The reviewed, GitHub-backed exclusive claim implementation is `scripts/agent-claim.cjs`.
The earlier TypeScript implementation in `infrastructure/claim-coordinator` is a prototype and
**must not** be used to claim tasks in parallel. Both mechanisms must not run concurrently.

```bash
# GITHUB_TOKEN is supplied securely in the environment, never committed.
node scripts/agent-claim.cjs status
node scripts/agent-claim.cjs next --agent codex-worker-01 --provider codex
node scripts/agent-claim.cjs heartbeat --agent codex-worker-01
node scripts/agent-claim.cjs release --agent codex-worker-01
```

The current coordinator restricts `next` to Phase 01 issues. It must be extended and
retested against the phase dependency graph before later-phase ten-worker dispatch.
See `docs/COORDINATION.md` and the Phase 02 acceptance report.
