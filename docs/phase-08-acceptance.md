# Phase 08 — video export and processing (implementation checkpoint)

Status: **implementation submitted as stacked draft, acceptance gate #84 OPEN**.

## What is implemented

1. `@edushare/export-core` constructs a deterministic ordered trim/speed export plan, validates source duration, and provides provenance metadata with immutable source-PDF SHA-256 identifiers.
2. In-browser export: reads saved local MediaRecorder clips, replays them in edited order at selected playback rate, draws board-only video on a 1920×1080 canvas at 30 fps, routes audio through Web Audio, and records a single browser-supported container. Optional teacher-supplied branding is drawn on the board. Progress, cancel, retry and video+manifest downloads are available. No auto upload.
3. Private/offline native FFmpeg worker: `python scripts/export_mp4.py --manifest lesson-export-manifest.json --media-dir recorded-segments/ --output lesson.mp4`. Source files must be downloaded from the app and named with original `segmentId.webm` or `.mp4` in the media directory. The script validates manifest, paths, input A/V streams, clip trims and duration; transcodes to uniform H.264/AAC 1920x1080 30 fps; concatenates, verifies codecs, resolution and total duration before committing the output. It does not use network, shell evaluation or production credentials.
4. Metadata sidecar records clip order/rates/trims, format, source PDF hashes, and resolution. Sources are never modified.

## Tests and independent evidence

- `tsc -b packages/export-core` passed with globally installed TypeScript; package-local Vitest tests are supplied.
- `python -m pytest -q tests/python/test_export_mp4.py`: 6 passed.
- Offline FFmpeg end-to-end smoke test with generated colour video+tone audio passed: output MP4 probed at 1920x1080, H.264 + AAC stereo, 1.1213 seconds for a requested 1.1 second trim. This **is not** a lesson-wide lip-sync/A-V drift certification.
- TS/TSX transpile/syntax checked. Full npm install, browser export, multiple-clip A/V drift, background-tab timer throttling and device compatibility remain unverified because the npm registry is unavailable here and Node 22.16.0 is below >=22.22.2.

## Known restrictions

- Browser export runs in real time while the tab is open/foreground; 15-minute limit; output typically WebM. It cannot promise MP4 unless the browser advertises it. A local native worker generates verified MP4 manually after the user downloads source segments.
- Browser renderer has small potential silence/freeze gaps during clips switching and uses MediaRecorder clock rather than an offline deterministic timeline. Browser 30-minute soak and drift bounds remain unverified.
- No server-side background queue, cloud upload, auto MP4 conversion in web UI, or 1080p performance guarantee on low-end hardware. Long lessons use the optional local worker.
- Current upstream Phase 06 #64, Phase 07 #74 and earlier gates remain open, so final Phase 08 acceptance must not be marked complete.

## Required completion gate

On supported Node >=22.22.2: `npm ci && npm run check`; verify browser clip stitching with 3+ different lengths and rates, reordering, original audio sync, pauses and crash recovery, file metadata correctness, consent, branding opt-in, audio levels and >30-minute quality. Test native FFmpeg two-clip concatenation, different source codec/container options, multi-minute A/V drift and memory constraints. Keep issue #84 open until evidence is recorded.
