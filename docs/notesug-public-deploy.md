# NotesUG public EduShareClass deployment

EduShareClass runs as a **publicly readable, browser-local teaching studio** at
`https://notesug.com/edushareclass/`. This is a pre-release web deployment,
not an approved production cloud backend.

## Front-end build

On Ubuntu with Node.js >=22.22.2:

```bash
npm ci --ignore-scripts
VITE_BASE_PATH=/edushareclass/ npm run typecheck
VITE_BASE_PATH=/edushareclass/ npm run test
VITE_BASE_PATH=/edushareclass/ npm run build
```

The Vite base must match the nested NotesUG path, and React Router uses that
base as its browser basename. Do not expose the Vite development server
directly.

## Serving and rollback

Publish only `apps/web/dist` to an immutable static release folder and
atomically switch the NotesUG `edushareclass` static-file symlink. Preserve
the previous release for immediate rollback. The Nginx location serves
`/edushareclass/`, falling back to `index.html` for lesson routes.

This public route does not use HTTP Basic authentication. It accepts only
GET/HEAD, keeps a restrictive CSP and permits microphone access solely for
the current origin. It is intentionally `noindex` until release acceptance.

Do not change `/`, `/api/`, `/_next/`, existing admin or other NotesUG
routes. Test all of them after any Nginx change. Maintain configuration
backups before edits and use `nginx -t` before reload.

## Data and safety

- PDFs, PNG crops, board actions, teacher-entered notes, and recordings are
  saved in the teacher's **own browser IndexedDB** by default.
- They are **not** public assets and do not automatically upload.
- Clearing browser data may delete lessons. A public static website is not
  a cross-device account or backup service.
- Cloud sign-in, server-side file upload and publication are optional,
  separately controlled features; none are enabled by this static deploy.
- A local board PNG download is a single frame, not a finished video.
- Maintain the Phase 02–09 open QA gates for long recordings, browser
  compatibility, export accuracy, security, and production PostgreSQL.

## Teacher improvements (2026-11-06)

- Name a lesson during creation; update its title from Controls.
- Write up to 300 characters of **teacher-authored** text as animated
  handwriting without a PDF. Unsupported symbols produce errors; original
  PDF selections remain immutable and separately attributed.
- Save the visible board frame as a 1920×1080 PNG.

QA evidence on the connected Ubuntu server: project typecheck and production
build pass; 90 unit/integration assertions pass; Chrome successfully created
and renamed a lesson, saved handwritten teacher notes without PDF sources,
and generated a nonempty 1920×1080 PNG. These checks are not a substitute
for end-to-end real teacher video recording and cloud acceptance.
