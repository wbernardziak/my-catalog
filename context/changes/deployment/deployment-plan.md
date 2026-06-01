# First Cloudflare Workers Deployment Plan

## Summary

- Target platform: **Cloudflare Workers SSR**, not Cloudflare Pages. The current `@astrojs/cloudflare` v13 for Astro 6 supports Workers, and the Astro documentation indicates that Pages support has been removed from this adapter line: https://docs.astro.build/en/guides/integrations-guide/cloudflare/.
- Selected mode: **deployment plan only for now**. We are not doing a smoke deployment without secrets; the full deployment is blocked until production Supabase secrets are prepared.
- Local `npm run build` already passes. The build reveals automatic Cloudflare bindings: `SESSION` for KV and `IMAGES` for Cloudflare Images; the adapter/Wrangler can provision them automatically during deployment.

## Key Changes

- Before the first deployment, change the Worker name in `wrangler.jsonc` from `10x-astro-starter` to `my-catalog` so the public Cloudflare resource matches the project name.
- Keep the current runtime: `main: "@astrojs/cloudflare/entrypoints/server"`, `compatibility_flags: ["nodejs_compat"]`, assets from `./dist`, and observability enabled.
- Do not add OpenRouter secrets in the first deployment because the current code does not use them yet. The first deployment covers Astro SSR + Supabase Auth.
- Set production secrets only through Wrangler, not in `wrangler.jsonc`: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Cloudflare/Astro documents secrets through the Wrangler CLI: https://docs.astro.build/en/guides/integrations-guide/cloudflare/#environment-variables-and-bindings.
- Prepare Supabase before deployment: create the project, copy the Project URL and anon key, and enable email/password auth. For the first test, use a manually confirmed user or temporarily disable email confirmation, because the current code shows `/auth/confirm-email` but does not implement the email confirmation callback.

## Deployment Procedure

1. Log in to Wrangler locally: `npx wrangler login`, then verify the account: `npx wrangler whoami`.
2. Update the `wrangler.jsonc` name to `my-catalog`.
3. Set the production Cloudflare Worker secrets:
   - `npx wrangler secret put SUPABASE_URL`
   - `npx wrangler secret put SUPABASE_KEY`
4. Run the local quality gate: `npm run lint` and `npm run build`.
5. Deploy manually from the local repository directory: `npx wrangler deploy`.
6. Record the returned Worker URL as the project's first production URL.
7. After deployment, run logs for observation only: `npx wrangler tail my-catalog`.

## Test Plan

- Build gate: `npm run lint` and `npm run build` must pass without errors.
- Runtime smoke: open the Worker URL and confirm that the home page renders without a 500.
- Auth smoke: go to `/auth/signin`, sign in with a confirmed Supabase user, and check the post-login redirect.
- Protected route: visit `/dashboard` without a session and confirm the redirect to `/auth/signin`; after signing in, the dashboard should render.
- Logs: during smoke tests, observe `npx wrangler tail my-catalog`; there should be no runtime exceptions related to Supabase, cookies, KV session, or assets.
- Rollback readiness: after deployment, note the Worker version from the Wrangler output; code rollback is done through `wrangler rollback`, but it does not roll back Supabase changes.

## Assumptions

- The first deployment should be a **full deployment with Supabase**, not a public smoke deployment without secrets.
- The first deployment is manual through local Wrangler; GitHub Actions auto-deploy will be a separate stage.
- We are not configuring a custom domain, preview protection, or CI/CD deploy tokens yet.
- The `SESSION` and `IMAGES` bindings remain handled by the adapter/Wrangler by default; add manual bindings only if `wrangler deploy` reports a specific provisioning error.
- OpenRouter stays outside the first deployment because the AI recommendation feature does not exist in the code yet.
