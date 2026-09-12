# Test rollout phase 2: per-member state attribution — Implementation Plan

## Overview

Prove, against a real local database, that per-member state is attributed to the
right household member at both layers: writes are owner-bound by RLS, and reads are
scoped by the application's member filter. Establish the database-backed test harness
this project has never had, and leave it wired as a CI gate.

## Current State Analysis

Risk #1 (`context/foundation/test-plan.md` §2, High × High) is the highest-fear row in
the map and the only one no test touches. Research
(`context/changes/testing-per-member-state-attribution/research.md`) established the
shape of the problem, and it is asymmetric:

- **Writes are DB-enforced.** `with check (member_id = auth.uid())` on INSERT and
  `using` + `with check` on UPDATE/DELETE, on both `game_played` and
  `game_preference`. A live probe with two authenticated members confirmed it.
- **Reads are not.** SELECT is `using (true)` on both tables. The two
  `.eq("member_id", memberId)` calls in `src/lib/services/memberGameState.ts:114-115`
  are the sole authority, and every scoped read path — `/catalog` and
  `/api/recommendations` — funnels through them.
- **Nothing can catch a regression in either.** `src/test/supabaseDouble.ts:3-21`
  models no rows and honours no filters. No test in this repo has ever needed a
  database; the only verification write-own ever received is a manual Studio checkbox
  from July (`context/archive/2026-07-21-played-loan-and-preference/plan.md:295`).
- **CI would reject a DB test today.** `.github/workflows/ci.yml:28` runs `npm test`
  with no environment variables; only the `build` step receives the secrets.

## Desired End State

`npm run test:db` runs a database-backed suite against the local stack that fails if
either half of Risk #1 regresses, and a CI job runs it on every push and PR. The
default `npm test` stays hermetic and fast. `§6.3` of the test plan tells the next
contributor how to add a test of this kind.

Verified by: deleting an `.eq("member_id", …)` from `listMemberState` turns the suite
red; loosening a `with check` predicate to `true` turns the suite red.

### Key Discoveries

- Write denial is silent: RLS denies UPDATE/DELETE by matching zero rows, so PostgREST
  answers `200` with `[]`. Only INSERT raises `42501`. Asserting "an error was raised"
  would make three of four write cases pass vacuously — research Open Question 1.
- `game_preference` has a composite FK to `game_played (game_id, member_id)`
  (`supabase/migrations/20260722143000_member_game_state_pk_and_indexes.sql:37-41`), so
  a member must have a played row **before** a preference row can exist. Fixture order
  is load-bearing.
- Read-all is a feature dependency, not an oversight: FR-006 stats
  (`src/lib/services/preferenceStats.ts:111-112`) queries both tables with no member
  filter at all, deliberately.
- `src/test/astro-env-server.stub.ts` already resolves `SUPABASE_URL` / `SUPABASE_KEY`
  from `process.env` — the hook a DB test needs, already in place.
- Vitest 4.1.10 supports `test.projects` and `--project <name>`, so the split needs one
  config file rather than two.
- The local stack is `project_id = "my-catalog"` on ports 54330-54339, API `54331`
  (fixed 2026-09-12; before that `supabase start` silently reused another repo's
  containers).

## What We Are NOT Doing

- **Not changing any policy or schema.** No migration. The multi-household hazard named
  at `supabase/migrations/20260722092117_create_member_game_state.sql:50-56` is a product
  decision, not a test-phase call. (If that ever changes, `context/foundation/lessons.md`
  makes `npx supabase db push --linked` the required final step.)
- **Not asserting member-vs-member read isolation.** The PRD offers attribution
  (`prd.md:45`) and a signed-in-vs-anonymous confidentiality line (`prd.md:94`); FR-006
  requires cross-member reads. Such a test would fail by design.
- **Not re-testing `computeMemberStats` labelling** — already covered as a pure unit
  test at `src/lib/services/preferenceStats.test.ts:39-77`.
- **Not testing through the route handlers.** The service level catches the same
  regression; a real session cookie in an `APIContext` is disproportionate harness.
- **Not touching `src/test/supabaseDouble.ts`** or any phase 1 test.
- **Not making the default `npm test` depend on Docker.**

## Implementation Approach

Four phases, mirroring phase 1's shape: harness first (proven by one real assertion),
then one invariant per phase, then cleanup and gate. Each phase's success criteria
include a deliberate break, because a policy test that has never been seen red is
exactly the test that turns out to assert nothing.

The two halves are tested at the layers that own them: the policy half through
`@supabase/supabase-js` clients signed in as two real members (the same library and JWT
path `src/lib/supabase.ts:9-16` uses), and the read half through the real service
functions, where a dropped filter actually shows.

## Critical Implementation Details

**Denial is silent for three of four write cases.** Only INSERT raises. Every
UPDATE/DELETE denial assertion must read the row back and assert it is _unchanged_ —
asserting an error, or asserting `data === []`, would also pass if the row never
existed. Each denial case therefore needs a positive control: the same operation
performed by the row's owner must succeed in the same test file.

**Fixture ordering is constrained by the composite FK.** A preference row cannot exist
without the matching played row for the same `(game_id, member_id)`. Seed played first,
and tear down in reverse (or rely on the `on delete cascade` from `games`).

**The `astro:env/server` alias must reach both vitest projects.** Splitting into
`projects` does not inherit root-level `resolve` automatically; the project entries need
`extends: true` (or their own alias block), or every import of `@/lib/supabase` fails to
resolve in the new project.

---

## Phase 1: The database harness

### Overview

A second vitest project, excluded from the default run, plus a helper that hands a test
two signed-in members against the local stack. Lands with one real assertion so the
harness is proven rather than assumed.

### Changes Required:

#### 1. Split the vitest config into two projects

**File**: `vitest.config.ts`

**Purpose**: Keep the fast hermetic suite as the edit-loop default while giving the
database suite its own opt-in entry point, so `npm test` never requires Docker.

**Contract**: Two projects, `unit` (everything except `src/test/db/`) and `db`
(`src/test/db/**/*.test.ts` only). Both resolve the `@/*` alias and the
`astro:env/server` stub — see Critical Implementation Details on `extends: true`. The
existing 12 test files must remain in `unit` and their behaviour unchanged.

#### 2. Add the `test:db` script

**File**: `package.json`

**Purpose**: One command for the database suite, mirroring `test`'s no-watch shape.

**Contract**: `"test:db": "vitest run --project db"`, and `test` becomes
`vitest run --project unit`. Keep `--passWithNoTests` absent from both — phase 1 removed
it deliberately, and an empty database suite must fail.

#### 3. The two-member harness

**File**: `src/test/db/harness.ts` (new)

**Purpose**: Give each test file two distinct authenticated members and a clean
database, without a service_role key and without shared state between runs.

**Contract**: Exports a way to obtain two signed-in `SupabaseClient`s (members A and B)
plus their user ids, created per run with unique emails through the anon auth API, and a
cleanup that removes the rows and users a run created. Also exports a preflight that
**fails loudly** with an actionable message naming `npx supabase start` when the stack on
`SUPABASE_URL` is unreachable — never a skip. Reads `SUPABASE_URL` / `SUPABASE_KEY` from
`process.env`, defaulting to the local stack's `http://127.0.0.1:54331`.

**File**: `src/test/db/README.md` (new)

**Purpose**: State the harness's limits the way `supabaseDouble.ts:3-21` states its own,
so the next contributor knows which suite answers which question.

**Contract**: Names what this harness proves (real policy behaviour, real row
visibility), what it costs (Docker, ~seconds per run), and that it is the only place in
the repo where authorization claims are legitimate.

#### 4. First real assertion

**File**: `src/test/db/harness.test.ts` (new)

**Purpose**: Prove the harness before anything depends on it — two members exist, are
distinct, and each can write its own row.

**Contract**: Members A and B have different ids; each can insert its own `game_played`
row for a shared game; both rows exist afterwards.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` passes against a running local stack
- `npm test` still passes and runs the pre-existing 12 files, unchanged
- `npm test` completes without a running Supabase stack (proving the split holds)
- `npm run test:db` fails with the actionable "start the stack" message when no stack is reachable
- `npm run lint` and `npm run typecheck` pass

#### Manual Verification:

- `src/test/db/README.md` states the harness's limits as plainly as `supabaseDouble.ts` states its own

---

## Phase 2: Write-own at the policy layer

### Overview

The half the database genuinely enforces. These assertions pass on day one; their value
is as a regression guard, so the break check is what makes the phase real.

### Changes Required:

#### 1. Write-own denial cases

**File**: `src/test/db/writeOwn.test.ts` (new)

**Purpose**: Pin the six write-side predicates (`with check` on insert, `using` +
`with check` on update, `using` on delete, across both tables) so loosening one turns
the suite red.

**Contract**: Driven as member B against member A's rows, for both `game_played` and
`game_preference`:

- insert carrying A's `member_id` → rejected, error code `42501`
- update A's row → affects zero rows, **and A's row read back is unchanged**
- delete A's row → affects zero rows, **and A's row still exists**

Each denial is paired with a positive control in the same file: A performing the same
operation on A's own row succeeds. Fixtures seed played before preference (composite FK).

#### 2. Negative space: cross-member reads are intentional

**File**: `src/test/db/writeOwn.test.ts` (same file, own `describe`)

**Purpose**: Encode the decision that `context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:113-121`
recorded only as a comment, so tightening the SELECT policy cannot silently break
FR-006 stats.

**Contract**: Member B _can_ select member A's `game_played` and `game_preference` rows.
The `describe` block and its comment must state that this is intended behaviour
`/stats` depends on, cite FR-006, and note it should be revisited only if the app ever
serves more than one household.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` passes
- Every denial case asserts state unchanged, not merely an empty result or an error
- Each denial case has a positive control in the same file
- Loosening a `with check` predicate to `true` in a scratch migration turns the suite red; the scratch migration is reverted afterwards
- `npm run lint` and `npm run typecheck` pass

#### Manual Verification:

- The read-all test reads as a deliberate decision record, not as an assertion that the app is insecure

---

## Phase 3: Read attribution through the services

### Overview

The half nothing enforces but one line of application code, and the half a user would
actually feel.

### Changes Required:

#### 1. Attribution through the real service functions

**File**: `src/test/db/readAttribution.test.ts` (new)

**Purpose**: Catch a dropped or wrong `.eq("member_id", …)` — the regression research
identified as invisible to every existing test and to the database.

**Contract**: With both members' rows present in the database for overlapping games:

- `listMemberState` called with A's client and A's id returns only A's played set and A's preference map — B's rows absent, not merely deprioritised
- The same for B, asserting the two results actually differ (so a test cannot pass by both members seeing the same thing)
- `listCatalogGames` returns the shared catalog with A's state merged onto the right games, and B's state on none of them
- A game only B has played reads as not-played for A; a game both played reads as played for both

The differing-preference case matters most: research found the preference `Map` is built
unordered with last-write-wins (`memberGameState.ts:125-131`), so a merged read is
non-deterministic. Give A and B **opposite** preferences on the same game, so a dropped
filter cannot coincidentally produce the right answer.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` passes
- Deleting either `.eq("member_id", …)` from `src/lib/services/memberGameState.ts:114-115` turns the suite red; restored afterwards
- At least one case gives the two members opposing state on the same game
- `npm run lint` and `npm run typecheck` pass

#### Manual Verification:

- A reader can tell from the test names which half of Risk #1 each case defends

---

## Phase 4: CI job and cookbook

### Overview

Make the suite a real gate and write down the pattern, so phase 3 of the rollout
inherits a harness instead of rebuilding one.

### Changes Required:

#### 1. A CI job that starts Supabase

**File**: `.github/workflows/ci.yml`

**Purpose**: Make the database suite block a merge; without it the harness is a local
convenience that rots.

**Contract**: A second job, parallel to `ci`, that checks out, installs, starts the
local stack via the `supabase` devDependency, runs `npm run test:db` against it, and
stops the stack. It must not need repository secrets — the local stack's own URL and anon
key are used. The existing `ci` job is unchanged.

#### 2. Fill in the cookbook

**File**: `context/foundation/test-plan.md` (§6.3)

**Purpose**: §6.3 is currently `TBD`. It is the artifact the next phase reads.

**Contract**: Replace the placeholder with the pattern actually shipped: location, the
harness entry point, how to get two members, the fixture-ordering constraint from the
composite FK, the silent-denial rule (assert state unchanged, never an error), the
positive-control requirement, and how to prove the test can fail.

#### 3. Update the rollout and gate tables

**File**: `context/foundation/test-plan.md` (§3, §4, §5)

**Purpose**: Keep the orchestrator's status table and the gate inventory true.

**Contract**: §3 row 2 → `complete`. §4's "DB / RLS verification" row → now used, naming
`npm run test:db`. §5 gains a row for the database suite with its true wiring state.

### Success Criteria:

#### Automated Verification:

- The CI job passes on a real push
- `npm test`, `npm run test:db`, `npm run lint`, `npm run typecheck` and `npm run build` all pass
- `npm run test:db` fails the CI job when a test is made to fail deliberately

#### Manual Verification:

- §6.3 alone is enough to add a per-member test without reading this plan
- §3, §4 and §5 match what is actually wired

---

## Testing Strategy

### Unit tests:

None added. `computeMemberStats` labelling is already covered
(`src/lib/services/preferenceStats.test.ts:39-77`).

### Integration tests:

The whole phase. Two suites against a real database: policy behaviour as two
authenticated members, and read attribution through the real service functions.

### Manual testing steps:

1. `npx supabase start`, then `npm run test:db` — passes.
2. `npx supabase stop`, then `npm test` — passes (hermetic).
3. `npm run test:db` with the stack down — fails with the actionable message, not a skip.
4. Delete an `.eq("member_id", …)` from `listMemberState`; `npm run test:db` goes red; restore.
5. Loosen a `with check` to `true` in a scratch migration; `npm run test:db` goes red; revert.

## Performance Considerations

The database suite costs Docker startup in CI (~1-2 min) and seconds locally. It stays out
of the default `npm test` for exactly that reason. Fresh users per run keep it
parallel-safe at the cost of rows in local `auth.users`, which the cleanup removes.

## Migration Notes

None. This phase adds no migration. The scratch migration used for the phase 2 break
check is reverted and never committed.

## References

- Research: `context/changes/testing-per-member-state-attribution/research.md`
- Risk #1 and its response guidance: `context/foundation/test-plan.md` §2 (amended 2026-09-12)
- Prior phase for structure: `context/archive/2026-09-11-testing-api-boundary-contract/plan.md`
- The decision this phase encodes: `context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:113-121`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles.

### Phase 1: The database harness

#### Automated

- [x] 1.1 `npm run test:db` passes against a running local stack — eba60a8
- [x] 1.2 `npm test` still passes and runs the pre-existing 12 files, unchanged — eba60a8
- [x] 1.3 `npm test` completes without a running Supabase stack — eba60a8
- [x] 1.4 `npm run test:db` fails with the actionable message when no stack is reachable — eba60a8
- [x] 1.5 `npm run lint` and `npm run typecheck` pass — eba60a8

#### Manual

- [ ] 1.6 `src/test/db/README.md` states the harness's limits as plainly as `supabaseDouble.ts` states its own

### Phase 2: Write-own at the policy layer

#### Automated

- [x] 2.1 `npm run test:db` passes — a45b8b1
- [x] 2.2 Every denial case asserts state unchanged, not merely an empty result or an error — a45b8b1
- [x] 2.3 Each denial case has a positive control in the same file — a45b8b1
- [x] 2.4 Loosening a `with check` to `true` turns the suite red; scratch migration reverted — a45b8b1
- [x] 2.5 `npm run lint` and `npm run typecheck` pass — a45b8b1

#### Manual

- [ ] 2.6 The read-all test reads as a deliberate decision record

### Phase 3: Read attribution through the services

#### Automated

- [x] 3.1 `npm run test:db` passes
- [x] 3.2 Deleting either `.eq("member_id", …)` turns the suite red; restored afterwards
- [x] 3.3 At least one case gives the two members opposing state on the same game
- [x] 3.4 `npm run lint` and `npm run typecheck` pass

#### Manual

- [ ] 3.5 Test names make clear which half of Risk #1 each case defends

### Phase 4: CI job and cookbook

#### Automated

- [ ] 4.1 The CI job passes on a real push
- [ ] 4.2 `npm test`, `npm run test:db`, lint, typecheck and build all pass
- [ ] 4.3 `npm run test:db` fails the CI job when a test is made to fail deliberately

#### Manual

- [ ] 4.4 §6.3 alone is enough to add a per-member test without reading this plan
- [ ] 4.5 §3, §4 and §5 match what is actually wired
