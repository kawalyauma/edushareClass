# Photo-reference classroom chalkboard (first live implementation)

**Design reference:** the owner-supplied NotesUG.com Social Studies classroom
chalkboard photograph. The reference is visual only. The rendering is an original
programmatic 1920 × 1080 canvas, not a copied image or a rasterised PDF overlay.

## Teacher workflow

1. Open `https://notesug.com/edushareclass/`, then create a lesson.
2. Open **Source PDF**, upload a text-bearing PDF, and select
   **Drag over a complete PDF section**.
3. Drag around adjacent lines of questions, explanations and answers. The
   app stores the exact source text, page/rectangle, SHA-256 source identity,
   ordered PDF glyph chunks and an original PNG crop. Original source bytes are
   never changed by board formatting.
4. Inspect the **Selection preview**. Teacher corrections are stored
   separately from the original extraction.
5. Under **Controls → PDF section → classroom chalkboard**, choose
   **1, 2 or 3 columns**, then select **Write selected PDF section as chalk notes**.
   The app creates a dedicated board (and further boards as required), using
   original stroke paths with a tall, narrow classroom writing style. Questions
   are white and answer labels are yellow.
6. The handwriting animates in stroke order; **Show completed** reveals the
   finished board immediately. Record the board using the existing manual
   teacher-microphone workflow, or download a PNG of the board.

## Quality and provenance rules

- **No OCR, rewriting or answer generation** in this version. Detected text is
  copied from the PDF text layer, retaining line order. The first line is
  omitted from *body* notes only when it exactly matches the lesson title,
  which is already displayed in the board header.
- The letter style is an original stroke font with small deterministic changes
  in character lean, spacing and chalk pressure. Curves and dusty edges are
  rendered on the canvas itself, so they are included in recorded videos.
- A dragged scanned region with no extractable text is explicitly rejected
  and must be inserted using its unchanged original image crop.
- Unsupported mathematical/Unicode characters **cause a visible error** instead
  of being silently replaced. Use an original source crop where exact math
  layout cannot be represented.
- Long text **wraps at word boundaries**. Auto-pagination and question-answer
  grouping preserve reading order. No cramped scaling is allowed.
- One section is bounded at **1,600 characters and 90 source lines**, with a
  maximum of eight generated boards; larger sections should be selected in
  smaller pieces. Selection is page-local, not across PDF pages.
- Existing freehand drawing, white/black/green theme, teacher-entered notes,
  earlier lessons, recording and local storage remain supported.
- An illustrated chalkboard is always local to the teacher's browser; enabling
  public static website access does **not** publish teachers' PDFs or videos.

## Operational and acceptance evidence

The built application is served as immutable static assets at
`/edushareclass/` under the existing NotesUG HTTPS Nginx location. A versioned
release-directory symlink permits an immediate rollback without changing any
NotesUG Next.js or API route. Only public static assets are deployed; the
optional cloud API is not enabled by this release.

QA done on connected Ubuntu server:
- TypeScript `npm run typecheck`, `npm run test` and production build using
  `VITE_BASE_PATH=/edushareclass/`.
- Real Chrome local staging test: uploaded a 14-line Social Studies PDF,
  selected all lines with a drag, verified captured source text and PNG,
  created a 3-column board with hundreds of timestamped handwriting strokes,
  read stored IndexedDB lesson data, then exported the board as a 1920×1080 PNG.
- Visual inspection fixed brand header wrapping, uneven question distribution
  and excessive chalk smudges.

**Not yet accepted:** real 30–60-minute microphone A/V synchronisation,
production recording/export reliability, cloud security and school-scale
usage. Keep corresponding original phase QA gates open.
