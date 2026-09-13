<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Test rollout phase 3 — catalog integrity under soft-delete

- **Plan**: `context/changes/testing-catalog-integrity-soft-delete/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: NEEDS WORK → SOLID (after fixes)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-state alignment | PASS |
| Lean execution | PASS |
| Architectural fit | PASS |
| Blind spots | WARN → resolved |
| Plan completeness | FAIL → resolved |

## Grounding

7/7 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress↔Phase mechanical contract ✓.
The riskiest claim was verified with a compiler probe rather than by reasoning
(a throwaway test file, `npx tsc --noEmit`, then removed).

Two claims checked and confirmed sound, which could have gone the other way:

- Extending `createGame` with a third optional parameter is backward compatible —
  all four existing call sites are two-argument (`harness.test.ts:40`,
  `readAttribution.test.ts:54`, `writeOwn.test.ts:37`, `policyBackstops.test.ts:26`).
- Wiring `lint:reads` into CI only matches how the sibling guard scripts are
  *actually* wired: `lint-staged` runs `eslint --fix` and `prettier` only, despite
  `test-plan.md` §5 describing `lint:colors`/`lint:contrast` as "local".

## Findings

### F1 — Phase 3 cannot pass its own criterion 3.2

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — a real trade-off; stop and think it through
- **Dimension**: Plan completeness
- **Location**: Phase 3 → Contract ("vi.mock-free")
- **Detail**: The contract said to call the service functions directly with
  `createSupabaseDouble().client` as the `supabase` argument. That does not
  compile: `tsc --noEmit` returns `TS2345 — Argument of type '{ from: (table:
  string) => QueryBuilder; }' is not assignable to parameter of type
  'SupabaseClient<...>'. Missing: supabaseUrl, supabaseKey, auth, realtime, and
  20 more.` `boundary.test.ts` avoids this because the *handlers* call
  `createClient`, so the double arrives through a `vi.mock` holder typed
  `unknown` (`boundary.test.ts:17-21`); the service functions take the client as
  a parameter, so a service test must hand it over and must cast. Criterion 3.2
  ("Typecheck passes") belongs to the same phase, so the plan contradicted itself.
- **Fix A ⭐ Recommended**: A typed accessor on `SupabaseDouble`.
  - Strength: The cast lives in one place with a comment explaining why it is
    sound, and serves every future service test — `games.ts` is not the last
    untested service.
  - Trade-off: Touches the shared phase-1 harness, so the change has a wider
    radius than a new file.
  - Confidence: HIGH — the compiler probe confirms both the error and the shape
    of the fix.
  - Blind spot: Did not check whether ESLint forbids `as unknown as` in this repo.
- **Fix B**: A local cast in `games.test.ts`.
  - Strength: No change to the shared harness; the whole cost sits in the new file.
  - Trade-off: The next service test repeats the cast — and a repeated cast with
    no comment is exactly what someone later copies without understanding.
  - Confidence: HIGH — same evidence.
  - Blind spot: None significant.
- **Decision**: FIXED with Fix A — Phase 3 now has two changes; change #1 adds a
  `serviceClient` accessor to `src/test/supabaseDouble.ts` with the compiler error
  quoted as the rationale.

### F2 — Break-check 2.6 can pass vacuously

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Blind spots
- **Location**: Phase 2 → Contract + manual criterion 2.6
- **Detail**: 2.6 says to change `.gte("max_players", …)` to `.gt(…)` and expect
  the `players` case to go red. That only holds if the live fixture game sits
  exactly on the boundary (`max_players === filters.players`). The contract said
  only "one live game matches". With the harness defaults (`min_players: 2`,
  `max_players: 4`, `harness.ts:171-172`) and a filter of `players: 3`, `.gt`
  still matches (4 > 3), the deliberate break stays green, and the reviewer
  concludes the test works. Same failure class the plan warns about elsewhere: an
  assertion that cannot fail.
- **Fix**: Require boundary-exact range fixtures and name the values, so the
  implementer does not pick convenient mid-range numbers.
- **Decision**: FIXED — added a "Range fixtures must sit exactly on the boundary"
  paragraph to the Phase 2 contract, covering the `.gte`, `.lte` and `maxMinutes`
  sides.

### F3 — Contract names a non-existent type `GameInsert`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: Phase 1 → change #1, `createGame` signature
- **Detail**: The contract specified `overrides?: Partial<GameInsert>`. No such
  type exists in `src/types.ts` — there are `GameRow` (`:55`, snake_case stored
  shape), `NewGameInput` (`:119`, camelCase create payload) and `CatalogGame`
  (`:95`). The harness inserts snake_case directly, so `GameRow` is the right
  base; guessing `NewGameInput` would produce camelCase keys that silently miss
  every column.
- **Fix**: Use
  `Partial<Pick<GameRow, "genre" | "min_players" | "max_players" | "avg_play_minutes" | "loan_status">>`.
- **Decision**: FIXED — signature corrected, with an explicit note that
  `NewGameInput` is the wrong base and why, plus the four unaffected call sites
  listed.

### F4 — Criteria headers missing the house-style colon

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: all five phase blocks
- **Detail**: The plan used `### Success Criteria` / `#### Automated Verification`;
  the archived phase-2 plan uses the same headers with a trailing colon
  (`context/archive/2026-09-12-testing-per-member-state-attribution/plan.md:174-176`).
  The `## Progress` section matched the mechanical contract exactly, so
  `/10x-implement` would have parsed the plan correctly — this is cross-plan
  consistency for grepping the archive, not an execution risk.
- **Fix**: Add colons to the ten phase-block headers.
- **Decision**: FIXED — 5 × `### Success Criteria:`, 5 × `#### Automated
  Verification:`, 5 × `#### Manual Verification:`; Progress section left untouched
  and re-verified (10 bare `#### Automated`/`#### Manual`, zero checkboxes outside
  Progress).

### F5 — Unnamed guard tripwire: `insert().select()` in `createGame`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Blind spots
- **Location**: Phase 4 → change #1
- **Detail**: The contract correctly said writes are not flagged, but did not name
  the case that forces the rule's ordering: `createGame`
  (`src/lib/services/games.ts:83`) is
  `.from("games").insert({...}).select().single()` — a chain that reaches
  `.select(` and carries no predicate. A naive "select without predicate → flag"
  rule fires on correct production code. Criterion 4.1 catches it, but only after
  the fact.
- **Fix**: Name `games.ts:83` in the contract as the reason the write-verb check
  must precede the `.select(` check.
- **Decision**: FIXED — paragraph added to the Phase 4 contract.

## Post-fix state

All five findings resolved in `plan.md`; `plan-brief.md` updated so its scope line
still matches Phase 3's two changes. Verdict after fixes: **SOLID**.
