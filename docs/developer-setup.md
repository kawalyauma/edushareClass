# Developer setup

Requirements: Node ≥ 22.22.2 and npm ≥ 10.

```bash
npm install
npm run dev        # web app at http://localhost:5173
npm run check      # format:check + lint + typecheck + test + build (run before every PR)
npm test           # vitest (web/jsdom + node projects)
npm run format     # prettier --write
```

Claims (see ADR 0004):

```bash
npm run claims -- list
npm run claims -- claim 3 --agent codex-1 --provider openai --branch agent/codex-1/p02-pdf
npm run claims -- heartbeat 3 --agent codex-1     # every 5 minutes
npm run claims -- release 3 --agent codex-1       # or: complete (after merge)
```

By default claims use `coordination/claims.json` (local, git-ignored). Set `CLAIMS_GITHUB_REPO=owner/repo`
and `GITHUB_TOKEN` to use the GitHub-backed store on the `coordination` branch.
