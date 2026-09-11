<!-- IMPL-REVIEW-REPORT -->
# Implementation review: API boundary contract

- **Plan**: `context/changes/testing-api-boundary-contract/plan.md`
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION → all findings triaged and resolved
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL → resolved (F1, F3, F4 fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (13/13 automated re-verified independently) |

Not rated REJECTED despite the critical finding: runtime behaviour was correct
throughout, all tests passed, and the defect was type-soundness with a narrow fix.

## Findings

### F1 — New files fail `tsc --noEmit` (4 errors)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (types)
- **Location**: `src/pages/api/games/boundary.test.ts:120,277`, `src/test/supabaseDouble.ts:79`
- **Detail**: `TS2339` ×2 destructuring `deniedLocation`/`deniedStatus` from a heterogeneous
  `ENDPOINTS` array; `TS2322` mixed `form` shapes vs `Record<string, string>`; `TS2348`
  `writes[op]` indexed by a dynamic key yields a non-callable `Mock` union. The rest of the
  repo compiled clean, so the defect was entirely new. Runtime unaffected — no assertion
  silently passed, since `response.status` is always a number.
- **Fix**: Explicit `EndpointCase` / `IdCase` interfaces on the `it.each` tables, and
  `Mock<(table: string, payload: unknown) => void>` for the write spies.
- **Decision**: FIXED

### F2 — Nothing type-checks this repo, and the test plan claimed otherwise

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; worth pausing on
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:170`, `.github/workflows/ci.yml`, `package.json`
- **Detail**: §5 claimed "lint + typecheck | husky/lint-staged + CI | required (wired)". Husky
  runs `eslint --fix` only; CI ran lint, lint:colors, lint:contrast, build, test. No `tsc`, no
  `astro check`. ESLint's type-aware rules do not surface raw compiler diagnostics and
  `astro build` transpiles without checking — which is exactly how F1 shipped through a green
  gate stack. Same class of inaccuracy as the `npm test` claim corrected before implementation.
- **Fix**: Added a `typecheck` script (`tsc --noEmit`) and a CI step after `astro sync`; split
  §5's row into separate lint and typecheck rows with the true wiring state and the reason.
- **Decision**: FIXED

### F3 — The double ignored filter arguments, so a dropped scoping clause would pass

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; worth pausing on
- **Dimension**: Safety & Quality (test quality)
- **Location**: `src/test/supabaseDouble.ts:83-98`
- **Detail**: `eq`/`is`/`lte`/`gte` were plain passthroughs discarding their arguments. If a
  refactor dropped `.eq("id", id)` from `softDeleteGame` (`src/lib/services/games.ts:167-174`),
  the handler would soft-delete every live game and the whole suite would still pass. The
  double's doc comment disclaimed authorization but named the RLS gap, not this one — a
  likelier and more destructive class.
- **Fix**: The double now records `filterLog`/`filterSummary()`, and the suite asserts the
  id-scoped writes narrowed to their row (including `played`'s two-column delete). Verified by
  break check: dropping `.eq("id", id)` from `softDeleteGame` turns the delete case red.
- **Decision**: FIXED

### F4 — The five new `catch {}` blocks swallowed errors with no logging

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/pages/api/games/index.ts`, `[id].ts`, `[id]/{loan,played,preference}.ts`
- **Detail**: An aborted read or a programming error was indistinguishable in production from a
  user's malformed body, with zero telemetry. Consistent with every pre-existing catch in those
  files, so not a regression — but it widened an unlogged surface at an auth boundary.
- **Fix**: Bound the error and `console.error` it in the five new catches, following the
  existing `eslint-disable-next-line no-console` convention from `src/pages/catalog.astro:46`.
  Pre-existing catches left alone.
- **Decision**: FIXED

### F5 — The "Supabase is not configured" branch was untested

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality (coverage)
- **Location**: `src/pages/api/games/index.ts:57-59` and the same block in five siblings
- **Detail**: The null-client check is the first branch of every handler's three-step block and
  fires before the auth guard; no test drove it.
- **Fix**: A `describe` block pointing the mock holder at `null`, reusing the `ENDPOINTS` table:
  asserts the configured error redirect (or 503 for the JSON endpoint) and no write.
- **Decision**: FIXED

### F6 — Minor additive drift from the plan's harness contract

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan Adherence
- **Location**: `src/test/supabaseDouble.ts`
- **Detail**: The plan's contract said `{ client, writes }` with "a convenience assertion that
  none fired"; the implementation exposes `writeSummary()` (a query asserted with `toEqual([])`,
  which gives a better failure message) and adds `lte`/`gte`/`order`/`limit` passthroughs the
  real service calls need. Additive, no intent broken. F3's fix extended the surface further
  with `filterLog`/`filterSummary()`.
- **Fix**: Recorded here as an accepted deviation; no code change.
- **Decision**: ACCEPTED

## Post-triage state

All automated criteria re-verified after the fixes: `npm run typecheck` PASS, `npm run lint`
clean, `npm test` 144 passed / 12 files, `npm run build` PASS, `lint:colors` and `lint:contrast`
PASS. Break checks reproduced independently: removing the session guard from `preference.ts`
(a handler not spot-checked during implementation) turns the suite red, and dropping
`.eq("id", id)` from `softDeleteGame` turns the new scoping case red.

Manual verification rows in the plan remain pending — they are the human checklist:
1.5, 2.4, 3.4, 3.5, 4.4.
