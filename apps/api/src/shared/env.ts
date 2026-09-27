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
  /** `fixture` makes the pipeline use fixture providers; set only by the test pool and local dev. */
  PROVIDERS?: string;
  /** The episode pipeline Workflow (P12). */
  EPISODE_PIPELINE: Workflow<{ documentaryId: string; weekStart: string }>;
};
