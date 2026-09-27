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

### T-013b · P12.2 · Derived rows, episodes and the cost ledger · todo · needs: T-011d, T-011b, T-011c
Text: `tasks/p12/T-013.md`.
Note (2026-09-27): for P13, `CostLedgerRow.step` also allows `plan` and `unit` also allows `cacheWriteToken` and `cacheReadToken`; store `step`, `provider` and `unit` as plain text columns without CHECK lists so later steps need no table rebuild.

### T-013c · P12.3 · Transcriber and captioner providers · todo · needs: T-011d
Text: `tasks/p12/T-013.md`.

### T-013d · P12.4 · EpisodePipeline step 1: understand · todo · needs: T-013a, T-013b, T-013c
Text: `tasks/p12/T-013.md`.

### T-013e · P12.5 · What was understood, on the phone · todo · needs: T-013b, T-011e
Text: `tasks/p12/T-013.md`.

## P13 — Planner (step 2 of the episode pipeline)

### T-014a · P13.1 · The planner's shapes and checks · todo · needs: T-013b
Text: `tasks/p13/T-014.md`.
Note (2026-09-27, from a second check of the text): (1) Add `planMomentErrors(output, brief)`: every cold open, shot and closing id must be an answer, clip or photo of the brief, else `<where>: not a picture or sound from this week`; `planOnce` (T-014c) runs it after the `PlannerOutput` parse and before anything else. Error strings may contain ids, never other text. (2) `narratorShare` returns `{ narratorMs, spokenMs, share }` (`validatePlan` keeps its exact messages); `userVoiceShare` = 1 − `share`; the `planProperties` test for a narrator share over 25% expects `userVoiceShare` below 0.75 and `valid` false. (3) `weekday` is required on brief moments; allowed test change: the `WeekBriefV1` contract test's moments gain `weekday`. (4) `planDurationMs` takes the `PlannerOutput` and the brief (not the assembled plan) so the 30–240 s check runs before `assemblePlan` parses. (5) A lower third is timed on its moment's first scene shot; the cold open does not count, so a moment used only as the cold open gets no lower third.

### T-014b · P13.2 · The planner provider and the style prompt · todo · needs: T-013c, T-014a
Text: `tasks/p13/T-014.md`.
Note (2026-09-27): the style prompt gains one sentence at the end of the "How an episode goes" paragraph, right after "and that must be an answer.": "It can play again, whole, in its scene." (Three fixture weeks reach 30 s only when it does, and the recap already reuses it.)
Note (2026-09-27, for P14): the style prompt's "Words." paragraph gains, after "British spelling.": "Write numbers, dates and times in words, such as three weeks or half past six." (The narrator's voice reads digits badly, D40.)

### T-014c · P13.3 · EpisodePipeline step 2: plan · todo · needs: T-013d, T-014a, T-014b
Text: `tasks/p13/T-014.md`.
Note (2026-09-27): (1) When the first answer had no text, the retry sends no assistant turn (an empty one is a 400): the errors follow the brief in the one user message. (2) `planOnce` catches an error on the retry call and returns `invalid` with the usage so far; only an error on the first call throws. (3) `planOnce(brief, planner, { effort = PLAN_EFFORT } = {})` so the eval can set effort. (4) The error-string test allows ids and nothing else from the brief or the answer.

### T-014d · P13.4 · The planner evaluation · todo · needs: T-014c
Text: `tasks/p13/T-014.md`.

## P14 — Narration (step 3 of the episode pipeline)

### T-015a · P14.1 · Narration shapes and rules · todo · needs: T-014a
Text: `tasks/p14/T-015.md`.

### T-015b · P14.2 · The ElevenLabs provider · todo · needs: T-013c, T-015a
Text: `tasks/p14/T-015.md`.

### T-015c · P14.3 · EpisodePipeline step 3: narrate · todo · needs: T-014c, T-015a, T-015b
Text: `tasks/p14/T-015.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
