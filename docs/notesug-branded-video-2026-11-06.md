# NotesUG branded lesson videos — release note and QA

This release extends EduShareClass on `https://notesug.com/edushareclass/`
without rebuilding the existing PDF selection, chalkboard and local recording
workflow.

## Teacher workflow

1. Create a lesson; upload a PDF and drag over a section.
2. Review the draft boards, choose a layout, approve, and record your real
   teacher voice while independently playing and pausing chalk writing.
3. Stop and save the browser recording locally.
4. Open **Controls → Export lesson video**. By default **NotesUG Academy video
   presentation** is enabled. The teacher may turn it off or add their
   display name and a short lesson caption.
5. Click **Export edited recording**, keep the tab active and then download
   the browser-supported video plus its source/provenance manifest.

## Export presentation

- **Introduction:** 2.5 seconds of an original dark-green cinematic board
  backdrop, hand-framed gold outline, NotesUG/EduShare Academy identity, lesson
  title and optional teacher name.
- **Lesson:** the source 1920×1080 teacher-chalkboard recording with original
  microphone audio. A discreet NotesUG watermark sits on the bottom wooden
  ledge rather than covering teaching text. Short optional caption available.
- **Closing:** 1.9 seconds of the original matching backdrop, NotesUG brand,
  a positive closing message and notesug.com link.
- Intro/outro and watermark are locally rendered vector/canvas graphics. No
  third-party music, stock footage, uploaded user media, cloud transport or
  synthetic teacher voice is included.
- Branding and total *planned* output duration are recorded in the exported
  manifest. The browser codec is probed; output is usually WebM VP9/Opus, **not
  guaranteed MP4**. The separately documented offline FFmpeg exporter is
  available for H.264/AAC conversion.

## Recording duration correctness repair

MediaRecorder-generated WebM can report infinite duration until a seek finds
the true final timestamp. Using capture wall time as if it were recorded
media duration had caused completed clips to try to render past their encoded
end, preventing exported videos from finishing.

The recorder now probes the playable local video blob via HTMLVideoElement,
including the very-large-seek recovery for `Infinity` duration, and stores
the decoded playable duration in the non-destructive clip metadata. The code
falls back to the clock if the browser cannot probe the blob, with a visible
warning. The original local media blob is never modified or uploaded.

## Validation on connected Ubuntu server

- TypeScript project compilation and Vite production build.
- Automated Vitest suites, including branding and media-duration regression.
- Chromium end-to-end: PDF drag selection → draft board review → approval →
  live board/microphone capture → independent chalk pause/resume → complete
  local source recording → branded edited export.
- FFprobe on actual exported WebM found VP9 video at **1920×1080** and
  Opus audio. Intro/lesson/outro sample frames were extracted and visually
  inspected; the branded source retains the original chalkboard footage.
- Output duration is approximately the duration of the edited clip plus
  4.4 seconds of bookends, with browser MediaRecorder timing variation.

## Limits and release safety

- Browser compositor exports in real time and requires the tab to remain
  visible. Seek, codec and media timing must be rechecked on phones, Firefox
  and longer recordings; a ten-minute soak is not accepted yet.
- HTMLVideoElement duration probing is best-effort; if it cannot verify the
  source, the user receives a warning, and actual export may still reject
  incomplete video.
- Saved source PDFs, images, video and voice remain in the teacher's own
  browser unless a separate user-authorised cloud upload is made.
- Production deployment must use the existing NotesUG static route with
  an immutable release directory and rollback symlink; never modify
  unrelated site routes, accounts, passwords or databases.
