# Phase 02 — PDF reader and selection checkpoint

**Status:** implementation delivered for review; **runtime/browser acceptance remains pending** until dependencies and real browsers can be used. Do not interpret a merged PR or closed issue as proof that the browser gate passed.

## Phase 2 deliverables mapped to the canonical original issues

| Issue | Workstream | Implementation |
|---|---|---|
| #11 P02-01 | PDF.js worker and document loading | Dynamic bundled `pdfjs-dist@6.4.299`, worker URL, SHA-256 source identity, file signature and 50 MiB limit, password prompt, loading/error states |
| #12 P02-02 | Page navigation / virtualised scrolling | Previous/next, page number, page-window rendering (max five pages) |
| #13 P02-03 | Zoom, rotation, viewport mapping | Scale 50–300%, 90° rotation, PDF.js inverse viewport transforms |
| #14 P02-04 | Text-layer selection and copy | Keyboard/mouse line targets, extracted text preview, clipboard copy |
| #15 P02-05 | Line/paragraph grouping | Geometrical grouping and conservative whitespace reconstruction; **paragraph grouping is not automatically inferred** |
| #16 P02-06 | Selection preview/correction | Unmodified extracted text plus original crop, separate explicit teacher correction |
| #17 P02-07 | Image and diagram crops | Pointer rectangle, hi-DPI canvas crop persisted in IndexedDB |
| #18 P02-08 | Math safeguards | Missing glyph, maths and skewed/RTL warnings, original source crop available |
| #19 P02-09 | Scanned-PDF fallback | Detect no-text and limited-text pages, use exact manual crop; **no OCR inference** |
| #20 P02-10 | Source mapping test gate | Rotation/zoom geometry assertions, text grouping and datastore tests, schema fixtures |

## Source fidelity contract

- Original PDF stored locally by SHA-256, tied to lesson source ID; no source PDF uploaded to a service.
- Each selection has original source ID, 1-based page, PDF user-space rectangle, kind and original PNG crop.
- A text line preserves *raw source fragments* (`sourceChunks`) separately from geometrically reconstructed displayed text; corrections are explicitly stored in `displayText`, never overwriting `text` or source fragments.
- Crop regions are mapped back through the **PDF.js viewport inverse**, not a homemade rotation approximation.
- Mathematical extraction is **flagged as uncertain** and always accompanied by a crop; not automatically typeset or corrected.
- Scanned pages have no fabricated text and require teacher crop selection.

## Validation evidence and remaining gates

Executed in this environment:
- Global TypeScript compiler parse/transpile pass for new TS/TSX files: no syntax errors.
- Sixteen independent Node assertions for coordinate mapping over 0/90/180/270 degrees and zoom factors 0.5, 1, 2.5; text grouping; formula warnings; scan detection; bitmap crop limits: pass.
- JSON manifests and local import-path checks: pass.

**Not executed:** `npm ci`, project `npm run check`, `vitest`, browser PDF rendering or upload/reopen test, and screenshot/visual QA. This runtime cannot resolve the npm registry, and has Node 22.16.0 whereas the monorepo requires >=22.22.2. Do not claim green build or full acceptance. Run on a suitable development machine before declaring the Phase 02 technical gate complete.

### Local verification

```bash
node --version            # must be >=22.22.2
npm ci
npm run check
npm run dev
```

In Chrome, upload a multi-page selectable PDF and a scanned PDF; scroll deep into each, zoom/rotate, select a text line, compare crop and text, deliberately correct a formula, reload and verify selection/crop persistence. Test a password-protected PDF, a corrupt file and an oversized file. Check that no network request carries PDF contents.

## Known limitations / follow-up

- Line ordering and inferred whitespace can differ on multi-column, irregular text or rotated source glyphs; raw chunks and crop remain authoritative. Only simple horizontal line grouping is implemented; no automatic paragraph reconstruction.
- Fixed-height virtual page slots use first-page dimensions; mixed-size pages may leave gaps/overlap and require measurement/offset improvements.
- Phase 02 selection is **not yet written onto the teaching board**. Handwriting stroke playback and board interaction belong to later phases; this branch does not implement those.
- Original image crop is displayed in preview, but optical character recognition is not implemented.
- Browser resource/persistence quota limitations apply to large PDFs and PNG crops.
- A second TypeScript claim-coordinator prototype exists in infrastructure, but the canonical process is the reviewed Node script in `scripts/agent-claim.cjs`. Do not run both as separate authorities.
