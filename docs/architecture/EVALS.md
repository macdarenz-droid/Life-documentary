# Evaluations

How we judge the model steps before a change to a prompt, a model or a setting ships. Each evaluation runs on demand, never in `pnpm test` or CI, because it calls a paid model.

## The planner (P13, D39)

**What it runs.** The real planner (`planOnce`, the same function the pipeline uses, retry included) over the 20 fixture weeks in `@life/story/fixtures`. Each week is briefed with `weekBrief` as a first episode with no earlier summaries. Only weeks that `planEligibility` sends to the model get a call. The others are checked for getting none.

**What it checks, per week.** The scoring lives in `apps/api/src/pipeline/plan/evalReport.ts`, and each property comes from `planProperties` in `packages/story`:

| Property | Why |
|---|---|
| `valid` | The plan passes `validatePlan` in model mode, so the renderer can play it. |
| `userVoiceShare` | The person's own voice carries the episode. The narrator stays well under a quarter of the speaking time (VISION). |
| `coldOpenIsAnswer` | An episode opens on one of the person's answers. |
| `momentsFromBrief` | Every moment the plan uses is one from this week. Nothing is invented (rule 10). |
| `titleNotGeneric` | The title says what the week was about. "My week" or "Week 12" doesn't. |
| `noCopiedWords` | No bridge or tease repeats five or more of the person's words in a row. Their words stay theirs. |
| `voiceClean` | The plan's words follow DESIGN §8: no banned phrases or characters, and no digits in what the narrator says. |

The report also gives each week's outcome (`model`, `invalid`, `refused` or `none`), the number of answered calls, the tokens and the cost in µUSD.

**The pass rule.** A week the model should plan passes when it got a model plan with every property true and `userVoiceShare` of at least 0.75. A recap week (media but not enough for the model) passes when the model was not called. An empty week (no answer, clip or photo) passes when nothing was done.

**How to run it.** With `ANTHROPIC_API_KEY` set:

```
pnpm --filter @life/api eval:planner
```

Options come from environment variables, because Vitest refuses unknown command-line flags:

- `PLAN_EFFORT`: `low`, `medium` or `high` (default: the value in `apps/api/src/pipeline/plan/settings.ts`).
- `EVAL_WEEK`: one fixture week by its number, 1 to 20.

It prints a Markdown table with one row per week and a totals line (weeks passed, total µUSD). Without the key it prints `Skipped: ANTHROPIC_API_KEY is not set.` and exits 0.

**Results.** The supervisor records each run here.

| Date | Model | Effort | Weeks passed | Total µUSD | Notes |
|---|---|---|---|---|---|
| not run yet: needs the owner's key | | | | | |
