# Phase 04 — interactive manual teaching board

**Implementation code:** delivered. **Final gate:** open pending full browser validation (#44), and Phase 02/03 acceptance remains unverified.

## Implemented

- Board-only 1920 × 1080 canvas; image crops drawn directly into canvas, never mixed into recorded sidebar/content.
- Teacher pen, eraser (whole-stroke hit testing), chalk/ink styling, pen width/colour, green/black/white board themes.
- Multi-page board with previous/next/new navigation, page-specific clear, undo/redo and event-sourced deterministic replay.
- Mouse, pen/stylus pressure and touch input; pointer coordinates mapped from responsive CSS display to stable logical board coordinates.
- PDF selection-to-board insertion as animated handwriting when all characters are supported; original source crop insertion for diagrams, scanned pages and unsupported characters, preserving source fidelity.
- Original image crops keep their source aspect ratio, show explicit missing-image placeholder, and persist alongside the PDF in local IndexedDB.
- Content repositioning via accessible directional controls; keyboard N (new page), Space (pause/resume), Ctrl+Z and Ctrl+Shift+Z.
- Board action schema extended without changing the v1 lesson format version: `ink.draw`, `ink.erase`, `content.move`, `content.remove`, `board.theme.set`, `history.undo`, `history.redo`.

## Verification

`tests/phase34.acceptance.test.ts` covers drawing/erasing, redo/undo, clear/page separation, source-crop placement, saved timestamps and deterministic replay. Separate Node smoke-check on the pure reducer passed. Full Vitest, browser, lint, screenshot and performance evidence **not** obtained due unavailable npm registry and required Node version. Do not claim acceptance green.

## Gate checks to run on suitable machine

```bash
node --version # >=22.22.2
npm ci
npm run check
npm run dev
```

Test in desktop Chrome and a touch/stylus browser: PDF select line → write by hand; pause/resume/replay strokes; add pages, navigate/clear/undo/redo, save/reload IndexedDB, move and crop, verify pen colours on all three themes, verify no canvas touch scroll conflict. Test large lessons and text cropped off-board, check page-specific undo and exact PDF source identity. Review screenshots/short clips before closing #44 or releasing Phase 05.

### Limits

No microphone/video capture, segment editing or exports in these phases. Scanned image OCR is not implemented. Eraser removes whole strokes, not arbitrary stroke segments; general drag/resize of board content is not yet implemented. The glyph library is partial Unicode, and long text must be split across pages manually. PDF Phase 02's multi-column/mixed-size limitations continue to apply.
