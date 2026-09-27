# Life Documentary — decisions

One file. Each decision has an id, a date, who decided, what, and why. Later decisions can replace earlier ones; the replaced one gets a "replaced by" note and stays. Evidence lives in `docs/research/`.

## D1 · 2026-09-26 · supervisor · The product is a story engine with a daily interview
Life Documentary turns a person's ordinary days into weekly narrated episodes and a yearly film. Not a camera app, not a journal, not a photo library. Why: nobody narrates a life across years (research §1); the closest product (1SE) has no story; Retro's founder states the demand ("people do less with their photos than ever"). The owner has not yet confirmed the definition; it stands until corrected.

## D2 · 2026-09-26 · supervisor · Weekly episode, never a daily streak
The unit of success is the Sunday episode. A missed day is a quiet day. Why: BeReal's daily obligation burned out; Retro and Locket retain on weekly rhythms; journaling is emotionally heavier than a lesson, so loss-aversion loops are wrong here. Words "streak", "badge", "level up" are banned in `packages/story/words` and tested.

## D3 · 2026-09-26 · supervisor · The user's voice is the narration
Recorded answers are the spine of every episode; the AI narrator writes only bridges and the tease, capped at 25% of spoken time, enforced by `planValidation`. Why: Remento's users love the real voice and dislike the AI paraphrase.

## D4 · 2026-09-26 · supervisor · No generative video for content
The user's footage is the content. Generative clips cost $0.50–7.50 per 10 s and would exceed the subscription. Possible later premium B-roll only.

## D5 · 2026-09-26 · supervisor · No biometrics, anywhere
No face templates, voice prints, or traits inferred from faces or voices, on device or server. People are named by the user. Why: Illinois BIPA damages of $1,000–5,000 per violation and live class actions against Apple and Google; EU AI Act biometric rules; COPPA counts faceprints as personal data; the product does not need them. Enforced by a boundary test.

## D6 · 2026-09-26 · supervisor · Expo (React Native) for the client
Why: TypeScript and React carry over from the owner's Kairos project; config plugins avoid hand-edited native projects; EAS is CLI-driven, which suits coding agents; `expo-camera`, `expo-audio`, `expo-video`, `expo-sqlite`, `expo-background-task` cover release 1. Capacitor cannot record video on web and iOS PWAs have no background sync; native Swift and Kotlin would double the codebase for a small team; Flutter is a second language with no reuse. Dev-client builds from day one (no Expo Go).

## D7 · 2026-09-26 · supervisor · No on-device video assembly
FFmpegKit binaries were withdrawn (Apr 2025) and the project archived (Jul 2026); its successor is source-only with LGPL/GPL and codec patent exposure. The device only trims and compresses (platform APIs). Episodes render in the cloud.

## D8 · 2026-09-26 · supervisor · Cloudflare for the backend
Workers (Hono), R2, D1, Queues, Workflows, later Containers. Why: the owner already operates Workers; R2 has zero egress, which is the dominant cost for a media product (≈ $360/month at 10k users vs $826–2,100 elsewhere); Workflows fit the multi-step episode pipeline. D1 over Postgres for release 1 because the data is per-documentary and small; PowerSync and Postgres are the upgrade path if sync needs grow. Condition to revisit: D1 limits (database size, write throughput) hit before 100k users.

## D9 · 2026-09-26 · supervisor · Remotion for rendering, Lambda first
Compositions are React components in the team's language, and Remotion ships an official Claude Code plugin and agent skills, so the coder can build them. Remotion Lambda renders a 3-minute episode for about $0.05–0.06 in about a minute. Licence is free while the company has ≤ 3 people; at 4+ it is $0.01 per render with a $100/month minimum, which is accepted. Cloudflare Containers running `@remotion/renderer` is the later move once headless Chrome memory is verified there. Fallback if P-A fails: FFmpeg templates on Containers.

## D10 · 2026-09-26 · supervisor · Claude Sonnet 5 plans the episode; Haiku 4.5 captions; Opus 5.5 plans the season
Structured outputs with a Zod schema and a cached style prefix. Costs about $0.03–0.05 per episode script and $0.65–1.30 per 1,000 captions. Anthropic does not train on API data by default and image inputs are ephemeral (to be re-checked against the Commercial Terms before the privacy policy is published). Claude declines to identify people in images, which fits D5.

## D11 · 2026-09-26 · supervisor · Speech-to-text on Workers AI first, on device later
Workers AI Whisper large-v3-turbo costs $0.0005 per audio minute and keeps a single vendor. Voice answers are ≤ 60 s. iOS 26 SpeechAnalyzer and `whisper.rn` are the later step that keeps audio off the server entirely.

## D12 · 2026-09-26 · supervisor · ElevenLabs Flash for narrator bridges; no voice cloning in release 1
About $0.05 per 1k characters; bridges are short. Voice cloning needs recorded consent from the account holder and is never offered for people who appear in clips; it is out of release 1 scope.

## D13 · 2026-09-26 · supervisor · Licensed library music, not generated music
A curated 40–60 track mood library (licence is an owner action; CC0 fixtures until then). Generated music: Suno has no public API and active litigation; ElevenLabs Music at $0.15/min would add ≈ $0.45 per episode. Revisit as a premium toggle once unit economics are measured.

## D14 · 2026-09-26 · supervisor · Device is the primary store; previews process-then-delete; full clips only when chosen
Originals stay on the device, encrypted at rest with per-file keys wrapped by a Keychain master key. To understand a week the server receives downsampled previews and short answer audio in a `tmp/` prefix with a 2-day lifecycle rule, and deletes them when derived text is written. Full clips upload only when the plan selects them (free tier) or when Cloud backup is on (paid). Why: trust research §5; storage cost; Lapse and Snapchat.

## D15 · 2026-09-26 · supervisor · One shared rule decides what leaves the device
`packages/story/leavesDevice(moment, entitlement)` runs on the device (before enqueueing) and on the server (before accepting). `localOnly` moments never leave. Tested on both sides.

## D16 · 2026-09-26 · supervisor · Sync is pull/push with last-write-wins per field
Client UUIDs, server timestamps, tombstones, per-documentary change log. Moments are single-writer, episodes are server artefacts, edits are an append-only op log. No CRDTs. (D37: per row in v1, per field with crew in P19.)

## D17 · 2026-09-26 · supervisor · Better Auth on Workers and D1 for accounts
Sign in with Apple (required once any third-party login exists on iOS), Google, and email (a six-digit code since D36; first written as a magic link). Why: keeps auth on the same vendor and database; open source. To be proven in P4; fallback is Supabase Auth with D1 kept for product data.

## D18 · 2026-09-26 · supervisor · Two test runners
Vitest for `packages/*` and `apps/api` (with the Cloudflare Workers pool); Jest with `jest-expo` and React Native Testing Library for `apps/mobile`. Why: React Native component testing is only reliable on Jest; pure packages and Workers test faster on Vitest. Maestro for device journeys later.

## D19 · 2026-09-26 · supervisor · Pricing and tiers (working assumption; owner decides)
Free: capture, interview, archive, monthly recap, export. Documentary $4.99/month or $39.99/year. Family $69.99/year for 6. Legacy later at $99–149. Nothing free ever becomes paid; storage is tiered from day one; never ads. Why: research §6.

## D20 · 2026-09-26 · supervisor · An episode always arrives
Any failure after two attempts at understand, plan, narrate or render falls back to the `recapPlan` (titles, music, the footage, no narrator). Only a render failure of the recap marks the episode `failed`, alerts, and shows a dated delay. Why: the weekly delivery is the habit; a missing Sunday breaks it.

## D21 · 2026-09-26 · supervisor · Words are one owned file
All user-facing strings live in `packages/story/words` with a test for banned words and for the documentary tone rules (no exclamation marks in system messages, no gamification words). Plain, warm, specific.

## D22 · 2026-09-26 · supervisor · Solo loop before crew
P1–P18 ship and are reviewed before P19 (crew) widens the product. Why: the habit must be proven on one person; Lapse shows that a social layer added before the core loop is proven becomes a cost.

## D23 · 2026-09-26 · supervisor · The repo is the single source for docs; the Relay mirrors them
The owner said the repository is fresh and is this product's home. `docs/` in the repo is authoritative; the same files are written to the Relay so agents without repo access can read them. Tasks: `tasks/TASKS.md` in the repo is the queue; the Relay copy is updated when statuses change.

## D24 · 2026-09-26 · supervisor · Prove before Build
Two proofs run before feature work: P-A (Remotion fixture render in CI) and P-B (real-device capture and resumable upload to R2). Why: the render and the iOS background upload are the two assumptions most likely to be wrong (stack research §8).

## D25 · 2026-09-26 · supervisor · Toolchain pins (checked against the npm registry on 2026-09-26)
Node 22 LTS (`.nvmrc` `22`), pnpm 10, Expo SDK 57 (`expo@57`, the current `latest`; research mentioned SDK 55, which is two releases old), TypeScript `~6.0.3`, Vitest `~4.1.11`, Zod 4, Hono 4, wrangler 4, Remotion 4, Drizzle ORM 0.45 with drizzle-kit 0.31 (device part superseded by D32). Why TypeScript 6 and not 7: `typescript-eslint` 8.70 supports TypeScript `<6.1.0` only; TypeScript 7 is the native port and lint would break. Why Vitest 4 and not 5: `@cloudflare/vitest-pool-workers` 0.22 needs `vitest ^4.1.0`. pnpm uses `node-linker=hoisted` so React Native and Metro resolve packages the classic way. Revisit when typescript-eslint and the Workers pool support the newer majors.

## D26 · 2026-09-26 · supervisor · Placeholder app identifiers
`com.macdarenz.lifedocumentary` for the iOS bundle id and Android package, scheme `lifedocumentary`. Why: a store build needs a stable id and the owner's GitHub name is the only verified handle. The owner may change it before the first store build (P-B); after the first store upload it is permanent.

## D27 · 2026-09-26 · supervisor · How the coder reports without a Relay link
The Relay project has no coder link yet. The coder reports on its own draft PR (one PR comment per result, same format as a Relay message) and writes nothing in the Relay. The supervisor reviews on GitHub, updates `tasks/TASKS.md` on the base branch, and mirrors state to the Relay dashboard, PROJECT_STATE and LOG. If the owner creates a coder link later, the coder switches to posting in the Relay `tasks/` folder.

## D28 · 2026-09-26 · supervisor · Coder model and loop
The coder runs as its own cloud session on Opus 5.5 at medium effort (the owner's standing rule for coders in the Kairos project), started from `tasks/CODER_PROMPT.md`, with a self-paced `send_later` loop. It is replaced in a new session when its context passes about 250,000 tokens, only between tasks. The supervisor stays on the strongest available model for design and review.

## D29 · 2026-09-26 · owner request, supervisor design · Premium cinematic design direction
Owner: "I want use premium websites for the design. Smooth transitions rather than generic Figma templates." Decided: `docs/design/DESIGN.md`. Cinema references (Apple TV, Severance titles, A24, MUBI, Linear, Family, Retro), springs for spatial motion with Material 3 spatial stiffness at damping ratio 0.9 (no bounce, documentary tone), curves only for opacity and colour, interruptible gesture-driven transitions, restraint by frequency, nine named signature transitions each with a reduced-motion path. Why: these are the techniques that separate premium motion from template motion (Apple WWDC23, Material 3, Rauno Freiberg, Emil Kowalski, Family); evidence in `docs/research/DESIGN_RESEARCH.md`.

## D30 · 2026-09-26 · supervisor · Motion libraries at Expo SDK 57 pins
Reanimated 4.5.1 (CSS-style transitions and springs), Gesture Handler ~2.32 (not v3: a major upgrade), Skia 2.6.2 (grain, blur, masks on hero surfaces only), expo-image, expo-haptics, FlashList 2.0.2. No Moti (unmaintained since January 2025), no Lottie or Rive mascots. The premiere zoom uses expo-router `Link.AppleZoom` (alpha, iOS 18+) behind one `PremiereLink` component with a fade-through fallback, because shared-element transitions are still experimental.

## D31 · 2026-09-26 · supervisor · Typography: Instrument Serif and Inter now, GT Sectra and Söhne as a paid upgrade
Both open fonts are OFL and free in apps; Instrument Serif is a condensed display serif made for large sizes, which carries the "huge and quiet" title style; Inter at 400/600 only for UI (MUBI's two-weight discipline). The paid pairing needs app licences priced per foundry and is an owner decision.

## D32 · 2026-09-26 · supervisor · Device store: expo-sqlite with hand-written migrations, no ORM on the device
The device uses `expo-sqlite` behind a small `SqlDriver` port, an append-only list of SQL migrations applied in exclusive transactions (tracked in `schema_migrations` with checksums and in `PRAGMA user_version`), and repositories that parse every row with its `packages/contracts` schema. Why: Drizzle 0.45's Expo driver is synchronous (it blocks the JS thread), its migrations need a Babel inline-import plugin and a Metro `sql` extension, Drizzle's Expo guide now points at the 1.0 release candidate, and the Zod parse already gives typed rows. The same repositories run in Jest on a `better-sqlite3` adapter, so migrations and queries are tested without a device. Drizzle stays an option for D1 (decided with P4). Supersedes the device part of D25's Drizzle pin.

## D33 · 2026-09-26 · supervisor · File encryption with expo-crypto AES-256-GCM in chunks; no SQLCipher in v1
Originals are encrypted with a random 256-bit key per file, AES-256-GCM in 1 MiB chunks with a fresh nonce per chunk and the asset id, chunk index and final flag as associated data (so reordering and truncation are detected); the file key is wrapped by a 32-byte master key in `expo-secure-store` (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, no biometric prompt, because background uploads need it). Why expo-crypto instead of libsodium: it ships in SDK 57 with AES-GCM since SDK 55 and needs no extra native module; `react-native-libsodium` and `react-native-quick-crypto` are unverified on React Native 0.86. The SQLite file itself relies on the platform's file protection in v1 (it holds metadata, not media); SQLCipher (`useSQLCipher`, dev build only) is reconsidered in P24 compliance. Device performance for a 50 MB clip and Keychain behaviour across reinstall are checked in P-B.

## D34 · 2026-09-26 · supervisor · Uploads go through the Worker in parts; no presigned R2 URLs in v1
The device uploads each 5 MiB part with an authenticated `PUT /uploads/:id/parts/:n` that the Worker streams into the R2 binding's multipart upload (`createMultipartUpload`, `uploadPart`, `complete`). Why: presigned part URLs need R2 S3 API credentials (an owner-managed secret to issue and rotate); streaming a request body into R2 is I/O, not CPU time, and a 5 MiB part is far below the 100 MB request limit; the whole path runs in the local Workers test pool. Revisit presigned URLs only if Worker egress or duration costs show up in the cost ledger. Supersedes "presigned part PUTs" in ARCHITECTURE §5.

## D35 · 2026-09-26 · supervisor · Capture keeps originals as recorded; no on-device trim or compression in P5
Answers are capped at 10 s when they are recorded (`recordAsync({ maxDuration })`, `record({ forDuration })`); library clips up to 60 s are accepted as they are and longer ones are refused with a plain line. Why: `expo-image-picker` does not trim library videos, `expo-video` has no export API, `ffmpeg-kit-react-native` is deprecated, and `react-native-compressor` 2.0.3 is Nitro-based and unverified on React Native 0.86. Downsampled previews for understanding are made when uploading (P6), where their size matters; the originals stay on the device (D14).

## D36 · 2026-09-27 · supervisor · Email sign-in by a six-digit code; UUID user ids; auth built per request
Better Auth's `emailOTP` plugin (6 digits, 5 minutes, 3 attempts, stored hashed) replaces the magic link, because a code works when the mail is opened on another device and needs no hand-off of a browser cookie into the app. `advanced.database.generateId: 'uuid'` keeps user ids in the contracts' `Uuid`; `advanced.database.validateSchema: false` and the Drizzle adapter's `transaction: false` fit D1 (no system-table reads, no interactive transactions); the auth instance is built per request from `env`. Mail goes through a `MailSender` port with a recording sender for tests and `wrangler dev`; the real vendor is chosen with the owner's account. Checked against better-auth 1.7.6 and @better-auth/expo 1.7.6 type declarations on 2026-09-27.

## D37 · 2026-09-27 · supervisor · Sync is last-write-wins per row in v1; P6 uploads only answers and photo previews
Each synced row carries `updatedAt`; the server keeps an incoming row only when it is newer (ties keep the stored row). With one writer per documentary until crew (P19) this equals per-field merge; P19 revisits it. Device-only fields (`localPath`, `wrappedKey`, poster fields) never leave the phone; the server stores a moment's storyline and cast ids as JSON arrays. What leaves is decided by `leavesDevice(moment, { cloudBackup })` on both sides: `localOnly` → nothing (not even the row); answers upload as recorded (10 s, needed for the transcript); photos upload a 1,000 px preview; library clips upload nothing until a later phase asks; originals only with Cloud backup (P23). Upload parts go to `PUT /uploads/:assetId/:purpose/parts/:n` (D34 with the purpose in the path). One phone holds a documentary's media in v1: another phone of the same account syncs rows but skips moments whose media it does not have. Video waits for Wi-Fi.

## D38 · 2026-09-27 · supervisor · Understanding a week: Whisper per answer, Haiku captions in a batch, phone-made keyframes, working copies deleted after the run
Step 1 of `EpisodePipeline` (a Cloudflare Workflow, one instance per documentary and week) reads only what `leavesDevice` allows and what the phone has uploaded. Each answer is transcribed by Workers AI `@cf/openai/whisper-large-v3-turbo` from the working copy streamed out of R2 (about $0.0001 for 10 s). Which containers Workers AI accepts is undocumented, so a real `.m4a` and `.mov` answer are checked at deploy before this is relied on. Photo previews and video keyframes are captioned by Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, one constant; retirement is "not sooner than 15 October 2026") through the Message Batches API at half price (about $0.0007 a caption). The run waits up to 2 hours for the batches, cancels the rest and goes on without what is missing (D20 still applies to real failures); a batch is sent once, never retried by the Workflow, and each batch carries at most 12 MB of images so its request fits a Worker's memory. The phone makes the keyframe (the middle frame, 1,000 px JPEG) because a Worker cannot decode video. Library clips now send that keyframe, and video answers send it beside their sound. Working copies live under `tmp/` (R2 lifecycle rules match by prefix only), and a working copy never sets the asset's `cloudKey`. The lifecycle backstop becomes 9 days instead of D14's 2, because the run reads a whole week once, on Sunday (a daily run from P16 could shrink it again). They are deleted when the run ends, and the batch is deleted at Anthropic after its results are read, because batches keep inputs for 29 days and are not zero-retention. Captions follow rule 7: the prompt says "a person" and never guesses who, age, gender or feelings, and a caption that still uses such a word is dropped rather than kept. Derived rows (one per moment and provider) sync down only, and the phone shows an answer's transcript in the viewer. Costs go to a ledger in integer micro-dollars per episode, step and unit, and `Episode.costCents` is their rounded-up sum. Fixture providers run only when the Worker's `PROVIDERS` var says so, so a Worker without a key fails instead of inventing text (rule 10). Asking the phone for full clips stays in P16. Research: Cloudflare Workers AI, Workflows and vitest-pool-workers 0.22 docs and types; Anthropic batch, vision, pricing, data-retention and model pages (2026-09-27). Task text: `tasks/p12/T-013.md`.

## D39 · 2026-09-27 · supervisor · Planning: Sonnet 5 chooses and orders moments and writes the words, the server times and checks the plan, one retry, then the recap
Claude Sonnet 5 (`claude-sonnet-5`, effort `medium` with adaptive thinking, `max_tokens` 16000) gets the week brief under one fixed style prompt, cached for an hour and free of user data so Sunday runs share it. Through structured output it returns only `PlannerOutput`: which answer opens cold, which moments go in which scene in what order, the closing moment, who gets a lower third, and the words (title, subtitle, headings, bridges, tease, summary) with a music mood. It sets no times, because the brief has no word timings (rule 10): the server makes every shot from its moment with the recap's own rules (answers whole, clips up to 6 s, photos 3 s with the design's Ken Burns), times the lower thirds, and adds the week, the number, the duration, captions on every scene and the narrator voice (`narrator-1` until P14 lets the person choose one of four). Answers are at most 10 s, so the model-plan floor drops from 60 s to 30 s; a week that cannot reach 30 s, three media moments and one answer gets the recap without a model call, and a week with no media has no episode (quiet weeks are not failures, D2). A plan is kept only when it parses, passes `validatePlan`, the voice rules and a check that no bridge repeats five of the person's words in a row (VISION: the narrator never speaks for them). Otherwise the same step asks once more, showing the model its first answer and the errors; a second failure, a refusal or a model error falls back to the recap plan (D20). Plans are stored per version; the episode's summary is its plan's summary, and later briefs read the last three model-plan summaries. Planning costs go to the ledger per unit at Sonnet 5 prices (about $0.06 for an 18k-token brief and a 2.5k-token answer, less with cache hits). An evaluation over the 20 fixture weeks, run by hand with the owner's key, scores every plan and is the gate for prompt or model changes. Research: Anthropic Sonnet 5, structured-output, prompt-caching and effort pages and SDK 0.128.0 source (2026-09-27); a draft review found twelve issues, all fixed before publication. Task text: `tasks/p13/T-014.md`.
