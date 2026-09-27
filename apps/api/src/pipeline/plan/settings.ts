// What the planning step asks the model (P13, D39). The adapter receives these values and holds none.
export const PLAN_MODEL = 'claude-sonnet-5';
/** The eval compares `medium` and `high` before this changes. */
export const PLAN_EFFORT = 'medium';
/** Below the SDK's non-streaming limit (about 21,333). */
export const PLAN_MAX_TOKENS = 16000;
/** Our own narrator id; P14 maps it to a vendor voice. Set by the server, never by the model. */
export const NARRATOR_VOICE = 'narrator-1';
