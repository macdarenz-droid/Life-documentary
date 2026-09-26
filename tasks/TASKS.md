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

### T-003c · P2.3 · Signature motion components (P2 set) · todo · needs: T-003b
Text: `tasks/p2/T-003.md`.

### T-003d · P2.4 · Design Lab and a recorded web preview in CI · todo · needs: T-003c, T-001d
Text: `tasks/p2/T-003.md`.

### T-003e · P2.5 · Episodes share the tokens and the type · changes r1 · needs: T-003a, T-002b
Text: `tasks/p2/T-003.md`.
**Fix list r1** (review of ce7ae3d; the title card, fonts, label and moved `titleCardPlan` are approved):
1. The caption scrim cuts in and out: `Captions.tsx` draws the gradient only while a caption is on screen, so the lower half of the frame darkens in one frame at 5,000 ms and brightens in one frame at 7,500 ms (checked on the rendered fixture). Add a pure helper `captionScrimOpacity(ms, captions, fadeMs)` in `packages/render/src/episode/captionScrim.ts`: for each run of touching or overlapping captions it rises linearly from 0 at `fromMs − fadeMs` to 1 at the run's first `fromMs`, stays 1 through the run, and falls to 0 at the run's last `toMs + fadeMs`; 0 elsewhere. Render the scrim as its own layer with that opacity (`fadeMs = duration.micro`); the caption text keeps appearing at `fromMs`. Tests (`packages/render/test/captionScrim.test.ts`): 0 before and after a run, 0.5 halfway through the fade-in, 1 at `fromMs`, 1 at the joint of two touching captions, two separate runs fade separately.
2. The grain makes the render much slower: the fixture render took 103.9 s locally against 62.8 s before this task (CI step 87 s against 62 s), because `Grain.tsx` computes `noise3D` for every grain pixel on every grain frame. Keep the look but compute at most 8 distinct grain frames per render and cycle them (`grainFrame % 8`), or use an SVG `feTurbulence` filter with a per-frame `seed`, whichever keeps `texture.grainOpacity` and `texture.grainFps`. Acceptance: the CI "Render fixture episode" step takes at most 72 s; report the old and new numbers.
Checks: render tests, typecheck, lint, format, boundaries; CI `render` job green with the artifact.

## P7 — Question engine
Pure, deterministic, in `packages/story`; wired to storage in P8/P9.

### T-005a · P7 · Question contracts, dates and the template bank · todo · needs: T-001a
Text: `tasks/p7/T-005.md`.

### T-005b · P7 · The engine and a simulated year · todo · needs: T-005a
Text: `tasks/p7/T-005.md`.

## P3 + P11 — Stored shapes and the pure story engine

### T-004a · P3.1 · Domain contracts v1 · todo · needs: T-005a
Text: `tasks/p3/T-004.md`.

### T-006a · P11.1 · Episode contracts · todo · needs: T-004a
Text: `tasks/p11/T-006.md`.

### T-006b · P11.2 · The shareable rule, the week brief and 20 synthetic weeks · todo · needs: T-006a
Text: `tasks/p11/T-006.md`.

### T-006c · P11.3 · Plan validation and the recap plan · todo · needs: T-006b
Text: `tasks/p11/T-006.md`.

## P3 — Local store on the device (D32, D33)

### T-004b · P3.2 · SQLite driver port, schema v1 and the migration harness · todo · needs: T-004a
Text: `tasks/p3/T-004.md`.

### T-004c · P3.3 · Repositories and the integrity check · todo · needs: T-004b, T-006b
Text: `tasks/p3/T-004.md`.

### T-004d · P3.4 · The encrypted file store · todo · needs: T-004c
Text: `tasks/p3/T-004.md`.

## Blocked on the owner

### P-B · Capture and upload proof on real devices · blocked · needs: P3, P5, P6 tasks (not yet written)
Waiting on the owner: a Cloudflare account (Workers Paid, R2), an Expo/EAS account, an Apple Developer account, and a real iPhone and Android phone for the check. P3 task text is written (T-004); P5 and P6 text is written once the owner has the accounts.
