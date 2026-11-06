# EduShareClass optional private-school API (Phase 09)

The teaching studio remains **local-first and account-free by default**. This FastAPI service is opt-in and does not run/deploy itself. No voice files or PDFs are automatically transferred by the web app.

## Developer setup

```bash
cd apps/api
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
# For a private local development database only:
export EDUSHARE_CLOUD_ENABLED=1
export EDUSHARE_JWT_SECRET="$(openssl rand -hex 32)"   # keep in a secret manager for deployed services
export EDUSHARE_DATABASE_URL='sqlite:///./edushare-local.db'
export EDUSHARE_PRIVATE_DIR='./private-data'
export EDUSHARE_CORS_ORIGINS='http://localhost:5173'
alembic -c alembic.ini upgrade head
uvicorn edushare_api.app:app --host 127.0.0.1 --port 8000
```

In **production**, configure `EDUSHARE_DATABASE_URL=postgresql+psycopg://...`, a private mounted storage directory, a persistent secret from a secret manager, an HTTPS reverse proxy, strict CORS, backups, virus scanning and a rate limiter. Do not use SQLite for concurrent cloud uploads. `EDUSHARE_CREATE_SCHEMA=0` by default; use Alembic migrations. `.env` secrets and private files are ignored and must never be committed. Do not enable public registration unless you have abuse controls and school onboarding policy.

## Provision a school and staff

Self-registration is **disabled** by default. For a school administrator, provide `EDUSHARE_BOOTSTRAP_EMAIL`, `EDUSHARE_BOOTSTRAP_PASSWORD` and `EDUSHARE_BOOTSTRAP_SCHOOL` through your secure shell/session environment and run `python scripts_bootstrap_admin.py`. Bootstrap passwords are never logged or accepted as CLI flags. Authenticated school administrators may create teacher accounts with `POST /api/v1/users/teachers`.

## API contracts (OpenAPI at /docs when enabled)

- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`: 30-minute JWT HS256, Argon2 password hashing; credential tokens are never cookies or browser localStorage.
- `GET /api/v1/lessons`, `GET /api/v1/lessons/{id}`, `PUT ...` with `If-Match: "0"` create or current ETag version to prevent lost edits, `DELETE ...`. Each lesson and file is **owner scoped**.
- `POST /api/v1/lessons/{id}/files?kind=pdf|media`: private raw streaming upload with PDF/video file signature, SHA-256, size quotas; `GET /api/v1/files/{id}` requires owner authentication, no public storage URL.
- Resumable uploads: `POST /api/v1/uploads` with `lessonId, kind, mimeType, sizeBytes, sha256`; then `PATCH /api/v1/uploads/{id}` with `Upload-Offset` and a raw chunk <=8 MiB. The offset must match; query status with `GET`, abort with `DELETE`. The final byte triggers hash and type validation. Quota reservations include pending uploads.
- `POST /api/v1/courses`, `POST /courses/{id}/lessons`, `PATCH /courses/{id}/publish`: school-admin only and require lesson ownership in that school. `GET /courses` is login + school scoped, not public student-facing publication.

## Privacy and limitations

No anonymous PDF/media fetch, automatic sync, public class catalogue, cross-tenant browsing, third-party voice cloning, or server export worker. The browser cloud panel is **explicit opt-in** and uploads only selected files; lesson metadata alone cannot reconstruct missing source PDFs and recordings. Video playback/export can remain local.

**Outstanding acceptance:** PostgreSQL integration and migrations, production auth rate limiting/lockout, secret rotation/revocation, antivirus, resumable upload concurrency, quota races, cleanup of abandoned upload sessions, strict CORS/reverse proxy, backup-and-restore testing, school role audits, cloud PDF/media roundtrips, browser end-to-end and threat-model sign-off. Phase 09 integration gate #94 stays open.

## Tests

```bash
python -m pytest -q apps/api/tests      # from repo root with API on Python path
# or from apps/api:
python -m pytest -q tests
```
