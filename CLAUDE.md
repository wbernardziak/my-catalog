# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

Run, build:

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run dev:clean` — the same, after clearing the Vite cache
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build

Tests:

- `npm test` — unit/integration suite (`vitest run --project unit`); no Docker needed
- `npm run test:watch` — the same suite in watch mode
- `npm run test:db` — RLS/database suite (`--project db`); needs a local Supabase (`npx supabase start`)

Gates — each of these runs in CI, so run them before handing work back:

Guard self-tests and the wiring test live in `scripts/*.test.ts` and run in `npm test`; adding a guard requires its self-test and an entry in `scripts/gate-wiring.test.ts` (see test-plan §6.8).

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:colors` — fails when a colour is named directly in `src/` instead of a token role
- `npm run lint:contrast` — fails when a theme's ink is unreadable on a surface it can land on
- `npm run lint:reads` — fails when a `games` read omits `.is("deleted_at", null)`, the only place soft-delete is enforced

Fixers (not gates, and not run by CI):

- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged, configured in `lint-staged.config.js`. Staging a `*.{ts,tsx,astro}` file runs `eslint --fix` on it, then `npm run typecheck` and `npm test` project-wide; `*.{json,css,md}` gets `prettier --write`. A docs-only commit therefore skips the code gate. The commands run inside lint-staged on purpose — it hides unstaged changes, so the gate grades the staged index rather than the working tree. See `context/foundation/test-plan.md` §6.6.

Husky activates through the `prepare` script on `npm install`; without it `core.hooksPath` is never set and **no hook runs at all**. If commits are suspiciously fast, check `git config core.hooksPath` — it should be `.husky/_`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main` or `master`, in two jobs:

- **`ci`** — `typecheck`, `lint`, `lint:colors`, `lint:contrast`, `lint:reads`, `build`, then `npm test` (the unit project). Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.
- **`db-tests`** — boots a real local Supabase stack (`npx supabase start`, minus studio/imgproxy/edge-runtime/logflare/vector/storage-api/mailpit) and runs `npm run test:db`. Separate so the fast hermetic job stays the signal most pushes need; a real stack is the only way to observe RLS behaviour (see `src/test/db/README.md`).

Both suites therefore run in CI — `test:db` is not local-only.
