---
date: 2026-09-11T19:49:47+02:00
researcher: Wojciech Bernardziak
git_commit: ad71405f04060bc5c0b404f6d90901855165deee
branch: test/api-boundary-contract
repository: my-catalog
topic: "Where authentication, authorization and input validation actually live at the API boundary (test rollout phase 1, risks #2 and #4)"
tags: [research, codebase, api, auth, rls, validation, testing]
status: complete
last_updated: 2026-09-11
last_updated_by: Wojciech Bernardziak
---

# Research: API boundary contract — auth, ownership, and input validation

**Date**: 2026-09-11T19:49:47+02:00
**Researcher**: Wojciech Bernardziak
**Git Commit**: `ad71405f04060bc5c0b404f6d90901855165deee`
**Branch**: `test/api-boundary-contract`
**Repository**: my-catalog

## Research Question

Ground phase 1 of `context/foundation/test-plan.md` — risks #2 (an unauthenticated
or non-owning request reaches a catalog or per-member-state endpoint) and #4
(malformed input accepted at an API boundary) — in the actual code. Scope agreed
with the user: `src/pages/api/games/**` plus `src/pages/api/recommendations.ts`;
auth and theme endpoints are background, not test targets.

Per §1 principle #3 of the test plan, the plan documents *what could fail*;
this document is the ground truth for *where* it lives. Where the two disagree,
this document wins.

## Summary

Four findings reshape what phase 1 should actually assert.

1. **Every in-scope endpoint already self-checks the session.** All seven
   hand-roll the same `if (!context.locals.user)` guard. The middleware does
   *not* gate `/api/*` — `PROTECTED_ROUTES` covers only four page prefixes
   (`src/middleware.ts:5`) — so that per-file guard is the *only* auth gate on
   the API surface, duplicated verbatim in seven files with no shared helper.
   This is the real risk #2: not a hole today, but an unguarded invariant that a
   refactor could silently drop in one file. Phase 1's job is to lock it.

2. **The "non-owning caller" half of risk #2 does not apply to `games`, by
   design.** `games` is a single shared catalog: every RLS policy is
   `using (true)` / `with check (true)` for role `authenticated`
   (`supabase/migrations/20260710120000_create_games.sql:32-55`), and `created_by`
   is attribution-only, explicitly "NOT used to gate access" (same file, lines
   6-7). A test asserting "user B cannot edit user A's game" would fail *by
   design*. The test plan's risk #2 wording needs amending — see Open Questions.

3. **Per-member state has no IDOR surface at the app layer.** The only two
   places a member id reaches a write are `src/pages/api/games/[id]/played.ts:45`
   and `.../preference.ts:48`, and both take `context.locals.user.id` from the
   session. No endpoint accepts a member id from a body, query or param. The DB
   independently enforces write-own (`member_id = auth.uid()`) on both tables.
   What phase 1 can prove cheaply is the app-layer half: the id handed to the
   service is the session's, never a request field. The policy half is phase 2.

4. **Risk #4 is where the genuine gaps are.** `delete.ts` has no zod schema at
   all; *no* endpoint validates the `[id]` route param (a non-UUID string goes
   straight into `.eq("id", id)` and surfaces as a generic "try again" message);
   and five handlers call `context.request.formData()` outside any try/catch,
   which is the most plausible route to the unhandled 5xx risk #4 names.

Also structurally important for the harness: **the six `/api/games/*` endpoints
never return a status code for a failure — every failure path is a 302 redirect
with an `?error=` query string.** Only `/api/recommendations` speaks JSON
status codes (401/400/500/503). Tests must assert redirect targets plus absence
of a write, not `expect(res.status).toBe(401)`.

## Detailed Findings

### The auth gate: present per-file, absent in middleware

`src/middleware.ts:5` defines `PROTECTED_ROUTES = ["/dashboard", "/catalog",
"/stats", "/play"]` and gates with `pathname.startsWith(route)`
(`src/middleware.ts:29`). None of those prefixes match `/api/games` or
`/api/recommendations`. The middleware still *runs* on API requests and
populates `context.locals.user` (`src/middleware.ts:12-27`) — it simply never
enforces anything there. Note the gate is a `context.redirect()`, so even for
pages it is a redirect rather than a denial.

Each endpoint therefore carries its own three-step block — `createClient(...)`,
a null-client branch, then the user branch:

- `src/pages/api/games/index.ts:56-65` — no client → redirect `/catalog?error=`; no user → redirect `/auth/signin`
- `src/pages/api/games/[id].ts:15-24`
- `src/pages/api/games/[id]/delete.ts:14-22`
- `src/pages/api/games/[id]/loan.ts:21-29`
- `src/pages/api/games/[id]/played.ts:21-29`
- `src/pages/api/games/[id]/preference.ts:21-29`
- `src/pages/api/recommendations.ts:30-40` — no client → `503 {"error":...}`; no user → `401 {"error":...}`

No shared guard exists: a search for `requireUser|requireAuth|withAuth|assertUser`
across `src/` returns nothing. Each file's own comment states the reason for the
duplication (e.g. `src/pages/api/games/[id].ts:20-21`: "the middleware gates
`/catalog`, but `/api/games/...` is not middleware-gated").

### Ownership: shared catalog by decision, per-member state by session id

| Table | RLS | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|---|
| `games` | enabled (`20260710120000_create_games.sql:30`) | `using (true)` | `using (true)` / `with check (true)` — lines 38-55 |
| `game_played` | enabled (`20260722092117_create_member_game_state.sql:57`) | `using (true)` (:59-63) | `member_id = auth.uid()` (:65-82) |
| `game_preference` | enabled (`20260722092117:84`) | `using (true)` (:86-90) | `member_id = auth.uid()` (:92-109) |

So writes to per-member state are genuinely owner-gated at the database; reads
are not. The migration states the assumption directly
(`supabase/migrations/20260722092117_create_member_game_state.sql:50-56`):
"one household == one tenant. `using (true)` on SELECT therefore means 'any
authenticated user of this Supabase project', not 'any member of my household'."

There is no `profiles`/`household`/`membership` table; "household" is implicit —
every authenticated user of the project is a member.

At the app layer, `setPlayed` / `setPreference` receive `context.locals.user.id`
(`played.ts:45`, `preference.ts:48`). Loan status is deliberately *not*
per-member — it is a shared column on `games`, since the household owns one
physical copy (`loan.ts:16-18`, and `20260722092117:7`).

### Input validation, endpoint by endpoint

| Endpoint | Body validation | Route param `id` | Write ordering |
|---|---|---|---|
| `POST /api/games` (`index.ts`) | `newGameSchema` — zod, incl. `maxPlayers >= minPlayers` refine (`index.ts:28-53`) | n/a | write at `:84`, after all checks |
| `POST /api/games/[id]` | reuses `newGameSchema` (`[id].ts:4`) | truthy check only (`:27-29`) | write at `:49` |
| `POST /api/games/[id]/delete` | **none — no zod in the file** | truthy check only (`:24-27`) | write at `:31` |
| `POST /api/games/[id]/loan` | `z.enum(["available","loaned"])` (`:10`) | truthy only (`:31-34`) | write at `:46` |
| `POST /api/games/[id]/played` | `z.enum(["true","false"])` (`:11`) | truthy only | write at `:45` |
| `POST /api/games/[id]/preference` | `z.enum(["liked","disliked","clear"])` (`:11`) | truthy only | write at `:48` |
| `POST /api/recommendations` | `criteriaSchema` via `parseCriteria` (`src/lib/services/recommendationView.ts:30-47`), JSON parse wrapped → 400 (`:44-53`) | n/a | read-only endpoint |

**No write precedes its checks in any handler** — verified by reading each file.
That ordering is exactly what risk #4's "leaves no persisted side effect" clause
asks for, and it is currently unguarded by any test.

The `filters` form field on `loan`/`played`/`preference` is taken raw but is
re-parsed through `parseGameFilters`/`serializeGameFilters`
(`src/lib/services/gameFilters.ts:80-86`, schema at `:17-24` with `.catch(undefined)`
per field), so the redirect target is always a same-origin `/catalog` URL —
redirect-target injection is already defended.

### Error translation and the 5xx surface

- All `/api/games/*` DB errors are caught and turned into an `?error=` redirect
  (`index.ts:83-87`, `[id].ts:48-56`, `delete.ts:29-38`, `loan.ts:45-53`,
  `played.ts:44-48`, `preference.ts:47-55`).
- `preference.ts:53-55` models the "must be played first" FK violation
  (SQLSTATE `23503` on `game_preference_game_id_member_id_fkey`,
  `src/lib/services/memberGameState.ts:82-97`) as an expected outcome, not an error.
- `recommendations.ts` returns JSON: 503 no-client, 401 no-session, 400 bad JSON
  or bad criteria, 500 on a catalog read failure (`:59-66`). `recommend()` itself
  never throws — provider failures become a discriminated union returned at 200
  (`:25-27`).
- **Unverified (inference, worth a test):** `context.request.formData()` is
  called outside any try/catch at `index.ts:67`, `[id].ts:31`, `loan.ts:36`,
  `played.ts:36`, `preference.ts:36`. A malformed multipart body would throw
  before the handler's own error handling, most likely surfacing as a framework
  500 rather than the friendly redirect. This is the single most plausible
  unhandled-5xx path in scope and has not been triggered, only read.

### The test harness: nothing to extend, everything to build

- `vitest.config.ts:8-18` — plain `defineConfig` from `vitest/config`,
  `environment: "node"`, two aliases: `@` → `./src` and `astro:env/server` →
  `src/test/astro-env-server.stub.ts`. No setup files, no globals (each test
  imports from `"vitest"`). The comment at `:4-7` records why `getViteConfig`
  cannot be used: the Cloudflare adapter's Vite plugin rejects a Vitest config
  at startup.
- **No test in the repo invokes a `/api/games/*` handler.**
  `src/pages/api/games/index.test.ts:2,34-69` imports `newGameSchema` and
  `parseAuthors` and unit-tests them directly.
  `src/pages/api/games/id-endpoints.test.ts:17-23,30-33` is a *source-text grep*
  — it `readFileSync`s each handler and asserts the file contains the string
  `"GAME_NOT_FOUND_MESSAGE"`. Its own comment (`:8-12`) says no Astro context or
  handler mock exists in this project.
- The only handler-executing API test is `src/pages/api/theme.test.ts`, whose
  local `contextWith()` factory (`:12-28`) builds `{ request, cookies: { set },
  redirect }` cast `as unknown as APIContext` — no `locals`, no `params`, no
  `cookies.get`. It asserts on mock call args and never reads `.status` off a
  returned `Response`.
- **There is no Supabase double anywhere** — no `vi.mock("@/lib/supabase")`, no
  query-builder fake. Four service tests state the convention explicitly, e.g.
  `src/lib/services/catalogGames.test.ts:6-9`: "the DB wrapper itself is verified
  manually (consistent with the codebase not mocking Supabase)". Same phrasing in
  `gameFilters.test.ts:6-9`, `preferenceStats.test.ts:6-9`,
  `recommendationView.test.ts:11-13`.
- No MSW, nock, supertest or node-mocks-http in `package.json` devDependencies.
  The `supabase` CLI (`^2.23.4`) is present but no test starts a local stack.
- Precedent for "assert nothing happened" exists, just not for Supabase:
  `theme.test.ts:60,69` (`expect(set).not.toHaveBeenCalled()`) and
  `recommendations.test.ts:142,204` (`expect(fetchMock).not.toHaveBeenCalled()`).

Harness building blocks, in dependency order — all **must be written** except
the last: (1) a shared `APIContext` factory able to express authenticated and
unauthenticated callers with `locals`/`params`/`cookies`/`redirect`;
(2) a Supabase double whose `insert`/`update`/`delete` are `vi.fn()` spies so a
test can prove no write was issued; (3) assertions that read the returned
`Response`'s status and `Location` header; (4) the `astro:env/server` stub —
already wired repo-wide via `vitest.config.ts:14`, reusable as-is.

## Code References

- `src/middleware.ts:5` — `PROTECTED_ROUTES`; `:29` — the `startsWith` gate that skips `/api/*`
- `src/pages/api/games/index.ts:28-53` — `newGameSchema`; `:56-65` — auth block; `:84` — write
- `src/pages/api/games/[id].ts:26-29` — raw `id`, truthy check only; `:49` — write
- `src/pages/api/games/[id]/delete.ts:24-27` — the only input check in the file
- `src/pages/api/games/[id]/loan.ts:10` — `loanSchema`; `:16-18` — loan is shared, not per-member
- `src/pages/api/games/[id]/played.ts:45` — member id from session
- `src/pages/api/games/[id]/preference.ts:48` — member id from session; `:53-55` — modeled FK outcome
- `src/pages/api/recommendations.ts:35-40` — the only real status codes in scope
- `src/lib/services/memberGameState.ts:82-97` — SQLSTATE `23503` handling
- `src/lib/services/gameFilters.ts:17-24,80-86` — filter re-sanitization on redirect targets
- `src/lib/services/recommendations.ts:151-156` — catalog-membership re-check on LLM output (phase 4 territory)
- `supabase/migrations/20260710120000_create_games.sql:6-7,30-55` — attribution-only `created_by`, open RLS
- `supabase/migrations/20260722092117_create_member_game_state.sql:50-56` — the household==tenant assumption
- `supabase/migrations/20260722143000_member_game_state_pk_and_indexes.sql:25-45` — PK promotion + member indexes
- `vitest.config.ts:8-18`, `src/test/astro-env-server.stub.ts` — the whole current harness
- `src/pages/api/theme.test.ts:12-28` — the only fake-context precedent
- `src/pages/api/games/id-endpoints.test.ts:17-23` — the source-grep test worth replacing

## Architecture Insights

- **Authorization is deliberately coarse and lives in RLS, not app code.** The
  app layer's contribution is "is there a session" plus "the member id is mine".
  Any test that expects app-code ownership checks on `games` is testing a
  requirement this project does not have.
- **Defense in depth is real but hand-rolled.** Seven copies of the same guard,
  each with a comment explaining that the middleware won't help. Duplication is
  the reason a test matters here: nothing structurally prevents one copy from
  being dropped.
- **The games API is a form-post surface, not a REST API.** Redirect-with-`?error=`
  is the house error convention (decided 2026-07-09, `context/archive/2026-07-09-add-and-view-games/plan.md:196-202`).
  `/api/recommendations` is the one JSON endpoint and the only one with status codes.
- **The DB is the authority for exactly two guarantees** — write-own on member
  state, and the composite FK forcing "played before preference". Everything else
  the PRD promises (upper bounds on numbers, soft-delete preserving history) is an
  application-code contract only.

## Historical Context (from prior changes)

- `context/archive/2026-07-09-add-and-view-games/plan-brief.md:36` — RLS model chosen as "any authenticated user reads+writes all rows; store `created_by`", justified by the PRD's "both members are equal owners".
- `context/archive/2026-07-09-add-and-view-games/plan-brief.md:77` — accepted at the time: "shared-catalog RLS means any future signup can see the catalog — acceptable for a household-scale MVP".
- `context/archive/2026-07-09-add-and-view-games/plan.md:196-202` — validation approach: zod at the boundary, server authoritative, failures redirect with the first message.
- `context/archive/2026-07-09-add-and-view-games/reviews/impl-review.md:56-64` (F2) — upper bounds added to zod only; the DB check constraints still carry lower bounds alone.
- `context/archive/2026-07-21-played-loan-and-preference/plan-brief.md:22` — "read-all, write-own (`member_id = auth.uid()`)" chosen deliberately so S-06 stats work and no member overwrites another's state.
- `context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:113-121` (F7) — the read-all gap was found, and "fixed" by documenting the household==tenant assumption, not by changing the policy.
- `context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:35-52` (F1) and `plan.md:273` — hard delete of a game cascades away every member's played/preference rows; accepted as an admin-only action, documented rather than remediated.
- `context/archive/2026-07-10-edit-and-archive-games/reviews/plan-review.md:60` — predicted this phase: the endpoint-level test "will either balloon or be quietly dropped" because no handler-mocking pattern exists. It was dropped; phase 1 is the payment of that debt.
- `context/archive/2026-07-11-filter-catalog/plan.md:27,50-51` — the house testing style: exercise exported pure functions and zod schemas directly, do not mock Supabase.
- `context/foundation/lessons.md` — the only recorded rule touching this work is the migration-push rule; phase 1 adds no migration, so it does not apply. No lesson covers authorization or validation.

## Related Research

No prior `research.md` exists for an API-boundary or testing topic; the archived
changes carry `plan-brief.md` / `plan.md` / `reviews/` only. This is the first
research artifact in the test rollout.

GitHub permalinks were not generated: the commit `ad71405` sits on the unpushed
local branch `test/api-boundary-contract`, so no stable blob URL exists yet.

## Open Questions

1. **Risk #2's wording needs amending in `context/foundation/test-plan.md` §2.**
   "An authenticated request for a resource the caller does not own" describes a
   guarantee this codebase deliberately does not offer for `games`. The defensible
   phase-1 restatement: *every endpoint denies an unauthenticated caller on its
   own, without relying on middleware; and every per-member write is bound to the
   session's member id rather than any request field.* Needs the user's call
   before the plan is written.
2. **How deep should the Supabase double go?** The repo convention is not to mock
   Supabase at all. Phase 1 needs *some* double to prove "no write was issued".
   A shallow spy (assert `insert`/`update` never called) is cheap and sufficient
   for risk #4; anything that claims to prove authorization would be the
   self-fulfilling fake the test plan warns against — that belongs to phase 2's
   local-Supabase harness.
3. **Is the `formData()` unhandled-5xx path real?** Worth one test that sends a
   malformed multipart body to `POST /api/games` and observes what comes back.
   If it is a framework 500, the fix (wrap the parse) is in scope for phase 1;
   if Astro already handles it, the row closes with evidence.
4. **Does `src/pages/api/games/id-endpoints.test.ts` get replaced?** Its
   source-grep assertions would become redundant once handlers are executed for
   real. Recommend deleting it in phase 1 rather than leaving two overlapping tests.
5. **Should the seven duplicated guards be extracted into one helper?** Tempting,
   but it is a production refactor riding on a testing phase. Recommend: write the
   tests first against the current shape, and leave extraction to a later change
   where the tests protect it.
