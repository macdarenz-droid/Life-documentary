# Life Documentary — tasks

Only the supervisor edits this file. The coder reports on its draft PR; the supervisor updates statuses here on the base branch `claude/product-architecture-review-3bl19i`.

## How the queue works
**Statuses:** `todo` ready to take · `done` approved and merged into the base branch · `changes rN` a fix list for round N is written under the task · `blocked` waiting on the owner · `planned` not ready to take.

A `todo` task that already has a commit `T-### <title>` on the coder branch is in review. There is no separate review status.

**What the coder takes next:**
1. The first `changes rN` task that has no commit `T-### fix rN`.
2. Otherwise the first `todo` task whose `needs` are all `done` (a need the coder has committed but that is not yet reviewed counts as done) and whose ID starts no commit subject on the coder branch.

**Rules for every task:** follow `CLAUDE.md`; keep the diff to the task; add or change tests only as the task says; report `UI visible: yes/no — where`. Task text is in the file on the task's `Text:` line; fetch it when you take the task.

---

## Prove + P1 — Repo shell and render proof (release R0)

### T-001a · P1.1 · Workspace, tooling and the three pure packages · done · needs: —
Text: `tasks/p1/T-001.md`.

### T-001b · P1.2 · API skeleton on Workers · done · needs: T-001a
Text: `tasks/p1/T-001.md`. Fix r1 approved (`4b546b6`).

### T-001c · P1.3 · Mobile skeleton on Expo SDK 57 · done · needs: T-001a
Text: `tasks/p1/T-001.md`.

### T-001d · P1.4 · Boundaries, CI and README · done · needs: T-001b, T-001c
Text: `tasks/p1/T-001.md`.

### T-002a · P-A.1 · RenderManifest v1 and its timeline rules · done · needs: T-001a
Text: `tasks/pa/T-002.md`.

### T-002b · P-A.2 · The render package, fixtures and the CI render job · done · needs: T-002a, T-001d
Text: `tasks/pa/T-002.md`.

## P2 — Design system and motion (release R0)
Built to `docs/design/DESIGN.md` (owner request 2026-09-26: premium, smooth, not template).

### T-003a · P2.1 · Tokens and words · done · needs: T-001a
Text: `tasks/p2/T-003.md`.

### T-003b · P2.2 · Fonts, primitives and the motion preference · done · needs: T-003a, T-001c
Text: `tasks/p2/T-003.md`. Fix r1 approved (`f144454`).

### T-003c · P2.3 · Signature motion components (P2 set) · done · needs: T-003b
Text: `tasks/p2/T-003.md`. Fix r1 approved (`4f3e3ac`).

### T-003d · P2.4 · Design Lab and a recorded web preview in CI · done · needs: T-003c, T-001d
Text: `tasks/p2/T-003.md`. Fix r1 approved (`fece073`).

### T-003e · P2.5 · Episodes share the tokens and the type · done · needs: T-003a, T-002b
Text: `tasks/p2/T-003.md`. Fix r1 approved (`4902739`).

### T-005a · P7 · Question contracts, dates and the template bank · done · needs: T-001a
Text: `tasks/p7/T-005.md`.

### T-005b · P7 · The engine and a simulated year · done · needs: T-005a
Text: `tasks/p7/T-005.md`.

## P3 + P11 — Stored shapes and the pure story engine

### T-004a · P3.1 · Domain contracts v1 · done · needs: T-005a
Text: `tasks/p3/T-004.md`.

### T-006a · P11.1 · Episode contracts · done · needs: T-004a
Text: `tasks/p11/T-006.md`.

### T-006b · P11.2 · The shareable rule, the week brief and 20 synthetic weeks · done · needs: T-006a
Text: `tasks/p11/T-006.md`.

### T-006c · P11.3 · Plan validation and the recap plan · done · needs: T-006b
Text: `tasks/p11/T-006.md`.

## P3 — Local store on the device (D32, D33)

### T-004b · P3.2 · SQLite driver port, schema v1 and the migration harness · done · needs: T-004a
Text: `tasks/p3/T-004.md`.

### T-004c · P3.3 · Repositories and the integrity check · done · needs: T-004b, T-006b
Text: `tasks/p3/T-004.md`.

### T-004d · P3.4 · The encrypted file store · done · needs: T-004c
Text: `tasks/p3/T-004.md`.

## P5 — Capture (the daily answer on the device)

### T-007a · P5.1 · The local documentary, today's question and `captureMoment` · done · needs: T-004d, T-005b
Text: `tasks/p5/T-007.md`.

### T-007b · P5.2 · Device services and the composition root · done · needs: T-007a
Text: `tasks/p5/T-007.md`.

### T-007c · P5.3 · The Today screen and the Record transition · done · needs: T-007b, T-003c
Text: `tasks/p5/T-007.md`.

### T-007d · P5.4 · Photo, library, note, mood, place and "keep on this phone" · done · needs: T-007c
Text: `tasks/p5/T-007.md`.

## P8 — Storylines and cast · P9 — local daily reminder

### T-008a · P8.1 · Storyline, cast and tagging use cases · done · needs: T-007d
Text: `tasks/p8/T-008.md`.

### T-008b · P8.2 · Storylines and Cast screens · done · needs: T-008a
Text: `tasks/p8/T-008.md`.

### T-008c · P9.1 · Settings and the local daily reminder · done · needs: T-008b
Text: `tasks/p8/T-008.md`.

## P10 — Footage (the local archive)

### T-009a · P10.1 · Posters and playback copies · done · needs: T-008c
Text: `tasks/p10/T-009.md`.

### T-009b · P10.2 · Footage use cases · done · needs: T-009a, T-008a
Text: `tasks/p10/T-009.md`.

### T-009c · P10.3 · The Footage screen and the viewer · done · needs: T-009b, T-008b
Text: `tasks/p10/T-009.md`.

### T-009d · P10.4 · Edit, delete and "One year ago today" · done · needs: T-009c
Text: `tasks/p10/T-009.md`.

## Words — a real person's voice (owner request, 2026-09-27)

### T-012a · W.1 · Words in a real person's voice · done · needs: T-009d
Text: `tasks/words/T-012.md`.

## P4 — Account (Better Auth on Workers and D1)

### T-010a · P4.1 · Better Auth on Workers and D1, proved in the test pool · done · needs: T-001c
Text: `tasks/p4/T-010.md`.

### T-010b · P4.2 · Product rows, devices and the first link · done · needs: T-010a
Text: `tasks/p4/T-010.md`.

### T-010c · P4.3 · The public deletion page · done · needs: T-010b
Text: `tasks/p4/T-010.md`.

### T-010d · P4.4 · Sign in on the phone and the first link · done · needs: T-010b, T-009d
Text: `tasks/p4/T-010.md`.

## P6 — Upload queue and sync

### T-011a · P6.1 · `leavesDevice` and the sync and upload contracts · done · needs: T-001a
Text: `tasks/p6/T-011.md`.

### T-011b · P6.2 · `POST /sync` on the server · done · needs: T-011a, T-010b
Text: `tasks/p6/T-011.md`.

### T-011c · P6.3 · Sync on the phone · done · needs: T-011b, T-010d
Text: `tasks/p6/T-011.md`.

### T-011d · P6.4 · Uploads through the Worker · done · needs: T-011b
Text: `tasks/p6/T-011.md`.

### T-011e · P6.5 · The upload queue on the phone · changes r1 · needs: T-011d, T-011c, T-009a
Text: `tasks/p6/T-011.md`.
Note (2026-09-27): `upload_jobs.purpose` gets no CHECK list (the `UploadJob` contract guards it), so P12 can add the `keyframe` purpose without rebuilding the table. The part response is parsed with `UploadedPart` (T-011d fix r2).
**Fix list r1** (review of cb55c73; everything else approved: what is enqueued, the migration, resume by part, backoff, the Wi-Fi rule, one drain at a time).
1. The background task does nothing when the system launches the app to run it. `runner` is set only inside `CaptureRoot` after fonts load and the store opens, and the task module is imported only from `app/_layout.tsx`, so in a background launch (no views mounted) the task is not even defined, or finds no runner and returns Success. Give the app a small entry file (`apps/mobile/index.ts`, `package.json` `main` pointing at it) that imports the task module and then `expo-router/entry`. The task body must work on its own: when no mounted runner is set, it opens the store the way the app does, builds the account, Api and network services, runs `syncIfSignedIn` then `drainUploads` within the time budget, and closes what it opened.
2. A running drain brings back a job that `deleteMoment` removed. Before each save of a job, check that the job row still exists; when it is gone, stop sending, remove the plain copy and move on. `drainUploads` skips (and removes) a job whose moment is deleted.
3. Plain copies left by a kill are never removed, including the plain copy of a video the person then deletes. At start, empty `cache/uploads` beside `clearPlaybackCache`, before any drain or enqueue.
Tests: the task body with no mounted runner opens a (memory) store, syncs and drains one due job; deleting the moment while its upload is between parts stops the send, leaves no job row and no plain copy; a job whose moment is deleted is removed without an Api call; a file left in `cache/uploads` is gone after start.
Allowed test changes: none removed or loosened.
Checks: mobile typecheck, tests, lint, format, boundaries; `npx expo-doctor` no new failures. UNVERIFIED on a device: a background launch uploading.

## P12 — Understanding (step 1 of the episode pipeline)

### T-013a · P12.1 · Keyframes leave the phone · approved (40261e2; merges after T-011e fix r1) · needs: T-011e, T-011d
Text: `tasks/p12/T-013.md`.

### T-013b · P12.2 · Derived rows, episodes and the cost ledger · todo · needs: T-011d, T-011b, T-011c
Text: `tasks/p12/T-013.md`.
Note (2026-09-27): for P13, `CostLedgerRow.step` also allows `plan` and `unit` also allows `cacheWriteToken` and `cacheReadToken`; store `step`, `provider` and `unit` as plain text columns without CHECK lists so later steps need no table rebuild.

### T-013c · P12.3 · Transcriber and captioner providers · todo · needs: T-011d
Text: `tasks/p12/T-013.md`.

### T-013d · P12.4 · EpisodePipeline step 1: understand · todo · needs: T-013a, T-013b, T-013c
Text: `tasks/p12/T-013.md`.

### T-013e · P12.5 · What was understood, on the phone · todo · needs: T-013b, T-011e
Text: `tasks/p12/T-013.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
