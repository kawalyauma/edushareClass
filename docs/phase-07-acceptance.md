# Phase 07 — lesson timeline and editing

Status: **implementation submitted for review, acceptance OPEN**.

## Implemented

- Non-destructive `timeline` data model: source segment IDs, per-clip trim range, playback rate, ordering and tombstones for removed clips; original MediaRecorder chunks and PDF/board events are not mutated.
- Pure deterministic mapping from edited playhead to original segment time and board replay time. A recording created after saved timeline edits is appended rather than silently omitted.
- Editor in lesson workspace: selectable saved clips, trim, reorder, preview rate, seek/scrub, board snapshot seek, removal/restoration, persistent undo/redo, original local browser video preview.
- Manual re-record route: seek to original board snapshot, begin a new recording, then explicitly replace the old clip with that completed recording. Old media remains in local IndexedDB unless the user deliberately deletes the entire lesson.
- Form errors and damaged/missing local recording are reported visibly.

## Validation and limitations

`tsc -p packages/timeline-editor/tsconfig.json` passed; core deterministic editor unit tests are included. Full monorepo `npm ci && npm run check` and browser playback/scrub tests cannot be independently confirmed in this runtime (npm registry unavailable and Node 22.16.0 below project >=22.22.2). There is no claim of a real-time waveform; a seekable scrubber is presented instead. Re-recording requires manual replacement rather than automated destructive splicing. Preview playback speed does not transcode files: this is Phase 08's job. Media blob playback depends on source browser codec support.

### Required gate

Run `npm ci && npm run check` with Node >=22.22.2; verify 3-segment lesson edits, trim boundary and playback-rate accuracy, no missing audio, seek/scrub board fidelity, reload and undo/redo history, re-record replacement, interrupted media recovery, disabled-state behaviour, and that source blobs and PDFs are never overwritten. Keep #74 open until this evidence exists.
