export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  BUILD: string;
  /** Worker secret: signs sessions. */
  BETTER_AUTH_SECRET: string;
  /** The Worker's public origin, e.g. https://api.example.com. */
  BETTER_AUTH_URL: string;
  /** Sign in with Apple and Google are offered only when these secrets exist. */
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Workers AI (P12): speech to text. */
  AI: Ai;
  /** Worker secret: the Anthropic key for captions (P12). */
  ANTHROPIC_API_KEY?: string;
  /** Worker secret: the ElevenLabs key for narration (P14). */
  ELEVENLABS_API_KEY?: string;
  /** Worker secret: our narrator ids (`narrator-1` … `narrator-4`) to ElevenLabs voice ids, as JSON (P14). */
  NARRATOR_VOICES?: string;
  /** The media bucket's name, for R2's S3 endpoint (P15). */
  R2_BUCKET: string;
  /** Worker secrets: an R2 API token scoped to the media bucket, for presigned render URLs (P15, D41). */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /**
   * Worker secrets (set with `wrangler secret put`; dashboard variables are wiped by the next deploy): the
   * AWS user that may only invoke the render function, its region, the function and the deployed site (P15).
   */
  REMOTION_AWS_ACCESS_KEY_ID?: string;
  REMOTION_AWS_SECRET_ACCESS_KEY?: string;
  REMOTION_REGION?: string;
  REMOTION_FUNCTION_NAME?: string;
  REMOTION_SERVE_URL?: string;
  /** Worker secret, optional: Expo's access token, sent when push security is turned on (P16). */
  EXPO_ACCESS_TOKEN?: string;
  /** `fixture` makes the pipeline use fixture providers; set only by the test pool and local dev. */
  PROVIDERS?: string;
  /** The episode pipeline Workflow (P12). */
  EPISODE_PIPELINE: Workflow<{
    documentaryId: string;
    weekStart: string;
    renderAt: string;
    deliverAt: string;
  }>;
  /** The re-cut Workflow (P17). */
  RECUT_PIPELINE: Workflow<{ episodeId: string; runId: string }>;
};
