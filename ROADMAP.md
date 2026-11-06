# EduShareClass — 10-phase / 100-issue execution roadmap

**Repository:** https://github.com/kawalyauma/edushareClass  
**Mission:** browser-first manual PDF selection → human-style handwriting → live teacher microphone → recorded MP4 lesson.

There are **10 open issues in each phase**, **100 open issues total** as of backlog creation. Task titles use `[P01-01]` through `[P10-10]`. GitHub issue numbers are **not** the task IDs, and no agent should need to ask the owner for an issue number.

| Phase | Name | Exit criterion | Queue |
|---|---|---|---|
| 01 | Foundation and architecture | Typed contracts, workspace, tests and exclusive-claim coordination | [P01 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P01) |
| 02 | PDF reader and selection | Source-faithful text, formula and crop selection | [P02 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P02) |
| 03 | Handwriting stroke engine | Handwriting drawn by actual strokes with fallbacks | [P03 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P03) |
| 04 | Teaching board | Teacher controls, pages and deterministic replay | [P04 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P04) |
| 05 | Mathematics and diagrams | Accurate fraction/math and diagram rendering | [P05 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P05) |
| 06 | Voice and video recording | Board-only video, voice sync, persisted media chunks | [P06 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P06) |
| 07 | Lesson timeline and editing | Re-recordable segments and recoverable timeline | [P07 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P07) |
| 08 | Video export and processing | Correct synced 1080p MP4 and retries | [P08 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P08) |
| 09 | Accounts and storage | Secure projects, private media and optional cloud sync | [P09 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P09) |
| 10 | QA, optimisation and release | 60-min soak, security, accessibility, owner acceptance | [P10 issues](https://github.com/kawalyauma/edushareClass/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+P10) |

## Launch instructions for orchestrator / agent runner

1. Clone repository and read [AGENTS.md](AGENTS.md).
2. **Current stop point: Phase 02.** Phase 01 has been merged, and Phase 02 source integration was delivered with outstanding browser QA. Do not initiate Phase 03 or later without a verified gate. Up to ten workers may run only once the exclusive claim coordinator is validated.
3. Before concurrent claiming, implement Phase 01 exclusive-claim coordinator. Until complete, operate under a **single-claim dispatcher** and start independent agents only after leases have been reserved by the dispatcher.
4. Each worker lists open GitHub issues, discovers a ready `[P01-XX]` issue, requests exclusive claim, receives a branch name and works independently. Never manually dictate issue numbers.
5. Submit a PR with evidence. Release lease after merge; repeat until the phase integration gate closes.
6. Proceed to the next phase only after all phase tasks/gates pass.

## No unsafe assumptions
GitHub issue comments are not transactional locks. 10 uncoordinated agent instances may select the same issue. Never claim atomicity until the coordinator is implemented and tested. An `AGENTS.md` file alone does not launch or schedule agents.

## Mandatory release demonstration
A teacher uploads a PDF, selects a line, sees stroke-by-stroke handwriting on the board, narrates via microphone, records only the board, recovers from an interruption and downloads a synchronized MP4 lesson.
