<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Test Plan Refresh (2026-09-14)

- **Plan**: `context/changes/test-plan-refresh-2026-09-14/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: NEEDS FIXES before triage; SOLID after fixes
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict          |
| ------------------- | ---------------- |
| End-state alignment | WARNING (F1)     |
| Lean execution      | PASS             |
| Architectural fit   | PASS             |
| Blind spots         | WARNING (F2, F3) |
| Plan completeness   | WARNING (F4, F5) |

## Grounding

- 6/6 paths ✓, 3/3 symbols ✓, brief↔plan ✓, Progress↔Phase ✓.
- Verified by a subagent against a Prettier-formatted scratch copy of the guide:
  - rows #1–#7 are unchanged under `git diff -w`;
  - the `| not started |` grep survives formatting;
  - "26 service / 9 route tests use the stub" is accurate.

## Findings

### F1 — Four stale line references left in the guide

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: End-state alignment
- **Location**: What We're NOT Doing; Phase 3
- **Detail**: Three references in §6.5 no longer point at the code they describe, and Phase 8 builds on its break-check steps. `recommendations.test.ts:43-47` should be `providerStub.ts:36-40`; `recommendations.ts:153-156` should be `:155-159`; `recommendations.ts:73` should be `:77-86`. §6.4's `games.ts:83` is off by one (`:82`).
- **Fix**: Add a §6 line-reference change to Phase 3, narrow the NOT-doing line, and add a check scoped to §6.
- **Decision**: FIXED. Phase 3 change #5 and check 3.6 were added. The check is scoped to §6 so that the dated 2026-09-13 amendment in §2, a historical record, stays verbatim.

### F2 — Risk #11 cites evidence that research said to reject

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; pause to think it through
- **Dimension**: Blind spots
- **Location**: Phase 1 — risk table row #11, Source cell
- **Detail**: The Source cell used "browser verification needed twice in one session" as evidence of likelihood. Research found those checks were panel rendering and a provider hiccup, and #11's own guidance says to challenge that reading. The row is rated High × Low but, unlike #7, carries no note justifying that rating.
- **Fix**: Replace the source with the untested cookie → middleware → `locals.user` path, and add a justification note modelled on #7's.
  - Strength: the likelihood rating stays honest.
  - Trade-off: the evidence looks weaker, which is accurate.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Decision**: FIXED

### F3 — Required post-review step not in the plan: GitHub issues and branch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Blind spots
- **Location**: plan-brief.md, Prerequisites
- **Detail**: `lessons.md` requires a tracking issue, one issue per phase, and a `feat/<change-id>` branch after plan review and before implementation. The work is currently on `main`.
- **Fix**: Add this to the brief's Prerequisites.
- **Decision**: FIXED

### F4 — "Q1" means two different interviews in §2

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Plan completeness
- **Location**: Phase 1 — Source cells #8–#11
- **Detail**: Rows #1–#7 cite the 2026-09-02 interview, and #8–#11 reuse the same Q1–Q5 numbers for the 2026-09-14 interview. #10 cited an interview although its evidence was impl-review F3.
- **Fix**: Write "refresh interview Qn" consistently, and drop the interview citation from #10.
- **Decision**: FIXED

### F5 — Two automated checks can't be run as written

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Plan completeness
- **Location**: Phase 1 check 1.5; Phase 3 check 3.5
- **Detail**: Check 1.5 relied on reading a diff, and without `-w` it fails because Prettier re-pads the tables. Check 3.5 expected the output to end with "188 passed", but Vitest prints `Tests  188 passed (188)` before its timing lines.
- **Fix**: Replace both with pass/fail grep commands.
- **Decision**: FIXED
