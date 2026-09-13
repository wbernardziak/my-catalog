<!-- IMPL-REVIEW-REPORT -->
# Implementation review: Test rollout phase 4: LLM recommendation guardrails

- **Plan**: `context/changes/testing-llm-recommendation-guardrails/plan.md`
- **Scope**: Phases 1-5 of 5 (full plan)
- **Date**: 2026-09-13
- **Verdict**: REJECTED → ACCEPTED after triage (the critical finding is fixed in `041b32f`)
- **Findings**: 1 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL → resolved |
| Architecture | PASS |
| Pattern Consistency | WARNING → resolved |
| Success Criteria | PASS |

All 16 Automated rows re-verified independently at review time: `npm test` 168→171 across
14 files, `typecheck` clean, `lint` clean, `build`, `lint:colors`, `lint:contrast`,
`lint:reads` all pass. No Manual row was checked — 17 remain pending for the human, none
signed off blind. Plan adherence verified file by file: every planned change MATCHes,
with two cosmetic drifts (F10) and one benign extra case; every "What We Are NOT Doing"
boundary holds (no loaned/played exclusion, no time or genre enforcement, island
untouched, no mocking library, no ratchet script, prompt and model byte-identical).

## Findings

### F1 — A mixed provider answer returns `no_match`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — a real trade-off; pause to think it through
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recommendations.ts:194-198
- **Detail**: When the model returns one fabricated id plus one real game the party cannot
  play, `inCatalog` is non-empty so the `out_of_catalog` branch is skipped; the player-count
  guard then empties the list and the result is `no_match` — the neutral "try adjusting the
  player count" copy — while a perfectly fitting game sits in the catalog. Phase 4 thus
  reintroduced, by a narrower path, the exact conflation phase 3 was written to remove.
  Confirmed by a scratch probe: candidates `[exact(4-4), duo(1-2)]`, `playerCount: 4`,
  answer `[zzz, duo]` → `{ ok: false, reason: "no_match" }`.
- **Fix A ⭐ Recommended**: Reserve `no_match` for the case where no candidate satisfies the
  count; otherwise return `out_of_catalog`, with its copy widened to "games that don't fit
  what you asked for".
  - Strength: Keeps the union at six members (a third reason was declined during planning)
    and makes both branches honest.
  - Trade-off: The reason name now covers two failure shapes; the logs keep them apart.
  - Confidence: HIGH — probe-confirmed, one condition.
  - Blind spot: How often a real model mixes the two error shapes is unmeasured.
- **Decision**: FIXED via Fix A (041b32f), with three regression cases including the exact
  probe scenario, break-checked.

### F2 — The dedupe test does not prove its own title

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Success Criteria
- **Location**: src/lib/services/recommendations.test.ts:327
- **Detail**: "keeping the best rank" was asserted with a fixture already in rank order, so
  the sort-before-dedupe was not load-bearing.
- **Fix**: Put the rank-3 duplicate first in the fixture.
- **Decision**: FIXED (041b32f)

### F3 — No named case for the `out_of_catalog` panel kind

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/recommendationView.test.ts:131
- **Detail**: `no_match` has a dedicated case asserting the neutral empty panel;
  `out_of_catalog` was only swept up by the distinctness loop, although "it must be an error
  panel, not the empty one" is the entire point of the split.
- **Fix**: Add a named case mirroring the `no_match` one.
- **Decision**: FIXED (041b32f)

### F4 — Spy lifecycle leaves `console.error` silenced on failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/recommendations.test.ts:123,307
- **Detail**: Both spies restored inline at the end of the test body, and `vitest.config.ts`
  sets no `restoreMocks`, so an assertion failing above the restore silences `console.error`
  for every later case in the file.
- **Fix**: Restore in `afterEach`.
- **Decision**: FIXED (041b32f)

### F5 — A partial hallucination leaves no log line

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recommendations.ts:161-169
- **Detail**: Fabricated ids were logged only when every id was fabricated, so the commonest
  shape of provider drift — some ids good, some invented — was invisible in production, and
  the log is this boundary's only frequency signal.
- **Fix**: Log whenever `inCatalog.length < parsed.data.recommendations.length`.
- **Decision**: FIXED (041b32f)

### F6 — Provider-controlled ids logged untruncated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recommendations.ts:163-165
- **Detail**: The three pre-existing `console.error` calls in the same file truncate
  (`content.slice(0, 500)`); the new ones logged unbounded provider strings.
- **Fix**: `slice(0, 20)` on both id lists.
- **Decision**: FIXED (041b32f)

### F7 — Failure copy blames "The AI" and implicates the catalog

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/recommendationView.ts:178-182
- **Detail**: The four sibling messages either name a user action or stay in neutral
  first-person; the new one names the AI and could read as if the household's catalog were
  at fault.
- **Fix**: Match the sibling register, e.g. "We couldn't get a usable recommendation."
- **Decision**: SKIPPED — partially overtaken by F1, which rewrote the copy to "The AI
  suggested games that don't fit what you asked for." The register point stands if it
  bothers a reader later.

### F8 — Provider stub helpers duplicated across two suites

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recommendations.test.ts:104-124
- **Detail**: `FetchMock`, `providerResponse` and `stubFetch` were re-implemented in the
  route suite, while the repo otherwise centralises scaffolding in `src/test/`.
- **Fix**: Promote to `src/test/providerStub.ts`.
- **Decision**: FIXED (041b32f)

### F9 — `Map` last-wins, and the never-throws precondition

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recommendations.ts:154,187
- **Detail**: The candidate `Map` is last-wins on duplicate ids (harmless — `id` is the
  primary key, and `recommendationView.ts` builds its join map the same way), and
  `const { playerCount } = criteria` is the first property access on `criteria`, so a
  non-object would throw out of a function documented never to throw. TypeScript forbids it
  and the only caller passes validated output.
- **Fix**: Record the precondition in the function's doc comment.
- **Decision**: FIXED (041b32f)

### F10 — Two cosmetic plan drifts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/recommendations.test.ts:226-230
- **Detail**: The rejecting `Response` was inlined rather than added to the shared helper,
  and no standalone `describeFailure("out_of_catalog")` `it` was written (the parametrized
  loop covered it). Same coverage either way; F3 closed the second half anyway.
- **Decision**: SKIPPED
