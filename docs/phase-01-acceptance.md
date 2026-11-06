# Phase 01 acceptance checkpoint

Evidence is reproducible with `npm run check` (all green at time of writing).

| Issue  | Deliverable                       | Evidence                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------ |
| P01-01 | Contracts and ADRs                | `docs/adr/0001–0005`, `docs/lesson-format.md`                            |
| P01-02 | React + TS + Vite scaffold        | `apps/web`, `npm run build`                                              |
| P01-03 | Shared types and lesson schema    | `packages/shared-types`, `packages/lesson-format` + tests                |
| P01-04 | Responsive three-panel shell      | `apps/web/src/shell`, `app.test.tsx` (panels, tabs, keyboard, URL)       |
| P01-05 | Design tokens and UI components   | `styles/tokens.css`, `src/ui`                                            |
| P01-06 | Router and workspace navigation   | `routes.tsx`, empty / not-found / corrupt / unavailable states tested    |
| P01-07 | IndexedDB local storage           | `storage/projectStorage.ts` + tests (CRUD, reload, corrupt, unavailable) |
| P01-08 | Test, lint, format, build tooling | root configs, `npm run check`                                            |
| P01-09 | Claim coordinator and leases      | `infrastructure/claim-coordinator`, race tests                           |
| P01-10 | Integration acceptance, setup     | `tests/phase1.acceptance.test.ts`, `docs/developer-setup.md`             |

## Known limits (not verified here)

- `GitHubClaimStore` is tested against a mocked API only; it needs the `coordination` branch and a
  token to be exercised against GitHub. Owner action required (ADR 0004).
- No browser screenshots: the shell was verified by DOM tests, not rendered in a real browser, and the
  responsive CSS (panel hiding below 1024px) is unverified visually.
- GitHub issues #1–#10 still need to be closed by merging this branch via PR (owner review required for
  shared contracts per AGENTS.md).
