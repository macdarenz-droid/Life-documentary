import { createApp } from './app';
import { startDueWeeks } from './pipeline/schedule';
import type { Env } from './shared/env';

export { EpisodePipeline } from './pipeline/EpisodePipeline';

const app = createApp();

export default {
  fetch: app.fetch,
  /** The weekly cron (P16): starts every due week. */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(startDueWeeks(env, new Date(controller.scheduledTime).toISOString()));
  },
} satisfies ExportedHandler<Env>;
