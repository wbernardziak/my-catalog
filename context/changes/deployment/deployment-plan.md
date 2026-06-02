# First Cloudflare Workers Deployment Plan

## Status

**Done.** First production deployment to Cloudflare Workers completed on June 1, 2026.

- Production URL: `https://my-catalog.wojciechbernardziak.workers.dev`
- Worker name: `my-catalog`
- Cloudflare Worker version ID: `6171444e-2787-4ecd-a785-dd7169852608`
- Production secrets uploaded through Wrangler: `SUPABASE_URL`, `SUPABASE_KEY`
- Local verification completed: `npm run lint`, `npm run build`
- Smoke checks completed: `/`, `/auth/signin`, unauthenticated `/dashboard` redirect, authenticated `/dashboard`
- Logs check completed: `npx wrangler tail my-catalog` connected successfully

## Summary

- Target platform: **Cloudflare Workers SSR**, not Cloudflare Pages. The current `@astrojs/cloudflare` v13 for Astro 6 supports Workers, and the Astro documentation indicates that Pages support has been removed from this adapter line: https://docs.astro.build/en/guides/integrations-guide/cloudflare/.
- Selected mode: **full deployment with Supabase secrets**. The deployment has been completed with production Supabase configuration stored as Cloudflare Worker secrets.
- Local `npm run build` passes. The build reveals automatic Cloudflare bindings: `SESSION` for KV and `IMAGES` for Cloudflare Images; the adapter/Wrangler provisioned them during deployment.

## Key Changes

- Before the first deployment, change the Worker name in `wrangler.jsonc` from `10x-astro-starter` to `my-catalog` so the public Cloudflare resource matches the project name.
- Keep the current runtime: `main: "@astrojs/cloudflare/entrypoints/server"`, `compatibility_flags: ["nodejs_compat"]`, assets from `./dist`, and observability enabled.
- Do not add OpenRouter secrets in the first deployment because the current code does not use them yet. The first deployment covers Astro SSR + Supabase Auth.
- Set production secrets only through Wrangler, not in `wrangler.jsonc`: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Cloudflare/Astro documents secrets through the Wrangler CLI: https://docs.astro.build/en/guides/integrations-guide/cloudflare/#environment-variables-and-bindings.
- Prepare Supabase before deployment: create the project, copy the Project URL and anon key, and enable email/password auth. For the first test, use a manually confirmed user or temporarily disable email confirmation, because the current code shows `/auth/confirm-email` but does not implement the email confirmation callback.

## Deployment Procedure

1. [x] Log in to Wrangler locally: `npx wrangler login`, then verify the account: `npx wrangler whoami`.
2. [x] Update the `wrangler.jsonc` name to `my-catalog`.
3. [x] Set the production Cloudflare Worker secrets:
   - `npx wrangler secret put SUPABASE_URL`
   - `npx wrangler secret put SUPABASE_KEY`
4. [x] Run the local quality gate: `npm run lint` and `npm run build`.
5. [x] Deploy manually from the local repository directory: `npx wrangler deploy`.
6. [x] Record the returned Worker URL as the project's first production URL.
7. [x] After deployment, run logs for observation only: `npx wrangler tail my-catalog`.

## Test Plan

- [x] Build gate: `npm run lint` and `npm run build` must pass without errors.
- [x] Runtime smoke: open the Worker URL and confirm that the home page renders without a 500.
- [x] Auth smoke: go to `/auth/signin`, sign in with a confirmed Supabase user, and check the post-login redirect.
- [x] Protected route: visit `/dashboard` without a session and confirm the redirect to `/auth/signin`; after signing in, the dashboard should render.
- [x] Logs: during smoke tests, observe `npx wrangler tail my-catalog`; there should be no runtime exceptions related to Supabase, cookies, KV session, or assets.
- [x] Rollback readiness: after deployment, note the Worker version from the Wrangler output; code rollback is done through `wrangler rollback`, but it does not roll back Supabase changes.

## Assumptions

- The first deployment should be a **full deployment with Supabase**, not a public smoke deployment without secrets.
- The first deployment is manual through local Wrangler; GitHub Actions auto-deploy will be a separate stage.
- We are not configuring a custom domain, preview protection, or CI/CD deploy tokens yet.
- The `SESSION` and `IMAGES` bindings remain handled by the adapter/Wrangler by default; add manual bindings only if `wrangler deploy` reports a specific provisioning error.
- OpenRouter stays outside the first deployment because the AI recommendation feature does not exist in the code yet.
