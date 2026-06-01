# Repository Guidelines

This is an Astro 6 SSR application using React 19 islands, TypeScript, Tailwind CSS 4, Supabase Auth, shadcn/ui, and the Cloudflare Workers adapter. Treat `CLAUDE.md` as the detailed agent reference when you need deeper architecture notes.

## Project Structure & Module Organization

- `src/pages/` contains Astro routes; API endpoints live in `src/pages/api/` and should export uppercase HTTP handlers such as `POST`.
- `src/components/` contains Astro and React UI; shared shadcn/ui primitives live in `src/components/ui/`.
- `src/layouts/`, `src/styles/`, and `src/lib/` hold page shells, global CSS, and reusable helpers/services.
- `src/middleware.ts` owns route protection through `PROTECTED_ROUTES`; add protected paths there.
- `public/` stores static assets. `supabase/` stores local Supabase configuration. `context/` stores planning and project foundation documents.

## Build, Test, and Development Commands

Use the npm scripts in `@package.json`: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, and `npm run format`. Install dependencies with `npm install` from `package-lock.json`.

CI is defined in `@.github/workflows/ci.yml` and must stay green for pushes and PRs to `master`.

## Security & Configuration

Copy `.env.example` to `.env` for Astro/Supabase and to `.dev.vars` for Cloudflare local secrets. Keep `SUPABASE_URL` and `SUPABASE_KEY` server-only; they are declared as secret server env fields in `astro.config.mjs`.

## Coding Style & Naming Conventions

Use Node.js `22.14.0` from `.nvmrc`. Follow `@tsconfig.json` and `@.prettierrc.json`; import from `@/*` for `src/*`. Prefer Astro components for static UI and React components only for interactive islands. Use `cn()` from `@/lib/utils` for conditional Tailwind classes instead of manual string concatenation.

## Testing Guidelines

No test runner or coverage threshold is configured in this workspace. Before submitting behavior changes, run `npm run lint` and `npm run build`; add a test framework and documented script before introducing test files.

## Commit & Pull Request Guidelines

This workspace does not include readable Git history, so no commit convention can be inferred. Use short imperative commit subjects, describe user-visible impact in PRs, mention linked issues, and include screenshots for UI changes. Ensure CI-equivalent commands pass before requesting review.
