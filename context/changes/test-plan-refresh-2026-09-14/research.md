---
date: 2026-09-14T13:20:32+02:00
researcher: Claude (Opus 5) for Wojciech Bernardziak
git_commit: c1f9a83c4db5abc9c5d59eb90345fa2789509e75
branch: main
repository: my-catalog
topic: "Ground the test-plan refresh: five external-seam risks (A–E) and stale §4 facts"
tags: [research, test-plan, refresh, openrouter, supabase-auth, astro-env, middleware, e2e, quality-gates]
status: complete
last_updated: 2026-09-14
last_updated_by: Claude (Opus 5)
---

# Research: Ground the test-plan refresh — five external-seam risks and stale §4 facts

**Date**: 2026-09-14T13:20:32+02:00
**Researcher**: Claude (Opus 5) for Wojciech Bernardziak
**Git Commit**: c1f9a83c4db5abc9c5d59eb90345fa2789509e75
**Branch**: main
**Repository**: my-catalog

Permalink base for every `path:line` below:
`https://github.com/wbernardziak/my-catalog/blob/c1f9a83c4db5abc9c5d59eb90345fa2789509e75/<path>#L<line>`

## Research Question

Ground the refresh of `context/foundation/test-plan.md` opened in
`context/changes/test-plan-refresh-2026-09-14/change.md`. For each of the five proposed
risks (A provider shape drift, B quota exhaustion, C config divergence, D deployed-shape
regression, E gate infrastructure breaking unnoticed): ground the real failure path in
code, verify or correct the response guidance, locate existing tests, name the cheapest
useful layer, and flag speculative risks. Also establish the stale §4 facts and whether
Playwright is justified for D. Issue #43 (visual contrast in E2E) is out of scope.

## Summary

**None of the five risks survives exactly as worded. Each has a real, narrower defect underneath.**
Three of them rest on a premise the code contradicts:

| Risk  | As proposed                                                        | What the code says                                                                                                                                                                                                                                                                                                                                                                                         | Verdict                                                                                                                    |
| ----- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **A** | Provider shape drift passes a green suite silently                 | Structural envelope drift already fails **loudly**: a typed `invalid_response` panel, logged. The likely drift (model retired, a flag rejected, HTTP 4xx) becomes `provider_error`, which **writes no log** and reads the same as an outage. The test stub envelope is copied from our own interface (oracle problem)                                                                                      | **Reframe:** provider failures cannot be diagnosed, and the test envelope is not independent of the parser                 |
| **B** | A quota is hit and the feature silently stops                      | Signup rate-limit errors **are** logged and shown (raw provider text). The LLM 429/402 path shows a visible error but **is not logged**, and its "try again shortly" copy is wrong for a daily cap. Separately, signup shows "Check your email" for an already-registered address that gets no email                                                                                                       | **Reframe:** limits cannot be seen by the operator, plus two copy/UX defects. Most of B shares A's code branch             |
| **C** | A missing or mismatched key does not fail a gate before deploy     | A missing key already degrades **visibly** (banner, redirect, 503), and every key is deliberately `optional`. The real defect is `OPENROUTER_MODEL`: `access: "public"`, so its value is baked in at build time, which contradicts the code comment, the README and the archived plan. A wrong-but-present OpenRouter key fails **silently**. The auth email Site URL lives only in the Supabase dashboard | **Genuine defect** (build-time inlining), plus silent wrong-value failures. "Missing key fails a gate" is the wrong target |
| **D** | Only the full deployed app exposes a regression                    | The cookie round trip, the middleware and the island-to-route contract are **completely untested**, but no browser-only regression has ever reached production. A `db`-project integration test (real sign-in, then cookie, then `onRequest`, then `locals.user`) closes most of the gap without a browser. Only island hydration and the island's real fetch truly need one                               | **Partly genuine.** Cheaper layer first; Playwright is optional and limited to 2–3 flows                                   |
| **E** | `.js`/`.mjs`/`.sh` are outside every lint glob; the hook never ran | **False for CI:** `eslint .` lints `scripts/**/*.mjs` and root configs. The hook gap was fixed in `c5facff`. The real problem is **vacuous passes**: no minimum-count floors, a stale hardcoded Tailwind palette (`bg-mauve-500`, `border-s-red-500` pass — proven with fixtures), comment-fooled substring checks, and nothing detects a gate removed from `ci.yml`                                       | **Genuine defect, differently located:** guard logic and wiring, not lint globs                                            |

**Consequences for the refresh:**

1. **Several phases are fix-plus-regression-test, not test-only.** The unlogged `provider_error`, the build-time `OPENROUTER_MODEL` and the stale colour palette are production or gate defects. A test written against today's code would lock the defect in.
2. **Merge A and B's LLM half into one phase.** They share one branch (`recommendations.ts:114-128`) and one test seam (`providerStub.ts`). B's signup half is small and fits the same phase.
3. **Recommended order by cost × signal:**
   - E: cheap, offline, a proven defect, and it protects every other gate
   - C: offline, a proven defect
   - A+B: offline unit tests plus logging fixes
   - D: a db-project integration test first, then an optional behavioural Playwright slice
   - Real-provider smoke: optional and nightly only, because it spends the 50/day free quota
4. **§7 stays largely intact.** The old "no browser/e2e" exclusion is now conditionally lifted for D. Visual testing stays excluded (Q5).

## Detailed Findings

### Risk A — Provider response-shape drift

**Runtime providers.** OpenRouter via bare global `fetch`, and Supabase via SDK
(`@supabase/ssr` 0.10.3, `supabase-js` 2.105.3).

- URL: `src/lib/services/recommendations.ts:5`: `const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";`
- Model: `recommendations.ts:11,98`: `model: OPENROUTER_MODEL ?? DEFAULT_MODEL` (default `openai/gpt-4o-mini`; local `.dev.vars` sets a `:free` model).
- Request body: `recommendations.ts:97-111`: `response_format: { type: "json_object" }`, `reasoning: { enabled: false }`, system + user messages, `signal: AbortSignal.timeout(8000)`.

**Parse ladder and what each break becomes:**

| Break                                             | Code                                                                                                 | Reason                       | Logged?                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| fetch throws                                      | `recommendations.ts:114-116`                                                                         | `timeout` / `provider_error` | **no**                                                    |
| any non-2xx                                       | `recommendations.ts:118-120` `if (!response.ok) { return { ok: false, reason: "provider_error" }; }` | `provider_error`             | **no**; status and body never read                        |
| envelope `.json()` rejects                        | `recommendations.ts:122-128`                                                                         | `provider_error` / `timeout` | **no**                                                    |
| `choices[0].message.content` not a string         | `recommendations.ts:125,133-137`                                                                     | `invalid_response`           | yes, but logs `{ content }` (undefined), not the envelope |
| `JSON.parse(content)` fails (e.g. ```json fences) | `recommendations.ts:139-146`                                                                         | `invalid_response`           | yes (first 500 chars)                                     |
| zod `responseSchema` fails (`:24-32`)             | `recommendations.ts:148-153`                                                                         | `invalid_response`           | yes                                                       |
| all ids outside catalog                           | `recommendations.ts:165-178`                                                                         | `out_of_catalog`             | yes                                                       |
| `recommendations: []`                             | `recommendations.ts:175-180`                                                                         | `no_match`                   | **no**                                                    |

The route returns every modelled reason as HTTP 200 `{ok:false, reason}` with no log
(`src/pages/api/recommendations.ts:96`). The copy comes from `describeFailure` in
`src/lib/services/recommendationView.ts`. `provider_error` reads "The recommendation
service is unavailable right now. Please try again shortly."

**A real, recorded drift.** A `:free` model rejected the `reasoning` flag with HTTP 400
(`context/archive/2026-08-01-visual-identity-themes/plan.md:594`). Today that surfaces as
`provider_error`: indistinguishable from an outage, and with no log line at any layer.

**Oracle problem (genuine).** `src/test/providerStub.ts:23-27` builds
`{ choices: [{ message: { content } }] }`, which mirrors our own
`interface OpenRouterBody` (`recommendations.ts:34-36`). It is neither a captured real
response nor cited from provider docs, and it has no `status`, `headers` or `text()`. The
phase 4 plan's "oracle, stated once" (`context/archive/2026-09-13-testing-llm-recommendation-guardrails/plan.md:566-571`)
covers the **outbound payload only**. The only evidence of the real shape is the manual live runs
(`visual-identity-themes/plan.md:547-553`).

**Existing coverage.** `src/lib/services/recommendations.test.ts`: non-OK `:153-160`,
transport `:162-169`, non-JSON `:171-178`, schema `:180-189`, not configured `:191-201`,
envelope rejection `:203-215`, malformed choices `:217-228`, request shape `:234-246`,
default model `:248-257`. The route suite (`src/pages/api/recommendations.test.ts`)
covers payload `:157-203` and contract `:205-290`. **No test** asserts any
`provider_error` branch logs, uses a real `Response`, or includes a fenced-JSON case. No
real-provider smoke exists. It was explicitly declined for tests (`guardrails/plan.md:105`).

**Corrected guidance.**

- _Prove:_ every provider failure (transport, timeout, each non-2xx status, a 200 with an
  error body) leaves a log line naming its status or cause. The test envelope comes from a
  captured real response, not from our interface.
- _Challenge:_ "drift is silent" (structural drift is loud); "`provider_error` means an
  outage" (it also means retired model, rejected flag, bad key, quota).
- _Avoid:_ a stub derived from `OpenRouterBody`; calling the real provider on every push.
- _Cheapest layer:_ unit tests with a real `Response` built from one committed captured
  fixture, red until the logging lands. A real-provider smoke is **optional**, only nightly
  or on manual dispatch, needs an `OPENROUTER_API_KEY` secret CI lacks today, and costs 1 of
  the 50/day free requests (`visual-identity-themes/plan.md:562`).

**Supabase half.** Row-read shapes run against a real stack in the db suite
(`src/test/db/catalogIntegrity.test.ts:2-3`, `readAttribution.test.ts:2-3`,
`policyBackstops.test.ts:2`), so drift there is largely covered by `db-tests`. Auth is
covered only by `src/pages/api/auth/auth.test.ts`, which fully mocks the client
(`:19-23`, and `:13-16` says so). **Version skew (genuine, low impact):** the pins for the
linked production project live in gitignored `supabase/.temp/` (gotrue v2.192.0, postgres
17.6.1.127). CI's `npx supabase start` uses the images bundled with CLI 2.98.2, so the CI stack
is not pinned to prod.

### Risk B — Free-tier quota reached

**Signup** (`src/pages/api/auth/signup.ts:26-36`):

```ts
const { error } = await supabase.auth.signUp({ email, password });
if (error) {
  console.error("[auth/signup] the provider refused the sign-up", error.message);
  return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
}
return context.redirect("/auth/confirm-email");
```

- **Rate limit: not silent.** The error is logged and rendered via `<ServerError>`
  (`SignUpForm.tsx:127`, fed by `signup.astro:4`). Weaknesses: raw provider text as copy,
  and `error.status`/`error.code` ignored. Signin has the same shape (`signin.ts:63-71`).
- **Existing account (genuine).** With confirmations on (prod), Supabase returns success
  without sending mail, to prevent account enumeration. `signup.ts:36` redirects to
  `/auth/confirm-email`, which says "Check your email… We've sent a confirmation link"
  (`confirm-email.astro:13-18`). `data.user.identities` is never read. The page picks its
  copy from `import.meta.env.DEV` (`confirm-email.astro:4`), not from whether a session
  came back.
- **The local stack cannot reproduce the email cap.** SMTP is commented out
  (`supabase/config.toml:220`), `enable_confirmations = false` (`:209`), and `email_sent`
  "Requires auth.email.smtp" (`:181-182`). Local and prod also differ for an existing
  account: locally it errors.

**LLM quota.** 429, 402, 401, 400 and 404 all collapse into `recommendations.ts:118-120`, producing
`provider_error` with no log. Observed live: "HTTP 429 Rate limit exceeded:
free-models-per-day (X-RateLimit-Limit: 50, Remaining: 0)… correctly maps to
`provider_error`" (`visual-identity-themes/plan.md:558-567`). The copy "try again shortly"
is wrong for a daily cap that resets at 02:00. `context/foundation/lessons.md:26-30` is
satisfied in letter only (the route returns 200). This was already listed as open in
`guardrails/research.md:217-219`.

**Existing coverage.** `auth.test.ts:98-120` uses a generic `{ message: "Invalid login credentials" }`.
There is no 429 or `over_email_send_rate_limit` shape and no existing-user case.
`recommendations.test.ts:153-160` uses a fake `{ ok:false }` with no status or headers.

**Corrected guidance.**

- _Prove:_ a provider 429/402 leaves a log naming the status and `X-RateLimit-*` headers.
  A signup rate limit maps to member-readable copy. An obfuscated existing-account signup
  does not claim an email was sent. The last point is a product decision, to be recorded
  in the plan.
- _Challenge:_ "silent" (user-visible on both paths); "a redirect to confirm-email means
  an email left".
- _Avoid:_ stubbing a generic error in place of the provider's actual limit signal; any
  test that spends real quota; "verify locally" for the email cap.
- _Cheapest layer:_ unit tests. Stub `signUp` → `{ error: { status: 429, code: "over_email_send_rate_limit" } }`
  and `{ data: { user: { identities: [] } }, error: null }`. Return
  `new Response('{"error":{...}}', { status: 429, headers: { "X-RateLimit-Remaining": "0" } })`.
  Only the 429 message text is evidenced in the repo. Confirm the other shapes against
  provider docs or a captured response before encoding them.

**Workers limits: speculative.** There is no `limits` block in `wrangler.jsonc`. The only mention is
`context/foundation/infrastructure.md:63`. One recommendation request makes about 5 subrequests.
No evidence; no row.

### Risk C — Configuration divergence

**Key table** (secret values never read; names only):

| Key                  | `astro.config.mjs` schema          | `.env.example` | `.dev.vars` | `wrangler.jsonc` | `ci.yml`                                                          | test stub                    | Prod                                                                                      |
| -------------------- | ---------------------------------- | -------------- | ----------- | ---------------- | ----------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`       | server/secret/optional (`:19`)     | yes            | yes         | no               | build step only (`:28`); db-tests defaults via `harness.ts:14,26` | `astro-env-server.stub.ts:5` | `wrangler secret put` (`context/changes/deployment/deployment-plan.md:34`)                |
| `SUPABASE_KEY`       | server/secret/optional (`:20`)     | yes            | yes         | no               | build step only (`:29`)                                           | `:6`                         | `wrangler secret put` (`:35`)                                                             |
| `OPENROUTER_API_KEY` | server/secret/optional (`:21`)     | yes            | yes         | no               | **absent**                                                        | `:7`                         | README:138 "Cloudflare secret"; `deployment-plan.md:25` left it out; no record it was set |
| `OPENROUTER_MODEL`   | **server/public**/optional (`:22`) | yes            | yes         | no               | **absent**                                                        | `:8`                         | README:138 "optional"; no mechanism                                                       |

`.env` is absent locally. Other config: `supabase/config.toml` has `project_id = "my-catalog"` (`:5`),
`site_url = "http://127.0.0.1:3000"` (`:154`), which matches neither dev port (4321/8787),
and `enable_confirmations = false` (`:209`). The hosted project's Site URL, redirect
allow-list and confirmation setting exist **only in the Supabase dashboard**.

**Failure modes in production:**

- **A missing Supabase key is visible, not a 500.** `createClient` returns null
  (`src/lib/supabase.ts:6-8`), a banner renders (`src/lib/config-status.ts:14`,
  `Layout.astro:30`), protected routes redirect (`middleware.ts:33-40`), signin/signup
  redirect `?error=Supabase is not configured` (`signin.ts:21-24`), and recommendations
  return 503 (`api/recommendations.ts:47-49`).
- **Wrong Supabase values** show as auth failures, or silently hit the wrong project.
  That is the shape of the local `project_id` incident (`test-plan.md:201`).
- **A missing OpenRouter key is visible:** `not_configured` (`recommendations.ts:67-68`),
  plus banner (`config-status.ts:21`) and copy (`recommendationView.ts:158-161`).
- **A wrong, revoked or unfunded OpenRouter key is silent:** the `provider_error` branch
  shared with A and B, with no log.
- **`OPENROUTER_MODEL` is a genuine defect, baked in at build time.** `access: "public"`
  keys are validated and inlined at build
  (`node_modules/astro/dist/env/vite-plugin-env.js:74-80,133-139`). Only `secret` keys are
  read per request (`:142-148`; Cloudflare feeds only that path,
  `node_modules/@astrojs/cloudflare/dist/utils/handler.js:19`). A `wrangler secret put`
  for it is **ignored**. The value is whatever the builder had: local builds copy
  `.dev.vars` into `process.env` (`@astrojs/cloudflare/dist/index.js:292-297`), while a
  clean or CI build gets the paid `openai/gpt-4o-mini` default. This contradicts
  `recommendations.ts:8-9` ("overridable … without a code change"), README:138, and
  `context/archive/2026-07-09-llm-recommendation-service/plan-brief.md:37`. It was noted and
  left unfixed in `guardrails/research.md:168-170`.
- **Auth email redirect is silent and cannot be decided from the repo.** `signup.ts:26`
  passes no `emailRedirectTo`, so the link targets the hosted Site URL (dashboard only).
  There is no callback route (`exchangeCodeForSession`/`verifyOtp` absent from `src/`), as
  `deployment-plan.md:27` acknowledges.
- **Test stub drift is silent.** `tsc` types `astro:env/server` from `.astro/env.d.ts`, so a
  schema key missing from `src/test/astro-env-server.stub.ts` imports as `undefined` in
  tests and still typechecks.

**No gate validates env.** All keys are optional, `validateSecrets` is unset (Astro
default `false`, `astro/dist/core/config/schemas/base.js:60`), and secrets are skipped at
build (`vite-plugin-env.js:106`). The `SUPABASE_*` secrets passed to the CI build
(`ci.yml:27-29`) are **not consumed**: deleting them keeps CI green.

**Deploy is manual:** `npx wrangler deploy` from a laptop (`deployment-plan.md:26,33-36`,
README:131-136), and CI never deploys. **Unverified:** commit `fcb09ae` was authored by
`cloudflare-workers-and-pages[bot]`, which suggests the Cloudflare Git integration may once have been
connected. If it still is, Cloudflare's builder decides the baked-in `OPENROUTER_MODEL`.

**Past divergence incidents:** the local `project_id` collision (`test-plan.md:201,532-535`;
`context/archive/2026-09-12-testing-per-member-state-attribution/change.md:43-47`); migrations
missing from prod (`lessons.md:5-10`, commit `f2f7cab`); `.dev.vars` copied into untracked
`dist/server/` (`guardrails/research.md:168-172`); and the pre-mortem naming exactly this
drift (`infrastructure.md:58`).

**Corrected guidance.**

- _Prove:_ (a) a key documented as runtime-tunable cannot be inlined at build time;
  (b) a wrong-but-present provider key is observable in logs; (c) the names in the schema,
  the test stub and `.env.example` cannot drift without failing `npm test`.
- _Challenge:_ "a missing key must fail a gate" (keys are optional by design and already
  degrade visibly); "a green build means production config is complete" (the build reads no
  secrets).
- _Avoid:_ a guard that hand-lists today's keys; forcing keys to `optional: false`, which
  breaks the deliberate optional-OpenRouter design; a CI gate that needs production
  credentials.
- _Cheapest layer:_ one offline unit test that reads the schema as the source of truth and
  asserts parity with the stub and `.env.example`, plus a rule about access type. Live
  parity (`wrangler secret list` names, the Supabase Site URL) goes in a **pre-deploy
  checklist or script** run by a person, because deploy is manual and needs credentials.

### Risk D — Regression only the deployed shape exposes

**Flow map.**

| Flow                         | Mechanism                                                                                                                                                       | Works without hydration?                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Sign in / sign up            | island wrapping a native `<form method="POST">` (`signin.astro:16`, `SignInForm.tsx:36-43`, `SignUpForm.tsx:66`)                                                | yes                                                              |
| Sign-in handler              | server POST → `setAll` into `context.cookies` → redirect (`signin.ts:20,26,37`; `supabase.ts:17-21`)                                                            | —                                                                |
| Middleware                   | reads the `Cookie` header → `getUser()` → `locals.user` / `sessionUnresolved`; `PROTECTED_ROUTES` page prefixes only (`middleware.ts:5,12-40`)                  | —                                                                |
| Cookie options               | none passed, so `@supabase/ssr` defaults apply: path `/`, sameSite lax, not httpOnly, 400 days (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`) | —                                                                |
| Played / like / loan toggles | native POST forms in the `GameCard` island (`GameCard.tsx:63,82,99,119`)                                                                                        | yes                                                              |
| Edit / delete-confirm        | `useState` mode switch (`GameCard.tsx:25-44,128-132`)                                                                                                           | **no**                                                           |
| Recommendations              | only client `fetch`: `preventDefault`, then JSON POST (`RecommendationFlow.tsx:68-104`); the form has no `action`                                               | **no**: an unhydrated submit reloads `/play` with a query string |

**Coverage gaps.** Handler tests inject `locals.user` and stub cookies
(`src/test/apiContext.ts:61-85`). `auth.test.ts` mocks `@/lib/supabase` completely. **No test
imports `middleware.ts`.** No test covers the `Set-Cookie` → next request → `locals.user`
round trip. The island's hard-coded path and response handling are untested: there are no
`*.test.tsx` files and no jsdom or testing-library. The route suite sends numeric criteria
while the island sends strings, and that is covered only one level down
(`recommendationView.test.ts:28-38`). No test renders an Astro page. The db suite uses raw
JWTs and "does NOT exercise the app's own authentication" (`src/test/db/README.md`).

**Incident history: no browser-only regression reached production.**

- Vite cache corruption, 2026-08-01 (`visual-identity-themes/plan.md:667-735`): client-side
  chunk 404s and pages cut off at the first island. Dev server only; the prod build was clean.
  An E2E run against `astro preview` would not have caught it.
- Landing hero ignoring auth state (`7c9f9e5`): an SSR HTML check with a cookie catches it,
  no browser needed.
- Unguarded `getUser()` in middleware (`46a59f0`, impl-review F1 in
  `context/archive/2026-07-24-ai-play-recommendation/reviews/impl-review.md`): unit-testable.
- `useFormStatus` never firing after `preventDefault`: browser-only in nature, but caught at
  plan review (`ai-play-recommendation/reviews/plan-review.md:59-65`).
- The two Chrome checks behind Q4 (`guardrails/plan.md:644,661`): row 4.9 was a transient
  provider hiccup that produced the logging lesson. It was not a cookie or hydration defect.

**Playwright cost.**

- `astro dev` and `astro preview` both run workerd
  (`@astrojs/cloudflare/dist/entrypoints/preview.js:7`, adapter 13.5.0), so local runs are
  representative apart from real HTTPS.
- It needs the local Supabase stack, which `db-tests` already boots (`ci.yml:44`). The CI
  build step uses production secrets (`ci.yml:30-33`), so an E2E build must point at the
  local stack instead.
- Confirmations are off (`config.toml:209`), so `createMember`/`createTwoMembers`
  (`src/test/db/harness.ts:136-156`) seed users directly.
- The LLM call is made server-side inside workerd, so `page.route` cannot stub it, and
  stubbing `/api/recommendations` in the browser defeats D. The deterministic route is to
  leave `OPENROUTER_API_KEY` unset: that yields `not_configured` through the full cookie,
  middleware, route and island path. The alternative, a base-URL env plus a stub server,
  changes app code and overlaps C.
- New tooling: `@playwright/test`, a Chromium download and CI cache, `webServer` config
  (build + preview), a project separate from Vitest. Adds minutes per run.

**Corrected guidance.**

- _Prove, cheapest first:_
  1. **`db`-project integration** (no browser): the real `signin.ts` POST against the local
     stack with a small cookie store, recorded `set` calls replayed as a `Cookie` header,
     then `onRequest`, then assert `locals.user.id`. Also: `/catalog` without a cookie
     redirects to signin, and a bad cookie gives `user: null`. Needs an alias for
     `astro:middleware`'s `defineMiddleware`, like the existing `astro:env/server` one.
  2. **Middleware unit tests** in `unit`: the gate prefixes, and a `getUser` throw giving
     `sessionUnresolved`.
  3. **Optional behavioural Playwright** against `astro build && astro preview` plus the
     local stack, at most: (i) sign in → `/catalog` → sign out → `/catalog` redirects;
     (ii) `/play` with no provider key: client validation blocks an empty submit, then
     Players=3 renders the `not_configured` panel; (iii) optionally Edit on a seeded card
     proves hydration, save, then the redirect shows the change.
- _Challenge:_ "only a browser sees cookie bugs" (the round trip is testable in-process);
  "manual Chrome checks imply a regression class" (the history shows none reached prod).
- _Avoid:_ visual assertions (Q5); stubbing `/api/recommendations` in the browser; E2E
  cases that repeat `boundary.test.ts`; running E2E against `astro dev` (cache flakiness,
  2026-08-01).
- **Only a browser can see:** island hydration (chunk 404, duplicate React, a dropped
  `client:load`), the island's real request path and body, and the browser actually
  keeping cookies across a redirect.

### Risk E — Gate or guard infrastructure breaks unnoticed

**Lint coverage: the premise is false for CI.** `eslint.config.js:81-90` covers
`scripts/**/*.mjs` with `disableTypeChecked` (recommended rules, including `no-undef`, stay on). Root
`.js`/`.mjs` configs are linted with type-checked rules. This was confirmed by probes:
parse errors, `no-undef` and unused variables all exit 1. Only the lint-staged key
(`lint-staged.config.js:20`, `"*.{ts,tsx,astro}"`) and the Stop-hook pathspec
(`.claude/hooks/quality-gate.sh:52`) skip them. Impl-review F3 already said "`npm run lint`
in CI does cover the `.js`/`.mjs` files; nothing covers the `.sh`"
(`context/archive/2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md:93-116`,
decision PENDING).

**Loud failures are handled.** A syntax or runtime error in any guard exits non-zero, a
missing npm script exits non-zero, and Vitest with zero files exits 1.

**Vacuous passes: the genuine defect.** Proven against scratch copies of the scripts:

- `scripts/check-color-literals.mjs`
  - No minimum file count (`:75-78,106`). An empty `src/` gives "No colour literals in 0 files.", exit 0.
  - Hardcoded extensions (`:25`): `.mts`/`.mjs`/`.mdx`/`.svg`/`.html` and `public/` are never scanned.
  - **Stale hardcoded `PALETTE` (`:29-54`).** The installed tailwindcss 4.2.4 defines
    `mauve`/`olive`/`mist`/`taupe`, and fixtures with `bg-mauve-500` and `text-olive-700`
    passed. `PREFIX` (`:57`) lacks `border-s`/`border-e`, and `border-s-red-500` passed.
    **A real hole today.**
- `scripts/check-games-read-guard.mjs`
  - No minimum count (`:84-87,156`). An empty tree gives "All 0 `games` read(s)", exit 0. Today it
    finds 2 reads in 69 files, and nothing asserts that stays at least 2.
  - `TABLE_RE` (`:65`) matches only literal `.from("games")`: `.from(T)` and
    `.from("games" as const)` are invisible, and the fail-closed "unrecognised" branch
    (`:113-122`) is never reached.
  - Raw substring tests (`:104,110`) count comments. `// TODO .update( later` classes a
    read as a write, and `// no .is("deleted_at", null) here` classes a read as guarded.
  - `.mts` reads are skipped (`:47`).
- `scripts/check-contrast.mjs` mostly fails closed (`:156-160,168-170,182-184,189-191,208-210`).
  Silent gaps: hand-maintained `THEMES`/`INK_ROLES`/`GRADIENT_TEXT` (`:36-40,56-63,96-104`);
  a fourth theme is never checked, though 3 blocks exist today (`src/styles/global.css:22,116,189`).
  `blockFor` (`:108`) reads only the first matching selector block. There is no
  `checks > 0` assertion (`:247`). Today: 87 assertions across 3 themes.
- `.claude/hooks/quality-gate.sh` fails closed on a bad directory and on `git status` errors
  (`:33-36,52-55`, fixed in `39b628d`). Silent gaps:
  - Edits to `.mjs`/`.json`/`.sh`/`.yml` exit 0 (`:56-58`).
  - It never runs `lint` or the `lint:*` guards.
  - A lost exec bit or wrong settings path gives a non-blocking error nothing detects.
  - No shellcheck. `bash -n` would cover syntax more cheaply.
- Husky activates only if `prepare` ran (fixed in `c5facff`); `core.hooksPath` is `.husky/_`
  today. `--ignore-scripts` or `HUSKY=0` silently disables it; the only safeguard is a
  sentence in `CLAUDE.md`.
- **Nothing detects a removed gate.** No test reads `ci.yml`, `package.json` scripts,
  `.claude/settings.json` or `.husky/pre-commit`. Deleting `- run: npm run lint:reads` from
  `ci.yml` stays green.
- **No deliberate-break check has ever been run on the three `lint:*` guards.** The
  2026-09-14 archive break-checked only the commit gate and the Stop hook
  (`quality-gate-wiring/plan.md:422-442`). Row 2.7 proved the script half; Claude Code
  honouring exit 2 was not observed live.

**Corrected guidance.**

- _Prove:_ each guard exits non-zero on a known-bad fixture and on an empty or
  zero-match scan; the colour guard's palette tracks the installed Tailwind; removing a
  gate step from `ci.yml` or `package.json` fails `npm test`.
- _Challenge:_ "the gate exists, therefore it runs"; ".mjs is unlinted" (it is linted);
  "exit 0 means clean".
- _Avoid:_ adding lint globs or shellcheck and calling it done, with no deliberate-break
  check; fixtures that pass for the wrong reason.
- _Cheapest layer, in order:_
  1. minimum-count floors in both scanners;
  2. derive `PALETTE` from `node_modules/tailwindcss/theme.css` and add `s|e` to the border
     prefix;
  3. a unit self-test per guard that runs `node scripts/x.mjs` on a temporary fixture tree
     (needs a root override, since `ROOT` comes from `import.meta.url`:
     `check-color-literals.mjs:23`, `check-games-read-guard.mjs:45`, `check-contrast.mjs:33`);
  4. a unit test asserting `ci.yml` carries each gate step and `package.json` carries
     `prepare` plus the guard scripts;
  5. optionally, `bash -n` (or shellcheck) in CI and comment stripping in the games guard.

## Stale §4 / §5 facts (current as of c1f9a83)

- **§4 existing suite (`test-plan.md:199`):** now **20 files: 15 unit, 5 db**. Unit: 7 services, **5**
  API-route (`auth`, `games/boundary`, `games/index`, `recommendations`, `theme`), plus theme,
  types and 1 component (`GameForm.test.ts` tests `fromRow`, not rendering). **188 unit tests**
  (`npx vitest run --project unit`, Vitest 4.1.10, 1.60s); **35 db tests**
  (`npx vitest list --project db`; 30 static `it(` sites, one `it.each` over 6).
- **§4 API mocking (`:200`):** "24 service tests and 6 route tests" is stale. `vi.stubGlobal("fetch")`
  now lives only in `src/test/providerStub.ts:38` (`stubFetch`), with 23 call sites in
  `recommendations.test.ts` (26 tests) and 9 in `api/recommendations.test.ts` (9 tests). The
  cited `recommendations.ts:87` is now `:91`.
- **§4 DB/RLS (`:201`):** Supabase CLI "2.23.x" is stale. **2.98.2** is installed, range `^2.23.4`.
  Note the CI stack isn't pinned to prod image versions (Risk A).
- **§4 e2e (`:202`):** "deliberately not planned" must change to reflect D's conditional plan.
- **§4 CI (`:205`):** "What Phase 5 still owes: the local edit-loop gate alone" is stale; Phase 5 is complete.
- **§4 grounding tools (`:209-212`):** `checked: 2026-09-02`. Still accurate in substance: no
  Context7, `claude-in-chrome` available, no Playwright MCP, `gh`/`supabase` CLIs local.
  Re-date on refresh.
- **§5 colour-literal + contrast (`:225`):** "Where: local" is stale; both run in CI.
- **§5 typecheck (`:223`):** "husky runs `eslint --fix` only" is stale as a present-tense statement.
- **§5 pre-prod smoke (`:231`):** still optional and unwired. This is where C's live-parity checklist belongs.
- **Versions:** astro 6.3.1, @astrojs/cloudflare 13.5.0, @astrojs/react 5.0.4, wrangler 4.90.0,
  react 19.2.6, typescript 5.9.3, eslint 9.39.4, typescript-eslint 8.59.2, husky 9.1.7,
  lint-staged 16.4.0, tailwindcss 4.2.4, vite 7.3.3 (override), @supabase/supabase-js 2.105.3.
  No playwright, puppeteer, cypress, testing-library, jsdom, happy-dom or msw. `axe-core` is
  transitive only, via jsx-a11y.

## Code References

- `src/lib/services/recommendations.ts:5,11,97-111` — provider URL, model default, request body
- `src/lib/services/recommendations.ts:114-128` — transport, timeout, non-2xx and envelope branches; **none log**
- `src/lib/services/recommendations.ts:133-137` — invalid-content log records `content`, not the envelope
- `src/lib/services/recommendations.ts:175-180` — `no_match` on empty list, not logged
- `src/lib/services/recommendations.ts:8-9` — comment claiming `OPENROUTER_MODEL` is runtime-overridable
- `src/pages/api/recommendations.ts:96` — every modelled failure returned as 200 with no log
- `src/test/providerStub.ts:23-27,38` — stub envelope mirrors `OpenRouterBody`; the single `stubGlobal` site
- `src/pages/api/auth/signup.ts:26-36` — signUp error handling; unconditional confirm-email redirect
- `src/pages/auth/confirm-email.astro:4,13-18` — copy chosen from `import.meta.env.DEV`
- `astro.config.mjs:19-22` — env schema; `OPENROUTER_MODEL` is `access: "public"`
- `node_modules/astro/dist/env/vite-plugin-env.js:74-80,106,133-148` — public inlined at build, secrets skipped at build and read at runtime
- `src/test/astro-env-server.stub.ts:5-8` — test stub keys (no parity check)
- `.github/workflows/ci.yml:27-29,44` — unused build secrets; db-tests stack boot
- `supabase/config.toml:154,181-182,209,220` — local site_url, email rate limit, confirmations off, SMTP off
- `src/middleware.ts:5,12-40` — the session gate; no test imports it
- `src/lib/supabase.ts:6-22` — null client on missing config; cookie getAll/setAll
- `src/components/RecommendationFlow.tsx:68-104` — the only client fetch; no form action
- `src/components/catalog/GameCard.tsx:25-44,128-132` — hydration-dependent edit and delete-confirm
- `src/test/apiContext.ts:61-85` — handler harness injects `locals` and stub cookies
- `src/test/db/harness.ts:136-156` — reusable member seeding for any E2E global setup
- `eslint.config.js:81-90` — `scripts/**/*.mjs` is linted
- `lint-staged.config.js:20`; `.claude/hooks/quality-gate.sh:52,56-58` — local gates skip `.mjs`/`.sh`/`.yml`
- `scripts/check-color-literals.mjs:25,29-54,57,75-78` — extension list, stale palette, border prefix, no floor
- `scripts/check-games-read-guard.mjs:47,65,84-87,104,110` — extensions, literal-only table match, no floor, comment-fooled checks
- `scripts/check-contrast.mjs:36-40,56-63,108,247` — hand-maintained theme/role lists, first-block-only, no check floor

## Architecture Insights

- **One silent branch carries three risks.** `recommendations.ts:114-128` is where retired
  models and rejected flags (A), quota exhaustion (B), and a wrong or revoked key (C) all
  land. Logging that branch with status plus a truncated body gives the most signal for
  the least effort in this refresh.
- **Degrade-visibly is the house pattern for missing config** (null client, banner, typed
  `not_configured`). The refresh should protect that pattern, not replace it with required
  keys.
- **The access type in `astro:env` is a runtime contract, not a label.** `public` means
  frozen at build. Any guard for C has to reason about access type, not only about key
  names.
- **The guards are regex scanners over hand-maintained lists.** They fail closed on
  structure they recognise and pass vacuously on structure they don't. The same fix
  applies to all three: a floor, a derived source of truth, and a known-bad fixture.
- **The test harnesses are deliberately in-process.** `apiContext.ts` fakes `locals` and
  cookies, and `supabaseDouble.ts` models no rows. That is why the app's own auth
  integration (cookie → middleware → `locals.user`) has never been exercised, even though
  every layer on either side of it is tested.
- **Real external services appear in the suite only as the local Supabase stack.** No
  test touches OpenRouter, hosted Supabase or Cloudflare. That is correct for per-push
  gates, but it puts every live-parity check in a manual, pre-deploy or scheduled layer.

## Historical Context (from prior changes)

- `context/archive/2026-09-13-testing-llm-recommendation-guardrails/plan.md:102,105` — no MSW or nock; no real provider from tests
- `context/archive/2026-09-13-testing-llm-recommendation-guardrails/plan.md:566-571` — oracle defined for the outbound payload only
- `context/archive/2026-09-13-testing-llm-recommendation-guardrails/research.md:168-172` — `OPENROUTER_MODEL` inlining and the `.dev.vars` → `dist/` copy, noted and left open
- `context/archive/2026-09-13-testing-llm-recommendation-guardrails/research.md:217-219` — non-2xx body never read; fetch rejection unlogged; still open
- `context/archive/2026-08-01-visual-identity-themes/plan.md:547-567,594` — live provider runs; a real 429 quota; a `:free` model rejecting the `reasoning` flag
- `context/archive/2026-08-01-visual-identity-themes/plan.md:667-735` — Vite cache corruption (dev-only hydration failure)
- `context/archive/2026-08-01-visual-identity-themes/plan.md:843` — retry declined because it spends quota
- `context/archive/2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md:93-116` — F3 (gate infra outside lint), decision pending
- `context/archive/2026-09-14-testing-quality-gate-wiring/plan.md:422-442` — break-checks done for the commit and Stop gates only
- `context/archive/2026-09-12-testing-per-member-state-attribution/change.md:43-47` — the `project_id` collision
- `context/archive/2026-07-24-ai-play-recommendation/reviews/impl-review.md` (F1), `.../plan-review.md:59-65` — middleware `getUser` guard; `useFormStatus` after `preventDefault`
- `context/changes/deployment/deployment-plan.md:12,25-27,33-36` — manual secrets and deploy; OpenRouter omitted; email confirmation not implemented
- `context/foundation/infrastructure.md:58,63` — pre-mortem on secret drift; Workers limits unknown
- `context/foundation/lessons.md:5-10,26-30` — migrations to prod; log every non-2xx branch

## Related Research

- `context/archive/2026-09-11-testing-api-boundary-contract/research.md`
- `context/archive/2026-09-12-testing-per-member-state-attribution/research.md`
- `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/research.md`
- `context/archive/2026-09-13-testing-llm-recommendation-guardrails/research.md`
- `context/archive/2026-09-14-testing-quality-gate-wiring/research.md`

## Open Questions

1. **Is the Cloudflare Git integration (Workers Builds) still connected?** Commit `fcb09ae`
   hints it was. If it is, Cloudflare's builder decides the baked-in `OPENROUTER_MODEL`, and
   "deploy is manual" is wrong. Check the Cloudflare dashboard.
2. **What is the hosted Supabase project's Site URL, redirect allow-list and confirmation
   setting?** They are not in the repo, and they decide whether signup email links work in
   production. Check the dashboard; decide whether to record them in `infrastructure.md`.
3. **Were `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` ever set in production?** Nothing records
   it (`deployment-plan.md:25` left them out). Answerable with `wrangler secret list`.
4. **Product decisions B needs before tests can have an oracle:** should a daily-quota 429
   get its own `quota_exhausted` reason and copy? What should signup show for an obfuscated
   existing-account response?
5. **`OPENROUTER_MODEL` fix direction:** make it `access: "secret"` so it is read at runtime,
   or correct the comment, README and plan-brief to say "build-time". Either is valid; the
   guard asserts whichever is chosen.
6. **Does D's Playwright slice earn its cost** once the `db`-project cookie → middleware test
   exists? Decide after that test lands, not before.
7. **Real-provider smoke:** worth an `OPENROUTER_API_KEY` repository secret and 1 of 50
   daily requests per nightly run? Default recommendation is no, until a captured-fixture
   unit test exists and drift is observed.
8. **Exact provider limit payloads** (Supabase `over_email_send_rate_limit` status and code,
   OpenRouter 402 body) are recalled from provider behaviour, not evidenced in the repo, except the
   429 message text. Confirm against docs or a captured response before encoding them in
   fixtures.
