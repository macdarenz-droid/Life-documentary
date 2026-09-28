import { createApp } from './app';
import { resumeRecuts } from './pipeline/recut/start';
import { startDueWeeks } from './pipeline/schedule';
import type { Env } from './shared/env';

export { EpisodePipeline } from './pipeline/EpisodePipeline';
export { RecutPipeline } from './pipeline/recut/RecutPipeline';

const app = createApp();

export default {
  fetch: app.fetch,
  /** The weekly cron (P16): starts every due week, then looks after claimed re-cuts (P17). */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await startDueWeeks(env, new Date(controller.scheduledTime).toISOString());
        } finally {
          await resumeRecuts(env);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
