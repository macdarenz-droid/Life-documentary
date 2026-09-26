# Life Documentary — supervisor handoff

From the first supervisor (CLAUDE SUPERVISOR, session `session_01PyYuLeC3sCJKPiByabpEgb`) to the next supervisor. Written 2026-09-26 12:20 UTC. The first supervisor has stopped its loop and its PR subscription, so only one supervisor acts at a time.

## Goal
Deliver Life Documentary to release, as defined in `docs/VISION.md`, by running the coder loop: write task text ahead of the coder, review every "ready" report, merge approved work into the base branch, keep the Relay dashboard and state files current, and ask the owner only for what no agent can do.

## Done
- **Define stage complete.** Research (`docs/research/MARKET_RESEARCH.md`, `STACK_RESEARCH.md`, `DESIGN_RESEARCH.md`), product (`docs/VISION.md`), architecture (`docs/architecture/ARCHITECTURE.md`), roadmap (`docs/architecture/ROADMAP.md`, phases P-A, P-B, P1–P26), design direction (`docs/design/DESIGN.md`), decisions D1–D31 (`docs/decisions/DECISIONS.md`), coder rules (`CLAUDE.md`).
- **Tasks written:** P1 (`tasks/p1/T-001.md`, T-001a–d), P-A render proof (`tasks/pa/T-002.md`, T-002a–b), P2 design system and motion (`tasks/p2/T-003.md`, T-003a–e). Queue and statuses in `tasks/TASKS.md`.
- **Coder running.** Session `session_01PHyGVgSKo53jADBxGs2MBq` ("Life Documentary CODER"), Opus 5.5 at medium effort, self-paced `send_later` loop, branch `claude/life-coder-loop`, draft PR #1 into the base. Started from `tasks/CODER_PROMPT.md` (Relay copy: `agents/handoffs/CODER_PROMPT.md`).
- **Reviewed and merged:** T-001a (merged as `8ce5ec9`; checks re-run locally, 21 tests pass).
- **Relay:** stage Prove; 9 architecture components; tracker items T-001a–d, T-002a–b, T-003a–e, P-B (blocked on owner).

## Waiting for you right now (review cursor: base `faa4419`)
1. **T-001b fix r1** · coder commit `4b546b6` (range `8c95c15..4b546b6`). Check the fix list in TASKS (one compatibility date `2026-08-22` in `wrangler.jsonc`, override removed from `vitest.config.ts`, generated types ignored by ESLint, root script `types:api`). The coder notes that `pnpm types:api` writes tabs, so `pnpm format` must follow it.
2. **T-001c** · coder commit `c1fcb29` (range `c1eca93..c1fcb29`). Expo SDK 57 skeleton; expo-doctor 21/21; local `expo export` works. Check its tsconfig merge (Expo base + our strict base) and Metro monorepo config.
3. When both pass: set them `done` in `tasks/TASKS.md`, merge `4b546b6` (it contains `c1fcb29`) into the base with `--no-ff`, push, reply one line on PR #1, update the Relay tracker items and the P1 progress.
Then the coder continues with T-001d, T-002a, T-003a and onward; it reads TASKS from the base branch, so a status you set is picked up on its next tick.

## How to review (same every time)
1. `git fetch origin claude/life-coder-loop`; read the coder's PR comment for the Range.
2. `git diff --stat <Range>`; `git diff --name-only <Range> -- docs tasks CLAUDE.md` must be empty except what the task names (merge commits bring in supervisor files; ignore those).
3. Read the diff against the task's Do / Tests / Acceptance and CLAUDE.md's 15 rules.
4. Re-run the checks in a separate worktree on the coder head: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` (plus `pnpm boundaries` once T-001d lands, and the task's own commands). From T-001d onward, CI on the PR must be green too.
5. Approve → `done`; otherwise `changes rN` with a numbered fix list under the task in TASKS. Merge only commits whose tasks are all `done`.
6. Mirror every changed doc to the Relay (same path; `tasks/CODER_PROMPT.md` → `agents/handoffs/CODER_PROMPT.md`; `CLAUDE.md` → `docs/CODER_RULES.md`), add one LOG line, keep PROJECT_STATE current.

## Decisions you must keep (details in DECISIONS)
- D1–D3: a story engine with a daily interview; weekly episode, never a streak; the user's voice is the narration (narrator ≤ 25% of spoken time).
- D5: no biometrics anywhere (enforced by T-001d's boundary rules).
- D6–D9: Expo SDK 57 client; no on-device video assembly; Cloudflare backend (Workers, R2, D1, Queues, Workflows); Remotion render, Lambda first.
- D10–D13: Claude Sonnet 5 plans episodes, Haiku 4.5 captions, Opus 5.5 plans seasons; Workers AI Whisper for speech; ElevenLabs Flash for narrator bridges only; licensed music.
- D14–D16: device is the primary store; previews processed then deleted; one shared `leavesDevice` rule; sync is last-write-wins per field.
- D20: an episode always arrives (recap fallback).
- D22, D24: solo loop before crew; prove render (P-A) and device upload (P-B) before feature work.
- D25: toolchain pins: Node 22, pnpm 10.33, TypeScript ~6.0.3 (not 7), Vitest ~4.1.11 (not 5), Expo SDK 57; native modules only via `npx expo install`.
- D27: the coder reports on PR #1, not in the Relay (there is no coder Relay link).
- D28: coder is Opus 5.5 at medium effort; replace its session between tasks when its context passes ~250k tokens.
- D29–D31: premium cinematic design (DESIGN.md): springs at damping ratio ≥ 0.85, nine signature transitions each with a reduced-motion path, Instrument Serif + Inter.

## Known corrections to published task text
- T-001a said `module: "Bundler"`; TypeScript 6 rejects it. `ESNext` is correct and accepted.
- T-001b: tests and deploys run on compatibility date `2026-08-22` because `@cloudflare/vitest-pool-workers` 0.22 bundles a runtime that accepts dates only up to that day. Raise it when the pool is upgraded.
- P2 note for T-003b: Jest for mobile is `~29.7.0` (what expo-doctor requires for SDK 57), not the root Vitest.

## Next task text to write (before the queue runs dry, about 10 tasks from now)
1. **P3 Local store** (ARCHITECTURE §3, ROADMAP Block A): SQLite schema v1 with Drizzle, migration harness, repositories for Moment, MediaAsset, Question, Storyline, CastMember, Episode view, UploadJob; encrypted file store (libsodium, per-file keys wrapped by a Keychain master key). Verify library versions for SDK 57 first (`expo-sqlite`, `drizzle-orm` 0.45 with its expo driver, `react-native-libsodium` or `expo-crypto-lib`).
2. **P7 Question engine** and **P11 Contracts** (pure `packages/story` and `packages/contracts` work, no owner accounts needed): good parallel work while P-B waits on the owner.
3. Hold P4 (account), P5 (capture), P6 (upload) task text until the owner provides the accounts listed below; P5 and P6 can be written earlier but P-B needs real devices.

## Owner actions outstanding (ask once, then keep independent work moving)
- Confirm or correct the product definition and pricing in `docs/VISION.md` (§2, §6, §7).
- For P-B and P4: Cloudflare account (Workers Paid, R2, D1), Expo/EAS account, Apple Developer account, Google Play Console, a real iPhone and Android phone.
- Later: Anthropic and ElevenLabs API keys (P12, P14), AWS for Remotion Lambda (P15.2), RevenueCat (P23), a music licence (before public release), keep or change the app id `com.macdarenz.lifedocumentary` (D26).

## Files to read first (in this order, ~15 minutes)
`CONTRACT.md` and `PLAYBOOK.md` (Relay, owner's rules) → `PROJECT_STATE.md` → `docs/VISION.md` → `docs/architecture/ARCHITECTURE.md` §1–§7 → `docs/decisions/DECISIONS.md` → `tasks/TASKS.md` → `tasks/CODER_PROMPT.md` → `docs/design/DESIGN.md` when reviewing P2.

## Tools and access
- Repo `macdarenz-droid/Life-documentary`; base branch `claude/product-architecture-review-3bl19i` (also the only branch besides the coder's; there is no `main` yet). GitHub via the `mcp__github__*` tools.
- Relay "Life Documentary" with a supervisor link (tools: overview, fetch, write_file, append_file, post_message, dashboard, update_item, update_progress).
- Coder session control: `get_session`, `send_message`/`create_trigger` (to nudge), `create_session` (to replace it, from `tasks/CODER_PROMPT.md`), `archive_session` for the old one.
- Wake yourself with `subscribe_pr_activity` on PR #1 (coder comments arrive as events) plus a self-scheduled check-in (`send_later` or `/loop`) every 25–30 minutes while the coder is active.

## Continuity (owner rule, 2026-09-26)
Every loop is continuous. Keep two hourly backstop routines alive (`list_triggers`): "Life Documentary supervisor hourly backstop" into the supervisor session and "Life Documentary coder hourly backstop" into the coder session. When you replace the coder, `update_trigger` the coder backstop's target by deleting it and creating it again for the new session. Watchdog the coder on every tick (`get_session`): a failed or idle coder with a takeable task gets a wake (`create_trigger`, run once in 1 minute, the Loop block); a coder past ~250k tokens is replaced between tasks. Owner decisions made in chat are recorded in `docs/COACHING-DECISIONS.md` (standing merge permission included).

## Acceptance criteria for the handover
- The new supervisor reviews T-001b fix r1 and T-001c within its first hour, and the coder is never left more than 3 hours without a review.
- TASKS, PROJECT_STATE, the Relay dashboard and LOG agree after every review.
- The owner hears from the supervisor only at a layer end, a phase end, or when an owner action is needed.

## Out of scope for the supervisor
Writing product code on the base branch (the coder builds; the supervisor only merges and edits docs and tasks); changing the product definition without the owner; spending money or creating cloud resources; publishing to stores.
