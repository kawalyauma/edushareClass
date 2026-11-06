# ADR 0002 — Canonical, event-sourced lesson format

**Status:** accepted (Phase 01). Shared interface: changes need review.

## Decision

A lesson is one JSON document (`formatVersion: 1`) defined by zod schemas in
`@edushare/shared-types`; TypeScript types are inferred from the schemas.

- **Sources and selections** keep PDF identity (`sha256`), 1-based page and PDF-point `bbox`, the
  verbatim extracted `text`, and a `cropAssetId` fallback. Text is never rewritten.
- **Board state is event-sourced.** `actions[]` are time-ordered (`t` in ms on the lesson clock).
  `replay()` in `@edushare/lesson-format` is a pure reducer, so replay is deterministic and can seek
  to any time (required for Phase 04 replay and Phase 07 editing).
- **Recording segments** carry ordered media chunk ids so interrupted sessions can be recovered
  (`status: 'recovered'`).
- Cross-field integrity (known sources/pages/selections, page within source, ordered times, unique
  action ids, segment end ≥ start) is enforced in the schema, not by callers.

## Consequences

Adding an action type or field is a schema change plus a reducer case; bump `formatVersion` for any
breaking change and add a migration in `lesson-format`.
