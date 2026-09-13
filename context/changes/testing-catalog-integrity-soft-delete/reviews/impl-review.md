<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test rollout phase 3 — catalog integrity under soft-delete

- **Plan**: `context/changes/testing-catalog-integrity-soft-delete/plan.md`
- **Scope**: Phases 1–5 of 5 (all Automated rows complete)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION → ACCEPTED (after triage fixes)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict            |
| ------------------- | ------------------ |
| Plan Adherence      | PASS               |
| Scope Discipline    | PASS               |
| Safety & Quality    | WARNING → resolved |
| Architecture        | PASS               |
| Pattern Consistency | PASS               |
| Success Criteria    | PASS               |

## Success criteria verification

All 20 Automated rows re-run live during this review: typecheck, lint, lint:reads,
lint:colors, lint:contrast, `npm test` (150 tests / 13 files), `npm run test:db`
(35 tests / 5 files), build — all green. 14 Manual rows pending; none is signed
without evidence, which matches the autonomous-run policy that forbids flipping
them.

Diff scope matches the plan's file list exactly. No production source was
modified, consistent with "What We Are NOT Doing".

## Findings

### F1 — Filter matrix could not detect an entire filter being removed; decoy fixture unused

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: `src/test/db/catalogIntegrity.test.ts:191-200`
- **Detail**: Verified by probe, not by reasoning. Deleting the entire `genre`
  filter block from `games.ts:33-35` left 12/12 tests green; so did deleting the
  JS-layer filter from `catalogGames.ts:35-40`. Cause: `not.toContain(deletedTwin)`
  passes because the twin is excluded by the soft-delete predicate regardless of
  filters, and `toContain(matchAll)` passes because matchAll matches everything.
  Both assertions are insensitive to a filter disappearing. The `decoy` fixture
  was built for exactly this gap — its comment claims "Proves the filters actually
  narrow" — but was referenced only in the aggregate test, so the comment
  overstated what the code did.
  Severity note: the review agent rated this CRITICAL. Rated WARNING here instead,
  because Risk #6 is "deleted rows leak" or "live rows vanish", and both of those
  directions were already caught (the predicate break reddened all eight cases;
  `.gte`→`.gt` reddened the dropped live row). Filter removal is a neighbouring
  regression class, not the one this phase targets. The gap is real, the fix is
  one line.
- **Fix**: Add `expect(ids).not.toContain(decoy)` to the shared `it.each` body.
- **Decision**: FIXED — added with an explaining comment. Re-break-checked:
  removing the `genre` filter block now reddens the genre case; disabling the
  JS-layer `played` filter now reddens the played case. Both restored.

### F2 — The guard silently missed a read split across two statements

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; stop and think it through
- **Dimension**: Safety & Quality
- **Location**: `scripts/check-games-read-guard.mjs:63-67` (`chainAfter`)
- **Detail**: Verified by probe. A file containing
  `let q = supabase.from("games"); const r = await q.select("*")…` passed
  `npm run lint:reads` green and was not even counted as a read (the report still
  said "2 reads"). `chainAfter` truncates at the first `;`, so `.select(` is never
  seen. This is not exotic: `listGames` (`games.ts:31-44`) already uses the
  `let query = …; query = query.eq(…)` idiom, so splitting `.from()` from
  `.select()` is a natural refactor in that very file. A guard whose sole purpose
  is catching a new unguarded read was missing one.
- **Fix A ⭐ Recommended**: Classify each chain as write / read / unrecognised, and
  report the unrecognised ones instead of passing them silently.
  - Strength: A scanner that admits what it cannot read is honest; one that
    silently passes it looks like coverage while providing none.
  - Trade-off: Possible false positives on unusual but correct writes; needs the
    EXEMPT escape hatch.
  - Confidence: HIGH — the probe shows exactly where the parser loses the chain.
  - Blind spot: How many chain shapes occur in practice beyond the two here.
- **Fix B**: Rewrite on the TypeScript compiler API (already a devDependency).
  - Strength: Removes the whole class of text-parsing problems at once.
  - Trade-off: The script stops resembling its siblings and grows several-fold;
    `.astro` would need a separate path.
  - Confidence: MEDIUM — not prototyped.
  - Blind spot: CI start-up cost unmeasured.
- **Decision**: FIXED with Fix A — three-way classification, a separate reporting
  block for unrecognised chains, and the header comment rewritten to describe all
  three outcomes. Verified: the split-chain probe is now reported at its file:line
  and exits 1.

### F3 — The RLS probe left two orphaned rows in the local stack

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: local Supabase stack, `public.games`
- **Detail**: The throwaway `__rlsprobe.test.ts` from Phase 5 had no `afterAll`
  and was run twice, leaving two live `rls-probe …` rows. The table held exactly
  those two rows and nothing else, which incidentally confirms the real suite's
  teardown is complete. No effect on assertions (they are containment-based and
  anchored to a per-run unique genre). Reported because the run report claimed the
  policy was cleaned up but never checked the rows.
- **Fix**: Delete the two rows from the local stack.
- **Decision**: FIXED — deleted; `public.games` now holds 0 rows.

### F4 — test-plan §3 points at an archive folder that does not exist yet

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/test-plan.md:148`
- **Detail**: The row links to
  `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/` while the
  change still lives under `context/changes/` with `status: implemented`. The plan's
  Phase 5 contract asked for this explicitly and the run report flagged it as an
  uncertainty; `/10x-archive` will move the folder and the link will resolve.
- **Fix**: Leave it; `/10x-archive` closes it. Manual row 5.6 exists for exactly
  this check.
- **Decision**: SKIPPED — deliberately left for `/10x-archive`.

### F5 — Backticked `.from(\`games\`)` bypassed the guard

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: `scripts/check-games-read-guard.mjs:50` (`TABLE`)
- **Detail**: The match was a literal on `.from("games")`. The single-quote variant
  is neutralised in practice (Prettier enforces double quotes and `lint` runs
  before `lint:reads` in CI), but backticks survive both, leaving a genuine if
  unlikely hole.
- **Fix**: Match the table name under any quote style.
- **Decision**: FIXED — replaced the literal with
  `/\.from\(\s*(["'`])games\1\s\*\)/g`. Verified: a backticked unguarded read is now
  reported as unguarded.

## Post-triage state

F1, F2, F3, F5 fixed; F4 deliberately deferred to `/10x-archive`. Full gate re-run
after the fixes: typecheck, lint, lint:reads, lint:colors, lint:contrast,
`npm test` (150), `npm run test:db` (35), build — all green. Verdict after fixes:
**ACCEPTED**.
