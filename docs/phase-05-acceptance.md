# Phase 05 — Mathematics & diagrams (implementation checkpoint, 2026-11-06)

**Status: Implementation started; full Phase 05 acceptance NOT achieved.** This feature does not infer or correct mathematical content from PDF source. The original source crop and SHA-256 provenance remain authoritative.

## Delivered

- `packages/math-notation`: exact, deliberately narrow mathematical syntax parser with a typed AST, deterministic Canvas drawing layout, proportionally scaled numerator/denominator, radicals, super/subscripts, and explicit error diagnostics. Commands permitted: `\frac`, `\sqrt`, `\times`, `\div`, `\cdot`, `\leq`, `\geq`, `\pi`. No TeX engine, code evaluation or arbitrary macros.
- In teacher controls, **Typeset exact maths** is enabled only when the selected source text or explicitly teacher-corrected display text can be parsed without ambiguity. The existing **Place original crop** always remains available for complex formulas, missing glyphs, images or scans. Raw PDF text and crop are never overwritten.
- Pure geometry prototype: label-placement collision checks (reports failed labels rather than hiding them), independent Venn-circle model and polyline helpers. Diagram authoring UI and pixel-perfect diagram correctness are NOT yet delivered.
- Unit tests cover source preservation, malformed fractions/scripts, unsupported TeX, basic layout and label collisions.

## Known limitations / remaining work

1. PDF text extraction is not TeX. Many originals will require the **unchanged source crop**. The parser intentionally rejects unrecognised Unicode, arrays, complex units and ambiguous symbols.
2. Algebraic working lines, reveal controls, teacher-authored geometric shapes, detailed Venn shading, accurate figure labels and crop overlay/tracing need further implementation and visual comparison.
3. Browser font metrics vary; deterministic advance metadata does not guarantee every browser glyph will fit. Compare rendered output with the PDF before accepting a typeset source.
4. No acceptance signoff until a clean install, `npm run check`, real Chrome screenshots, rotated/cropped mixed PDF examples, fractions/indices, and maths correctness review.

## Manual verification

In a local Chromium browser, create a lesson, select text from a PDF, and use **Typeset exact maths** for an explicit `\frac{12}{5}+x^{2}` string. Check the fraction line and raised index, undo/redo, persistent reload, and board-only view. Choose an unsupported source (e.g. mathematical Unicode fraction slash) and verify **Typeset exact maths** disables while **Place original crop** is available. Verify that source text, SHA-256 identity and crop bytes remain unchanged.
