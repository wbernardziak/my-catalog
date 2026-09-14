<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test Plan Refresh (2026-09-14)

- **Plan**: `context/changes/test-plan-refresh-2026-09-14/plan.md`
- **Scope**: Phases 1–3 of 3 (commits `0b9de1c`, `5cb4364`, `3b9ea0a`, epilogue `b778e64`)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION before triage; all findings fixed in triage
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| Plan adherence      | PASS — no drift or missing items; a few in-scope elaborations                        |
| Scope discipline    | PASS — only the planned file and the change folder changed; §1 untouched             |
| Safety & quality    | WARNING (F1, F4, F5) — factual accuracy of doc text                                  |
| Architecture        | PASS                                                                                 |
| Pattern consistency | WARNING (F2, F3, F6, F7)                                                             |
| Success criteria    | PASS — 15/15 automated re-run at HEAD; manual rows 1.6–1.8, 2.5–2.6, 3.7–3.8 pending |

## Findings

### F1 — §8 ledger miscounts the §7 changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Safety & quality
- **Location**: `context/foundation/test-plan.md:704-705`
- **Detail**: The ledger said §7 "gained three exclusions"; it gained two, and the browser entry was replaced. It also omitted the change from pre-prod smoke to the pre-deploy checklist. The wrong count came from the plan's own Phase 3 contract.
- **Fix**: Reworded the ledger bullet.
- **Decision**: FIXED

### F2 — "Strategy (§1–§5) last reviewed" still said 2026-09-02

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Pattern consistency
- **Location**: `context/foundation/test-plan.md:697`
- **Detail**: §2–§5 were revised on 2026-09-14, but this line still carried the old date and contradicted the refresh bullet.
- **Fix**: Split into a §1 line (2026-09-02) and a §2–§5 line (2026-09-14).
- **Decision**: FIXED

### F3 — Hot-spot figures cite a directory outside §1's hot-spot scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; pause to think it through
- **Dimension**: Pattern consistency
- **Location**: `context/foundation/test-plan.md:56-57, 140`
- **Detail**: #9 and #10 cite `.github/workflows`, which is outside §1's scope. The figures didn't state how they were counted (file-change entries, not distinct files).
- **Fix A ⭐ Recommended**: State the widened scope and the counting method in the dated §2 note.
  - Strength: keeps the CI-config evidence and makes the figures reproducible; §1 stays untouched.
  - Trade-off: §1 and §2 describe different scopes.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Fix B**: Drop the `.github/workflows` figure.
  - Strength: stays strictly inside §1's scope.
  - Trade-off: #9 loses its only hot-spot evidence.
  - Confidence: MED.
  - Blind spot: none significant.
- **Decision**: FIXED via Fix A

### F4 — Two imprecise claims in the §2 "Added 2026-09-14" note

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Safety & quality
- **Location**: `context/foundation/test-plan.md:145, 153-154`
- **Detail**: "One unlogged branch (`:114-128`)" actually covers three silent returns. "Contradicting the code comment and README" overstates the README.
- **Fix**: Changed to "the unlogged non-2xx branch (`:118-120`)" and "contradicting the code comment that promises a swap without a code change".
- **Decision**: FIXED

### F5 — §6.1 reference-test sizes were stale

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Safety & quality
- **Location**: `context/foundation/test-plan.md:307-309`
- **Detail**: It said `recommendations.test.ts` has 206 lines (it has 362) and named the wrong "two largest" files.
- **Fix**: The two largest are now `recommendations.test.ts` (362) and `recommendationView.test.ts` (149); `gameFilters.test.ts` (100) is kept as a compact pure-function example.
- **Decision**: FIXED

### F6 — #11 Source cell named a code identifier

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Pattern consistency
- **Location**: `context/foundation/test-plan.md:58`
- **Detail**: "cookie → middleware → `locals.user` path" put a code symbol in a Source cell, against principle #3.
- **Fix**: Changed to "sign-in → session → next request path".
- **Decision**: FIXED

### F7 — Issue #43 sentence sat after §7's Source parenthetical

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrowly scoped
- **Dimension**: Pattern consistency
- **Location**: `context/foundation/test-plan.md:643-646`
- **Detail**: Every §7 entry ends with "(Source: …)"; the added sentence came after it.
- **Fix**: Moved the sentence before the parenthetical and cited the refresh interview Q5 there.
- **Decision**: FIXED
