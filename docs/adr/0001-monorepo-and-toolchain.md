# ADR 0001 — Monorepo and toolchain

**Status:** accepted (Phase 01)

## Decision

npm workspaces monorepo with the layout fixed in `AGENTS.md`: `apps/web`, `apps/api`,
`packages/{shared-types,lesson-format,stroke-engine}`, `infrastructure/`, `tests/`, `docs/`.
TypeScript project references (`tsc -b`), Vitest (jsdom for `apps/web`, node elsewhere), ESLint flat
config + typescript-eslint, Prettier, Vite + React for the web app. Workspace packages export their
TypeScript source directly (`"main": "src/index.ts"`), so no build step is needed between packages.

## Consequences

- One command verifies everything locally: `npm run check` (format, lint, typecheck, test, build).
- **No GitHub Actions** are enabled (AGENTS.md: CI is opt-in to avoid unexpected cost).
- `apps/api` (FastAPI) is intentionally not scaffolded until Phase 09; it needs no Phase 01 contract.
