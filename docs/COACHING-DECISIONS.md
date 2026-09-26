# Supervisor decisions

Judgement calls the plan was silent on. One line each: date · decision · reason.

- 2026-09-26 · Supervisor merges go to the base branch `claude/product-architecture-review-3bl19i` (the handoff's integration branch, which the coder reads TASKS from); the supervisor session branch `claude/life-documentary-supervisor-o4f4kr` is kept identical to it. · The owner authorized the merge in chat; the coder only sees statuses on the base.
- 2026-09-26 · T-002a: "0 at the last millisecond" read as `musicVolumeAt(manifestDurationMs)` = 0. · The task's own formula (linear fade to 0 over the last 1,500 ms) reaches 0 exactly at the end; approved as built.
- 2026-09-26 · T-001d: tooling Vitest config lives at `tooling/vitest.config.ts`, not the repo root as the task said. · Vitest finds configs by walking up folders, so a root config would be picked up by every workspace's own test run (checked in the installed Vitest source).
- 2026-09-26 · Standing owner authorization: the supervisor merges every reviewed and approved coder commit into the base (`--no-ff`) without asking each time. · Owner, in chat: "And in the future merges".
- 2026-09-26 · T-002b approved although the fixture `clip.mp4` (3 s) is shorter than the 4 s first shot and the `inMs 1000` + 3 s third shot, so the clip's last frame holds for 1 s. · The mismatch is in the task's own fixture spec; the render proof (size, duration, audio, timing) is unaffected. Real footage will have its own length checks in P10.
- 2026-09-26 · T-003b field focus ring animates colour, not only transform/opacity. · T-003b's text asks for exactly that (colour change over `duration.micro`); a colour fade is already the reduced-motion form, so no separate path is required.
- 2026-09-26 · Coder session replaced: it hit its usage limit at 14:03 UTC with ~380k tokens of context (D28 says replace past ~250k). · The loop cannot restart itself after a failed turn; a fresh session from `tasks/CODER_PROMPT.md` continues the queue.
