<!-- PLAN-REVIEW-REPORT -->

# Plan review: Quality-gate wiring

- **Plan**: `context/changes/testing-quality-gate-wiring/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: NEEDS WORK → **SOLID** after fixes
- **Findings**: 1 critical, 3 warnings, 2 observations — all 6 fixed

## Verdicts

| Dimension           | Verdict (at review) | After fixes |
| ------------------- | ------------------- | ----------- |
| End-state alignment | FAIL                | PASS        |
| Lean execution      | PASS                | PASS        |
| Architectural fit   | PASS                | PASS        |
| Blind spots         | FAIL                | PASS        |
| Plan completeness   | WARNING             | PASS        |

## Grounding

4/4 existing paths ✓, 2 planned paths correctly absent ✓, 4/4 npm scripts ✓,
jq present (later designed out) ✓, brief↔plan ✓, Progress↔Phase contract ✓
(28 rows after fixes, 0 checkbox leakage, no numbering gaps).

Codebase verification was done directly rather than via a subagent: the riskiest
claims were empirically testable in minutes, and the prior subagent on this
change's hook mechanics was wrong on every load-bearing point.

## Findings

### F1 — The gate checks the working tree, not what is being committed

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stake; think hard before deciding
- **Dimension**: Blind spots
- **Location**: Phase 1 — pre-commit hook contract
- **Detail**: The plan ran `npm run typecheck && npm test` as plain commands
  after lint-staged. Those read the working tree; `git commit` commits the index.
  Proven by experiment: with `const n: number = "not a number"` staged and the
  working copy fixed, typecheck passed — the gate would have admitted a commit
  whose staged snapshot was broken. It fails the other way too: an unrelated
  unstaged edit blocks a commit whose content is fine. This defeats the Desired
  End State, and it is the single thing the phase exists to prevent.
- **Fix A ⭐ Recommended**: Move typecheck + unit into lint-staged as function
  entries in a new `lint-staged.config.js`, and add `--hide-unstaged`.
  - Strength: inherits lint-staged's stash-unstaged behaviour, so the commands
    grade the index — the same mechanism already trusted for eslint.
  - Trade-off: config migrates from `package.json` to a JS file.
  - Confidence: HIGH (raised from MEDIUM during triage after verifying
    lint-staged 16.4.0's function-entry contract and stash semantics).
  - Blind spot: untracked files are hidden by neither flag, so a new untracked
    `.ts` still reaches the gate. Recorded in the plan rather than solved.
- **Fix B**: Keep the commands outside and wrap with `git stash --keep-index`.
  - Strength: no config migration.
  - Trade-off: hand-rolled stashing can strand work — which happened while
    testing this very finding.
  - Confidence: HIGH mechanically, but the failure mode is nasty.
- **Decision**: FIXED with Fix A

### F2 — The Stop hook is inert in the workflow it was designed for

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; stop and think it through
- **Dimension**: Blind spots
- **Location**: Phase 2 — working-tree guard
- **Detail**: `/10x-implement` commits at the end of each phase, which is why
  every Progress row carries a SHA. After that commit the tree is clean, the
  guard exits 0, and the gate never runs. Worse in combination with the
  documented escape: a `--no-verify` commit skips husky _and_ leaves a clean
  tree, so it skips the Stop hook too — both layers miss the same commit, and CI
  is all that remains. The plan presented the layers as independent; for that
  case they fail together.
- **Fix**: State the partition explicitly in Implementation Approach (Stop hook
  covers uncommitted work, commit gate covers commits) and add a Phase 2 manual
  row confirming a turn that ends in a commit runs no gate, so the gap is
  observed rather than assumed.
- **Decision**: FIXED

### F3 — Desired End State contradicts the documented bypass

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: End-state alignment
- **Location**: Desired End State vs "What We're NOT Doing"
- **Detail**: The end state claimed a change "cannot reach a commit without" the
  gate passing, while the plan deliberately keeps `--no-verify` and
  `disableAllHooks`. Unachievable by design, therefore untestable.
- **Fix**: Rephrased to "unless deliberately bypassed", naming CI as the
  enforcing boundary.
- **Decision**: FIXED

### F4 — Phase 1's automated criteria do not test Phase 1's deliverable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan completeness
- **Location**: Phase 1 — Automated Verification
- **Detail**: Rows 1.1–1.4 were `typecheck`/`lint`/`test`/`build` passing — all
  four would pass with the hook never written. Phase 2 does this properly
  (2.4–2.6 assert the script is executable, tracked, and short-circuits).
- **Fix**: Added automated row 1.5 asserting the configured gate exits non-zero
  against a staged type error; later manual rows renumbered.
- **Decision**: FIXED

### F5 — Phase 3's contract depends on a step outside Phase 3

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan completeness
- **Location**: Phase 3 — Rollout row
- **Detail**: The contract said the §3 Change-folder cell "points at the archive
  path once `/10x-archive` runs". Archiving happens after this change closes, so
  the phase could not satisfy half its own contract.
- **Fix**: Scoped to Status → `complete` with the live change path; archive path
  noted as landing at archive time.
- **Decision**: FIXED

### F6 — `jq` is an undeclared dependency of the Stop-hook script

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind spots
- **Location**: Phase 2 — gate script
- **Detail**: jq 1.7 is present on this machine but appears in no manifest or
  prerequisite list. Without it the `stop_hook_active` test evaluates empty, so
  the script gates every turn and can never short-circuit the eight-block cap —
  a silent failure in the one guard that prevents burning eight agent turns.
- **Fix**: Designed the dependency out. The flag is now read with `node`, which
  is already a hard prerequisite of this repo. The replacement was verified
  against all three inputs before being written into the plan: `true` → exit 0
  (short-circuits), `false` → non-zero (gates), malformed → non-zero (fails safe
  by gating rather than silently disabling).
- **Decision**: FIXED
