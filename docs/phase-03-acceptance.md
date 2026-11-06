# Phase 03 — genuine handwriting stroke engine

**Implementation code:** delivered. **Full visual/browser acceptance:** pending independent verification; keep canonical issue #34 open until tests/build and Chrome interaction review pass. Owner has requested progressing Phase 04 in parallel; this is not evidence that Phase 03's final gate passed.

## Implemented

- 102 original hand-plotted em-normalized vector glyphs: 26 uppercase Latin, 26 lowercase, 10 digits, common punctuation and mathematics operators. Independent stroke paths with pen lifts; source data in `packages/stroke-engine/src/glyphs.ts` is original to this project and no external font binaries were copied.
- Automatic word spacing, line wrapping, line height, configurable stroke width/colour and handwriting speed; chronological stroke timing, pen lift pauses and word pauses in `layout.ts`.
- Arc-length interpolation to draw paths progressively rather than exposing complete glyphs at once, deterministic playback (`startMs`/`durationMs`).
- Canvas ink and chalk strokes with pressure-aware width (`render.ts`).
- Explicit unsupported Unicode detection. Such text is **not** silently omitted; the board integration refuses incomplete handwriting and provides exact original PDF crop fallback.
- Original Phase 01 interfaces remain compatible through `OriginalGlyphProvider` and `HandwritingStrokeEngine` exports.

## Source and verification

- `packages/stroke-engine/src/handwriting.test.ts` covers alphabet/numerals/symbols, wrapping, unknown characters, deterministic timelines, partial path interpolation and pace.
- Separate standalone Node smoke check executed with TypeScript transpilation: 102 glyphs validated, stroke scheduling and partial rendering assertions passed. This does **not** replace project Vitest/typecheck or visual browser tests.
- Local environment lacks full npm dependencies and is Node 22.16.0, below required >=22.22.2. Registry DNS unavailable. Full check not run here.

## Gate requirements

Run `npm ci && npm run check` on Node >=22.22.2, inspect actual animated words and mathematical expressions in Chrome, verify smooth 0.25x–4x speed, line spacing, visual texture and unsupported glyph fallback, screen-record before closing #34. No external AI or prerecorded glyph animation assets are used.
