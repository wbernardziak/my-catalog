# API boundary contract — implementation plan

## Overview

Build the repository's first handler-executing test harness, then use it to lock
two invariants at the API boundary: **every endpoint denies an unauthenticated
caller on its own**, and **invalid input is rejected without a write reaching
Supabase**. This is phase 1 of the rollout in `context/foundation/test-plan.md`
(risks #2 and #4).

## Current State Analysis

Grounded in `context/changes/testing-api-boundary-contract/research.md`
(commit `ad71405`, same session):

- `src/middleware.ts:5` gates only `/dashboard`, `/catalog`, `/stats`, `/play`.
  Nothing gates `/api/*`, so each handler's own `if (!context.locals.user)` block
  is the only auth gate — hand-copied verbatim into seven files with no shared
  helper (`index.ts:63-65`, `[id].ts:22-24`, `delete.ts:20-22`, `loan.ts`,
  `played.ts`, `preference.ts` all at `:27-29`, `recommendations.ts:38-40`).
- `games` carries no ownership concept by design: every RLS policy is
  `using (true)` for role `authenticated`, and `created_by` is attribution-only
  (`supabase/migrations/20260710120000_create_games.sql:6-7,30-55`).
- The two member-id write sites read the session: `played.ts:45`,
  `preference.ts:48`.
- Validation gaps: `delete.ts` has no zod at all (its only check is `if (!id)`,
  `:25-27`); no endpoint validates the `[id]` route param; `formData()` is parsed
  outside any try/catch at `index.ts:67`, `[id].ts:31`, `loan.ts:36`,
  `played.ts:36`, `preference.ts:36`.
- No test in the repo invokes a `/api/games/*` handler. `index.test.ts` unit-tests
  `newGameSchema`; `id-endpoints.test.ts:17-23` is a `readFileSync` source-grep.
  `theme.test.ts:12-28` is the only fake-context precedent (no `locals`, no `params`).
- No Supabase double exists anywhere, and four service tests state the convention
  not to mock Supabase (`catalogGames.test.ts:6-9` and siblings).

## Desired End State

`npm test` executes every in-scope handler for real. An unauthenticated call to
any of the seven endpoints is proven to be denied *and* to write nothing; an
invalid body is proven to be rejected *and* to write nothing; the two per-member
writes are proven to carry the session's member id. A guard deleted from any one
handler turns the suite red. CI fails on an empty or uncollectable suite.

### Key discoveries

- `createClient` is imported from `@/lib/supabase` by all seven handlers and
  returns `null` when env is missing (`src/lib/supabase.ts:5-8`) — so
  `vi.mock("@/lib/supabase")` is the single injection point for the double.
- The chain surface the double must support is exactly what the services call:
  `.from().select()/.insert()/.update()/.upsert()/.delete()/.eq()/.is()/.single()/.maybeSingle()`
  (`src/lib/services/games.ts:83-174`, `src/lib/services/memberGameState.ts:39-115`).
- `App.Locals` is declared in `src/env.d.ts` as `{ user: User | null; theme: Theme }` —
  the context factory must satisfy that shape, not invent one.
- `vitest.config.ts:14` already aliases `astro:env/server` repo-wide; the harness
  inherits it with no new configuration.
- Every `/api/games/*` failure is a 302 with an `?error=` query string
  (`index.ts:78-81` and siblings); `/api/recommendations` is the only endpoint
  with real status codes (`:35-40`).

## What We Are NOT Doing

- **Not** asserting ownership on `games`. Any member may edit any game by design;
  a test to the contrary would encode the opposite of the decision made on
  2026-07-09 (`context/archive/2026-07-09-add-and-view-games/plan-brief.md:36`).
- **Not** proving RLS. The spy-only double cannot, and must never be described as
  if it could — that is phase 2's local-Supabase work.
- **Not** extracting the seven duplicated guards into a shared helper. That is a
  production refactor; it should ride on a later change that these tests protect.
- **Not** changing the games endpoints to return status codes instead of redirects.
- **Not** adding coverage thresholds, MSW, or a local Supabase stack.
- **Not** touching `/api/auth/*` or `/api/theme` (scope agreed during research).

## Implementation Approach

Harness first, then one phase per risk, then cleanup. The double is deliberately
shallow: chainable, with `insert`/`update`/`upsert`/`delete` as `vi.fn()` spies
returning a canned result. It answers exactly one question — *was a write
issued?* — which is what "no persisted side effect" needs, and it cannot
accidentally masquerade as an authorization oracle.

Where a test exposes a genuine defect (the most likely being an unhandled 500
from `formData()`), the fix lands in the same phase, justified by the failing
test. No production edit is made on taste alone.

## Critical Implementation Details

**Mock hoisting.** `vi.mock` is hoisted above imports, so the double's factory
cannot close over variables declared later in the file; the per-test spy handles
must be reachable through a function (e.g. a getter exported from the harness
module) rather than captured at module scope. This is the one place where the
obvious arrangement silently breaks.

**Redirect capture.** `context.redirect` is a function the handler calls, not
something Astro supplies in tests — the factory must provide one that returns a
real `Response` with a `Location` header, so assertions read the response rather
than the mock's call args (`theme.test.ts:60` reads call args, which is why it
never checks status).

---

## Phase 1: Test harness

### Overview

Two small modules under `src/test/`, plus one end-to-end proof that a real
handler can be driven and its write observed.

### Changes Required:

#### 1. API context factory

**File**: `src/test/apiContext.ts`

**Purpose**: Build an `APIContext`-shaped object for handler tests, expressing an
authenticated or unauthenticated caller, route params, and a form or JSON body,
so seven test files do not each hand-roll one.

**Contract**: A named export taking `{ user?, params?, form?, json?, url? }` and
returning an object cast to `APIContext` carrying `request` (a real `Request`),
`locals` matching `App.Locals` from `src/env.d.ts` (`user` defaulting to `null`,
`theme` to the default theme), `params`, `cookies` with `get`/`set`/`has`/`delete`
as `vi.fn()`, and `redirect(path)` returning a real `Response` with status 302 and
a `Location` header.

#### 2. Supabase double

**File**: `src/test/supabaseDouble.ts`

**Purpose**: Stand in for the client returned by `createClient`, recording whether
any write was issued, without modelling rows or filters.

**Contract**: A factory returning `{ client, writes }` where `client.from(table)`
yields a chainable, thenable object supporting `select`, `insert`, `update`,
`upsert`, `delete`, `eq`, `is`, `single`, `maybeSingle`, resolving to a
configurable `{ data, error }`; and `writes` exposes the `vi.fn()` spies for
`insert`/`update`/`upsert`/`delete` plus a convenience assertion that none fired.
A doc comment must state plainly that this double proves *no write was issued*
and proves nothing about authorization — phase 2 owns that.

#### 3. First end-to-end proof

**File**: `src/pages/api/games/boundary.test.ts` (new)

**Purpose**: Prove the harness works before building on it: one unauthenticated
`POST /api/games` asserting the redirect to `/auth/signin` and an unfired write
spy, and one valid authenticated post asserting the write *did* fire.

**Contract**: Uses `vi.mock("@/lib/supabase")` so `createClient` returns the
double's client; the positive case is what makes the negative case meaningful —
without it the spy assertion could pass for the wrong reason.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with the new file
- `npm run lint` passes
- The negative case fails when the guard at `src/pages/api/games/index.ts:63-65` is temporarily deleted (deliberate-break check)
- The positive case fails when the double's `insert` spy is temporarily made unreachable

#### Manual Verification:

- The double's doc comment states its limits, so a future reader cannot mistake it for an authorization oracle

---

## Phase 2: The auth invariant

### Overview

Table-driven coverage of the guard across all seven endpoints, plus the
member-id-from-session assertions.

### Changes Required:

#### 1. Endpoint table

**File**: `src/pages/api/games/boundary.test.ts`

**Purpose**: Drive every in-scope endpoint unauthenticated from one table, so a
dropped guard in any single file fails immediately and adding a row is the only
work a new endpoint needs.

**Contract**: A table of `{ name, handler, params?, form?, json?, expected }`
covering `POST /api/games`, `/api/games/[id]`, `.../delete`, `.../loan`,
`.../played`, `.../preference` (each expecting a 302 to `/auth/signin`) and
`POST /api/recommendations` (expecting 401 with a JSON error body). Every row
also asserts no write spy fired. The table's comment records that a new endpoint
must be added here.

#### 2. Member-id binding

**File**: `src/pages/api/games/boundary.test.ts`

**Purpose**: Prove the two per-member writes carry the session's member id, not a
request field — the app-layer half of member attribution, with the policy half
left to phase 2 of the rollout.

**Contract**: For `played` and `preference`, post a body that also contains a
`memberId`/`member_id` field naming a *different* user, and assert the value
handed to the service (or reaching the double's `upsert`) is the session user's
id. Covers `played.ts:45` and `preference.ts:48`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- Removing the guard from any one of the seven handlers turns the suite red (spot-check at least two files)
- `npm run lint` passes

#### Manual Verification:

- The table reads as a legible inventory of the boundary — a reviewer can see at a glance which endpoints are covered

---

## Phase 3: Input rejection without side effects

### Overview

Per-endpoint invalid input, the unvalidated `[id]` param, and the
malformed-`formData()` probe. Fix only what a test proves broken.

### Changes Required:

#### 1. Invalid-body cases

**File**: `src/pages/api/games/boundary.test.ts`

**Purpose**: Assert that a malformed, wrong-typed or out-of-range body is rejected
*and* leaves no write, for each validating endpoint.

**Contract**: At minimum — `POST /api/games` with `maxPlayers < minPlayers` and
with a missing title; `loan` with a value outside `available|loaned`; `played`
with a non-boolean; `preference` with a value outside `liked|disliked|clear`;
`/api/recommendations` with a non-JSON body (expect 400) and with a missing
`playerCount` (expect 400). Each asserts the redirect target or status *and* an
unfired write spy.

#### 2. The `[id]` param

**File**: `src/pages/api/games/boundary.test.ts`

**Purpose**: Characterize what the four id-scoped endpoints do with an empty and
a non-UUID id, since none validates it (`[id].ts:26-29`, `delete.ts:24-27`,
`loan.ts:31-34`, `played.ts`/`preference.ts` likewise).

**Contract**: Empty id asserts the `GAME_NOT_FOUND_MESSAGE` redirect. Non-UUID id
asserts the observed behaviour with the double returning a Postgres-style error —
documenting that a bad id is indistinguishable from a DB failure. If that proves
to be a real defect worth fixing, add id validation and update the assertion;
otherwise record the finding in the test's comment.

#### 3. Malformed body probe

**File**: `src/pages/api/games/boundary.test.ts`, and handlers if it fails

**Purpose**: Settle research open question #3 — whether an unparseable multipart
body escapes as an unhandled 500 (`index.ts:67` and four siblings).

**Contract**: Drive `POST /api/games` with a `Request` whose body cannot be parsed
as form data and observe. If the handler throws, wrap the `formData()` parse in
the five handlers so it becomes the house `?error=` redirect, and assert that.
If Astro/undici already yields an empty `FormData`, assert the resulting
validation redirect and close the question in the plan's Progress notes.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- Every invalid-input case asserts an unfired write spy, not only a response
- `npm run lint` and `npm run build` pass (the build matters if handlers were edited)

#### Manual Verification:

- If handlers were edited, a manual post of a valid game through the UI still saves and redirects to `/catalog`
- If handlers were edited, an invalid post still shows the friendly `?error=` message

---

## Phase 4: Cleanup and gate

### Overview

Retire the superseded test, make the CI gate real, and write down the pattern.

### Changes Required:

#### 1. Delete the source-grep test

**File**: `src/pages/api/games/id-endpoints.test.ts` (deleted)

**Purpose**: Its assertions pass even if the constant is never used; the not-found
path is now covered by real invocations.

**Contract**: Before deleting, confirm the new suite asserts the
`GAME_NOT_FOUND_MESSAGE` redirect on each of the four id endpoints, so coverage
moves rather than disappears.

#### 2. Make the gate real

**File**: `package.json`

**Purpose**: With a suite in place, an empty or uncollectable run must fail CI.

**Contract**: `test` becomes `vitest run` (drop `--passWithNoTests`). No CI
workflow change — `.github/workflows/ci.yml:27` already runs `npm test`.

#### 3. Write down the pattern

**File**: `context/foundation/test-plan.md`

**Purpose**: §6.2 is a TBD stub; fill it in from what was actually built, and mark
rollout phase 1 done.

**Contract**: §6.2 names the harness modules, the table-driven layout, the
redirect-plus-unfired-spy assertion shape, and the double's stated limits. The §3
status cell for phase 1 becomes `done`; §5's "unit + integration" gate row moves
from planned to wired. Add a §6.6 note recording any handler fix made in phase 3.

### Success Criteria:

#### Automated Verification:

- `npm test` passes and fails when the suite is emptied
- `npm run lint` passes
- `git grep -c readFileSync src/pages/api` returns nothing

#### Manual Verification:

- A reader following §6.2 alone could add a test for a new endpoint without reading this plan

---

## Testing Strategy

### Unit tests

- Existing `newGameSchema` tests in `src/pages/api/games/index.test.ts` stay as they are — they cover schema shape, which the boundary suite does not duplicate.

### Integration tests

- All new work is integration at the route-handler layer: real handler, real `Request`, fake client.
- Each case asserts a response *and* the absence (or presence) of a write. A response assertion alone would let a "denied" redirect that still wrote pass.

### Deliberate-break checks

- Delete a guard → suite red (phase 2).
- Empty the suite → `npm test` red (phase 4).
These are the evidence that the tests can fail; run them, then revert.

### Manual steps

1. After any handler edit in phase 3, add a game through the UI and confirm it saves.
2. Confirm an invalid submission still shows the friendly error on `/catalog`.

## References

- Research: `context/changes/testing-api-boundary-contract/research.md`
- Rollout plan: `context/foundation/test-plan.md` §2 (risks #2, #4), §3 phase 1
- Fake-context precedent: `src/pages/api/theme.test.ts:12-28`
- Chain surface to support: `src/lib/services/games.ts:83-174`, `src/lib/services/memberGameState.ts:39-115`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles.

### Phase 1: Test harness

#### Automated

- [x] 1.1 `npm test` passes with the new file — a454643
- [x] 1.2 `npm run lint` passes — a454643
- [x] 1.3 Negative case fails when the guard in `index.ts` is temporarily deleted — a454643
- [x] 1.4 Positive case fails when the `insert` spy is temporarily unreachable — a454643

#### Manual

- [ ] 1.5 Double's doc comment states its limits

### Phase 2: The auth invariant

#### Automated

- [x] 2.1 `npm test` passes
- [x] 2.2 Removing a guard from any one handler turns the suite red (two files spot-checked)
- [x] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 The table reads as a legible inventory of the boundary

### Phase 3: Input rejection without side effects

#### Automated

- [ ] 3.1 `npm test` passes
- [ ] 3.2 Every invalid-input case asserts an unfired write spy
- [ ] 3.3 `npm run lint` and `npm run build` pass

#### Manual

- [ ] 3.4 If handlers were edited, a valid game still saves through the UI
- [ ] 3.5 If handlers were edited, an invalid post still shows the friendly error

### Phase 4: Cleanup and gate

#### Automated

- [ ] 4.1 `npm test` passes and fails when the suite is emptied
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 No `readFileSync` remains under `src/pages/api`

#### Manual

- [ ] 4.4 §6.2 alone is enough to add a test for a new endpoint
