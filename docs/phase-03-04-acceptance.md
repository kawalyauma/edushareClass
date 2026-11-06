# Phase 03 / 04 — Stroke handwriting + teaching board checkpoint

**Implementation status:** delivered to review branch. **Acceptance status:** pending full browser/integration validation. Do not close gate #34 or #44 until reproducible build, type/lint checks and interactive QA pass.

## Implemented modules

| Canonical issue | Description | Implementation |
|---|---|---|
| #23 #24 #25 | Original em-normalized vector glyph paths; uppercase, lowercase, digits, maths punctuation, no font tracing or license ambiguity | `packages/stroke-engine/src/glyphs.ts` |
| #26 #27 #31 | Stroke scheduling, arc-length animation, pen lift, word spacing, wrapping, speed control | `packages/stroke-engine/src/layout.ts` |
| #28 #32 | Pressure-sensitive pen segments, deterministic chalk/ink and explicit unsupported-char notice, source crop fallback | `packages/stroke-engine/src/render.ts`, `apps/web/src/board/BoardControls.tsx` |
| #33 #34 | Deterministic timeline tests and handwriting fixtures | `packages/stroke-engine/src/handwriting.test.ts`, `tests/phase34.acceptance.test.ts` |
| #35 #36 #37 | Board-only 1920×1080 canvas, page/pen/eraser toolbar, pointer/mouse/stylus/touch input | `apps/web/src/board/BoardCanvas.tsx`, `BoardControls.tsx` |
| #38 #39 #40 | Segment eraser, event-log undo/redo/clear, multiple pages, stroke width/colour, 3 board themes | `packages/lesson-format/src/replay.ts`, `BoardControls.tsx` |
| #41 #42 #43 #44 | Selection insertion, original crop rendering, place/move/remove, persistent board actions and keyboard shortcuts | `apps/web/src/board/useBoardStudio.ts` plus tests |

## Important contracts

- PDF source selections, unmodified text, PDF coordinate bboxes and crop asset identities persist separately in IndexedDB. The board **never rewrites** the PDF text. Unsupported glyphs stop handwritten placement; teacher can use original exact source crop.
- Every manual board change is a time-stamped, schema-validated action. Replay is a pure reduction; undo/redo actions modify visibility of earlier user changes without deleting history. Stroke animation starts from the event timestamp and progresses over its recorded duration.
- Board surface is standalone 1920×1080 so subsequent media capture can exclude the PDF sidebar and editor controls. No microphone, screen capture or MP4 recording in Phases 03/04.
- The drawing canvas supports mouse, pen/stylus pressure and touch events, scaled into logical board coordinates. Original crop image assets are loaded only locally.
- Crops render on the canvas as bitmaps, not HTML overlays, to support future board-only recording.

## Local checks

Run from repository root on Node >=22.22.2:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev
```

Then verify Chrome/Chromium on desktop and touch: select a normal PDF line → **Write text by hand** → watch letter-by-letter pen paths; slow/speed up, pause/replay; select a formula with unknown glyphs → verify refusal and **Place original crop**; pen-draw and erase with touch and mouse; undo/redo the last pen and eraser strokes; add pages and navigate; move/crop content; reload and verify persisted board/crop; change board themes; use keyboard. Compare long (>10-minute) replay, mixed PDF rotations and multi-column text source fidelity. Confirm the 1920×1080 board is the only compositing surface.

## Unverified limitations / release blockers

- The current build runtime has Node 22.16.0, below project engine >=22.22.2; npm registry is not resolvable. `node_modules` is incomplete, so full npm Vitest/build/lint/React-browser QA cannot be claimed green here.
- The 102 original vector glyphs cover a deliberate core Latin/numeric character set, not full Unicode, accented letters, or every mathematical operator. No OCR or AI font imitation. Use exact crop for unsupported characters.
- Paragraph/multicolumn selection fidelity and virtual scrolling of mixed page sizes retain Phase 02 limitations.
- Freehand erasure is whole-stroke hit testing. No segmented freehand eraser/pressure smoothing beyond supplied pointer samples.
- Content placement currently uses vertical defaults with arrow-button reposition, not a general drag/resize canvas editor; long handwriting can exceed visible page height. Final browser overflow, device-scale, performance and accessibility audits still required.
- The application is manual only; neither AI narration nor recording/export is implemented.

**Gate conditions:** review + actual browser evidence, full build/test green, reloaded IndexedDB data, deterministic seek/undo replay, original PDF source fidelity. Keep issues #34 and #44 open until verified. Phase 05 should not be released based solely on this implementation.
