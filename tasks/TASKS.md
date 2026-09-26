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

### T-007b · P5.2 · Device services and the composition root · changes r1 · needs: T-007a
Text: `tasks/p5/T-007.md`.
**Fix list r1** (review of 2adbc1c; everything else approved):
1. `CameraRecorderView` invents the video's size (a fixed 1080×1920) and estimates its length with `performance.now()` around the recording, so a clip that ends at the 10 s cap before the finger lifts is stored longer than it is (CLAUDE.md rule 10: missing is not a value). Read `durationMs`, `width` and `height` from the recorded file instead, with an Expo API checked in the installed `.d.ts` (for example `expo-video`'s `createVideoPlayer(uri)` and its source-load event, which carries the duration and the video track size, then `release()`; `npx expo install expo-video` if needed). If the file's metadata cannot be read, `stop()` returns `null` and nothing is saved (the screen will show a `words` line in T-007c); never fall back to a guess.
2. Test: with a mocked metadata reader, `stop()` returns the file's duration and size, not the time between `start` and `stop` (a recording capped at 10 s and stopped at 12 s reports 10 s); an unreadable file gives `null`.
Checks: mobile tests, typecheck, lint, format, boundaries; `npx expo-doctor` no new failures.
Fix r1 approved (7e05969). It merges together with T-007c, which comes before it on the coder branch.

### T-007c · P5.3 · The Today screen and the Record transition · changes r1 · needs: T-007b, T-003c
Text: `tasks/p5/T-007.md`.
**Fix list r1** (review of fea63b4; everything else approved: Record plan and ring, Text Morph label, reduced-motion countdown, permissions and Settings, the screen-reader start/stop action, the lab spec). Apply it on top of the T-007d code already on the coder branch.
1. The camera runs hidden: `TodayScreen` keeps `CameraView` mounted at opacity 0 whenever the camera is allowed, so the camera is live (and the phone's camera light is on) while the person is only reading the question, in voice mode, after "Saved", and behind any screen pushed on the Stack. The camera must run only while the person can see it. In video mode, mount `CameraView` on press-in; start recording when the view hands out its recorder (wait at most 3 s, then show `words.today.couldNotSave`); unmount it after `stop()` resolves or on a cancel. The 1 s minimum and the countdown count from the moment recording starts, not from press-in. Releasing before the camera is ready cancels without saving and shows the hold-longer line.
2. The date line comes from `today`, computed once when the route mounts, so after midnight a focus reload shows the new day's question under yesterday's date. Show `dayLabel(question.askedOn)` (the loaded question owns its day) and remove the `today` prop from `TodayScreenProps`, `todayScreenProps` and the Design Lab.
3. When saving an answer throws, the screen goes back to idle with no word. Show `words.today.couldNotSave`.
Tests: no `camera-preview` before press-in, in voice mode, or after release; it is there during a video hold; a camera view that never hands out a recorder shows `couldNotSave` after 3 s and saves nothing; with `fixedClock(...).set` moved to the next day and the screen reloaded (`reloadKey`), the date line and the question are the new day's; a rejecting `save` shows `couldNotSave`.
Allowed test changes: `TodayScreen.test.tsx`, `extras.test.tsx` and `todayHarness.ts` may drop the `today` prop and add the waits the new camera mount needs; no assertion is removed.
Checks: mobile tests, typecheck, lint, format, boundaries; the lab job green.

### T-007d · P5.4 · Photo, library, note, mood, place and "keep on this phone" · changes r1 · needs: T-007c
Text: `tasks/p5/T-007.md`.
**Fix list r1** (review of 3a9b640; everything else approved: Tray as a Reanimated sheet, the extras, clip limits, the `couldNotSave` line, the two test edits forced by the new controls). Take it after T-007c fix r1.
1. "Photo" takes a still from the hidden camera at once, so the person never sees what is in the frame. "Photo" opens a full-screen camera view instead: the live preview (back camera, with a quiet "Flip" text link from `words` that switches to the front one), one amber "Take photo" action and a quiet "Cancel". The still is taken from what the person sees, then saved through `captureMoment` with the chosen extras as now; the camera unmounts after either action. While this view is open it is the screen's only amber action; the Record button is hidden.
Tests: tapping "Photo" shows the preview and stores nothing yet; "Take photo" stores the `photo` moment and the preview is gone; "Cancel" stores nothing and the preview is gone; "Flip" switches the camera the view is given (`facing`).
Allowed test changes: the photo steps in `extras.test.tsx` press "Take photo" after "Photo"; no assertion is removed.
Checks: mobile tests, typecheck, lint, format, boundaries; the lab job green.

## P8 — Storylines and cast · P9 — local daily reminder

### T-008a · P8.1 · Storyline, cast and tagging use cases · todo · needs: T-007d
Text: `tasks/p8/T-008.md`.

### T-008b · P8.2 · Storylines and Cast screens · todo · needs: T-008a
Text: `tasks/p8/T-008.md`.

### T-008c · P9.1 · Settings and the local daily reminder · todo · needs: T-008b
Text: `tasks/p8/T-008.md`.

## P10 — Footage (the local archive)

### T-009a · P10.1 · Posters and playback copies · todo · needs: T-008c
Text: `tasks/p10/T-009.md`.

### T-009b · P10.2 · Footage use cases · todo · needs: T-009a, T-008a
Text: `tasks/p10/T-009.md`.

### T-009c · P10.3 · The Footage screen and the viewer · todo · needs: T-009b, T-008b
Text: `tasks/p10/T-009.md`.

### T-009d · P10.4 · Edit, delete and "One year ago today" · todo · needs: T-009c
Text: `tasks/p10/T-009.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
