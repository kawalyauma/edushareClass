# AGENTS.md — EduShareClass autonomous engineering protocol

## Mission and fixed scope
Build a browser-first **manual** PDF-to-handwriting teaching studio. Teacher selects PDF text/formulas/figures, controls an authentic stroke-by-stroke board animation, explains with their own microphone, and records/exports video. No AI narration, voice cloning, automated lessons, or source rewriting in v1. Support Ubuntu/Windows desktop Chrome/Chromium first; progressive support for other browsers/tablets.

## Mandatory startup procedure — DO NOT ASK THE OWNER FOR AN ISSUE NUMBER
1. Read this document, README, and current repository source.
2. Read the current open GitHub issues, labels, blockers and active phase. **Discover issues autonomously**. Never accept an issue number from a user as necessary to begin.
3. Determine eligible phase/workstream using the dependency DAG below and verified acceptance gates. Never infer readiness solely from numeric phase order or open issue count.
4. Filter eligible issues: title prefix `[PNN-XX]` (or `phase:NN` label if labels have been provisioned), open state, no unresolved `blocked-by` links, no existing verified claim, no in-flight PR covering the same work. The title prefix is authoritative until labels are installed. Prefer highest-priority and smallest independent module.
5. Claim one issue using the coordination protocol below. Agents may work on only one active issue at a time.
6. Study acceptance criteria and adjacent contracts, implement in an isolated branch/worktree, test, open PR, and link evidence.
7. After PR merge, mark complete, release claim, find another eligible issue. If none are eligible, report specific blockers, do not invent tasks.

## Claim protocol (race and multi-provider safe)
GitHub comments/labels are **not atomic locks**. Do NOT rely on "first comment wins" or a check-then-label sequence. For credible parallel agents, use a dedicated `coordination/claims.json` file on a protected coordination branch, updated via GitHub Git Data API with compare-and-swap (`expected_sha`) or an equivalent central transactional claim service. The claim service must serialize conflicts and return **success or failure**; never assume a claim based on a comment.
- Claim record: `issue_number`, `agent_id`, `provider`, `claimed_at`, `expires_at`, `heartbeat_at`, `branch`, `status`.
- Before coding, obtain a successful exclusive claim, re-read authoritative state, then comment `CLAIMED by <agent-id>; branch <branch>; heartbeat <UTC>`; set `status:claimed` if permitted.
- Lease TTL 30 minutes; heartbeat every 5 minutes while active; expiration alone does not authorize stealing without confirming claim state and checking active PRs/branches. A recovered agent may renew its own lease; another agent may acquire only through an atomic transition.
- If transactional coordination infrastructure is not yet available, **do not run 10 agents concurrently**. Run a single dispatcher temporarily to reserve distinct issues and record claims; agents still autonomously choose from offered eligible work after dispatcher approval.
- GitHub issue assignees may remain empty because CLI agent identities often are not GitHub users. The authoritative claim is the lease record, not assignee names.

## Dependency-aware phase scheduling (mandatory)
Each phase has up to 10 independent workstreams; 10 is a concurrency ceiling, not a mandatory number of active agents. Never start implementation merely because an issue is open.

**Bootstrap gate (Phase 1):** Complete claim coordinator #9, shared contracts #1/#3, app scaffold #2, and build/test baseline #8 before any uncontrolled parallel agent execution. A single dispatcher may allocate non-overlapping issues until exclusive claim leases are verified. Finish Phase 1 integration gate #10 before downstream implementation is released.

**Dependency DAG and release gates:**
- Phase 01: foundation. Gate: contracts, claim service, app shell, local project persistence, automated/local checks integrated.
- Phase 02: PDF reader. Requires Phase 01 gate. May run alongside Phase 03; its contract must provide stable source IDs, page coordinates, text/crop selection representation, and fidelity fixtures.
- Phase 03: stroke handwriting engine. Requires Phase 01 gate and the shared lesson/board contracts. May run alongside Phase 02, independently of PDF UI.
- Phase 04: interactive board. Requires PDF selection-to-board interface from Phase 02 and stroke renderer/scheduler contracts from Phase 03; full integration gate requires complete Phase 02 and 03 acceptance.
- Phase 05: mathematics and diagrams. Requires Phase 04 board composition, source crop fallback, and stroke glyph/layout interfaces.
- Phase 06: voice/video recording. May begin after Phase 04 has a stable board-only compositing surface and event clock; need not wait for all Phase 05 maths, but final recorded-lesson gate must verify math content and image crops.
- Phase 07: editing. Requires Phase 06 segment schema, persistent chunks, deterministic board action replay, and recovery contracts.
- Phase 08: export. Requires Phase 06 capture and segment metadata. Can run alongside Phase 07; integration/concatenation tasks wait for final Phase 07 segment editing contract.
- Phase 09: cloud persistence. Auth/storage schema design may start after Phase 01 contracts; cloud media integration requires Phase 06/08 media artefact contracts. Do not mandate cloud access for manual local recording.
- Phase 10: release. Requires all mandatory gates of Phases 01–09; security/accessibility/performance tests can begin earlier but no production release until final sign-off.

**Agent eligibility rules:** determine readiness from *task-level* dependencies, not lowest phase alone. A phase label is not proof of readiness. A work item with an unmet dependency must be marked blocked and not claimed. If both Phase 02 and Phase 03 are eligible, agents may choose from either; maintain a maximum 10 active agents across the approved wave unless the owner explicitly changes concurrency. Shared contracts may have additional critical-path dependencies. Never let parallel agents independently edit the same contracts.

**Gate evidence:** a phase gate requires merged PRs, green build/typecheck/tests, source-fidelity checks where applicable, media proof where applicable, and a written acceptance checkpoint. Owner approval is required where labelled `requires-owner-review`. No phase unlock from issue creation alone.

**Current launch policy (2026-11-06):** The owner directed Phase 01 merge and Phase 02 implementation. Code for these two phases is available, but full browser/CI-free local acceptance and live agent race tests remain pending. Do not authorise Phase 03 or later, production release, or ten-way concurrent agent dispatch until a verified checkpoint and authoritative claim-coordinator integration exist. See `docs/phase-02-acceptance.md`.

## Branch and PR process
- Branch: `agent/<agent-id>/pNN-<short-task>`; no shared working directory and no direct push to main.
- Link a single issue using `Closes #N` in PR. Describe changed files, tests, screenshots/recordings as relevant, compatibility, and known limits.
- Do not force-push shared branches, overwrite another agent's changes, rebase/merge unreviewed PRs, or silently change contracts. Require review for modifications to shared interfaces.
- Limit file ownership to the paths named in the issue. Coordinate unavoidable overlaps through a separate interface proposal.
- Green tests and review required before merge; release claims only on merge or explicit abandonment.

## Standard issue contract
Each issue must provide: objective, deliverables/path ownership, acceptance criteria, tests/evidence, dependencies, and a `[PNN-XX]` title prefix; phase labels are optional. If dependencies are missing, mark blocked and stop. Design contracts and fixtures before parallel implementation.

## Shared technical decisions
- Monorepo: `apps/web`, `apps/api`, `packages/stroke-engine`, `packages/lesson-format`, `packages/shared-types`, `tests`, `infrastructure`, `docs`.
- React + TypeScript + Vite, PDF.js, Canvas 2D/SVG, stroke-path glyph library, Web Audio + MediaRecorder, IndexedDB, FastAPI optional, PostgreSQL + S3-compatible storage when cloud-enabled, server FFmpeg for MP4.
- Use event-sourced board actions and timestamped recording segments in a canonical lesson format. Keep PDF coordinates and source identifiers for traceability.
- V1 manual teacher controls; no AI/TTS or model dependencies.
- Keep educational material accurate, verify selection/extraction; never invent math steps or rewrite PDF text without review. Preserve source crop as fallback.
- Recording output must show teaching board only; no PDF sidebar or controls. Save segment media chunks progressively to recover from tab crashes.
- Ensure accessibility (keyboard controls, contrast, labels), privacy/permissions, secure file handling, browser feature detection, and performance budgets.

## Definition of done
Implementation + tests + docs + screenshots or sample clips where visual/audio work exists + no broken lint/types + successful PR integration + claim released. For media paths verify audio sync, export compatibility and long-session recovery. For math paths verify glyph coverage and fractions/indices layout. If incomplete, leave issue open with explicit evidence.

## Safety and finances
No production deploy, paid resources, cloud billing changes, sensitive upload, secret access or destructive action without explicit owner approval. Never commit credentials, source textbooks lacking rights, or personal voice recordings. Avoid CI that incurs unexpected cost: locally runnable QA required; GitHub Actions opt-in only.

## Phase gates
1. Foundation: contracts, monorepo, claim coordination, build/tests, layout.
2. PDF: selectable text and crop preview, exact source mapping and scanned fallback.
3. Handwriting: actual animated pen strokes, fallback metrics, speed/spacing tests.
4. Board: controls, persistent pages, deterministic action replay.
5. Math: well-laid fractions/exponents/equations and diagram crop/drawing.
6. Recording: permission, stable voice+board sync, persistent chunks and recovery.
7. Editing: segment re-record and deterministic timeline preview.
8. Export: correctly synced, downloadable 1080p MP4 with failure recovery.
9. Cloud: authenticated projects, private files, quotas and optional sync.
10. Release: security, accessibility, multi-browser, long-form recording, onboarding and deployment verification.
