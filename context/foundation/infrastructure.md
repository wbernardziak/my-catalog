---
project: my-catalog
researched_at: 2026-06-01
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers SSR
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the best MVP target because the project already uses `@astrojs/cloudflare`, `wrangler.jsonc`, npm, GitHub Actions, Supabase Auth, and external OpenRouter calls. The interview constraints also fit: no persistent server process, balanced cost/DX, existing Cloudflare familiarity, one-region user base, and external Supabase/OpenRouter are acceptable. Current Cloudflare docs show direct Astro SSR support through Wrangler auto-detection and manual SSR configuration, while Workers pricing remains suitable for low-QPS MVP traffic ([Astro on Workers](https://developers.cloudflare.com/workers/frameworks/framework-guides/web-apps/astro/), [Wrangler deploy/rollback](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Vercel | Pass | Pass | Pass | Pass | Pass (Beta) | 4.5/5 |
| Netlify | Pass | Pass | Pass | Pass | Pass | 4.5/5 |
| Railway | Pass | Partial | Pass | Partial | Pass | 3.5/5 |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 3.5/5 |
| Render | Partial | Partial | Partial | Pass | Partial | 3/5 |

Cloudflare wins because it matches the selected starter without adapter migration. Vercel has strong CLI support, preview deployments, Astro SSR support, and official MCP in beta, but would require switching to the Vercel adapter ([Vercel CLI](https://vercel.com/docs/cli), [Astro on Vercel](https://vercel.com/docs/frameworks/frontend/astro), [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp)). Netlify is agent-friendly with `llms.txt`, Markdown docs, CLI deploys, and official MCP, but also requires Netlify-specific configuration ([Netlify docs](https://docs.netlify.com/), [Netlify CLI deploy](https://cli.netlify.com/commands/deploy/), [Netlify MCP](https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/)). Railway, Fly.io, and Render can run Astro SSR through Node/container-style deployments, but each adds more runtime migration or service management than this MVP needs ([Railway pricing](https://railway.com/pricing), [Fly Astro](https://fly.io/docs/js/frameworks/astro/), [Render Astro](https://render.com/docs/deploy-astro)).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Best alignment with the current Astro Cloudflare adapter, Wrangler config, low traffic, and stateless request/response app model.

#### 2. Vercel

Excellent developer experience and previews, but adapter migration is unnecessary overhead for a starter already configured for Cloudflare.

#### 3. Netlify

Strong agent tooling and deploy workflow, but no clear advantage over Cloudflare for this Cloudflare-targeted stack.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Workers is not Node.js; any future dependency that assumes full Node APIs can break at deploy time.
2. OpenRouter calls may dominate latency and make the 5-second recommendation target fail even if Cloudflare is fast.
3. Supabase and OpenRouter are external services, so the app is not operationally self-contained on Cloudflare.
4. Rollbacks revert Worker code, not Supabase schema changes or external API behavior.
5. Debugging edge-runtime failures can be harder than debugging a conventional Node server.

### Pre-Mortem — How This Could Fail

Six months after launch, Cloudflare looks like the wrong choice because the MVP quietly grew beyond its original request/response shape. The recommendation feature started making larger OpenRouter calls, response time regularly exceeded five seconds, and logs were too sparse to isolate whether latency came from the Worker, Supabase, or the LLM provider. A new dependency introduced for catalog imports assumed Node filesystem APIs; it worked locally in Astro dev but failed in the Worker runtime during deployment. The team also shipped a Supabase migration together with a UI change, then rolled back only the Worker after a bug report, leaving the database shape mismatched with the restored code. Because deployment discipline was informal, secrets and compatibility settings drifted between local `.dev.vars`, GitHub Actions, and Cloudflare. The platform did not fail outright, but the team treated an edge serverless target like a normal Node host and paid for that mismatch through slower debugging and fragile releases.

### Unknown Unknowns

- Astro local dev and Workers runtime are close but not identical; verify Cloudflare-specific behavior with `npm run build` and a Wrangler preview/deploy path before release.
- Cloudflare Workers limits around CPU time, subrequests, and compatibility flags can surface only after realistic Supabase/OpenRouter calls.
- Cloudflare's agent/MCP ecosystem is active, but individual tools and permissions may change; prefer Wrangler and official docs as the durable baseline.
- Preview protection and secret visibility need explicit setup; branch previews should not expose private household catalog data.

## Operational Story

- **Preview deploys**: GitHub Actions can run CI on PRs; Cloudflare preview/branch deployments should be protected if they ever include real Supabase data.
- **Secrets**: Local development uses `.env` and `.dev.vars`; production secrets live in Cloudflare Worker secrets and GitHub Secrets for CI builds. Agents may read names, not values.
- **Rollback**: Use `wrangler rollback [VERSION_ID] --message "<reason>"` for Worker code rollback. Database migrations and external service changes must be rolled back separately.
- **Approval**: A human approves production deploys, primary secret rotation, domain changes, and Supabase schema changes. Agents may run read-only status/log commands and prepare deploy PRs.
- **Logs**: Use Cloudflare dashboard observability or Wrangler tail/logging commands in read-only mode; CI logs remain available through GitHub Actions.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| Node-only dependency breaks on Workers | Devil's advocate | M | H | Keep `npm run build` in CI and review new packages for Worker compatibility before merge. |
| AI recommendations exceed 5 seconds | Pre-mortem | M | H | Add timeout handling, small prompt payloads, and a user-visible failure state for OpenRouter calls. |
| Supabase/OpenRouter outage affects app | Research finding | M | M | Treat both as external dependencies; add clear error states and avoid fabricated recommendations. |
| Worker rollback does not roll back database | Devil's advocate | M | H | Separate code deploys from schema migrations and document manual Supabase rollback steps per migration. |
| Preview deploy exposes real data | Unknown unknowns | L | H | Use separate Supabase projects or protected previews before testing with private household data. |
| Wrangler/adapter behavior changes across versions | Unknown unknowns | M | M | Pin dependencies through `package-lock.json`; check Cloudflare Astro docs before changing adapter or Wrangler versions. |

## Getting Started

1. Confirm the existing Cloudflare adapter and `wrangler.jsonc` still match the current Cloudflare Astro guide.
2. Add production `SUPABASE_URL` and `SUPABASE_KEY` to Cloudflare Worker secrets and GitHub repository secrets.
3. Run `npm run lint` and `npm run build`; fix Worker-runtime build errors before deployment.
4. Deploy with `npx wrangler deploy` from the project root after authenticating Wrangler.
5. After deploy, verify auth routes, `/dashboard`, and one OpenRouter-backed recommendation flow against the deployed URL.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
