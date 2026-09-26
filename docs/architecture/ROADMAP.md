# Life Documentary — roadmap

Gated order of work. A phase begins only after the phases it needs are done (merged, green CI, reviewed). Each phase is split into tasks in `tasks/TASKS.md` when it is next. Product authority: `docs/VISION.md`. Structure: `docs/architecture/ARCHITECTURE.md`.

Release stages (Relay dashboard): **Define** (this document exists) → **Prove** (P-A, P-B) → **Build** (P1–P21) → **Integrate** (P22–P25) → **Release candidate** (P26) → **Released**.

## Prove: the riskiest assumptions first

| Phase | Proves | Needs | Done when |
|---|---|---|---|
| **P-A Render proof** | A Remotion composition renders a 30 s episode from a fixture `RenderManifest v1` (two clips, one photo with Ken Burns, one narrator bridge, captions, a title card, a music bed) locally and in CI, in under 3 minutes on the runner. | Repo shell (P1a) | MP4 artifact on CI; visual check by the supervisor |
| **P-B Capture and upload proof** | On a real iPhone and Android phone, the dev client records a 10 s clip, encrypts it, and completes a resumable multipart upload to R2 that survives killing the app mid-upload. | P1, owner: Cloudflare, EAS, device | Owner records the check; upload time and failure notes in DECISIONS |

If P-A fails, the render moves to plain FFmpeg templates on Containers. If P-B fails on iOS background behaviour, uploads become foreground-with-resume and the product copy says so.

## Build

### Block A — Foundation (P1–P6)
| Phase | Scope | Needs |
|---|---|---|
| **P1 Repo shell** | pnpm workspaces; `apps/mobile` (Expo SDK 57, expo-router, TypeScript strict), `apps/api` (Hono on Workers, wrangler, D1, R2, Queues bindings), `packages/contracts`, `packages/story`, `packages/render`, `packages/design`; eslint, prettier, dependency-cruiser boundaries; Vitest and Jest set up; CI (`install → typecheck → lint → boundaries → tests → dry-run deploy → fixture render`); `CLAUDE.md`; README with verified commands. No product features. | — |
| **P2 Design system and motion** | Per `docs/design/DESIGN.md`: colour, type (Instrument Serif + Inter), motion, haptic and texture tokens in `packages/design`; fonts loaded; primitives (Text, Button with press and Text Morph, Field, Surface, Tray shell); motion components Title Card, Dissolve, Grain and Breath, and the reduced-motion hook; a Design Lab route that shows every token and motion; the same tokens and fonts in `packages/render`. Accessibility baseline (WCAG 2.2 AA). Premiere, Letterbox, Filmstrip, Tray detents and Record are built with the screens that use them (P5, P10, P16). | P1 |
| **P3 Local store** | SQLite schema v1 on expo-sqlite (D32); append-only migrations with a harness; repositories for Moment, MediaAsset, Question, Storyline, CastMember, Episode (view), UploadJob; integrity check; encrypted file store (AES-256-GCM via expo-crypto, per-file keys wrapped by a Keychain master key, D33). | P1 |
| **P4 Account** | Better Auth on Workers + D1; Sign in with Apple, Google, email magic link; session in secure store; device registration; account deletion request (in-app and web page); the `User` and `Documentary` rows; the first sync handshake. | P1, P3 |
| **P5 Capture** | Today screen with a placeholder question; hold-to-record 10 s video or voice; photo; clip or photo from the library; text note; mood; place name (opt-in); trim and compress on device; `captureMoment` writes file and row atomically; `localOnly` flag. | P2, P3 |
| **P6 Upload queue and sync** | Multipart resumable upload to R2 through presigned part URLs; background drain; Wi-Fi rule; `POST /sync` with cursor, last-write-wins, tombstones, change log; `leavesDevice` shared rule; the Footage screen lists moments by day and plays them. | P4, P5 |

### Block B — The interview (P7–P10)
| Phase | Scope | Needs |
|---|---|---|
| **P7 Question engine** | Template bank (≥ 120, tagged); deterministic selection; 60-day no-repeat; storyline follow-ups; anniversaries; tests over a simulated year. P7.2 (later): model-personalised wording that never changes the chosen template. | P3 |
| **P8 Storylines and cast** | Create, name, open, close storylines; tag moments; cast members with names and relations; screens; the question engine reads open storylines. | P5, P7 |
| **P9 Daily loop** | Expo push registration; server push for the daily question and the finished episode; local scheduled fallback; notification settings; quiet days handled without shame words. | P4, P7 |
| **P10 Footage** | Archive by day and by storyline; playback; edit note, mood, tags; delete a moment (tombstone, file removed); "one year ago today" surface. | P6, P8 |

### Block C — The story engine (P11–P16)
| Phase | Scope | Needs |
|---|---|---|
| **P11 Contracts** | `EpisodePlan v1`, `RenderManifest v1`, `WeekBrief`, `EditOp`, `Derived`, `Episode` in `packages/contracts`; `planValidation`, `weekBrief`, `recapPlan` in `packages/story`; fixtures: 20 weeks of synthetic moments. | P1 |
| **P12 Understanding** | `EpisodePipeline` step 1 on Workflows: Whisper STT (Workers AI) for answers; Haiku 4.5 batch captions for photos and one keyframe per clip; previews deleted after; `Derived` rows synced down; cost ledger rows. | P6, P11, owner: Anthropic key |
| **P13 Planner** | Sonnet 5 structured output with cached style prefix → `EpisodePlan v1`; validation and retry; recap fallback; the evaluation set and its runner; `Episode.summary`. | P11, P12 |
| **P14 Narration** | ElevenLabs Flash for bridges and tease; 4 narrator voices; caption track built from transcripts and bridges; 25% narrator cap enforced. | P13, owner: ElevenLabs key |
| **P15 Render** | Compositions: TitleCard, Scene (video, photo with Ken Burns), LowerThird, Captions, Closing, Tease; music bed with ducking under speech; 9:16 and 16:9; P15.1 local and CI fixture render (extends P-A); P15.2 Remotion Lambda deploy and the `remotionLambda` provider. | P2, P11, P14, owner: AWS |
| **P16 Delivery** | Cron per time-zone bucket; full `EpisodePipeline` (understand → request clips → plan → narrate → render → publish); Episode screen (stream, cache, captions on); push "Episode N is ready"; delayed-episode state; SLO metrics. | P9, P12–P15 |

### Block D — Authorship and crew (P17–P21)
| Phase | Scope | Needs |
|---|---|---|
| **P17 Edits** | Five one-tap edits; `editOps` pure functions; edit sheets; re-narrate only when needed; re-render; version replacement; 10-per-day limit. | P16 |
| **P18 Monthly recap** | Free-tier monthly 60 s recap (no narrator, music and titles) from the `recapPlan`; recap card (storylines moved, people seen most, best line). | P16 |
| **P19 Crew** | Shared documentary; invite link with one-time code; roles; crew moments in the week brief; leaving with takeout; consent screen per shared documentary. | P16, P10 |
| **P20 Widgets** | iOS home-screen widget and Live Activity (`expo-widgets`); Android widget (`react-native-android-widget`): today's question, last still, one year ago. | P9, P10, owner: device |
| **P21 Export and deletion** | `ExportJob` zip to a 7-day link; `DeleteJob` at day 30; R2 lifecycle backstop; public web page for export and deletion; survivability text. | P6, P16 |

## Integrate

| Phase | Scope | Needs |
|---|---|---|
| **P22 Season** | `SeasonPlan v1` with Opus 5.5; chapters over storylines; trailer in week 51; premiere date and poster; share clip; Season screen. | P17, P18 |
| **P23 Monetisation** | RevenueCat SDK and webhooks; tiers Free, Documentary, Family; storage quotas and crew limits enforced in `policy`; paywall copy that never gates what was free. | P16, P19, P21, owner: RevenueCat, store products |
| **P24 Privacy and compliance** | Privacy Nutrition Label; `PrivacyInfo.xcprivacy`; Play Data safety; permission strings; AI-narrated credit and metadata on exports; privacy policy and terms with sub-processors; no-training clauses checked against vendor terms. | P21 |
| **P25 Observability and cost** | Structured logs; error tracking on device and Workers; per-episode cost ledger totals and alerts; delivery SLO dashboard; provider outage behaviour verified. | P16 |

## Release candidate

| Phase | Scope | Needs |
|---|---|---|
| **P26 Release hardening** | Full regression; device journey on iPhone and Android (capture → upload → episode → edit → share → export → delete); store listing; staged rollout plan; recovery procedure; `main` tagged; EAS production builds; store submission by the owner. | P22–P25 |

## Later (not scheduled)
Legacy: printed season book; gifted interviewer plan for a parent. On-device STT (iOS SpeechAnalyzer) to keep audio off the server. Model-personalised question wording (P7.2). Generative music as a premium toggle once licensing and cost are known. Web viewer for episodes.

## Sequencing rules
- Never jump ahead for an exciting feature. A phase starts when its needs are done.
- The solo loop (P1–P18) ships before crew (P19) is widened, so the habit is proven on one person first.
- Each phase ends with a supervisor review of the built behaviour against `docs/VISION.md` §3, not only against the task text.
