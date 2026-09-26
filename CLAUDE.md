# Life Documentary — rules for coding agents

Read this before every task. The product is described in `docs/VISION.md`, the structure in `docs/architecture/ARCHITECTURE.md`, the reasons in `docs/decisions/DECISIONS.md`. The task queue is `tasks/TASKS.md`; the task text is in the file named on the task's `Text:` line.

## Golden rules
1. **Only the current task.** Build exactly its Goal, Do, Tests and Acceptance, in queue order. No refactors, no next feature, no files the task does not name (except a minimal typecheck-forced change, reported under Risks).
2. **One owner per truth.** Every fact is computed in the one place ARCHITECTURE §6 names. Screens only show values; they never compute them.
3. **Contracts first.** Every shape that crosses a boundary (device ↔ API, API ↔ render, API ↔ model, stored rows) is a Zod schema in `packages/contracts`. Parse at every boundary, on both sides.
4. **Pure story logic lives in `packages/story`.** It imports only `packages/contracts` and has no I/O, no clock and no randomness except what is passed in.
5. **Layers.** In `apps/mobile/src`: only `data/` imports the SQLite driver; only `services/` imports Expo device modules and the API client; `features/` never imports `data/` or `services/`; nothing imports `app/`. In `apps/api/src`: only `providers/` imports vendor SDKs; providers hold no product policy. The boundary check enforces this.
6. **Stored shape change = new schema version + append-only migration + migration test**, on the device and in D1.
7. **No biometrics.** Never add face detection, face grouping, face embeddings, voice prints, speaker identification, or inference of mood, age or gender from faces or voices. People are named by the user.
8. **`localOnly` never leaves the device.** Every upload, sync payload and model request goes through `leavesDevice` (from P6 onward).
9. **No secrets in code, docs, tests or messages.** Vendor keys are Worker secrets. The client never calls a vendor directly.
10. **Missing is not a value.** Never invent a transcript, caption, place, date or duration. Optional stays optional.
11. **Words.** User-facing text lives in `packages/story/words` (from P2 onward), plain and warm. Never "streak", "badge", "level up", or exclamation marks in system messages.
12. **Tests check behaviour** through public functions or the rendered UI, never source text. Never skip, delete or loosen a test to get green; change an existing test only where the task's "Allowed test changes" says so.
13. **Ready** means: typecheck, lint, boundaries, the task's tests and the build pass locally; every acceptance line is met; CI is green on the pushed commit. Anything not run is reported as UNVERIFIED.
14. **Accessibility.** WCAG 2.2 AA: labels, roles, focus order, contrast, reduced motion; captions on video.
15. **Versions.** Use the pins in DECISIONS D25. Never upgrade a major version unless the task says so.

## Commands (repo root; run `pnpm install` first)
Filled in by task T-001a and kept current by the tasks that change them:
- `pnpm typecheck` · `pnpm lint` · `pnpm boundaries` · `pnpm test` · `pnpm build`
- Per workspace: `pnpm --filter <name> <script>`

## Git
- Work only on your own branch. Never push to another branch, never force-push, never rebase or amend a pushed commit, never merge a PR.
- Commit subject `T-### <title from TASKS>`; fix rounds `T-### fix rN`; CI fixes `T-### fix ci`.
- One push per task; wait for CI before the next push unless you are fixing that run.
