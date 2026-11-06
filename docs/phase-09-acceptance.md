# Phase 09 — accounts, private files and optional school publishing

**Implementation status:** initial backend + opt-in browser connection delivered as a **stacked draft PR**. No live cloud infrastructure deployed. Canonical Phase 09 gate #94 OPEN.

## Implemented

- FastAPI 0.1 with OpenAPI, SQLAlchemy models for school, users, lessons, file assets, upload sessions and courses; Alembic initial migration. PostgreSQL via `psycopg` is configured but not independently exercised in this runtime.
- Argon2 password hashing; short-lived JWT with issuer/audience; signup off by default; offline admin bootstrap and administrator-created teacher accounts.
- Owner-scoped CRUD metadata with explicit revision `If-Match` conflict checks; per-owner access checks on every PDF/media upload and download.
- Private 0700 object directory, random file keys, streamed upload limits, MIME signature and SHA-256 validation, resumable 8 MiB chunks with offset checks and user quota reservations. Uploaded private video is **not public**.
- Admin-only school course creation and publishing, without implicitly publishing someone else's lessons. No student/public listing yet.
- Web cloud panel disabled by default; explicit login and file selection, memory-only access token, HTTPS requirement except localhost, remote revision check and explicit overwrite consent. No source PDFs or voice clips upload automatically; metadata JSON backup is not full-media sync.

## Validation

Python `pytest` tests cover auth/tenant separation, optimistic revision conflicts, wrong file signatures, PDF private upload/download, resumable offsets and hash completion, school-admin permissions, teacher provisioning and disabled-by-default cloud. Pure cloud URL TypeScript tests are supplied. **Full monorepo npm build, live PostgreSQL migration, production security audit, real browser cloud transfer and restore are unverified.**

## Blocking acceptance issues

P09-01..10 workstreams exist, but this PR should not close the acceptance gate #94. Production still requires abuse rate limits, secret rotation/revocation, audit logging, malware scanning, virus-safe previews, export background workers, long-running resumable concurrency tests, deployed backups/restore and GDPR/UGX local school privacy review. Never store teacher audio or student PDFs in public object buckets. Phase 06/07/08 gates also remain open.
