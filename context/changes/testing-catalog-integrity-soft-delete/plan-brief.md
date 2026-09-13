# Test rollout phase 3: catalog integrity under soft-delete — Plan Brief

> Full plan: `context/changes/testing-catalog-integrity-soft-delete/plan.md`
> Research: `context/changes/testing-catalog-integrity-soft-delete/research.md`

## What and why

Phase 3 of the test rollout (`context/foundation/test-plan.md` §3, Risk #6). Prove
that a soft-deleted game leaves every catalog read path but stays in storage, and
that filter composition never drops a live game. This is preventive, not
corrective: research found no defect. The value is that the guarantee currently
rests on two lines of convention with nothing beneath them.

## Starting point

`listGames` (`src/lib/services/games.ts:31`) and `listGenres` (`:65`) are the only
places that exclude deleted rows, and the `games` SELECT policy is `using (true)`,
so RLS is no backstop. Coverage is zero — no test in the repo ever sets
`deleted_at` to a non-null value, and `games.ts` has no test file at all. The
existing `supabaseDouble` cannot close the gap: it honours no filters, so a test
built on it would pass with the predicate deleted.

## Desired end state

`npm run test:db` proves against a real Postgres that a deleted game is absent
under every filter dimension, that its row is still selectable, and that a
matching live game always comes back. `npm test` and a new deterministic guard
fail fast, without Docker, when the predicate stops being issued or a new `games`
read path appears without it.

## Key decisions made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Where the proof lives | `src/test/db/`, real Postgres | The double honours no filters; only a real database can observe row visibility | Research |
| Gate reach | db suite **plus** a cheap shape assertion in `unit` | `npm test` and the `ci` job never run the db project, so the commonest regression would otherwise be invisible locally | Plan |
| Filter matrix breadth | Each of 6 filters singly + one all-six case | Covers both filtering layers and the densest composition without a 64-case serial suite | Plan |
| Endpoint-level check | Stop at `listCatalogGames` | `/catalog` has no render harness and `/api/recommendations` drags in the LLM (rollout phase 4); the handler adds no composition logic | Plan |
| Soft-delete fixture | Real service where deletion is the subject; direct `update` where a read is | One subject per test — a read failure can't be blamed on the delete service | Plan |
| Future read paths | A deterministic guard script | A new read path is new code no behavioural test calls; the repo already gates on `check-color-literals.mjs` and `check-contrast.mjs` | Plan |
| RLS backstop | Verify the thesis, do not implement | Keeps the phase to "prove", and a SELECT policy may silently break `softDeleteGame`'s success signal | Plan |

## Scope

**In scope:** db harness fixture helpers (`createGame` overrides, `markDeleted`);
the boundary and filter-composition suites; a typed accessor on the double plus a
query-shape test file for `games.ts`; a `lint:reads` guard script wired into `package.json` and the `ci`
job; verification of the RLS thesis; the §6.4 cookbook entry and the §3/§4/§5
test-plan updates.

**Out of scope:** any production code change (no defect found); an RLS backstop
migration; a shared `liveGames()` refactor; endpoint tests against a real
database; restore/un-archive; `/stats`; e2e.

## Architecture / approach

Three layers, each doing only what it alone can do. The **real database** carries
behavioural proof of row visibility. The **unit project** carries a shape
assertion — that the predicate is issued at all — which proves nothing about
Postgres but fails in milliseconds where the db suite does not run. A
**deterministic script** carries the structural property no behavioural test can
reach: a read path that does not exist yet. Every assertion ships only after being
watched to fail.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Harness + boundary | Fixture helpers; deleted absent, still in storage, live present | Extending `createGame` must not disturb three existing db test files |
| 2. Filter matrix | Six single-filter cases + one all-six case | A deleted twin that fails a filter on its own merits makes the case decorative |
| 3. Shape gate | `games.test.ts` asserting the predicate is issued | Reading a green `npm test` as proof of exclusion — the doc comment must forbid it |
| 4. Structural guard | `lint:reads` script + CI wiring | Text scanning false-positives; a guard that flags correct code gets disabled |
| 5. Verify + document | RLS thesis settled; §6.4 written | Leaving the local stack with a modified SELECT policy poisons later db runs |

**Prerequisites:** Docker and the local `my-catalog` Supabase stack on ports
54330-54339 (`test-plan.md` §4); phase 2's `src/test/db/` harness, already shipped.
**Estimated effort:** ~2-3 sessions across 5 phases; phases 3 and 4 are small.

## Open risks and assumptions

- The Phase 2 fixture is load-bearing. If dropping the predicate does not turn
  **every** filtered case red, the deleted twins do not actually match their
  filters and the suite is decorative — the exact anti-pattern §2 names.
- The guard script scans text, not an AST. It needs an exemption escape hatch and
  an error message that names it.
- Phase 5 mutates a live policy on the local stack. The restore must be verified
  against `pg_policies`, not assumed from an exit code.
- The endpoint-level check promised by §3 is deliberately not delivered as
  written; §1 principle #3 (research outranks the plan) is the licence, and the
  deviation is recorded in the plan rather than left for a reader to notice.

## Success criteria

- A soft-deleted game is provably absent from every catalog read path under every
  filter dimension, and its row is provably still in storage.
- A live game matching the active filters is never dropped, at either filtering
  layer.
- Deleting `.is("deleted_at", null)` from `games.ts` turns `npm test` red on its
  own, and adding an unguarded `games` read fails `npm run lint:reads`.
