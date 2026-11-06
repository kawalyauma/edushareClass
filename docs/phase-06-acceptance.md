# Phase 06 — Voice + board-only recording (implementation checkpoint, 2026-11-06)

**Status: implementation started; real microphone/video/browser acceptance is NOT verified.** No production deployment or background recording is enabled. The teacher explicitly presses **Start recording** before any microphone permission request.

## Delivered

- Supported MIME feature detection (`MediaRecorder.isTypeSupported`); WebM VP8/VP9+Opus preferred, MP4 only when the browser itself confirms support. **Not a general MP4 export implementation.**
- Explicit microphone picker, browser permission request, audio analyser meter without a speaker-monitor feedback path, mute/unmute, pause, resume, stop and locally downloaded browser-format video.
- Captures **only** the `BoardCanvas` element using `HTMLCanvasElement.captureStream(30)` and combines its video track with teacher microphone audio via Web Audio. No camera, PDF sidebar, controls or external TTS track is captured.
- Progressive one-second `MediaRecorder` slices persisted as original `Blob`s in the IndexedDB `mediaChunks` store. Records include lesson and segment IDs, sequence and elapsed clock marker. Segment references are persisted to the lesson and can be reopened after browser interruption. Lesson deletion also erases associated media chunks.
- Pure monotonic `SessionClock` with pause adjustment and a board-action clock adapter. Saved segment metadata contains start/end lesson timestamps and persisted chunk IDs. This is **not yet proof** of audio-video sync or final MP4 compatibility.

## Browser acceptance (still required)

1. Install dependencies and run `npm run check` with **Node.js >=22.22.2**. This environment has Node 22.16.0 and cannot complete an npm registry install.
2. In Chrome/Chromium over HTTPS or `localhost`, allow microphone on user gesture. Test input picker and revoking permission; verify muted recordings have no teacher audio and unmuted ones do. Test AudioContext suspend/resume and no feedback.
3. Record board handwriting for 3 minutes with a spoken counting sequence and check **no sidebar/controls** appear in the video. Inspect actual playback, audio continuity and A/V offset. Re-test a 30-minute session and tab visibility changes.
4. Pause/resume, stop, and download the browser-format file. Validate playback in multiple players (Firefox/Safari may support different codecs). Do NOT label it MP4 unless the browser truly emitted MP4.
5. Interrupt a recording by force-reloading the tab after multiple saved chunks; reopen the lesson and recover chunks. Confirm partial/truncated final chunks are clearly reported.
6. Fill IndexedDB quota / block storage to confirm a save warning is surfaced and recording is not falsely reported as complete.
7. Delete a lesson and independently check that its private media chunks are removed from IndexedDB.

## Known limitations

- Browser pause/resume and canvas capture timestamps are browser-dependent; the board event clock is monotonic but A/V lip-sync offset/under-load drift is not independently measured. Final synchronisation gate remains open.
- Recorded media chunks may be lost if the browser or OS kills the page before a `dataavailable` flush; recovery can never guarantee final seconds.
- This phase does not create final 1080p H.264 MP4, server FFmpeg pipelines, re-recordable edit segments, or automatic cloud upload. Those belong to later phases.
- Camera permission is never requested. The teacher's voice remains on-device until they themselves download/share the file.
