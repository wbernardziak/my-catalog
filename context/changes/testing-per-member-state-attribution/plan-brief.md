# Test rollout phase 2: per-member state attribution — Plan Brief

> Full plan: `context/changes/testing-per-member-state-attribution/plan.md`
> Research: `context/changes/testing-per-member-state-attribution/research.md`

## What and why

Risk #1 in `context/foundation/test-plan.md` is the highest-rated row in the map
(High × High) and the only one no test touches: a household member's played state or
like/dislike is attributed to the wrong member. This phase proves attribution at both
layers against a real database, and builds the database-backed test harness the project
has never had.

## Starting point

Two `.eq("member_id", …)` calls in `src/lib/services/memberGameState.ts:114-115` are the
sole authority for read attribution across `/catalog` and `/api/recommendations`; the
database does not back them up, because SELECT is `using (true)`. Writes are genuinely
owner-bound by RLS, verified by a live probe during research. Nothing can catch a
regression in either: `supabaseDouble.ts` honours no filters, and no test in this repo
has ever needed a database. The only verification write-own ever received is a manual
Studio checkbox from July.

## Desired end state

`npm run test:db` runs a real-database suite that goes red if either half regresses,
gated by its own CI job, while the default `npm test` stays hermetic and Docker-free.
§6.3 of the test plan tells the next contributor how to add a test of this kind, so
rollout phase 3 inherits a harness instead of rebuilding one.

## Key decisions made

| Decision                      | Choice                                                | Why                                                                                                                          | Source   |
| ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| What Risk #1 actually asserts | Attribution, not isolation                            | The PRD offers attribution (`prd.md:45`) and a signed-in-vs-anonymous line (`prd.md:94`); FR-006 requires cross-member reads | Research |
| Where each half is enforced   | Writes: RLS. Reads: app filter only                   | Live probe: insert-as-other → `42501`; update/delete → zero rows; SELECT is `using (true)`                                   | Research |
| Harness split                 | Separate `db` vitest project + own CI job             | Keeps the edit loop fast and Docker-free while still gating the DB suite                                                     | Plan     |
| Transport                     | `@supabase/supabase-js` client per member             | Same library and JWT path production uses                                                                                    | Plan     |
| Fixtures                      | Two fresh signed-up members per run                   | No shared state, parallel-safe, no service_role key in test config                                                           | Plan     |
| Read-test level               | Real service functions                                | A deleted `.eq` turns it red; the handler level adds harness, not signal                                                     | Plan     |
| Break check                   | Both halves, one break each                           | A policy test never seen red is the kind that asserts nothing                                                                | Plan     |
| Negative space                | One explicit test that cross-member reads are allowed | Stops a future "hardening" of SELECT from silently breaking `/stats`                                                         | Plan     |
| Schema                        | No migration                                          | The one-household hazard is a product decision, not a test-phase call                                                        | Plan     |

## Scope

**In scope:** the `db` vitest project and two-member harness; write-own denial cases for
both tables with positive controls; the intentional-read-all test; read attribution
through `listMemberState` and `listCatalogGames`; a CI job; §6.3 plus §3/§4/§5 updates.

**Out of scope:** any migration or policy change; member-vs-member read isolation (fails
by design); re-testing `computeMemberStats` labelling (already unit-tested); handler-level
tests; changes to `supabaseDouble.ts` or any phase 1 test; making `npm test` need Docker.

## Architecture / approach

Two suites at the layers that own the two halves. The policy half runs as two real
authenticated members through the same client library the app uses, asserting denial by
reading rows back unchanged — because RLS denies UPDATE/DELETE by matching zero rows, not
by raising, so an error-shaped assertion would pass vacuously. The read half runs through
the real service functions, where a dropped member filter actually shows. Fixtures seed
played before preference, because a composite FK requires it.

## Phases at a glance

| Phase                            | What it delivers                                                              | Key risk                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. The database harness          | `db` vitest project, `test:db`, two-member helper, loud failure when no stack | Splitting the config breaks the `astro:env/server` alias for the new project      |
| 2. Write-own at the policy layer | Six denial cases with positive controls, plus the intentional-read-all test   | These pass on day one; without the break check they could assert nothing          |
| 3. Read attribution              | `listMemberState` / `listCatalogGames` return only the caller's state         | A test where both members hold the same state passes even with the filter dropped |
| 4. CI job and cookbook           | Supabase-starting CI job, §6.3 written, §3/§4/§5 updated                      | Docker startup makes CI slower; the job must not need repository secrets          |

**Prerequisites:** Docker, and the local stack on ports 54330-54339 (`project_id = "my-catalog"`, API `54331`) — fixed 2026-09-12, before which `supabase start` silently reused another repo's containers.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open risks and assumptions

- Docker in CI adds ~1-2 min to the pipeline; acceptable as a separate parallel job, but it is a real cost on every push.
- Fresh users per run leave rows in local `auth.users` if a run dies before cleanup — untidy, not harmful.
- The intentional-read-all test asserts something that looks like a weakness. It needs its comment to stay legible, and it must be deleted if the app ever serves a second household.

## Success criteria (summary)

- Deleting an `.eq("member_id", …)` from `listMemberState` turns the suite red.
- Loosening a `with check` predicate to `true` turns the suite red.
- `npm test` still passes with no database running at all.
