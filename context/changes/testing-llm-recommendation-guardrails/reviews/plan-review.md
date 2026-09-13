<!-- PLAN-REVIEW-REPORT -->
# Plan review: Test rollout phase 4: LLM recommendation guardrails

- **Plan**: `context/changes/testing-llm-recommendation-guardrails/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: NEEDS WORK → SOLID after triage (all 10 findings fixed in the plan)
- **Findings**: 1 critical, 5 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-state alignment | PASS |
| Frugal execution | PASS |
| Architectural fit | PASS |
| Blind spots | WARNING → resolved |
| Plan completeness | FAIL → resolved |

## Grounding

8/8 paths ✓, 4/4 symbols ✓, brief↔plan ✓. Progress↔Phase: 5/5 phases paired, 31/31 items
(33/33 after triage), no stray checkboxes, single `## Progress` header.

Empirically verified by a codebase-verification pass (probes run in the scratchpad, repo
untouched): the Phase 1 route harness drives the whole chain and exposes the outbound
payload, the `Authorization` header, the 200 envelope and the 500-with-no-fetch path;
`vi.mock` factories survive `vi.resetModules()` on vitest 4.1.10 with env re-binding;
adding a union member raises TS2366 in `describeFailure`; the island needs no change; no
builder method used by the three services is missing from `supabaseDouble`; no existing
fixture in `recommendations.test.ts` breaks under the player-count guard.

## Findings

### F1 — Phase 4's guard contract does not compile

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: Phase 4, change 1
- **Detail**: `RecommendationCriteria.playerCount` is optional (`src/types.ts:16`) even
  though the route's zod schema always supplies it (`recommendationView.ts:31-37`). The
  guard as worded fails typecheck with TS18048 (reproduced), which contradicts the phase's
  own automated criterion. The plan never said what an absent player count should do.
- **Fix**: Guard applies only when `playerCount` is defined; absent count filters nothing.
  Also corrected the SQL citation to `games.ts:36-38` and noted the `Set` → `Map` change.
- **Decision**: FIXED

### F2 — Inverted instruction about the double's client accessor

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 1, automated criterion
- **Detail**: The plan said "passed as `serviceClient`, never `client`". For a route test
  it is the reverse — `serviceClient` is for service tests taking the client as a
  parameter (`src/test/supabaseDouble.ts:79-83`).
- **Fix**: Criterion now names `client` and states which accessor belongs to which layer.
- **Decision**: FIXED

### F3 — Break-check 1.5 reddens a third test the plan does not name

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Blind spots
- **Location**: Phase 1, manual verification
- **Detail**: `...row` in `mapRowToCandidateGame` also reddens `src/types.test.ts:26`,
  while the plan demands "nothing else" reddens (Testing Strategy).
- **Fix**: Row 1.5 now names three expected casualties.
- **Decision**: FIXED

### F4 — Hand-maintained `reasons` array omitted from Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 3, change 4
- **Detail**: `recommendationView.test.ts:131` holds a `reasons` array feeding the copy
  distinctness assertion at `:138`; without the new reason there, the new copy is never
  checked for distinctness.
- **Fix**: Contract now requires updating the array.
- **Decision**: FIXED

### F5 — Phases 3/4 silent about the new route suite

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 3 change 4, Phase 4 change 3
- **Detail**: The union change and the guard can invalidate expectations in the Phase 1
  file; the plan never said so.
- **Fix**: One sentence added to each contract.
- **Decision**: FIXED

### F6 — Phase 4 has no user-visible verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; pause to think it through
- **Dimension**: Blind spots
- **Location**: Phase 4, manual verification
- **Detail**: All four manual rows were break-checks, although the guard changes what users
  see (more frequent `no_match`) and nothing observes how often it fires.
- **Fix**: Added row 4.9 (a normal recommendation still renders) and made the guard's
  `console.error` an automated assertion, which is the only frequency signal.
- **Decision**: FIXED

### F7 — Row 3.6's escape hatch made it a non-check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 3, manual verification
- **Detail**: "If it cannot be provoked, confirm by reading the branch" removes the
  observation the house convention requires of a manual row.
- **Fix**: Replaced with a deterministic provocation (temporarily drop every id at the
  allow-list) and a note that the dev run needs `.dev.vars`; the brief's prerequisites line
  was corrected to match.
- **Decision**: FIXED

### F8 — Log assertions were manual

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phases 3 and 4
- **Detail**: `vi.spyOn(console, "error")` makes them automated; manual rows rot.
- **Fix**: Moved to automated criteria in both phases (3.5, 4.4).
- **Decision**: FIXED

### F9 — Seed shapes unstated, and the nearest model to copy is wrong

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 1, change 1
- **Detail**: `games` must be seeded as an array; `boundary.test.ts:45` seeds a bare object,
  which crashes `mergeAndFilterCatalog`. Matching `game_id`s are required for the optional
  payload fields to be observable at all.
- **Fix**: Seed shapes and the trap are now in the contract.
- **Decision**: FIXED

### F10 — The route-level `Authorization` assertion looked like a duplicate oracle

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Frugal execution
- **Location**: Phase 1, change 3
- **Detail**: Research warned against writing one oracle twice. It is not a duplicate — at
  the route it is the false-green guard (proving the key bound rather than
  `not_configured` short-circuiting) — but the plan did not say so, inviting deletion.
- **Fix**: Rationale added to the contract.
- **Decision**: FIXED
