# EduShareClass — Smart Teaching Board

Browser-based manual lesson recording studio. Teachers select content from a PDF, reveal it as animated handwriting on a teaching board, narrate with their real microphone, and export recorded lessons.

## Scope
Manual teaching only. React + TypeScript + Vite frontend; PDF.js; stroke-path handwriting; Canvas/SVG; browser microphone and recording; FastAPI/PostgreSQL optional cloud backend; FFmpeg MP4 conversion. No AI-generated lessons or cloned voice in v1.

## Development
Read [AGENTS.md](AGENTS.md) before changing code. All work is tracked in GitHub issues. Agents self-select and claim an eligible issue in the active phase; never require the owner to assign issue numbers.

## Getting started

See [docs/developer-setup.md](docs/developer-setup.md). Quick check: `npm install && npm run check`.

## Phases
1. Foundation and architecture
2. PDF reader and selection — implementation delivered; browser QA pending
3. Handwriting stroke engine
4. Teaching board
5. Maths and diagrams
6. Voice and video recording
7. Timeline and editing
8. Export and media
9. Accounts and storage
10. QA, security and release

## Priorities
Accuracy of PDF content; realistic writing; teacher-controlled pacing; reliable recovery; synchronized voice; private recordings; 1080p MP4 output.

## Phase 02 PDF selection

The Source PDF panel can accept local PDFs (up to 50 MiB), navigate pages, zoom/rotate,
select a text line or manually crop a scanned formula/diagram, and preview exact
source crops before carrying the selection forward. PDFs and crops are stored only in
IndexedDB. Mathematical text remains flagged for visual source review.
See [Phase 02 acceptance checkpoint](docs/phase-02-acceptance.md).

### Phase 05/06 modules (in progress)

- `packages/math-notation` — teacher-controlled exact maths typesetting with a strict parser and original PDF crop fallback. See `docs/phase-05-acceptance.md`.
- `packages/recording-core` + `apps/web/src/recording` — explicit teacher microphone access, board-only browser video and progressive local recovery chunks. See `docs/phase-06-acceptance.md`.

These features are **not production-approved** until the browser, device and synchronisation acceptance checks pass. MP4 export is scheduled for Phase 08, not guaranteed by MediaRecorder.

## Phase 07–09 engineering (stacked review work)

- **Phase 07** `packages/timeline-editor` + `apps/web/src/timeline`: clip timeline, non-destructive trim/reorder, undo/redo, source-time/board replay mapping and local video scrubber. See `docs/phase-07-acceptance.md`.
- **Phase 08** `packages/export-core` + `apps/web/src/export`: local editor-to-video export in a browser-supported container, optional teacher caption and metadata manifest. A no-network FFmpeg worker can produce verified H.264/AAC 1080p MP4 from locally downloaded segment source media: `scripts/export_mp4.py`. See `docs/phase-08-acceptance.md`.
- **Phase 09** optional FastAPI service at `apps/api`, PostgreSQL/Alembic schema, teacher login and school roles, private PDF/media storage, optimistic versioned lesson metadata, resumable quota-checked uploads and school-admin courses. Browser cloud panel is **off by default** and never silently transfers voice, lesson videos or PDFs. See `apps/api/README.md` and `docs/phase-09-acceptance.md`.

All three are **review-stage**, not an approved production release. Upstream Phase 06 is still a draft PR; do not merge stacked branches to `main` or enable school cloud accounts until the relevant npm/browser/security and acceptance gates pass. The repository's existing claim coordinator is Phase-01-only; these deliverables were authored without launching 10 concurrent provider agents.
