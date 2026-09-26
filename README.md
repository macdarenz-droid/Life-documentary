# Life Documentary

Life Documentary is a mobile app that turns a person's days into weekly narrated episodes. What the product is and why is in [docs/VISION.md](docs/VISION.md).

## Prerequisites

- Node 22 (`.nvmrc`)
- pnpm 10 (`packageManager` in `package.json`; `corepack enable` picks it up)

## Commands (repo root, after `pnpm install`)

- `pnpm typecheck` — TypeScript in every workspace.
- `pnpm lint` — ESLint over the repo.
- `pnpm format:check` — Prettier check (`pnpm format` rewrites).
- `pnpm boundaries` — import boundaries (dependency-cruiser) and the banned biometric identifiers scan.
- `pnpm test` — every workspace's tests, then the tooling tests.
- `pnpm build` — every workspace's build (API dry-run bundle, iOS JS export).
- `pnpm types:api` — regenerate `apps/api/worker-configuration.d.ts` from `wrangler.jsonc` (then `pnpm format`).
- `pnpm --filter <name> <script>` — one workspace, e.g. `pnpm --filter @life/api deploy:dry`.

## Workspaces

- `apps/mobile` (`@life/mobile`) — Expo app.
- `apps/api` (`@life/api`) — Hono API on Cloudflare Workers.
- `packages/contracts` (`@life/contracts`) — Zod schemas for every boundary.
- `packages/story` (`@life/story`) — pure story logic.
- `packages/design` (`@life/design`) — design tokens.
- `tooling/` — boundary rules and repo scripts (not a workspace).

## Docs and tasks

- `docs/` — vision, architecture, roadmap, decisions and research.
- `tasks/TASKS.md` — the task queue; task texts live in `tasks/`.
- `CLAUDE.md` — rules for coding agents.
