# Life Documentary — architecture

The one current picture of how Life Documentary is built and how work flows. The supervisor keeps it current. Product authority: `docs/VISION.md`. Order of work: `docs/architecture/ROADMAP.md`. Reasons: `docs/decisions/DECISIONS.md`. Evidence: `docs/research/`.

## 1. Shape of the system

```
┌──────────────────────────── device (Expo, TypeScript) ────────────────────────────┐
│ Today (question → 10 s answer) · Footage (archive) · Episode (watch, 5 edits)      │
│ Storylines · Cast · Crew · Settings                                                 │
│ SQLite (Drizzle) = the moments, questions, storylines, cast, episodes (views)       │
│ Encrypted file store = originals · Upload queue (multipart, resumable)              │
│ Question engine (pure, deterministic) · Sync (pull/push, LWW)                       │
└───────────────┬───────────────────────────────────────────────────┬───────────────┘
                │ HTTPS (typed by packages/contracts)                │ presigned PUT/GET
┌───────────────▼──────────── Cloudflare ────────────────────────────▼───────────────┐
│ Workers (Hono): auth · sync · uploads · episodes · edits · crew · export · account  │
│ D1: users, documentaries, memberships, moments (metadata), derived text, episodes, │
│     plans, edit ops, seasons, entitlements, cost ledger, change log                │
│ R2: users/{uid}/originals · previews (temporary) · narration · episodes            │
│ Queues: understand · narrate · render · export · delete                            │
│ Workflows: EpisodePipeline (understand → plan → narrate → render → publish)         │
└───────┬────────────────┬────────────────┬────────────────┬────────────────────────┘
        │                │                │                │
   Workers AI        Anthropic        ElevenLabs      Remotion Lambda (AWS)
   Whisper STT    Sonnet 5 plan      Flash TTS        compositions from packages/render
   (audio → text) Haiku 4.5 captions (bridges only)   (plan + media → MP4 + poster)
                  Opus 5.5 season
```

Rules that shape everything:
- **The device is the primary store.** Originals live there, encrypted at rest. The cloud holds previews only while understanding a week, and the clips chosen for an episode.
- **One owner per truth.** Every fact is computed in exactly one place (§6). Screens only show.
- **Contracts first.** Every shape that crosses a boundary (device ↔ API, API ↔ render, API ↔ model) is a versioned Zod schema in `packages/contracts`. Nothing crosses a boundary untyped or unvalidated.
- **Pure story logic is shared.** The question engine, week assembly, plan validation and edit operations are pure TypeScript in `packages/story`, used by both the device and the Workers, tested without a device or a network.
- **No biometrics, anywhere.** No face templates, no voice prints, no mood or age or gender inferred from faces. People are named by the user. This is tested, not just written.
- **Providers are replaceable.** Anthropic, ElevenLabs, Workers AI, Remotion Lambda and RevenueCat are behind adapters in `apps/api/src/providers/` that hold no product policy.

## 2. Repository layout (pnpm workspaces, TypeScript strict everywhere)

```
apps/
  mobile/            Expo SDK 57 app (expo-router, New Architecture, dev-client builds)
  api/               Cloudflare Workers (Hono) + D1 + R2 + Queues + Workflows (wrangler)
packages/
  contracts/         Zod schemas and types: Moment, Question, Storyline, Cast, Episode, EpisodePlan v1,
                     RenderManifest v1, EditOp, Sync protocol, Upload protocol, API DTOs, error codes
  story/             pure engine: question engine, week brief, plan validation, edit ops, recap plan, words
  render/            Remotion project: compositions (TitleCard, Scene, LowerThird, Closing, Captions),
                     fixtures, local render CLI, Lambda deploy scripts
  design/            design tokens (JSON + TS): colours, type, spacing, motion; consumed by mobile and render
tooling/             tsconfig base, eslint, prettier, dependency-cruiser boundary config, scripts
docs/                VISION, architecture, decisions, research (this repo is the single source)
tasks/               TASKS.md queue and task text files (mirrored to the Relay)
.github/workflows/   ci.yml
CLAUDE.md            golden rules for coding agents
```

### `apps/mobile/src` layers

| Folder | Holds | Imports allowed |
|---|---|---|
| `app/` | expo-router routes, composition root, providers, provider wiring | everything |
| `features/<surface>/` | screens and components: `today`, `footage`, `episode`, `storylines`, `cast`, `crew`, `season`, `settings`, `onboarding` | `application`, `domain`, `design-system`, `shared` |
| `application/` | use cases and projections: `captureMoment`, `answerQuestion`, `todayQuestion`, `storylines`, `cast`, `episodes` (views and edit requests), `sync`, `uploads`, `account`, `export` | `data`, `domain`, `shared`, port **types** from `services` |
| `domain/` | pure types and rules specific to the device (re-exports from `packages/contracts` and `packages/story`) | `packages/*`, `shared/lib` |
| `data/` | SQLite via `expo-sqlite` + Drizzle: schema, append-only migrations, repositories, integrity; encrypted file store; upload queue table | `domain`, `shared` |
| `services/` | adapters: API client (typed by contracts), camera, audio recorder, video player, notifications, secure store, background tasks, share, location (place name only), purchases | `domain`, `shared` |
| `design-system/` | tokens (from `packages/design`), primitives (Button, Field, Card, Sheet, TitleCard, Player) | `shared` |
| `shared/` | config (build info), small helpers | nothing |

Nothing imports from `app/`. Only `data/` imports the SQLite driver. Only `services/` imports Expo device modules and the API client. Enforced by `tooling/dependency-cruiser` in CI (task T-001c).

### `apps/api/src` layers

| Folder | Holds |
|---|---|
| `index.ts`, `routes/` | Hono app; routes: `auth`, `sync`, `uploads`, `moments`, `episodes`, `edits`, `crew`, `export`, `account`, `webhooks` (RevenueCat) |
| `auth/` | Better Auth on D1: Sign in with Apple, Google, email magic link; session tokens; device registration |
| `data/` | D1 schema (Drizzle), append-only migrations, repositories, R2 key layout, change log |
| `pipeline/` | Workflows and Queue consumers: `EpisodePipeline`, `SeasonPipeline`, `ExportJob`, `DeleteJob`; each step idempotent and keyed |
| `providers/` | adapters: `anthropic` (plan, captions, season), `workersAi` (STT), `elevenlabs` (TTS), `remotionLambda` (render), `expoPush`, `revenuecat`, `music` (licensed library index) |
| `policy/` | product rules on the server: entitlements and quotas, rate limits, cost caps, retention, what may leave the device |
| `shared/` | env bindings, errors, logging, clock |

Routes call `policy` and `data`; `pipeline` calls `providers` through ports; `providers` hold no product policy.

## 3. Data model (owner per fact; shapes in `packages/contracts`)

| Entity | Fields (essentials) | Owner of the truth |
|---|---|---|
| `User` | id, email, createdAt, region, deletionRequestedAt? | API `auth/` |
| `Documentary` | id, ownerUserId, title, kind `solo` or `shared`, timeZone, episodeDay (default Sunday), episodeHour (default 18), createdAt | API `data/` (created by the device, confirmed by the server) |
| `Membership` | documentaryId, userId, role `owner` or `crew`, joinedAt, leftAt? | API `policy/crew` |
| `Moment` | id (client UUID), documentaryId, authorUserId, capturedAt, timeZone, kind `answer` / `clip` / `photo` / `note`, questionId?, mediaAssetId?, text?, mood?, placeName?, localOnly, storylineIds[], castIds[], updatedAt, deletedAt? | Device `application/captureMoment`; synced with last-write-wins per field |
| `MediaAsset` | id, ownerUserId, kind `video` / `photo` / `audio`, durationMs, width, height, bytes, sha256, localPath, wrappedKey, cloudKey?, uploadState | Device `data/fileStore` and `data/uploadQueue`; the server records `cloudKey` once the multipart completes |
| `Question` | id, templateId, documentaryId, askedOn (local date), storylineId?, text, answeredByMomentId? | Device, from `packages/story/questionEngine` (deterministic) |
| `Storyline` | id, documentaryId, title, openedAt, closedAt?, summary? (server-written after episodes) | Device creates; API writes `summary` |
| `CastMember` | id, documentaryId, name, relation?, createdAt | Device; names typed by the user; no media reference other than manual tags |
| `Derived` | momentId, transcript?, caption?, language, provider, modelVersion, producedAt | API `pipeline/understand` (process then delete) |
| `Episode` | id, documentaryId, number, weekStart, weekEnd, state (`scheduled` → `understanding` → `planning` → `narrating` → `rendering` → `ready`, or `failed`, or `recap`), planVersion, renderVersion, mp4Key?, posterKey?, durationMs?, costCents, deliveredAt? | API `pipeline/EpisodePipeline` |
| `EpisodePlan` | episodeId, version, plan (EpisodePlan v1 JSON), createdBy `model` or `edit` | API; validated by `packages/story/planValidation` |
| `EditOp` | id, episodeId, seq, op `retitle` / `swapLine` / `dropClip` / `closingShot` / `musicMood`, payload, appliedToVersion | Device creates; API applies with `packages/story/editOps` (pure) |
| `Season` | documentaryId, year, state, trailerKey?, filmKey?, premiereAt? | API `pipeline/SeasonPipeline` |
| `Entitlement` | userId, tier `free` / `documentary` / `family`, storageQuotaBytes, crewLimit, source, validUntil | API `policy/entitlements` from RevenueCat webhooks |
| `CostLedger` | episodeId or seasonId, step, provider, units, cents, at | API pipeline steps |
| `ChangeLog` | documentaryId, seq, entity, id, changedAt | API `data/` for sync cursors |
| `UploadJob` (device only) | assetId, state, uploadId, parts (etag per part), bytesDone, attempts, nextAttemptAt | Device `data/uploadQueue` |

Media key layout in R2: `users/{uid}/originals/{assetId}` (kept only when in an episode or Cloud backup is on) · `tmp/{uid}/previews/{assetId}` (lifecycle rule: delete after 2 days; the pipeline deletes sooner) · `users/{uid}/narration/{episodeId}/{n}.mp3` · `users/{uid}/episodes/{episodeId}/v{renderVersion}.mp4` and `poster.jpg` · `users/{uid}/exports/{jobId}.zip` (7 days).

## 4. The story engine

### Question engine (device; `packages/story/questionEngine`)
Inputs: today's local date, open storylines, yesterday's and last week's moments with any synced derived text, anniversaries (moments one year ago), the template bank (≥ 120 templates tagged by context: `open_storyline`, `after_quiet_days`, `anniversary`, `place_first_time`, `person_seen`, `weekday`, `weekend`, `season`), the ids asked in the last 60 days, and a seed. Output: exactly one `Question` for today, deterministic for the same inputs. Rules: never repeat a template within 60 days; prefer an open storyline follow-up on two of seven days; anniversary questions when one exists; fall back to a general template. An optional model-personalised wording arrives later (ROADMAP P7.2) and never changes which template was chosen.

### Week brief (server; `packages/story/weekBrief`)
Pure function from the week's moments, derived text, storylines, cast names, the previous three episode summaries and the questions asked → a compact `WeekBrief` (≤ 15k tokens) for the planner. Media never enters the brief, only text and references.

### Episode plan (server; `providers/anthropic` → `EpisodePlan v1`)
Claude Sonnet 5 with a cached style prefix (the documentary voice, the schema, examples) and structured output. The plan is:

```
EpisodePlan v1
  title, subtitle?, episodeNumber, weekStart, weekEnd
  coldOpen: { momentId, inMs, outMs }                      the best line of the week, user's voice
  scenes[3..5]: { heading, storylineId?, shots[1..6]: { momentId, inMs?, outMs?, kenBurns? },
                  narratorBridge?: { text ≤ 140 chars }, captionsFromTranscript: bool }
  closing: { momentId }
  tease?: { storylineId, text ≤ 100 chars }
  music: { mood: calm|warm|bright|bittersweet|driving, trackId? }
  lowerThirds[]: { momentId, castId, atMs }
  narratorVoiceId, targetDurationMs (120000..240000)
  summary ≤ 400 chars                                      stored on Episode and fed to later briefs
```
Validation (`packages/story/planValidation`): every `momentId` exists in the brief and is not `localOnly`; total duration within bounds; the narrator's total text ≤ 25% of the episode's spoken time (the user's voice is the narration); no scene without a shot. Invalid → one retry with the validation errors; still invalid → the `recap` plan (no narrator, music and titles only) so an episode always arrives.

### Narration (`providers/elevenlabs`)
Only `narratorBridge` and `tease` texts are synthesised. The user's own answers are cut from their recordings. Captions come from transcripts and bridge texts. Voices: a cast of 4 licensed documentary voices; the user's own voice is not offered in release 1.

### Render (`packages/render` on Remotion Lambda)
`RenderManifest v1` = plan + presigned media URLs (15 minutes) + narration URLs + the music track URL + design tokens + captions. Compositions are React components; a fixture manifest renders locally with `npx remotion render` in CI so the visual layer is testable without any cloud. 1080×1920 at 30 fps by default, with a 1920×1080 export.

### Edits (`packages/story/editOps`)
Five operations, each a pure function `(plan, op) → plan'`: `retitle`, `swapLine` (replace a narrator bridge with a user moment, or vice versa), `dropClip`, `closingShot`, `musicMood`. The API appends the op, applies it to the current plan, bumps the version, re-narrates only if a bridge text changed, re-renders, and publishes. Limit: 10 re-renders per episode per day (policy).

### Season (`pipeline/SeasonPipeline`)
Yearly: Claude Opus 5.5 reads the year's episode summaries and plans and writes a `SeasonPlan v1` (chapters over storylines, 8–12 minutes). Trailer in week 51, premiere at the chosen date, share clip (≤ 30 s, 9:16).

## 5. Flows

**Daily.** 08:00 local notification "Today's question". Open → Today screen shows the question → hold to record a 10 s video or voice answer (`services/camera`, `services/audio`) → `captureMoment` writes the file (encrypted) and the row in one transaction, then enqueues an upload unless `localOnly`. Extra clips and photos and a note can be added any time. The widget shows the question until answered, then the answer's still.

**Upload.** `uploadQueue` drains on foreground and via `expo-background-task`: multipart create → presigned part PUTs (5 MB parts) → complete; `uploadId` and ETags persisted so it resumes across restarts; Wi-Fi only for video by default; exponential backoff; the server records `cloudKey`. Free tier: previews and answer audio upload for understanding; full clips upload only when the plan selects them (the pipeline requests them with a push to the device, which uploads on the next drain, deadline Sunday 17:00). Paid tiers with Cloud backup on: everything uploads.

**Sync.** `POST /sync { cursor, changes[] }` → `{ changes[], cursor }`. Client UUIDs; last-write-wins per field on the server clock; tombstones; per-documentary change log. Runs on foreground, after capture, and after a push.

**Episode.** Cron per time-zone bucket at Sunday 15:00 local starts `EpisodePipeline(documentaryId, weekStart)`: understand (STT for answers, captions for photos and one keyframe per clip; delete previews) → request missing full clips → plan → narrate → render → publish (`ready`, push "Episode N is ready", sync). Each step is idempotent on `(episodeId, planVersion)` and writes to the cost ledger. Failure at any step after two attempts → `recap` plan → render → publish; a failure there → `failed` and an alert; the user sees "This week's episode is delayed" with the day it will arrive.

**Watch and edit.** Episode screen streams the MP4 via a short presigned URL (cached on device once watched). Five edit sheets, one tap each; the screen shows "Re-cutting…" and the new version replaces the old when ready.

**Crew.** The owner invites by link (deep link with a one-time code). A crew member's moments join the shared documentary; the owner's device still receives only metadata plus previews for the Footage screen; originals stay with their author unless chosen for an episode. Leaving removes future contributions and offers a takeout of past ones.

**Export and delete.** Settings → Export everything → `ExportJob` zips originals, JSON metadata and episodes to a 7-day link. Delete account → soft delete → `DeleteJob` at day 30 removes D1 rows and R2 prefixes; an R2 lifecycle rule is the backstop. Both also reachable from a public web page for store compliance.

## 6. One owner per truth

| Truth | Owner |
|---|---|
| Today's question | `packages/story/questionEngine` (device) |
| A moment and its media | `apps/mobile/src/application/captureMoment` writes; `data/fileStore` encrypts; sync copies metadata |
| What may leave the device | `packages/story/leavesDevice(moment, entitlement)` (device and server run the same function) |
| Upload state | `apps/mobile/src/data/uploadQueue` |
| Derived text | `apps/api/src/pipeline/understand` |
| The week's brief | `packages/story/weekBrief` |
| The episode plan | `apps/api/src/pipeline/plan` via `providers/anthropic`, validated by `packages/story/planValidation` |
| Edits | `packages/story/editOps` applied by `apps/api/src/routes/edits` |
| What the episode looks like | `packages/render` compositions with `packages/design` tokens |
| Episode state | `apps/api/src/pipeline/EpisodePipeline` |
| Entitlement, quota, crew limit | `apps/api/src/policy/entitlements` |
| Cost per episode | `CostLedger` rows written by pipeline steps; totals by `apps/api/src/policy/costs` |
| Words on screen | `packages/story/words` (plain, warm, documentary tone; one file, tested for banned words like "streak") |
| Appearance | `packages/design` tokens; the app and the render read the same file |

## 7. Invariants (tested, not just written)

- No biometrics: no dependency in the face or voice-print category; a boundary test lists banned packages and a code search forbids `faceDetect`, `FaceDetector`, `speakerId`, `voiceprint`.
- `localOnly` moments never appear in `UploadJob`, `WeekBrief`, or any request body (tested on device and server).
- Every boundary payload is validated with the contracts schema on both sides.
- Only `data/` imports the SQLite driver; only `services/` imports Expo device modules; only `providers/` imports vendor SDKs; `features/` never imports `data/` or `services/`.
- Append-only migrations on device and D1; a stored-shape change needs a new schema version and a migration test.
- Every pipeline step is idempotent on its key and writes a cost ledger row.
- The narrator's text never exceeds 25% of an episode's spoken time.
- No secrets in the client; all vendor calls go through the Workers.
- Presigned URLs live ≤ 15 minutes and are scoped to the requesting user's prefix.
- Words never contain "streak", "badge", "level up" or exclamation marks in system messages.
- Every episode export carries the "AI-narrated" credit and metadata flag.

## 8. Environments, secrets, owner-only actions

| Need | Who | When |
|---|---|---|
| Cloudflare account with Workers Paid, R2, D1, Queues, Workflows; a wrangler API token for CI deploys | Owner | Before Prove (P-B) |
| Apple Developer Program, Google Play Console, EAS account | Owner | Before the first device build (Prove) |
| Anthropic API key, ElevenLabs API key | Owner | Before P12 and P14 |
| AWS account for Remotion Lambda (or the decision to use Containers) | Owner | Before P15.2 |
| RevenueCat project and store products | Owner | Before P23 |
| Music licence for the mood library | Owner | Before public release; CC0 fixtures until then |
| A real iPhone and Android phone for capture and upload checks | Owner | Prove, P5, P6, P20 |

Local development needs none of these: `wrangler dev` (Miniflare) for the API, an Expo dev client on a simulator for screens (camera and background tasks need a device), `npx remotion studio` for compositions, fixture responses for the model providers.

## 9. Quality gates

- CI on every PR and on `main`: install → typecheck (all workspaces) → lint → boundaries → unit tests (Vitest for `packages/*` and `apps/api` with the Workers pool; Jest with `jest-expo` and React Native Testing Library for `apps/mobile`) → `wrangler deploy --dry-run` → render a 15-second fixture episode with Remotion and upload it as an artifact.
- Planner evaluation set: 20 fixture weeks with required properties (valid plan, user voice ≥ 75% of spoken time, no `localOnly` moment, title not generic, cold open is an answer). Run on every prompt or model change, not on every CI run; results recorded in `docs/architecture/EVALS.md` when it exists.
- Device checks (owner or Maestro on a device farm later): capture, background upload resume, notification, widget, episode playback; recorded as unverified until evidence exists.
- Release: `main` with green CI is GOLDEN; EAS builds from tags; store submission by the owner.

## 10. Costs to watch

| Item | Estimate | Cap |
|---|---|---|
| Episode (weekly) | $0.30–0.65 median with library music | Alert at $1.00 per episode; refuse generative extras above tier budget |
| Storage per paying user | 2.4 GB after a year ≈ $0.04/month | Quota by tier (50 GB / 300 GB) |
| Season film | ≈ $2–4 (Opus 5.5 plan, 10 minutes of render and narration) | Once a year per documentary |
| Infra at 10k users | under $1k/month excluding AI | Reviewed monthly |
