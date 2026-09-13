# Test rollout phase 3: catalog integrity under soft-delete — Implementation Plan

## Overview

Prove that a soft-deleted game leaves every catalog read path but stays in
storage, and that filter composition never drops a live game. This is Risk #6 of
`context/foundation/test-plan.md` §3 — a **preventive** phase: research found no
defect in the shipped code. The work is to pin three properties that today rest
entirely on convention, and to close the gate so a regression is visible in the
local edit loop rather than only in a separate CI job.

## Current State Analysis

The whole FR-002 guarantee rests on two lines of application code:
`listGames` (`src/lib/services/games.ts:31`) and `listGenres`
(`src/lib/services/games.ts:65`). Every user-visible catalog read reaches the
database through one of them; `listCatalogGames`
(`src/lib/services/catalogGames.ts:53-60`) has no independent guard and inherits
exclusion entirely.

Below the application layer there is nothing. The `games` SELECT policy is
`using (true)` for `authenticated`
(`supabase/migrations/20260710120000_create_games.sql:32-36`); `deleted_at`
appears in no RLS predicate. The partial index
(`supabase/migrations/20260710193510_add_games_deleted_at.sql:12-14`) is a
performance structure, not a constraint.

Coverage is zero. No test in the repo ever sets `deleted_at` to a non-null
value — it appears in three fixtures as type boilerplate and is never varied.
`src/lib/services/games.ts` has no test file at all, so all five
`.is("deleted_at", null)` call sites (`:31`, `:65`, `:125`, `:150`, `:172`) are
uncovered. The four catalog-level filters are exercised only at the
URL-parsing level (`src/lib/services/gameFilters.test.ts`).

The `unit` project cannot close this gap: `src/test/supabaseDouble.ts` records
filter calls but honours none of them and resolves to canned data regardless of
the chain (`:107-110`, `:126`). A "deleted game is excluded" test built on it
would pass with the `.is()` deleted.

Harness gaps in `src/test/db/harness.ts`: `createGame` (`:164-187`) hardcodes
every filterable column, varying only `title`; there is no soft-delete fixture
(`deleteGames` at `:225` is a hard `DELETE`, teardown-only, localhost-locked).

## Desired End State

`npm run test:db` proves, against a real Postgres with the repo's migrations
applied, that a soft-deleted game is absent from every catalog read path under
every filter dimension, that its row is still selectable from storage, and that
a live game matching the filters is returned every time. `npm test` and
`npm run lint`-adjacent gates fail fast, without Docker, when the predicate stops
being issued or when a new `games` read path appears without it.

Verification: `npm test`, `npm run test:db`, and the new guard script all pass on
a clean tree; each new assertion has been break-checked (deliberately broken,
observed red, restored).

### Key Discoveries

- `listGames` applies `.is("deleted_at", null)` unconditionally at the head of
  the builder chain (`src/lib/services/games.ts:31`), before any `if`; every
  filter branch re-assigns the same `query`, so no branch can omit it.
- Filtering splits across two layers: four predicates in Postgres
  (`games.ts:37-44`), and `played`/`preference` in JS
  (`src/lib/services/catalogGames.ts:29-42`) because they are per-member facts in
  other tables. "Prove it once" is therefore insufficient by construction.
- `mergeAndFilterCatalog` maps over the `listGames` array and looks per-member
  state **up** by row id; it never iterates `listMemberState`'s output as a
  source. That is why a deleted game's stray played/preference row cannot
  resurface today (`catalogGames.ts:29-31`).
- The project already accepts bespoke deterministic guard scripts as gates:
  `scripts/check-color-literals.mjs` (106 lines) and
  `scripts/check-contrast.mjs`, both listed in `test-plan.md` §5. The structural
  guard follows that established shape — scan, collect hits, print
  `file:line  text`, `process.exit(1)`.
- `filterSummary()` returns `` `${method}(${column}, ${value})` `` strings
  (`src/test/supabaseDouble.ts:139`), so the shape assertion is a plain
  `toContain("is(deleted_at, null)")`.
- Phase 1's impl-review (`context/archive/2026-09-11-testing-api-boundary-contract/reviews/impl-review.md:56-70`)
  established the precedent: a double that ignores filter arguments makes the
  suite decorative. `filterLog` exists because of it.

## What We Are NOT Doing

- **No production code change.** Research found no defect. `listGames`,
  `listGenres`, `catalogGames.ts` and the three write guards ship unchanged.
- **No RLS backstop migration.** The `deleted_at is null` SELECT-policy thesis is
  verified in Phase 5 and recorded, not implemented. Adding it risks silently
  breaking `softDeleteGame`'s success signal and would drag in a production
  `supabase db push --linked` per `lessons.md`.
- **No refactor to a shared `liveGames()` helper.** Reducing the two call sites
  to one is tempting but is a production change in a phase whose job is to prove
  current behaviour — and it would not stop someone writing a fresh
  `.from("games")` anyway. The Phase 4 guard covers that risk directly.
- **No endpoint-level test through a real database.** `listCatalogGames` is the
  top tested level; see Implementation Approach for why, and the deviation from
  `test-plan.md` §3 is recorded there.
- **No restore/un-archive testing.** No restore path exists
  (`context/archive/2026-07-10-edit-and-archive-games/plan.md:88-89`); "still
  retrievable from storage" means the row is selectable, not that the app can
  bring it back.
- **No `/stats` coverage.** `listPreferenceStats` never reads `games`
  (`src/lib/services/preferenceStats.ts:111-112`), so "deleted" is not a concept
  on that surface. A deleted game's play history counting in stats is current,
  intended behaviour.
- **No e2e / browser layer.** `test-plan.md` §3 rules it out for every risk.

## Implementation Approach

Three layers, each chosen for what it alone can prove:

1. **Real database (`src/test/db/`)** carries the behavioural proof. It is the
   only layer that can observe row visibility, because the double honours no
   filters. Phases 1-2.
2. **The `unit` project** carries a cheap shape assertion — that the predicate is
   *issued at all*. It proves nothing about the database, but it fails in
   milliseconds inside `npm test` and the `ci` job, where the db suite does not
   run. This is the phase-1 `filterLog` pattern applied to reads. Phase 3.
3. **A deterministic script** carries the structural property no behavioural test
   can reach: a *future* read path is new code that no existing test calls.
   Phase 4.

**On the endpoint-level check.** `test-plan.md` §3 promises "integration (query
layer) plus one endpoint-level check". This plan stops at `listCatalogGames` —
the composite service both `/catalog` (`src/pages/catalog.astro:33`) and
`/api/recommendations` (`src/pages/api/recommendations.ts:60`) call — and does not
drive an HTTP handler against a real database. Reasons: `/catalog` is an Astro
component with no render harness; `/api/recommendations` also calls the LLM, whose
stubbing is Phase 4 of the rollout, not this one; and the handler adds no
composition logic of its own over the service. `boundary.test.ts` already proves
the handlers are wired to these services. `test-plan.md` §1 principle #3 gives
research precedence over the plan when they disagree, which is the licence being
used here. Recorded so the next reader does not read it as an oversight.

**On fixture construction.** The test whose subject is deletion calls the real
`softDeleteGame`; tests whose subject is a *read* stamp `deleted_at` through a
harness helper. One subject per test: a read failure can then never be blamed on
the delete service, or the reverse.

## Phase 1: Harness fixtures and the deleted/live boundary

### Overview

Give the db harness the two things it lacks — games that differ on filterable
columns, and a way to mark one deleted — then prove the core boundary at the
query layer.

### Changes Required

#### 1. Harness fixture extension

**File**: `src/test/db/harness.ts`

**Purpose**: `createGame` currently varies only `title`, so no fixture can
exercise a catalog filter. Add an optional overrides parameter so a test can
place a game inside or outside each filter dimension, without touching the
existing call sites in `writeOwn.test.ts`, `readAttribution.test.ts` and
`harness.test.ts`.

**Contract**:
`createGame(member: TestMember, title: string, overrides?: Partial<Pick<GameRow, "genre" | "min_players" | "max_players" | "avg_play_minutes" | "loan_status">>): Promise<string>`.
`GameRow` (`src/types.ts:55`) is the snake_case stored shape and the right base
here — **not** `NewGameInput` (`src/types.ts:119`), which is the camelCase create
payload and would silently miss every column. Existing two-argument calls keep
today's fixed values; all four of them (`harness.test.ts:40`,
`readAttribution.test.ts:54`, `writeOwn.test.ts:37`,
`policyBackstops.test.ts:26`) are unaffected. Return type unchanged.

#### 2. Soft-delete fixture helper

**File**: `src/test/db/harness.ts`

**Purpose**: Stamp `deleted_at` directly for tests whose subject is a read, so a
read assertion never depends on the delete service being correct. Distinct from
`deleteGames`, which hard-deletes for teardown — the doc comment must say so,
because confusing the two is how a test silently stops testing soft-delete.

**Contract**: `markDeleted(member: TestMember, gameId: string): Promise<void>` —
issues `update({ deleted_at: <iso> }).eq("id", gameId)` through the member's
client and throws on error, matching the existing helpers' failure style.

#### 3. The boundary suite

**File**: `src/test/db/catalogIntegrity.test.ts` (new)

**Purpose**: Prove the three properties Risk #6 names, unfiltered. The file
header explains, as `readAttribution.test.ts:13-32` does, why these tests exist
and what makes the fixture adversarial.

**Contract**: `beforeAll` calls `requireLocalStack()` and builds a fixture of at
least one live game and one soft-deleted game; `afterAll` hard-deletes them via
`deleteGames`. Cases:

- a soft-deleted game is absent from `listGames(supabase, {})`
- the same game **is** still selectable directly from storage (`select("*")`
  filtered to its id with no deleted predicate) and carries a non-null
  `deleted_at` — this is the half that distinguishes soft from hard delete
- a live game is present in the same call (the positive control, without which
  "absent" also passes when nothing is returned)
- `listGenres` does not offer a genre carried only by a deleted game, and does
  offer one carried by a live game
- the real `softDeleteGame(supabase, id)` returns `true`, and a second call on
  the same id returns `false` — the already-deleted guard at
  `src/lib/services/games.ts:172`

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Existing db suite still passes with the extended harness: `npm run test:db`
- The new boundary suite passes: `npm run test:db`
- The unit suite is unaffected: `npm test`

#### Manual Verification:

- Break-check the exclusion: delete `.is("deleted_at", null)` from
  `src/lib/services/games.ts:31`, run `npm run test:db`, confirm the absence case
  goes red, restore.
- Break-check the storage half: change `markDeleted` to call `deleteGames`
  instead, confirm the "still in storage" case goes red, restore.
- Confirm `createGame`'s existing two-argument call sites still produce the same
  rows (the three prior db test files pass unchanged).

---

## Phase 2: Filter composition matrix

### Overview

Prove the predicate survives every filter dimension, singly and all at once,
across both filtering layers.

### Changes Required

#### 1. The composition suite

**File**: `src/test/db/catalogIntegrity.test.ts`

**Purpose**: Answer the challenge §2 raises for Risk #6 — that excluding deleted
rows in one query proves it everywhere. Each case drives one filter dimension and
asserts both directions at once: the deleted game is absent **and** a live game
that matches the filter is present.

**Contract**: A fixture in which, for each of the six dimensions, one live game
matches and one soft-deleted game *would also match if it were live* — a deleted
game that fails the filter on its own merits proves nothing.

**Range fixtures must sit exactly on the boundary**, or the Phase 2 break-check
passes vacuously: with the harness defaults (`min_players: 2`, `max_players: 4`,
`harness.ts:171-172`) and a filter of `players: 3`, changing `.gte` to `.gt`
still matches (4 > 3) and the deliberate break stays green. So the live game must
have `max_players === filters.players` for the `.gte` side, a second live game
`min_players === filters.players` for the `.lte` side, and
`avg_play_minutes === filters.maxMinutes` for the `maxMinutes` case. State those
values in the fixture rather than picking convenient mid-range numbers.

Dimensions and the layer each exercises:

| Filter | Layer | Source |
| --- | --- | --- |
| `genre` | Postgres `.eq` | `games.ts:34` |
| `players` | Postgres `.lte`+`.gte` | `games.ts:37` |
| `maxMinutes` | Postgres `.lte` | `games.ts:40` |
| `loanStatus` | Postgres `.eq` | `games.ts:43` |
| `played` | JS | `catalogGames.ts:35` |
| `preference` | JS | `catalogGames.ts:38` |

The `played` and `preference` cases go through `listCatalogGames` (they do not
exist at the `listGames` level) and need `seedMemberState` on both the live and
the deleted game — seeding the deleted one is what proves the JS stage cannot
reintroduce it. Per-member seeding must follow the played-before-preference
order the composite FK requires (`test-plan.md` §6.3).

Plus one full-stack case: all six filters applied simultaneously through
`listCatalogGames`, returning exactly the one live game that satisfies all of
them, with the deleted twin absent.

### Success Criteria:

#### Automated Verification:

- The composition suite passes: `npm run test:db`
- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Whole db suite still green end to end: `npm run test:db`

#### Manual Verification:

- Break-check per layer: delete `.is("deleted_at", null)` from `games.ts:31` and
  confirm **every** filter case goes red, not only the unfiltered one — if a
  filtered case stays green, its fixture's deleted twin does not actually match
  that filter and the case is decorative.
- Break-check the live-row half: change `.gte("max_players", …)` to `.gt(…)` at
  `games.ts:37` and confirm the `players` case goes red on the missing live game,
  then restore. This is the "filter composition drops a live game" direction.
- Confirm runtime: the db suite runs serially; note the added wall-clock time and
  confirm it stays acceptable for the `db-tests` CI job.

---

## Phase 3: Shape gate in the unit project

### Overview

Make the cheapest regression — someone deletes the `.is()` call — fail in
`npm test`, without Docker, where the db suite does not run.

### Changes Required

#### 1. A typed accessor for passing the double to a service

**File**: `src/test/supabaseDouble.ts`

**Purpose**: The service functions take the Supabase client as a **parameter**,
so — unlike `boundary.test.ts`, where the handlers call `createClient` themselves
and the double arrives through a `vi.mock` holder typed `unknown`
(`boundary.test.ts:17-21`) — a service test must hand the double over directly.
That does not type-check: `tsc --noEmit` rejects it with

```
TS2345: Argument of type '{ from: (table: string) => QueryBuilder; }' is not
assignable to parameter of type 'SupabaseClient<...>'. Missing: supabaseUrl,
supabaseKey, auth, realtime, and 20 more.
```

Since `npm run typecheck` is a required gate (and criterion 3.2 of this phase),
the cast has to exist somewhere. Put it in the double, once, with a comment
explaining why it is sound — the double satisfies the only surface the services
touch (`.from(...)`) — so every future service test shares one documented cast
instead of copying an unexplained `as unknown as`.

**Contract**: a `serviceClient` accessor on the `SupabaseDouble` interface
returning the `client` narrowed to the parameter type the service layer expects.
Existing consumers of `double.client` (`boundary.test.ts`) are unaffected;
`client` stays as it is.

#### 2. Read-shape assertions

**File**: `src/lib/services/games.test.ts` (new)

**Purpose**: `src/lib/services/games.ts` has no test file. Add one that uses the
existing double to assert the *shape* of the queries the read helpers issue.
This proves nothing about row visibility — the file's doc comment must say so
explicitly and point at `src/test/db/catalogIntegrity.test.ts` for the
behavioural proof, mirroring how `supabaseDouble.ts:4-19` states its own limits.

**Contract**: no `vi.mock` — these call the service functions directly, passing
the double through the `serviceClient` accessor added above. Cases:

- `listGames` issues `is(deleted_at, null)` — via
  `expect(double.filterSummary()).toContain("is(deleted_at, null)")`
- `listGenres` issues the same
- `listGames` with every filter set issues the predicate **and** each expected
  filter call, proving no branch replaces the chain
- the three write guards (`updateGame`, `setLoan`, `softDeleteGame`) each issue
  both `eq(id, …)` and `is(deleted_at, null)` — the already-deleted guard's
  shape, next to the mass-delete guard `boundary.test.ts:219-231` already covers

Note the double resolves to canned data regardless of the chain
(`supabaseDouble.ts:126`), so each case needs a `results` entry shaped like what
the function under test unwraps (an array for the list helpers, a row or `null`
for the `maybeSingle` writers).

### Success Criteria:

#### Automated Verification:

- New unit tests pass: `npm test`
- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Full CI-equivalent sequence passes locally: `npm run typecheck && npm run lint && npm test`

#### Manual Verification:

- Break-check: delete `.is("deleted_at", null)` from `games.ts:31` and confirm
  `npm test` alone goes red (the point of this phase — no Docker, no db project).
- Confirm the file's doc comment states its limits, so a future reader does not
  mistake a green `npm test` for proof that deleted rows are excluded.

---

## Phase 4: Structural guard against a future read path

### Overview

A behavioural test cannot catch a read path that does not exist yet. Scan for
one instead.

### Changes Required

#### 1. The guard script

**File**: `scripts/check-games-read-guard.mjs` (new)

**Purpose**: Fail the gate when a `games` read appears in `src/` without the
deleted-row predicate in its chain. Follows the shape of
`scripts/check-color-literals.mjs`: walk `src/`, collect hits, print
`file:line  text`, exit 1 with a sentence saying what to do instead.

**Contract**: Scans `.ts`/`.tsx`/`.astro` under `src/`. For each
`.from("games")` occurrence, examines the chain that follows it (spanning
newlines, since `listGames` builds across lines) and flags any that reaches a
`.select(` without an `.is("deleted_at", null)` in the same chain. Writes
(`.insert(`, `.update(`, `.delete(`) are not reads and are not flagged — the
write guards are Phase 3's business. An `EXEMPT` set holds deliberate
exceptions, with `src/test/` excluded wholesale (the db harness reads storage
directly on purpose, which is the point of the "still in storage" assertion).

**The write-verb check must come before the `.select(` check.** `createGame`
(`src/lib/services/games.ts:83`) is
`.from("games").insert({...}).select().single()` — a chain that reaches
`.select(` and carries no predicate, because it is a write returning its own
row. A naive "select without predicate → flag" rule fires on correct production
code. Criterion 4.1 catches it, but only after the fact; knowing the case up
front is the difference between writing the rule correctly and debugging it.

This is text scanning, not AST parsing — the exemption set is the escape hatch,
and the error message must name it so a false positive is a 30-second fix rather
than a puzzle.

#### 2. Gate wiring

**File**: `package.json`

**Purpose**: Make the script runnable and part of the gate, alongside its two
siblings.

**Contract**: A `lint:reads` script invoking
`node scripts/check-games-read-guard.mjs`, named to match the existing
`lint:colors` / `lint:contrast` convention.

#### 3. CI wiring

**File**: `.github/workflows/ci.yml`

**Purpose**: Run the guard in the fast hermetic `ci` job, next to the other two
deterministic checks.

**Contract**: A `- run: npm run lint:reads` step in the `ci` job, placed with
`lint:colors` and `lint:contrast` (`.github/workflows/ci.yml:22-23`). No change
to the `db-tests` job.

### Success Criteria:

#### Automated Verification:

- The guard passes on the clean tree: `npm run lint:reads`
- Lint and typecheck pass: `npm run lint && npm run typecheck`
- Unit and db suites still pass: `npm test` and `npm run test:db`
- The guard's output names the file count on success, like its siblings do
  (`check-color-literals.mjs:106`)

#### Manual Verification:

- Break-check positive: add a throwaway
  `supabase.from("games").select("*")` (no predicate) to a `src/` file, confirm
  `npm run lint:reads` exits 1 and names that `file:line`, then remove it.
- Break-check negative: add the same call **with** `.is("deleted_at", null)` and
  confirm the guard stays green — a guard that flags correct code gets disabled
  within a week.
- Confirm the multi-line chain in `listGames` (`games.ts:31-46`) is recognised as
  guarded, not flagged.

---

## Phase 5: Verify the RLS thesis and write the cookbook entry

### Overview

Close the one open question research could not answer from code, and leave the
next reader a filled-in `§6.4` instead of a `TBD`.

### Changes Required

#### 1. Verify the SELECT-policy thesis

**File**: none (investigation against the running local stack)

**Purpose**: `research.md` claims, from Postgres RLS semantics rather than
observation, that adding `deleted_at is null` to the `games` SELECT policy would
also gate the row returned by `UPDATE … RETURNING`, making `softDeleteGame`
report the friendly not-found message on a successful delete
(`src/lib/services/games.ts:175-176`). Verify it so a future phase does not build
a decision on reasoning.

**Contract**: On the local stack, alter the SELECT policy to
`using (deleted_at is null)`, call `softDeleteGame` against a live row, observe
whether `result.data` comes back `null`, then restore the policy. The stack is
`my-catalog` on ports 54330-54339 (`test-plan.md` §4). Record the observed
outcome — whichever way it lands.

#### 2. Record the finding

**File**: `context/changes/testing-catalog-integrity-soft-delete/research.md`

**Purpose**: Convert Open Question 4 into a stated fact, and adjust the
Architecture Insights bullet that currently flags itself as unverified.

**Contract**: Update the bullet and the open question in place; bump
`last_updated` and add `last_updated_note` per the research frontmatter
convention.

#### 3. Fill in the cookbook

**File**: `context/foundation/test-plan.md`

**Purpose**: §6.4 is a `TBD` pointing at this phase. Write it, in the register of
§6.2 and §6.3 — location, harness, what the layer proves, the anti-patterns, and
the break-check recipe. Mark the §3 Phase 3 row complete and point it at the
archived change folder, as Phases 1 and 2 do.

**Contract**: §6.4 must state: which project owns which half and why the double
cannot serve; that a filtered case's deleted twin must match the filter or the
case is decorative; the two-directional assertion shape (deleted absent **and**
live present); the played-before-preference seeding order; and the guard script's
exemption escape hatch. Also add the new guard to the §5 quality-gate table and
update the §4 "existing suite" line's file/line count.

#### 4. Update the db suite README

**File**: `src/test/db/README.md`

**Purpose**: The README states what the harness proves and does not prove. It now
also covers catalog integrity, and gained two fixture helpers.

**Contract**: Note `markDeleted` and `createGame`'s overrides, and add to the
"does not prove" section that the shape gate in `npm test` is not a substitute
for this suite.

### Success Criteria:

#### Automated Verification:

- Everything still green after the policy restore: `npm run test:db`
- Full local gate passes: `npm run typecheck && npm run lint && npm run lint:colors && npm run lint:contrast && npm run lint:reads && npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Confirm the local SELECT policy is genuinely restored to `using (true)` after
  the experiment — query `pg_policies` directly rather than trusting the restore
  statement's exit code. A stack left with a modified policy poisons every later
  db run.
- Confirm §6.4 reads as instructions to a future author, not as a summary of what
  this phase did.
- Confirm the §3 rollout row and the §4/§5 tables are internally consistent with
  what actually shipped.

---

## Testing Strategy

### Unit tests

- Query shape for both read helpers and all three write guards
  (`src/lib/services/games.test.ts`), via `filterSummary()`. Fast, hermetic,
  runs in `npm test` and the `ci` job. Proves the predicate is issued; proves
  nothing about the database.

### Integration tests

- The deleted/live boundary and the full filter matrix against a real Postgres
  (`src/test/db/catalogIntegrity.test.ts`), via `npm run test:db` and the
  `db-tests` CI job. The only layer that can observe row visibility.

### Structural gate

- `scripts/check-games-read-guard.mjs` — catches what no behavioural test can: a
  read path that does not exist yet.

### Break-check discipline

Every assertion in this plan ships only after being watched to fail. The
per-phase Manual Verification sections name the specific break for each. The
Phase 2 break-check is the load-bearing one: if deleting the predicate does not
turn **every** filtered case red, the fixtures are wrong and the suite is
decorative — which is exactly the outcome `test-plan.md` §2 warns about for this
risk.

## Performance Considerations

The `db` project runs serially (`fileParallelism: false`) with 30s hook / 20s
test timeouts. Phase 2 adds roughly eight cases to a job that already boots a
Supabase stack, so the fixture should be built once in `beforeAll` and shared
across cases rather than per-test — the seeding, not the assertions, is the cost.
The `ci` job is unaffected: Phases 3 and 4 add milliseconds.

## Migration Notes

No schema change, so `lessons.md`'s `supabase db push --linked` rule does not
apply to this phase. If Phase 5's verification were ever to lead to an RLS
backstop, that would be a separate change and the push rule would bind it.

## References

- Research: `context/changes/testing-catalog-integrity-soft-delete/research.md`
- Risk #6 and its response guidance: `context/foundation/test-plan.md` §2
- Cookbook siblings: `context/foundation/test-plan.md` §6.2, §6.3
- Prior phase (db harness): `context/archive/2026-09-12-testing-per-member-state-attribution/`
- Prior phase (the double, and why `filterLog` exists): `context/archive/2026-09-11-testing-api-boundary-contract/reviews/impl-review.md:56-70`
- Soft-delete origin: `context/archive/2026-07-10-edit-and-archive-games/plan.md:118-121`
- Filter origin: `context/archive/2026-07-11-filter-catalog/plan.md:128-131`
- Guard-script pattern: `scripts/check-color-literals.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles.

### Phase 1: Harness fixtures and the deleted/live boundary

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck` — a8edd41
- [x] 1.2 Lint passes: `npm run lint` — a8edd41
- [x] 1.3 Existing db suite still passes with the extended harness: `npm run test:db` — a8edd41
- [x] 1.4 The new boundary suite passes: `npm run test:db` — a8edd41
- [x] 1.5 The unit suite is unaffected: `npm test` — a8edd41

#### Manual

- [ ] 1.6 Break-check the exclusion (drop `.is()` from `games.ts:31`, observe red, restore)
- [ ] 1.7 Break-check the storage half (`markDeleted` → `deleteGames`, observe red, restore)
- [ ] 1.8 Confirm `createGame`'s existing two-argument call sites are unchanged

### Phase 2: Filter composition matrix

#### Automated

- [x] 2.1 The composition suite passes: `npm run test:db`
- [x] 2.2 Typecheck passes: `npm run typecheck`
- [x] 2.3 Lint passes: `npm run lint`
- [x] 2.4 Whole db suite still green end to end: `npm run test:db`

#### Manual

- [ ] 2.5 Break-check per layer — every filtered case goes red when the predicate is dropped
- [ ] 2.6 Break-check the live-row half (`.gte` → `.gt` on `max_players`, observe red, restore)
- [ ] 2.7 Confirm the added db-suite wall-clock time stays acceptable for CI

### Phase 3: Shape gate in the unit project

#### Automated

- [ ] 3.1 New unit tests pass: `npm test`
- [ ] 3.2 Typecheck passes: `npm run typecheck`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 CI-equivalent sequence passes locally: `npm run typecheck && npm run lint && npm test`

#### Manual

- [ ] 3.5 Break-check: dropping `.is()` turns `npm test` red on its own
- [ ] 3.6 Confirm the file's doc comment states its limits

### Phase 4: Structural guard against a future read path

#### Automated

- [ ] 4.1 The guard passes on the clean tree: `npm run lint:reads`
- [ ] 4.2 Lint and typecheck pass: `npm run lint && npm run typecheck`
- [ ] 4.3 Unit and db suites still pass: `npm test` and `npm run test:db`
- [ ] 4.4 The guard reports a file count on success, like its siblings

#### Manual

- [ ] 4.5 Break-check positive: an unguarded `games` read is flagged with its `file:line`
- [ ] 4.6 Break-check negative: a guarded read stays green
- [ ] 4.7 Confirm the multi-line `listGames` chain is recognised as guarded

### Phase 5: Verify the RLS thesis and write the cookbook entry

#### Automated

- [ ] 5.1 Everything still green after the policy restore: `npm run test:db`
- [ ] 5.2 Full local gate passes (typecheck, lint, colors, contrast, reads, test)
- [ ] 5.3 Build passes: `npm run build`

#### Manual

- [ ] 5.4 Confirm the SELECT policy is restored to `using (true)` via `pg_policies`
- [ ] 5.5 Confirm §6.4 reads as instructions to a future author
- [ ] 5.6 Confirm the §3 rollout row and the §4/§5 tables match what shipped
