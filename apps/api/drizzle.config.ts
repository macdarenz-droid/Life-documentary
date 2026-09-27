import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @life/api db:generate` writes the next append-only migration (CLAUDE.md rule 6).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/data/schema.ts',
  out: './migrations',
});
