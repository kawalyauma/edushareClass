# ADR 0003 — Local-first project storage in IndexedDB

**Status:** accepted (Phase 01)

## Decision

Projects live in the browser's IndexedDB (`edushareclass` v1: `lessons` keyed by `id`, and a
reserved `mediaChunks` store for Phase 06). Cloud access is never required for manual recording.

- Every read is validated with `parseLesson`; damaged records surface as `{ reason: 'corrupt' }`
  and still appear in the list, so the user is told rather than silently losing data.
- Saves are validated and refused if invalid.
- Missing/blocked IndexedDB (e.g. some private modes) raises `StorageUnavailableError`, shown as a
  retryable error in the UI.
- The connection closes on `versionchange` so other tabs can upgrade or delete the database.
- The `ProjectStorage` interface is injected via React context, so UI tests and a future cloud
  adapter (Phase 09) substitute it without touching components.
