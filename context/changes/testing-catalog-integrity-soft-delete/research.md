---
date: 2026-09-13T09:22:08+02:00
researcher: Wojciech Bernardziak
git_commit: c5e74efa5bd9730177e6e9a0f74266178a8979fe
branch: main
repository: my-catalog
topic: "Catalog integrity under soft-delete: every read path, the layer that applies the deleted-row condition, and what today's suite already proves"
tags: [research, codebase, soft-delete, catalog, filters, games-service, rls, test-coverage]
status: complete
last_updated: 2026-09-13
last_updated_by: Wojciech Bernardziak
last_updated_note: "Settled Open Question 4 — the RLS-backstop thesis was verified against the local stack and corrected"
---

# Research: Catalog integrity under soft-delete

**Date**: 2026-09-13T09:22:08+02:00
**Researcher**: Wojciech Bernardziak
**Git Commit**: `c5e74efa5bd9730177e6e9a0f74266178a8979fe`
**Branch**: `main`
**Repository**: `my-catalog`

## Research Question

Phase 3 of the test rollout (`context/foundation/test-plan.md` §3, Risk #6) needs
grounding before a plan can be written. Per the §2 Risk Response Guidance the
research question is:

> Every read path that composes the deleted-row condition with filters, and the
> layer at which that condition is applied.

Plus the change's own framing question: what does the existing suite already
assert about the deleted/live boundary, so the plan does not duplicate it?

## Summary

Five findings drive the plan.

1. **The exclusion lives in exactly two lines of application code**, both in
   `src/lib/services/games.ts`: `listGames` (`:31`) and `listGenres` (`:65`).
   Every user-visible catalog read reaches the database through one of those two
   functions. There is no third read path.

2. **There is no backstop below the application layer.** The `games` SELECT
   policy is `using (true)` for `authenticated`
   (`supabase/migrations/20260710120000_create_games.sql:32-36`), and no view,
   trigger, or generated column hides deleted rows. `deleted_at` appears in no
   RLS predicate anywhere. If either `.is("deleted_at", null)` is ever dropped,
   nothing catches it — the query simply returns deleted games.

3. **Filter composition is structurally safe today, and the reason is worth
   pinning rather than re-deriving.** The deleted-row predicate is applied
   unconditionally at the head of the single builder chain, before any optional
   filter; every filter re-assigns the same `query` variable, so no branch can
   start a chain that omits it. All predicates AND by PostgREST construction,
   `.or()` appears nowhere in `src/`, every filterable column is `NOT NULL`
   (so the Postgres NULL-comparison trap cannot fire), and the only JS-side
   filtering (`mergeAndFilterCatalog`) iterates the already-filtered array. No
   live defect was found.

4. **The deleted/live boundary is untested at every layer.** No test in the repo
   — unit or db — ever sets `deleted_at` to a non-null value. `deleted_at: null`
   appears in three fixtures as type boilerplate and is never varied.
   `src/lib/services/games.ts` has **no test file at all**, so all five
   `.is("deleted_at", null)` call sites (`:31`, `:65`, `:125`, `:150`, `:172`)
   are uncovered.

5. **This phase cannot be done in the `unit` project.** `src/test/supabaseDouble.ts`
   records filter calls but honours none of them and returns canned data
   regardless of the query (`:107-110`, `:126`) — a "deleted game is excluded"
   test built on it would pass with the `.is()` deleted. The phase belongs in
   `src/test/db/`, which means it runs under `npm run test:db`, not `npm test`.
   That has a consequence for the local edit-loop gate; see Open Questions.

## Detailed Findings

### The read paths (complete inventory)

Two functions issue a catalog read against `games`:

- `listGames(supabase, filters)` — `src/lib/services/games.ts:30-53`.
  Chain (`:31-46`):

  ```ts
  let query = supabase.from("games").select("*").is("deleted_at", null);
  if (filters.genre !== undefined) query = query.eq("genre", filters.genre);
  if (filters.players !== undefined)
    query = query.lte("min_players", filters.players).gte("max_players", filters.players);
  if (filters.maxMinutes !== undefined) query = query.lte("avg_play_minutes", filters.maxMinutes);
  if (filters.loanStatus !== undefined) query = query.eq("loan_status", filters.loanStatus);
  const result = await query.order("created_at", { ascending: false });
  ```

- `listGenres(supabase)` — `src/lib/services/games.ts:64-74`.
  `supabase.from("games").select("genre").is("deleted_at", null)` (`:65`), then a
  case-sensitive JS distinct + case-insensitive display sort (`:71-73`). The
  case-sensitivity is deliberate and documented (`:56-63`): a case-insensitive
  dedup would offer one option that hides the other casing's rows, because
  `listGames` matches genre with case-sensitive `.eq`.

Consumer graph — every user-visible surface:

| Surface                        | Entry point                                           | Read path                                                          | Excludes deleted?            |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| Catalog list + filters         | `src/pages/catalog.astro:33`                          | `listCatalogGames` → `listGames`                                   | yes, via `games.ts:31`       |
| Genre dropdown options         | `src/pages/catalog.astro:33` → `CatalogFilters.astro` | `listGenres`                                                       | yes, via `games.ts:65`       |
| AI recommendation eligible set | `src/pages/api/recommendations.ts:60`                 | `listCatalogGames` → `listGames`                                   | yes, via `games.ts:31`       |
| Game edit form / card          | `src/components/catalog/GameCard.tsx:35` (`fromRow`)  | none — reuses the in-memory row from the list                      | n/a (already filtered)       |
| `/stats`                       | `src/pages/stats.astro:20`                            | `listPreferenceStats` — reads `game_played`/`game_preference` only | does not read `games` at all |

`listCatalogGames` (`src/lib/services/catalogGames.ts:53-60`) has **no independent
`deleted_at` guard of its own** — it inherits exclusion entirely from `listGames`.
It fetches `listGames(supabase, filters)` and `listMemberState(supabase, memberId)`
in parallel and hands both to the pure `mergeAndFilterCatalog` (`:28-44`).

There is **no single-row `select … .eq("id", …)` read anywhere in production
code**. The edit form and game card render from the list snapshot
(`GameCard.tsx:35`), so the "fetch by id after delete" race has no code path to
occur in.

### The layer that applies the condition

Application layer only, repeated in three distinct roles:

1. **Read-side list filter** — `games.ts:31` and `games.ts:65`. Two independent
   repetitions of the same predicate; there is no shared `liveGames()` helper.
2. **Write guard** — `updateGame` (`:125`), `setLoan` (`:150`), `softDeleteGame`
   (`:172`) each chain `.eq("id", id).is("deleted_at", null)`. This turns a
   concurrent-delete race into a zero-row no-op returning the shared
   `GAME_NOT_FOUND_MESSAGE` (`games.ts:16`) rather than mutating or resurrecting a
   deleted row. `softDeleteGame` (`:167-181`) additionally cannot double-stamp an
   already-deleted row.
3. **Database** — nothing. `supabase/migrations/20260710193510_add_games_deleted_at.sql`
   adds the column (`:8`, `timestamptz`, nullable, no default) and a partial index
   `games_live_created_at_idx on public.games (created_at desc) where deleted_at is null`
   (`:12-14`) matching the `listGames` query shape exactly. Its own comment
   (`:5-6`) records that no RLS change was made. The 2026-09-12 phase-2 research
   confirmed against live `pg_policies` that `games` SELECT/INSERT/UPDATE/DELETE
   are all `true` for `authenticated`.

So: the partial index is tuned for the live-rows query, but it is a performance
structure, not a constraint. Exclusion is 100% convention.

### Filter composition: hazards checked, all clear

Each hazard was checked against the shipped code, not assumed:

| Hazard                                                 | Status         | Evidence                                                                                                                                                                                                            |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A branch builds a query omitting the deleted predicate | not possible   | `.is()` is applied at `games.ts:31` before any `if`, and every branch re-assigns the same `query`                                                                                                                   |
| `.or()` precedence widening past the deleted predicate | not applicable | `.or(` has zero matches in `src/`                                                                                                                                                                                   |
| Postgres `NULL` semantics dropping live rows           | not possible   | `genre`, `min_players`, `max_players`, `avg_play_minutes`, `loan_status` are all `not null` (`20260710120000_create_games.sql:17-21`); only `deleted_at` is nullable and it is compared with `.is()`, never `.eq()` |
| Inconsistent range boundaries                          | correct        | `players`: `min_players ≤ N ≤ max_players`, both inclusive (`games.ts:37`); `maxMinutes`: `avg_play_minutes ≤ X` (`games.ts:40`). Matches the documented semantics at `games.ts:25-28`                              |
| Embedded/joined select desyncing the condition         | not applicable | `listGames` uses `select("*")`; no embedded select (`games(*)`, `game_played(...)`) exists anywhere                                                                                                                 |
| JS re-filtering resurrecting a deleted row             | not possible   | `mergeAndFilterCatalog` (`catalogGames.ts:29-42`) maps over the `games` array from `listGames`; per-member state is looked **up** by row id, never iterated as the source                                           |

The last row is the one worth stating precisely, because it is the property a
future refactor could break: `listMemberState` (`src/lib/services/memberGameState.ts:109-134`)
reads `game_played`/`game_preference` with **no** join back to `games` and no
`deleted_at` awareness — it happily returns per-member facts for soft-deleted game
ids. Those facts are harmless today only because the merge iterates the
already-filtered catalog. A future caller that iterated `listMemberState`'s output
directly would leak deleted-game ids. That is a latent risk, not a defect.

Filters reach the query as a plain `GET` form: `CatalogFilters.astro` posts to
`/catalog`, `parseGameFilters` (`src/lib/services/gameFilters.ts:17-24`) decodes
`URLSearchParams` forgivingly (every field `.optional().catch(undefined)`, so a
malformed param is dropped rather than erroring), and `catalog.astro:15` passes the
result straight to `listCatalogGames`. `played` and `preference` are **not** columns
on `games`; they are applied in JS by `mergeAndFilterCatalog`. So a full-filter
query splits across two layers: four predicates in Postgres, two in memory.

### What the existing suite proves (and does not)

20 test-support/test files exist; 16 are `*.test.ts`. Relevant coverage:

- `src/lib/services/gameFilters.test.ts` (100 lines) — parser only. Asserts
  `URLSearchParams` → `GameFilters` and `catalogRedirectTarget`. Never sees a row.
- `src/lib/services/catalogGames.test.ts` (83 lines) — `mergeAndFilterCatalog` as a
  pure function. Covers `played`, `preference`, and their AND combination
  (`:59-79`). Its `makeRow` fixture (`:25`) hardcodes `deleted_at: null` and
  **never varies it**. It also never touches the four catalog-level filters,
  because that function does not apply them.
- `src/pages/api/games/boundary.test.ts` (415 lines) — the delete endpoint appears
  in the id-scoped-writes `it.each` (`:219-231`): it asserts
  `writeSummary() === ["games.update"]` and that `filterSummary()` contains
  `eq(id, game-1)`. That pins the mass-delete guard (a dropped `.eq("id", id)`),
  nothing about `deleted_at` being the payload, and nothing about visibility.
  The "unknown id" case (`:360-373`) fakes the empty result with `data: null`
  rather than modelling a deleted row.
- `src/test/db/*` (4 files, 670 lines) — zero hits for `deleted_at`, `softDelete`,
  or `archive`. `readAttribution.test.ts` calls `listCatalogGames` twice
  (`:113`, `:130`), always with `{}` filters.

Concretely, **no test in this repo asserts any of the three properties phase 3
owes**: that a soft-deleted game is absent from a read, that a soft-deleted row is
still present in storage, or that a live game survives filter composition. And
none of the four catalog-level filters (`genre`, `players`, `maxMinutes`,
`loanStatus`) is ever exercised against real or modelled rows — only its parsing is.

This is precisely the anti-pattern §2 names for Risk #6: "happy-path filter tests
that never assert the deleted/live boundary."

### Harness capability and the project split

`src/test/supabaseDouble.ts` (140 lines) — **cannot serve this phase.** `filter()`
(`:107-110`) logs the call and returns the builder unchanged; `select`, `order`,
`limit`, `single`, `maybeSingle` are passthroughs (`:105`, `:113-121`); `then()`
(`:126`) resolves to the same canned `resultFor(table)` regardless of the chain.
A query with `.is("deleted_at", null)` and one without return identical data. Its
own doc comment (`:4-19`) says so: do not use it to claim anything about row
visibility. Its `filterSummary()` can still assert that the _call was issued_ —
useful as a cheap structural check, but it proves the shape of the query, not the
behaviour of the database.

`src/test/db/harness.ts` (230 lines) — the right home, with two gaps:

- `createGame(member, title)` (`:164-187`) hardcodes every filterable column
  (`genre: "Strategy"`, `min_players: 2`, `max_players: 4`,
  `avg_play_minutes: 60`, `loan_status: "available"`), varying only `title`. A
  filter-composition test needs rows that differ on those columns, so the helper
  needs an overrides parameter (or the test inserts directly).
- There is **no soft-delete fixture**. `deleteGames(member, ids)` (`:225`) is a
  **hard** `DELETE`, teardown-only, and phase 2's impl-review already locked it to
  localhost unless `DB_TESTS_ALLOW_REMOTE=1`. Stamping `deleted_at` must go through
  the real `softDeleteGame` service function (which is also the only way the test
  proves the _service_, not the fixture, does the right thing).

Project split (`vitest.config.ts`): `unit` excludes `src/test/db/**`; `db` includes
exactly `src/test/db/**/*.test.ts`, serial, 30s hook / 20s test timeouts.
`npm test` → `vitest run --project unit`; `npm run test:db` → `vitest run --project db`.
A file placed or named outside that glob is silently never run — the §6.3 warning
applies unchanged.

## Code References

- `src/lib/services/games.ts:31` — `listGames`, the single authoritative live-rows filter
- `src/lib/services/games.ts:37-44` — the four catalog-level filter predicates
- `src/lib/services/games.ts:46` — `order("created_at", { ascending: false })`
- `src/lib/services/games.ts:65` — `listGenres`, the second independent repetition
- `src/lib/services/games.ts:125,150,172` — write guards on `updateGame`/`setLoan`/`softDeleteGame`
- `src/lib/services/games.ts:167-181` — `softDeleteGame`, returns `false` on zero rows matched
- `src/lib/services/catalogGames.ts:28-44` — `mergeAndFilterCatalog`, the JS half of filtering
- `src/lib/services/catalogGames.ts:53-60` — `listCatalogGames`, no independent deleted guard
- `src/lib/services/memberGameState.ts:109-134` — `listMemberState`, no `deleted_at` awareness
- `src/lib/services/gameFilters.ts:17-24` — `filterSchema`, forgiving param decode
- `src/pages/catalog.astro:15,33` — the only page consuming the filtered read
- `src/pages/api/recommendations.ts:60` — the second `listCatalogGames` consumer
- `supabase/migrations/20260710120000_create_games.sql:17-21` — filterable columns, all `not null`
- `supabase/migrations/20260710120000_create_games.sql:32-55` — four `using (true)` policies, no `deleted_at`
- `supabase/migrations/20260710193510_add_games_deleted_at.sql:8,12-14` — column + partial index
- `src/test/supabaseDouble.ts:107-110,126` — why the double cannot prove exclusion
- `src/test/db/harness.ts:164-187` — `createGame`, fixed filterable columns
- `src/test/db/harness.ts:225-230` — `deleteGames`, hard delete, teardown only
- `src/pages/api/games/boundary.test.ts:219-231` — the only delete-related assertion today
- `src/lib/services/catalogGames.test.ts:25,59-79` — per-member filters covered, boundary not

## Architecture Insights

- **One enforcement point, no safety net.** Two `.is("deleted_at", null)` calls
  carry the whole FR-002 guarantee. The design is deliberate (the migration comment
  says so), and it is why a regression test at the query layer has real value: a
  break here is invisible to lint, typecheck, build, and the entire `unit` suite.
- **Filtering is split across two layers by necessity.** Four predicates are
  database-side because they are columns on `games`; `played`/`preference` are
  in-memory because they are per-member facts in other tables. The split is the
  reason "prove it once" is not enough — a test must drive a filter from _each_
  layer simultaneously against a fixture containing a deleted row.
- **The write guards are a second, independent property.** `updateGame`, `setLoan`
  and `softDeleteGame` refusing to touch an already-deleted row is what makes
  "deleted stays deleted" hold under concurrency. It is the same predicate but a
  different guarantee, and phase 1's double can only see the _shape_ of it.
- **A database backstop is not a free win — verified 2026-09-13, and it is worse
  than predicted.** Adding `deleted_at is null` to the `games` SELECT policy does
  not make soft-delete mis-report quietly; it makes it **fail outright**. Run
  against the local stack with that policy in place, `softDeleteGame` raises:

  ```
  Error: Failed to delete game: new row violates row-level security policy for table "games"
      at softDeleteGame src/lib/services/games.ts:177
  ```

  The service's `.select().maybeSingle()` (`games.ts:175-176`) needs the stamped
  row to be visible for the `RETURNING` clause; when the SELECT policy excludes
  it, Postgres raises rather than returning an empty result, and `games.ts:177`
  turns that into a thrown `Error` — so the endpoint hits its generic failure
  path, not the friendly not-found copy. The original prediction (silent `null`
  → "not found") was wrong about the mechanism and too mild about the outcome.
  Any future attempt at a database backstop must therefore change
  `softDeleteGame` first, or use a policy that exempts the write path.

## Historical Context (from prior changes)

- `context/archive/2026-07-10-edit-and-archive-games/plan.md:118-121` — the column
  addition and the query filter were deliberately kept in **one phase** "so the app
  is never in a state where a 'deleted' game reappears". The invariant this phase
  tests is the one that plan was written to protect.
- `context/archive/2026-07-10-edit-and-archive-games/plan.md:88-89` — no trash or
  restore UI; recovering a game is a database operation. So "still retrievable from
  storage" means _the row is there_, not _the app can restore it_. A test asserting
  a restore path would be testing something that does not exist.
- `context/archive/2026-07-11-filter-catalog/plan.md:128-131` — the filter work's
  own contract was to add filters "preserving the current `deleted_at is null`
  behavior". `listGenres` was scoped the same way so the dropdown never offers a
  genre only a deleted game has (`plan.md:147-148`).
- `context/archive/2026-07-11-filter-catalog/plan.md:55-65` — filters are **not**
  preserved across add/edit/delete redirects; those go to a bare `/catalog`.
- `context/archive/2026-09-11-testing-api-boundary-contract/reviews/impl-review.md:56-70`
  — the double originally ignored filter arguments, so dropping `.eq("id", id)` from
  `softDeleteGame` would have soft-deleted every live game with the suite still
  green. `filterLog`/`filterSummary()` was added in response. This is the closest
  prior art to phase 3's risk and the reason a shape-only assertion is not enough.
- `context/archive/2026-09-12-testing-per-member-state-attribution/` — built
  `src/test/db/`. `src/test/db/README.md:22-37` states what it does not prove:
  nothing about production's deployed schema (see `lessons.md`), nothing about the
  app's SSR/cookie auth, and "nothing about what a user sees".
- `context/foundation/prd.md:71-72` — FR-002: "mark board games as deleted … without
  removing them from stored history", with the recorded Socratic resolution that
  deleting risks losing catalog history.
- `context/foundation/prd.md:96` — NFR: "Catalog changes are not silently lost".
- `git log -- supabase/migrations src/lib/services` — five feature commits, no
  post-hoc fix commit touching `deleted_at`. This area has never regressed in
  production; the test is preventive, which is consistent with §3's note that
  phase 3's marginal signal is lower than phase 2's.

## Related Research

- `context/archive/2026-09-12-testing-per-member-state-attribution/research.md` —
  live `pg_policies` inventory (the source for "games SELECT is `using (true)`"),
  and the local-stack `project_id` collision history.
- `context/archive/2026-09-11-testing-api-boundary-contract/research.md` — the API
  boundary inventory and the handler-guard pattern.
- `context/foundation/test-plan.md` §6.2 and §6.3 — the two cookbook patterns this
  phase's §6.4 entry will sit beside.

## Open Questions

1. **Which project owns these tests, and what does that cost the gate?** The
   evidence says `db` (the double cannot prove exclusion). But `npm test` does not
   run `db`, so a regression in `listGames` stays invisible to the local edit loop
   and to the `ci` job — it would only fail the separate `db-tests` job. Options
   for the plan: accept it, or pair the db tests with a cheap `filterSummary()`
   shape assertion in the `unit` project that fails fast when `.is("deleted_at",
null)` stops being issued. The second is the phase-1 `filterLog` pattern applied
   to reads.
2. **How far does "every read path" reach?** Two functions is a small, closed set,
   so enumerating them exhaustively is cheap. But the durable risk is a _future_
   third read path with no `.is()`. Does the plan want a structural guard (a test
   that greps for `.from("games").select` call sites and asserts each is
   accompanied by the predicate, failing when a new one appears), or does it accept
   that a new leak-prone path is caught by review rather than by the suite?
3. **Does the harness gain a soft-delete fixture, or does the test call the real
   service?** Calling `softDeleteGame` is stronger (it proves the service stamps the
   column) but couples the fixture to the unit under test. A likely answer: use the
   real service in the test that owns the delete assertion, and a direct
   `update({deleted_at})` for fixtures in tests whose subject is a _read_.
4. **~~Is the RLS-backstop reasoning correct?~~ SETTLED 2026-09-13.** Verified
   empirically against the local stack during plan Phase 5: the direction was
   right, the mechanism and severity were not. A `deleted_at is null` SELECT
   policy makes `softDeleteGame` throw an RLS-violation error, not report a
   silent not-found. See the corrected bullet in Architecture Insights. The
   policy was restored to `using (true)` and `pg_policies` re-checked afterwards.
5. **`listGenres` deserves its own assertion.** It is the second, independently
   repeated predicate and the one most likely to be forgotten: a deleted game's
   genre reappearing in the dropdown is a visible leak that the catalog-list tests
   would not catch.
