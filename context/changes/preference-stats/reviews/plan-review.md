<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Preference statistics per member

- **Plan**: context/changes/preference-stats/plan.md
- **Mode**: Deep
- **Date**: 2026-07-24
- **Verdict**: SOLID (post-fix)
- **Findings**: 0 critical  2 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-state conformance | PASS |
| Lean execution | PASS |
| Architectural fit | PASS |
| Blind spots | WARNING (F1 — fixed) |
| Plan completeness | WARNING (F2 fixed, F3 fixed) |

## Grounding
6/6 paths ✓, 2/2 symbols ✓ (PROTECTED_ROUTES @ middleware.ts:4; test/build/lint/format scripts), brief↔plan ✓. New files correctly absent. contract-surfaces.md not present (skipped). Central RLS claim (read-all lets a member read others' preference rows) confirmed in 20260722092117_create_member_game_state.sql:59-63,86-90.

## Findings

### F1 — Empty-state is not an empty list; page must test "all counts zero"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Blind spots
- **Location**: Phase 1 (contract) + Phase 2 (stats page empty-state)
- **Detail**: `computeMemberStats` always emits the current member as a "You" row even with zero counts, so the empty case returns `[{You,0,0,0}]` — a non-empty array. A naive `stats.length === 0` check would render a 0/0/0 table instead of the friendly empty message. The correct predicate is "every member's counts sum to 0" (equivalently: no `game_played` rows exist, since preference implies played via the composite FK).
- **Fix**: Added a pure `hasAnyData(stats)` helper to the Phase 1 service contract + unit-test case (g), and rewrote the Phase 2 page contract to decide the empty state via `hasAnyData(stats) === false`, explicitly NOT `stats.length === 0`.
- **Decision**: FIXED (Fix in plan)

### F2 — `npm run format` as an automated verification checks nothing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: Phase 2 — Success Criteria 2.3 (and Progress 2.3)
- **Detail**: The `format` script is `prettier --write .` — it mutates files and always exits 0, so listed as "Format check clean (no diffs)" it verifies nothing.
- **Fix**: Replaced criterion 2.3 (and Progress 2.3) with `npx prettier --check .` — a non-mutating check that exits non-zero on drift.
- **Decision**: FIXED (prettier --check)

### F3 — Phase-1 typecheck via `npm run build` is heavyweight/imprecise

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: Phase 1 — Success Criteria 1.1
- **Detail**: Phase 1 touches only a pure `.ts` service + test, yet 1.1 ran a full `astro build` (Cloudflare adapter, `astro:env/server` secrets) just to typecheck; `astro check` is not wired. CLAUDE.md notes lint uses type-checked rules, so `npm run lint` already provides the type gate.
- **Fix**: Removed the `npm run build` item from Phase 1; the Phase-1 gate is now `vitest` + type-aware `npm run lint`, with the full `astro build` kept as the Phase-2 gate. Renumbered Phase 1 criteria/Progress (1.1–1.4) accordingly; also switched full-suite command to `npm test`.
- **Decision**: FIXED (Fix in plan)

## Triage summary

- Fixed: F1, F2, F3 (3)
- Skipped / Accepted / Dismissed: none

► Post-fix verdict: SOLID — safe to implement.
