# Supervisor decisions

Judgement calls the plan was silent on. One line each: date · decision · reason.

- 2026-09-26 · Supervisor merges go to the base branch `claude/product-architecture-review-3bl19i` (the handoff's integration branch, which the coder reads TASKS from); the supervisor session branch `claude/life-documentary-supervisor-o4f4kr` is kept identical to it. · The owner authorized the merge in chat; the coder only sees statuses on the base.
- 2026-09-26 · T-002a: "0 at the last millisecond" read as `musicVolumeAt(manifestDurationMs)` = 0. · The task's own formula (linear fade to 0 over the last 1,500 ms) reaches 0 exactly at the end; approved as built.
- 2026-09-26 · T-001d: tooling Vitest config lives at `tooling/vitest.config.ts`, not the repo root as the task said. · Vitest finds configs by walking up folders, so a root config would be picked up by every workspace's own test run (checked in the installed Vitest source).
