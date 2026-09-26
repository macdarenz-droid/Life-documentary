# Stack research — Life Documentary (26 September 2026)

Client platform, backend, render pipeline, narration stack, media understanding, privacy architecture, offline sync, and the recommendation the architecture adopts. Items marked **[unverified]** were not confirmed against a primary source. `docs/architecture/ARCHITECTURE.md` records the choices; `docs/decisions/DECISIONS.md` records why.

## 1. Client platform

**Expo / React Native (chosen).**
- Expo SDK 55 (Feb 2026) runs React Native 0.83, New Architecture only. `expo-av` is gone: use `expo-video` and `expo-audio` (lock-screen controls, background recording). `expo-camera` has video stabilisation. `expo-sqlite` has a typed tagged-template SQL API. `expo-file-system` supports append writes.
- Capture: `expo-camera` is enough for photos and 1–10 s clips; `react-native-vision-camera` only if per-frame on-device vision is needed later.
- Background work: `expo-background-task` wraps WorkManager and BGTaskScheduler; iOS schedules opportunistically (about 15-minute cadence, not guaranteed) **[unverified]**. Uploads that survive app termination need NSURLSession background sessions or WorkManager: `react-native-background-upload` or the maintained `react-native-background-downloader` fork (kesha-antonov, supports uploads). Dev-client builds only.
- Widgets: `expo-widgets` (alpha, SDK 55, iOS only, home-screen widgets and Live Activities); Android via `react-native-android-widget` (Expo config plugin). Plan widgets after the core loop.
- Share: `expo-sharing` out; `expo-share-intent` in **[maintenance unverified]**.
- On-device video assembly: FFmpegKit binaries were pulled 1 Apr 2025 and the repo archived Jul 2026; FFmpegKitNext (Jul 2026) is source-only (LGPL, GPL with x264/x265; H.264/HEVC patent exposure). Practical rule: on the device only trim and compress (AVFoundation, Media3 Transformer); render episodes in the cloud.
- Local ML: `whisper.rn` (whisper.cpp; ~150 MB tiny model, 375–410 MB RAM) or `expo-speech-recognition` (platform recognisers). iOS 26 SpeechAnalyzer is on device, long-form, model ships with the OS, about 2× faster than Whisper large-v3-turbo. Android ML Kit GenAI speech is Pixel 10/11 only so far. Embeddings: Apple MobileCLIP Core ML (S0: 3–15 ms). Treat on-device ML as an optimisation; cloud understanding is cheaper to build first.
- Agent-friendliness: best of the four. TypeScript, config plugins instead of hand-edited native projects, EAS Build/Submit from the CLI. The owner's TypeScript/React/Vitest/Playwright knowledge carries over.

**Flutter**: strong camera and FFI, same FFmpeg story, second language, no reuse. Not chosen.
**Capacitor + PWA**: Camera plugin cannot record video on web; iOS PWAs have no background sync; widgets need native code anyway. Good for a later web viewer only.
**Native Swift/Kotlin**: best capture and first-class SpeechAnalyzer/WidgetKit, but two codebases for a small agent team. Use native only as small Expo modules.

**Store review**: in-app account deletion (Apple 5.1.1(v)); Google Play needs an in-app path and a public web deletion URL in the Data safety form; Privacy Nutrition Label and `PrivacyInfo.xcprivacy` with required-reason APIs and SDK manifests; private-by-default episodes with share-out avoid most UGC obligations; specific permission strings.

## 2. Backend (≈200 MB/user/month; ≈2.4 GB/user after 12 months)

| Provider | Storage $/GB-mo | Egress | Uploads | Jobs |
|---|---|---|---|---|
| **Cloudflare R2** | $0.015 (IA $0.01) | **$0** | S3 presigned PUT and multipart (no presigned POST); Workers multipart API | Queues $0.40/M ops, Workflows, Durable Objects, Containers |
| AWS S3 | $0.023 | $0.09/GB | Presigned, multipart | SQS, Step Functions, Lambda |
| Supabase Storage (Pro $25) | 100 GB incl., then $0.0213 | 250 GB incl., then $0.03 cached | Signed URLs, tus, S3 protocol | pg_cron, Edge Functions, pgmq |
| Firebase Storage | $0.026 | $0.12–0.15/GB | SDK signed URLs | Cloud Tasks / Functions |
| Convex (Pro) | 100 GB incl., then $0.03 | 50 GB incl., then $0.12/GB | Upload URLs | Scheduled functions |

Storage plus egress at month 12 (1 GB/user/month downloaded):

| Users | R2 | S3 | Supabase | Firebase | Convex |
|---|---|---|---|---|---|
| 1k | ~$36 | ~$145 | ~$96 | ~$212 | ~$240 |
| 10k | ~$360 | ~$1,450 | ~$826 | ~$2,100 | ~$1,950 |
| 100k | ~$3,600 | ~$13,500 | ~$8,100 | ~$21,000 | ~$19,000 |

Egress dominates everywhere except R2. The owner already runs Workers, so R2 + Workers + Queues + Workflows + D1 + Containers is the natural choice. Workers Paid $5/mo (10M requests, 30M CPU-ms). Workers AI: Whisper large-v3-turbo $0.0005/audio-minute; Llama 3.2 11B Vision $0.049/$0.676 per M tokens (cheap fallback captioner). Containers up to `standard-4` (4 vCPU, 12 GiB, 20 GB disk).

Supabase is the best single-bill alternative (Postgres, Auth, Storage, tus) if egress at scale is acceptable, or as metadata and auth with R2 for bytes.

## 3. Server-side rendering

| Option | Cost per 1080p minute | Latency | Licensing |
|---|---|---|---|
| **Remotion + Lambda** | AWS ≈ $0.017–0.021 per minute at 2048 MB; a 3-min episode ≈ $0.05–0.06 | 10-min HD in ~60 s (parallel Lambdas) | Free for companies of ≤3 people; 4+: Creators $25/seat/mo or Automators $0.01/render ($100/mo minimum). Official Claude Code plugin and Agent Skills: the strongest agent story of any renderer. |
| Shotstack | $0.20–0.30/min | minutes | JSON timeline, cloud only |
| Creatomate | ≈ $0.28–0.38/min at 720p **[1080p unverified]** | minutes | template API |
| json2video | ≈ $0.25/min | minutes | JSON API, TTS included |
| Editframe | render-time billing **[unverified]** | — | small vendor |
| FFmpeg on Containers / Lambda | compute only, ≈ $0.01 per 3-min episode **[estimate]** | 1–3 min | LGPL; you own the templating |

Recommendation: Remotion compositions (React), rendered on Remotion Lambda first, moved to Cloudflare Containers running `@remotion/renderer` when volume justifies it **[Containers Chrome memory headroom unverified: test on standard-2/4]**. Keep a plain-FFmpeg fallback template for a low-cost tier later.

## 4. AI narration stack

**Story LLM: Claude** (platform.claude.com pricing, Sep 2026):

| Model | ID | In / Out per MTok | Batch | Use |
|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | $2 / $10 | season arc |
| Claude Sonnet 5 | `claude-sonnet-5` | $2 / $10 | $1 / $5 | weekly episode plan |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 | $0.50 / $2.50 | captions, classification |

- Structured outputs via `output_config.format` or `client.messages.parse()` with a Zod/JSON schema; `strict: true` on tools. The episode plan is a schema.
- Prompt caching: reads at 0.1×; put the style guide and schema in a cached prefix.
- Anthropic does not train on commercial API data by default and image inputs are ephemeral **[re-check Commercial Terms before publishing the privacy policy]**. Claude declines to identify people in images: a feature here.
- Per-episode script with Sonnet 5: ~15k in, ~2k out ≈ $0.05 (≈ $0.03 cached).

**TTS** (per 1k characters; a 3-minute narration ≈ 2,500 chars): ElevenLabs $0.10 (v3, Multilingual v2) or $0.05 (Flash/Turbo) → $0.125–0.25 per episode; OpenAI tts-1 $0.015, tts-1-hd $0.03; Google $0.004–0.16; Cartesia ≈ $0.005–0.037. Voice cloning: ElevenLabs verifies with a voice captcha; Professional Voice Clone is own-voice only; US state laws (California, New York, Tennessee ELVIS Act) require written consent. Product rule: "narrate in my voice" only with an in-app recorded consent script from the account holder; never clone people who appear in clips.

**Music**: ElevenLabs Music API $0.15 per generated minute, licensed catalogues, commercial use on paid plans (≈ $0.45 per episode: cache tracks per mood). Suno has no public API and active litigation. Stable Audio ≈ $0.20/generation, licensed data, self-hostable. Epidemic Sound has a partner safelisting API for UGC in apps **[pricing unverified]**. v1: a curated 40–60 track licensed mood library; generative music later as premium.

## 5. Media understanding
- Captions: Haiku 4.5 vision ≈ $1.30 per 1,000 images at 1,000 px ($0.65 batch). Downsample to ≤1,000 px. Gemini 2.5 Flash and Workers AI Llama Vision are cheaper fallbacks. Cluster by time, place and scene embeddings, never by faces.
- Speech-to-text: Workers AI Whisper large-v3-turbo $0.0005/min; Deepgram Nova-3 $0.0043/min; AssemblyAI ≈ $0.0025/min; OpenAI $0.003–0.006/min. On device: iOS 26 SpeechAnalyzer, `whisper.rn`. Voice answers are short (≤60 s), so on-device first is realistic later.
- **Face grouping: do not.** Illinois BIPA: 107+ new class actions in 2025; Apple's Photos face-scan class action survived dismissal; Google settled for $100M; statutory damages $1,000–5,000 per violation. EU AI Act: biometric categorisation of sensitive traits prohibited since 2 Feb 2025; other biometric identification is high-risk (deadline 2 Dec 2027 after the Digital Omnibus); Article 50 transparency and AI-content labelling apply from 2 Aug 2026. COPPA (compliance by 22 Apr 2026) counts faceprints and voiceprints as personal information. Do: time, place, scene clustering; manual people tags; "AI-narrated" labels on exports. Do not: face templates, mood/age/gender from faces, voice-print matching, any biometric vector server-side.

## 6. Privacy architecture patterns
1. At-rest encryption on device: `react-native-libsodium` (XChaCha20-Poly1305) or `expo-crypto-lib`; master key in Keychain/Keystore via `expo-secure-store`; per-file keys wrapped by the master key. Fully E2E media cannot be captioned or rendered server-side, so v1 encrypts originals at rest and uses a server-side per-user data key for the processing copy, decrypted only during a job.
2. Signed URLs only: presigned multipart PUT for upload; short-lived presigned GET for playback; never public buckets; URLs scoped to `users/{uid}/…`.
3. Process then delete: pull object → downsample → model → store derived text only → delete temp.
4. Export (takeout): a queued job zips originals, JSON metadata and episodes to a signed URL valid 7 days (GDPR Art. 20, CCPA access).
5. Deletion: in-app plus web link; soft-delete then hard-delete job at day 30 with an R2 lifecycle rule as backstop (GDPR Art. 17, CCPA 45 days).
6. Labels and manifests: Privacy Nutrition Label (Photos/Videos, Audio, Precise Location, User ID, Diagnostics); `PrivacyInfo.xcprivacy`; Play Data safety with the deletion URL.
7. GDPR/CCPA: contract as the lawful basis for core features; consent for optional narration of others' voices; sub-processors listed (Cloudflare, Anthropic, ElevenLabs, STT vendor); DPAs.
8. Minors: 16+ accounts; children appear in footage, so no biometrics anywhere and a "local-only moment" flag that keeps a capture off the cloud entirely.
9. AI content labelling (EU Art. 50 from 2 Aug 2026): visible "AI-narrated" credit and a metadata flag on exports **[C2PA tooling for MP4 unverified]**.

## 7. Offline-first sync for media
- Upload queue: SQLite table `upload_jobs(id, asset_id, state, bytes_done, upload_id, parts)`; capture writes file and row together; a foreground worker plus `expo-background-task` drains it; exponential backoff; Wi-Fi-only default for video.
- Resumable uploads: R2 S3 multipart (create → presigned part PUTs → complete); client stores `uploadId` and ETags to resume across restarts. The IETF resumable-upload draft (draft-12, Jul 2026) will succeed tus; do not hand-roll a protocol.
- Metadata sync: for a Cloudflare-only stack, a small hand-rolled pull/push over Workers + D1 with per-row `updated_at` and a change log. PowerSync (Postgres → SQLite; $1/GB hosted, 10 GB included) is the upgrade if Postgres is adopted.
- Conflicts: moments are single-writer → last-write-wins per field with server timestamps, tombstones, idempotent client UUIDs; episodes are server artefacts; user edits are an append-only op log replayed on the server. No CRDTs needed.

## 8. Recommendation adopted (2–3 agent team, 8–12 weeks)
- **Client**: Expo SDK 55+, TypeScript, `expo-router`, `expo-camera`, `expo-audio`, `expo-video`, `expo-sqlite` + Drizzle, `expo-location`, `expo-secure-store` + libsodium, `expo-background-task`, `expo-sharing`. EAS dev-client builds from day one. No on-device video assembly. Widgets and background-transfer modules after the core loop.
- **Backend**: Cloudflare Workers (API, signed URLs, auth), R2 (media), D1 (metadata), Queues (fan-out), Workflows (episode pipeline), Containers (renderer, later). ≈ under $1k/month infra at 10k users excluding AI.
- **Render**: Remotion compositions; Remotion Lambda first; Containers later.
- **AI**: Sonnet 5 structured outputs for the episode plan; Haiku 4.5 batch for captions; Workers AI Whisper for STT (on-device later); ElevenLabs Flash for narration bridges; curated licensed music library.
- **Unit economics** (weekly episode, ~4.3/month): captions ≈ $0.17, scripts ≈ $0.15–0.22, TTS ≈ $0.15–0.55, STT ≈ $0.07, render ≈ $0.04–0.25, storage ≈ $0.04–0.09 → **≈ $0.65–1.35 per user per month** before generative music. A $4.99/month tier clears it; the $39.99/year tier clears it at the median.
- **Biggest risks**: iOS background upload reliability (prototype on real devices early); Remotion headless-Chrome memory on Containers (or stay on Lambda); music licensing terms and cost (settle before public launch); EU Art. 50 labelling in v1.

## Sources
- Expo: expo.dev/changelog/sdk-54 · expo.dev/changelog/sdk-55 · docs.expo.dev/guides/new-architecture/
- FFmpegKit: itpathsolutions.com/ffmpegkit-shutdown-what-to-do-next · github.com/arthenica/ffmpeg-kit · tanersener.medium.com (goodbye FFmpegKit)
- whisper.rn: github.com/mybigday/whisper.rn · expo-speech-recognition: github.com/jamsch/expo-speech-recognition · SpeechAnalyzer: developer.apple.com/documentation/Speech/bringing-advanced-speech-to-text-capabilities-to-your-app · argmaxinc.com/blog/apple-and-argmax
- ML Kit GenAI: developers.google.com/ml-kit/genai/speech-recognition/android · MobileCLIP: huggingface.co/apple/coreml-mobileclip
- Widgets: saleksovski.github.io/react-native-android-widget · background uploads: github.com/kesha-antonov/react-native-background-downloader
- Capacitor camera: capacitorjs.com/docs/apis/camera
- Store rules: developer.apple.com/app-store/review/guidelines/ · developer.apple.com/support/offering-account-deletion-in-your-app · developer.apple.com/documentation/bundleresources/privacy-manifest-files · support.google.com/googleplay/android-developer/answer/13327111
- Cloudflare: developers.cloudflare.com/r2/pricing/ · developers.cloudflare.com/r2/api/s3/presigned-urls/ · developers.cloudflare.com/r2/api/workers/workers-multipart-usage/ · developers.cloudflare.com/workers/platform/pricing/ · developers.cloudflare.com/queues/platform/pricing/ · developers.cloudflare.com/containers/pricing/ · developers.cloudflare.com/workers-ai/platform/pricing/
- Supabase: supabase.com/docs/guides/storage/pricing · Firebase: firebase.google.com/pricing · Convex: convex.dev/pricing · AWS: aws.amazon.com/s3/pricing/ · aws.amazon.com/lambda/pricing/
- Remotion: remotion.dev/docs/license/faq · remotion.pro/license · remotion.dev/docs/lambda/cost-example · remotion.dev/docs/ai/claude-code-plugin · remotion.dev/docs/ai/skills
- Shotstack: shotstack.io/pricing/ · Creatomate: creatomate.com/pricing · json2video: json2video.com/pricing/
- Anthropic: platform.claude.com/docs/en/about-claude/pricing · platform.claude.com/docs/en/build-with-claude/vision
- TTS: elevenlabs.io/pricing · cloud.google.com/text-to-speech/pricing · docs.cartesia.ai/pricing · elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning
- Music: elevenlabs.io/eleven-music-api · elevenlabs.io/music-terms · stability.ai/explainers/stable-audio-vs-competitors-… · suno.com/terms-of-service · developers.epidemicsite.com/docs/safelisting/
- STT pricing: buildmvpfast.com/api-costs/transcription · convertaudiototext.com/blog/deepgram-nova-3-explained
- BIPA / AI Act / COPPA: privacyworld.blog/2025/12/2025-year-in-review-biometric-privacy-litigation/ · insideprivacy.com (X BIPA dismissal) · ai-act-service-desk.ec.europa.eu/en/biometrics · fpf.org (biometric categorisation red lines) · gibsondunn.com (EU AI Act omnibus) · federalregister.gov/documents/2025/04/22/2025-05904 · privacylawmap.com/blog/coppa-compliance-guide-2026
- Encryption: github.com/serenity-kit/react-native-libsodium · github.com/mjryan1-honesttech/expo-crypto-lib
- Sync: queryplane.com/blog/electricsql-vs-powersync-vs-replicache/ · powersync.com/blog/powersync-cloud-enterprise-pricing-model · github.com/Nozbe/WatermelonDB/ · datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/
