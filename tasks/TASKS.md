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

### T-010d · P4.4 · Sign in on the phone and the first link · changes r1 · needs: T-010b, T-009d
Text: `tasks/p4/T-010.md`.
**Fix list r1** (review of 7a301cf; everything else approved: the section, the code step, Apple only on iOS, the first link, the owner id update, the purge date line).
1. Signing in again must cancel an open deletion. The words say "To cancel, sign in again before then", but nothing on the phone calls `cancelDeletion`, so the request stays open and P21 would purge the account. In `signInAndLink` (`application/account.ts`), after the session is confirmed: `api.me()`, and when `deletion` is not null, `api.cancelDeletion()`. A failure there shows `signInFailed` like any other sign-in failure.
2. Closing the Google sheet shows "Couldn't sign you in". `getCookie()` also holds the OAuth `state` cookie, so `cached` is set and the adapter says `signedIn`. In `betterAuthAccount.ts`: `signInWithGoogle` returns `'signedIn'` only when `client.getSession()` has data, else `'cancelled'`; `refresh` caches the cookie only when it holds the session token cookie (`better-auth.session_token`), else `null`.
Tests: a sign-in while the fake Api reports an open deletion calls `cancelDeletion` once and the fake then reports none; a sign-in with nothing open does not call it; with a fake auth client whose social sign-in leaves only a `better-auth.state` cookie and no session, `signInWithGoogle` gives `'cancelled'` and `cookie()` is `null`.
Allowed test changes: none removed or loosened.
Checks: mobile typecheck, tests, lint, format, boundaries.

## P6 — Upload queue and sync

### T-011a · P6.1 · `leavesDevice` and the sync and upload contracts · done · needs: T-001a
Text: `tasks/p6/T-011.md`.

### T-011b · P6.2 · `POST /sync` on the server · changes r1 · needs: T-011a, T-010b
Text: `tasks/p6/T-011.md`.
**Fix list r1** (review of fd29352; everything else approved: ownership, `leavesDevice` on the server, the change log, paging, tombstones).
1. Questions have no `updatedAt`, so today an incoming question that differs from the stored one simply replaces it, and an older unanswered copy from a second phone clears a stored answer (that phone never lands the answer, because the answer's media is not on it, and it re-pushes the question every round). Merge rule for questions: a new question is stored; a stored one is replaced only when the incoming row has an `answeredByMomentId` and the stored row has none or points at a moment the server holds as deleted. A stored answer is never cleared. Anything else is refused as `stale`.
2. `/sync` must not trust `cloudKey`. A phone can send any string (another account's key, or an old key), and P12 reads and deletes the object at that key. On `/sync`: a new media asset row is stored with `cloud_key` null, a stored `cloud_key` is always kept, and `cloudKey` plays no part in the stale comparison. Only upload completion (T-011d) sets it.
Tests: phone A pushes Q answered by M, then phone B pushes Q unanswered → the stored Q still has M and B's change is refused `stale`; after M is deleted (tombstone pushed), a push of Q answered by M2 stores M2; a push of a new asset with `cloudKey: 'u/other/…'` stores null, and when the stored asset has a `cloud_key` (seeded in D1 by the test, as an original's completion would set it) a later push with a different `cloudKey` leaves the stored key in place.
Allowed test changes: tests that pushed a `cloudKey` and expected it back now expect the server's value; none removed.
Checks: API and contracts typecheck, tests, lint, format, boundaries, `deploy:dry`.

### T-011c · P6.3 · Sync on the phone · review · needs: T-011b, T-010d
Text: `tasks/p6/T-011.md`.

### T-011d · P6.4 · Uploads through the Worker · changes r1 · needs: T-011b
Text: `tasks/p6/T-011.md`.
**Fix list r1** (a review of 09d77e2 is running; more items may be added here before you reach this entry, so read it again when you start it).
1. Working copies need their own prefix. D14's backstop is an R2 lifecycle rule that deletes working copies after 2 days, and lifecycle rules match by key prefix only. With `purpose` last in the key, no rule can pick out answers and previews without also deleting originals. Keys: `tmp/{userId}/{documentaryId}/{assetId}/{purpose}` for `answer` and `preview` (and any later working-copy purpose); `u/{userId}/{documentaryId}/{assetId}/original` for originals. One function in `routes/uploads.ts` makes the key; the purpose decides the prefix.
2. A working copy is not the asset's lasting copy, so completing one must not set `media_assets.cloud_key` (in P12 a video answer uploads two working copies, its sound and a keyframe, and one field cannot point at both). Completing an `original` sets `cloud_key` and writes the `change_log` row as now; completing a working copy leaves the asset row alone, and P12 finds working copies by their key, which is fixed by (user, documentary, asset, purpose). `UploadDone` still returns the object's key.
Tests: a completed answer upload's stored object key starts with `tmp/{userId}/`, and so does a completed photo preview's; after an answer completes, the asset's `cloudKey` is still unset and a sync from the earlier cursor returns no new change for it.
Allowed test changes: the test that expected the answer's `cloudKey` after completion now expects the object at the `tmp/` key and no `cloudKey`.
Checks: API typecheck, tests, lint, format, boundaries, `deploy:dry`.

### T-011e · P6.5 · The upload queue on the phone · todo · needs: T-011d, T-011c, T-009a
Text: `tasks/p6/T-011.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
