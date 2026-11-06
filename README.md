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
