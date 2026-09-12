<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test rollout phase 2 — per-member state attribution

- **Plan**: `context/changes/testing-per-member-state-attribution/plan.md`
- **Scope**: Phases 1-4 of 4 (all complete)
- **Date**: 2026-09-12
- **Verdict**: REJECTED
- **Findings**: 2 critical, 4 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria were all re-run independently and pass: `npm test` 144/12,
`npm run test:db` 15/3, lint, typecheck, build, plus both negative cases and the
phase-3 break check. Scope is clean — every changed file was named in the plan, and
all six "What We Are NOT Doing" bullets hold.

## Findings

### F1 — Half the write predicates the phase exists to guard are unguarded

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — a real trade-off; worth pausing on
- **Dimension**: Plan Adherence (with a Safety consequence)
- **Location**: `src/test/db/writeOwn.test.ts`
- **Detail**: Phase 2's contract named six write-side predicates. Five denial cases
  exist; `game_played` UPDATE has none. Verified empirically by loosening each
  predicate on the live stack and re-running:

  | predicate                             | loosened → suite | guarded |
  | ------------------------------------- | ---------------- | ------- |
  | `game_played` INSERT `with check`     | 1 failed         | yes     |
  | `game_played` UPDATE `using`          | 15 passed        | **no**  |
  | `game_played` UPDATE `with check`     | 15 passed        | **no**  |
  | `game_played` DELETE `using`          | 1 failed         | yes     |
  | `game_preference` INSERT `with check` | 1 failed         | yes     |
  | `game_preference` UPDATE `using`      | 15 passed        | **no**  |
  | `game_preference` UPDATE `with check` | 15 passed        | **no**  |
  | `game_preference` DELETE `using`      | 1 failed         | yes     |

  `game_played`'s UPDATE policy can be opened completely (`using (true) with check
(true)`) with all 15 tests still green. The existing update test pins only the
  conjunction: `using` alone hides the row and `with check` alone rejects the write,
  so each covers for the other. The unguarded UPDATE `with check` is the predicate
  that stops a member re-attributing their own row to the other member — Risk #1's
  "a write lands under the wrong member". Criterion 2.4 ("loosening _a_ `with check`
  turns the suite red") was satisfied by an insert case, which is why this passed.

- **Fix**: Add a `game_played` UPDATE denial case with its positive control, and for
  both tables a case where a member updates their **own** row while setting
  `member_id` to the other member — expect `42501` and the row unchanged.
- **Decision**: FIXED — added a `game_played` UPDATE denial case plus a same-member-re-assignment case on both tables; all 8 predicates re-verified as guarded (each loosening now reddens the suite).

### F2 — Nothing pins this destructive suite to a local stack

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — a real trade-off; worth pausing on
- **Dimension**: Safety & Quality (data safety)
- **Location**: `src/test/db/harness.ts:25-26`, `:39-52`; `src/test/db/README.md`
- **Detail**: `SUPABASE_URL`/`SUPABASE_KEY` from the environment silently replace the
  local defaults, and `requireLocalStack()` only checks that something answers
  `GET /rest/v1/` with 200 — which a hosted project does. Against a real project the
  suite would sign up two real users per file (which the harness documents it cannot
  remove), insert into the shared production catalog, and **hard-delete** `games`
  rows. The app never hard-deletes; it soft-deletes, and the migration notes that a
  hard delete cascades away every member's played and preference state irreversibly.
  The README advertises the override with no warning. Nothing points at prod today;
  the realistic path is an `env:` block added to `db-tests` by symmetry with the
  `build` step above it, or a shell that already exports those vars.
- **Fix**: Refuse a non-localhost host in `requireLocalStack()` unless an explicit
  opt-in (e.g. `DB_TESTS_ALLOW_REMOTE=1`) is set, and reword the README override line.
- **Decision**: FIXED — `requireLocalHost()` refuses any non-localhost host unless `DB_TESTS_ALLOW_REMOTE=1`; README override line rewritten with the warning.

### F3 — Denial tests discard the result, so a broken request reads as a denial

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (test quality)
- **Location**: `src/test/db/writeOwn.test.ts:75`, `:124-128`, `:158`
- **Detail**: The denied UPDATE/DELETE calls are awaited and their result thrown away.
  Since the proof is "the row is unchanged", any reason the request did nothing yields
  green: a typo'd table, a malformed filter, an expired JWT. Verified — renaming the
  table to `game_playedTYPO` in a denial call leaves the file at 6/6 passing. This is
  the same vacuity the file's own header set out to eliminate, one level down.
- **Fix**: Capture the result, assert `error` is null, and chain `.select()` asserting
  zero rows returned — proving the database refused rather than that nothing ran.
- **Decision**: FIXED — the three UPDATE/DELETE denials now chain `.select()` and assert `error` null plus zero rows returned.

### F4 — The plan claims a cleanup that does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan Adherence
- **Location**: `plan.md:367-368`, Phase 1 harness contract
- **Detail**: The contract said cleanup "removes the rows and users a run created" and
  Performance Considerations says local `auth.users` rows are "which the cleanup
  removes". `harness.ts:170-171` deliberately does not remove users (it would need a
  service_role key this codebase does not have). The reasoning is sound and documented
  in the harness and README, but the plan now states something false about its own
  implementation.
- **Fix**: Correct the plan to say cleanup removes rows and deliberately leaves auth
  users, with the reason.
- **Decision**: FIXED — plan corrected in both places (Phase 1 contract and Performance Considerations).

### F5 — No timeouts on the db project or the CI job

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (reliability)
- **Location**: `vitest.config.ts:27-37`, `.github/workflows/ci.yml:33-45`
- **Detail**: Vitest's default `hookTimeout` is 10s; `readAttribution.test.ts`'s
  `beforeAll` does two bcrypt-backed sign-ups plus nine writes against a possibly-cold
  GoTrue — the classic "flaky only in CI, only on the first run" shape. The `db-tests`
  job has no `timeout-minutes`, so a hung image pull burns the 6-hour default (and the
  first run of this job did fail on an image pull).
- **Fix**: `hookTimeout: 30_000, testTimeout: 20_000` on the `db` project;
  `timeout-minutes: 20` on the job.
- **Decision**: FIXED — `hookTimeout: 30_000` / `testTimeout: 20_000` on the db project; `timeout-minutes: 20` on the CI job.

### F6 — Unchecked cast on a possibly-null result

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Pattern Consistency
- **Location**: `src/test/db/harness.test.ts:49-50`
- **Detail**: `error` is dropped and `data` is cast; on any failure this throws a bare
  `TypeError: Cannot read properties of null` instead of failing an assertion.
  `harness.ts:130-135` narrows exactly this case at runtime with a comment saying why.
- **Fix**: Destructure `error`, assert it is null, then map.
- **Decision**: FIXED — `error` asserted before `data` is read.

### F7 — The preflight probe proves less than its message implies

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/test/db/harness.ts:39-52`
- **Detail**: `GET /rest/v1/` returns 200 with no apikey at all (verified), so the
  probe validates neither the key, nor that migrations are applied, nor that GoTrue is
  up. A stale key or a stack missing the latest migration passes the guard and then
  fails deep inside `signUp` without the friendly guidance. Note the obvious remedy is
  insufficient: `GET /rest/v1/games?select=id` with a bogus key also returns 200 on
  this stack, so distinguishing a bad key needs an authenticated probe.
- **Fix**: Probe something that exercises auth and schema — e.g. a trivial `signUp` or
  a table read whose failure mode is distinguishable — and keep the good message.
- **Decision**: FIXED — probe now checks `games` is in the schema cache (404/PGRST205 gets its own `db reset` message) and that GoTrue is healthy.

### F8 — Created games can leak before they are recorded for teardown

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (data safety)
- **Location**: `src/test/db/readAttribution.test.ts:50-54`
- **Detail**: Three games are created and only then pushed as a batch. If the second or
  third `createGame` throws, the earlier rows are never recorded and survive teardown.
  `writeOwn.test.ts:36-39` already has the right pattern (push each id at creation).
  Also `deleteGames` is called with a possibly-undefined member if `beforeAll` died
  early — harmless only because `gameIds` is then empty.
- **Fix**: Push each id at creation; make `deleteGames` bail on a falsy member.
- **Decision**: FIXED — each game id recorded at creation; `deleteGames` bails on an undefined member.

### F9 — Untested claims only this suite can check

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — a real trade-off; worth pausing on
- **Dimension**: Success Criteria (coverage)
- **Location**: N/A
- **Detail**: Two authorization claims this repo asserts in comments remain untested,
  and this is the only suite able to test them. (a) The `anon` role: both migrations
  state "no `anon` policy exists, so unauthenticated requests see nothing" — the
  API-boundary suite proves the _app_ rejects a sessionless request, a different claim
  from the _database_ rejecting the role. `anonClient()` already exists, unexported.
  (b) The composite FK enforcing FR-005: `memberGameState.ts:88-95` catches `23503`
  and turns it into "mark as played first", `seedMemberState` exists to work around
  it, and no test inserts a preference without a played row to confirm the DB raises.
- **Fix**: Add an anon-role test across the three tables, and one FK-violation test.
- **Decision**: DEFERRED — recorded in `../follow-ups/review-fixes.md` (anon-role and composite-FK coverage; real gaps but outside Risk #1's remit).

### F10 — Smaller items

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Pattern Consistency
- **Location**: `.github/workflows/ci.yml:42`, `vitest.config.ts:24`, `harness.ts:64`
- **Detail**: (a) CI boots the whole stack including analytics/vector — the most common
  `supabase start` failure on hosted runners — when the suite needs db, auth and rest;
  `-x studio,imgproxy,edge-runtime,logflare,vector,storage-api,mailpit` would cut boot
  time and the largest slice of flake surface. (b) `exclude` replaces Vitest's defaults
  instead of extending them (`configDefaults.exclude`). (c) `TestClient` derives from
  supabase-js's `createClient` while services use the app's client type; compatible
  today, but coincidentally so. (d) `src/test/` now mixes helpers and suites, and the
  path is load-bearing for the vitest include/exclude — worth stating in the README.
- **Fix**: Take individually; none are urgent.
- **Decision**: PARTIALLY FIXED — CI now starts only db/auth/rest (`-x …`) and vitest extends `configDefaults.exclude`. The `TestClient` typing note and the `src/test/` layout note were left as observations.

## Post-triage state

All ten findings triaged: eight fixed, one deferred to
`../follow-ups/review-fixes.md`, one partially fixed.

The decisive re-verification for F1 — every write predicate loosened in turn on the
live stack, then restored:

| predicate | before | after |
| --- | --- | --- |
| `game_played` INSERT `with check` | 1 failed | 1 failed |
| `game_played` UPDATE `using` | **15 passed** | 1 failed |
| `game_played` UPDATE `with check` | **15 passed** | 1 failed |
| `game_played` DELETE `using` | 1 failed | 1 failed |
| `game_preference` INSERT `with check` | 1 failed | 1 failed |
| `game_preference` UPDATE `using` | **15 passed** | 1 failed |
| `game_preference` UPDATE `with check` | **15 passed** | 1 failed |
| `game_preference` DELETE `using` | 1 failed | 1 failed |

All eight are now guarded; `0` non-SELECT policies left open afterwards. F2 verified by
pointing `SUPABASE_URL` at the linked hosted project and confirming the refusal, and F7
by pointing it at the other local stack, which now reports `public.games does not exist`
with a `db reset` hint.

Gates after the fixes: `npm run test:db` 18/3, `npm test` 144/12, lint, typecheck and
build all pass.
