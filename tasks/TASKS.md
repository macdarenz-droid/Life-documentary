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

### T-011e · P6.5 · The upload queue on the phone · done · needs: T-011d, T-011c, T-009a
Text: `tasks/p6/T-011.md`.

## P12 — Understanding (step 1 of the episode pipeline)

### T-013a · P12.1 · Keyframes leave the phone · done · needs: T-011e, T-011d
Text: `tasks/p12/T-013.md`.

### T-013b · P12.2 · Derived rows, episodes and the cost ledger · done · needs: T-011d, T-011b, T-011c
Text: `tasks/p12/T-013.md`.

### T-013c · P12.3 · Transcriber and captioner providers · done · needs: T-011d
Text: `tasks/p12/T-013.md`.

### T-013d · P12.4 · EpisodePipeline step 1: understand · done · needs: T-013a, T-013b, T-013c
Text: `tasks/p12/T-013.md`.

### T-013e · P12.5 · What was understood, on the phone · done · needs: T-013b, T-011e
Text: `tasks/p12/T-013.md`.

## P13 — Planner (step 2 of the episode pipeline)

### T-014a · P13.1 · The planner's shapes and checks · done · needs: T-013b
Text: `tasks/p13/T-014.md`.

### T-014b · P13.2 · The planner provider and the style prompt · done · needs: T-013c, T-014a
Text: `tasks/p13/T-014.md`.

### T-014c · P13.3 · EpisodePipeline step 2: plan · done · needs: T-013d, T-014a, T-014b
Text: `tasks/p13/T-014.md`.

### T-014d · P13.4 · The planner evaluation · done · needs: T-014c
Text: `tasks/p13/T-014.md`.

## P14 — Narration (step 3 of the episode pipeline)

### T-015a · P14.1 · Narration shapes and rules · done · needs: T-014a
Text: `tasks/p14/T-015.md`.

### T-015b · P14.2 · The ElevenLabs provider · done · needs: T-013c, T-015a
Text: `tasks/p14/T-015.md`.

### T-015c · P14.3 · EpisodePipeline step 3: narrate · done · needs: T-014c, T-015a, T-015b
Text: `tasks/p14/T-015.md`.

## P15 — Render (the episode timeline, the compositions, the renderer)

### T-016a · P15.1 · The episode timeline · done · needs: T-014a, T-015a
Text: `tasks/p15/T-016.md`.

### T-016b · P15.2 · The episode, drawn · done · needs: T-016a
Text: `tasks/p15/T-016.md`.

### T-016c · P15.3 · Word-level captions · done · needs: T-016b
Text: `tasks/p15/T-016.md`.

### T-016d · P15.4 · The render input and the renderer port · done · needs: T-014c, T-015c, T-016a
Text: `tasks/p15/T-016.md`. Fix r1 approved (`af2d9a8`).

### T-016e · P15.5 · Remotion Lambda · done · needs: T-016b, T-016d
Text: `tasks/p15/T-016.md`. Fix r1 approved (`0eefa8e`).

## P16 — Delivery (the weekly run, push, the Episode screens)

### T-017a · P16.1 · The week and the schedule · done · needs: T-016a
Text: `tasks/p16/T-017.md`.

### T-017b · P16.2 · Push · done · needs: T-016d
Text: `tasks/p16/T-017.md`.

### T-017c · P16.3 · Asking for originals, on the server · changes r1 · needs: T-014c, T-016d, T-017b
Text: `tasks/p16/T-017.md`.

**Fix list r1** (review of 0f344a2, confirmed by two skeptics; everything else approved: the contract and pulled entity, `leavesDevice` with `requested` on both sides, the table and repository, `keepAnswers`, `requestOriginals` and its silent push, the upload rule and the `originals-ready` event, `closeAll`).
1. In `/sync`, a moment tombstone is committed first and the R2 delete of its `original` runs after it. If that delete fails, a retried tombstone finds the row already deleted and never deletes the file, so the full recording of a deleted moment stays in the cloud (VISION §8). Delete the `original` before the tombstone is committed. A tombstone for a row that is already deleted also deletes it again (the delete is safe to repeat).
Tests: an R2 delete that throws once leaves the tombstone uncommitted, and the retried push deletes the original and commits. A second tombstone for an already-deleted moment deletes a stray original.
Checks: API typecheck, tests, lint, format, boundaries, `deploy:dry`.

### T-017d · P16.4 · Asking for originals, on the phone · changes r1 · needs: T-017b, T-017c
Text: `tasks/p16/T-017.md`.

**Fix list r1** (review of d874edd, confirmed by two skeptics; everything else approved: the migration and cursor reset, landing pulled requests, the upload rules, closed requests, the push payload parsing, the plugin option).
1. The silent-push run gets a fresh 25 s once it holds the lock, so a push that arrives during the P6 task can run for 40 s or more after iOS woke the app (iOS allows about 30 s). Take a deadline when the task starts (in `handleOriginalsPush`, before `runInBackground`) and pass it through. Once the lock is held, the runner gets only what is left, measured from before the store opens. Skip the drain when under 5 s are left, and skip the whole run when nothing is left.
2. `run` in `captureContext.tsx` always passes `foreground: true`, and the mount-time `onForeground()` runs even when iOS launched the app in the background (a silent push renders the root too). That re-encodes a full-size photo in the background. Pass `foreground: AppState.currentState === 'active'` there as well, or skip the mount-time run unless the app is active.
3. `queueRequestedOriginals` can run twice at once (a foreground run and a sync after a capture), and both write the same JPEG path. One attempt can delete the copy the surviving job points at, or leave a key that doesn't match the file, and the photo then never reaches the episode. Make it single-flight per store, as `drainUploads` is, give each attempt its own temporary name, and set the job only when none exists (removing the copy when it loses).
Tests: a push that arrives while another run holds the lock ends within 25 s of its own start (advancing clock). A mount with AppState `background` queues no photo copy. Two overlapping `queueRequestedOriginals` calls leave one job whose copy decrypts.
Checks: mobile typecheck, tests, lint, format, boundaries.

### T-017e · P16.5 · The weekly run · todo · needs: T-015c, T-016d, T-017a, T-017c
Text: `tasks/p16/T-017.md`.

### T-017f · P16.6 · Episodes to the phone · changes r1 · needs: T-016d, T-017e
Text: `tasks/p16/T-017.md`.

**Fix list r1** (review of aed4a57, confirmed by two skeptics; everything else approved: the summary and its pulled entity, the change-log rows from `setPlan` on, the video route with 200, 206 and 416 and its 404s, the device table rebuild and landing newer rows with the local fields kept).
1. The test "a week that ended empty is never pulled" pulls only after `episodes.remove`, when no row is left, so it would pass even without the `planVersion > 0` guard or the plan join. Also pull after `setState('understanding')` and `setState('planning')`, before `remove`, and check that no `episode` change comes back. Keep the pull after `remove`.
Checks: API typecheck, tests, lint, format, boundaries.

### T-017g · P16.7 · The Episode screens · todo · needs: T-003e, T-017a, T-017f
Text: `tasks/p16/T-017.md`.

## P17 — Edits (five one-tap changes, the re-cut run, the edit sheets)

### T-018a · P17.1 · Edit rules · todo · needs: T-016a
Text: `tasks/p17/T-018.md`.

### T-018b · P17.2 · The re-cut run · todo · needs: T-017c, T-017e, T-017f, T-018a
Text: `tasks/p17/T-018.md`.

### T-018c · P17.3 · Edits on the server · todo · needs: T-018b
Text: `tasks/p17/T-018.md`.

### T-018d · P17.4 · Edits on the phone · todo · needs: T-017d, T-017g, T-018c
Text: `tasks/p17/T-018.md`.

### T-018e · P17.5 · The edit sheets · todo · needs: T-018d
Text: `tasks/p17/T-018.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
