<!-- IMPL-REVIEW-REPORT -->

# Implementation review: Quality-gate wiring

- **Plan**: `context/changes/testing-quality-gate-wiring/plan.md`
- **Scope**: full plan — Phases 1–3 of 3
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION at review → **ACCEPTED** after fixes
- **Findings**: 1 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | At review | After fixes |
| ------------------- | --------- | ----------- |
| Plan Adherence      | PASS      | PASS        |
| Scope Discipline    | PASS      | PASS        |
| Safety & Quality    | FAIL      | PASS        |
| Architecture        | PASS      | PASS        |
| Pattern Consistency | WARNING   | WARNING     |
| Success Criteria    | PASS      | PASS        |

## Evidence base

All 14 automated criteria re-run green at review time: `typecheck`, `lint`,
`test` (188), `build`, `lint:colors`, `lint:contrast`, `lint:reads`, `test:db`
(35), plus the script/settings tracking checks.

Changed files match the plan's declared targets exactly — no EXTRA, no MISSING.
`package.json` shows only the `lint-staged` block removal, no reformatting noise.
Zero manual rows are marked done: 14 remain `- [ ]`, so nothing was signed off
without evidence.

`lessons.md` compliance: the branch-and-issues rule was followed —
`feat/testing-quality-gate-wiring`, tracking issue #57 plus per-phase #58/#59/#60,
and every commit carries a `Refs:` line.

**Verified during review, not by the plan's own rows.** The `npm test` leg of the
lint-staged chain had never actually been observed to run: automated row 1.5
failed at `typecheck` and the chain stopped there. Re-probed with a type-valid
failing test staged — lint-staged ran `eslint → typecheck → npm test`, failed at
`npm test`, and reverted. The leg works; the row simply did not prove it.

## Findings

### F1 — The turn gate fired on any dirty path, not on gradeable files

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — a real trade-off; stop and think it through
- **Dimension**: Safety & Quality
- **Location**: `.claude/hooks/quality-gate.sh:35` (pre-fix)
- **Detail**: The working-tree guard used an unfiltered `git status --porcelain`,
  which reports untracked files of any type. One stray scratch file — a `.log`,
  an editor backup, a note — made every turn pay the full run until it was
  deleted or gitignored. Measured: **150ms on a clean tree vs 8340ms with a
  single untracked `.txt` present**. The plan asserts the two layers are
  symmetrical ("Both layers run the same two commands"), but their _triggers_
  were not: the commit gate is glob-scoped to `*.{ts,tsx,astro}` while the turn
  gate caught everything. §6.6's "Known residual" documented the untracked case
  for the commit gate only, so the docs did not cover it either.
- **Fix**: Scope the guard by pathspec to `*.ts`/`*.tsx`/`*.astro`, matching the
  commit gate's lint-staged key.
  - Strength: both layers now trigger on the same set; an untracked `.ts` still
    counts deliberately, because `tsc` reads it and it can break the build.
  - Trade-off: a change to `tsconfig.json` or `package.json` still does not
    trigger either layer — the same limitation the commit gate already had.
  - Confidence: HIGH — verified across five scenarios after the change.
  - Blind spot: none significant.
- **Decision**: FIXED — `39b628d`

### F2 — Two fail-open paths in the same guard block

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: `.claude/hooks/quality-gate.sh:30,35` (pre-fix)
- **Detail**: `cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0` let a missing project
  directory wave the turn through with no check at all. Separately, `$(...)`
  captures stdout only, so a `git status` failure produced an empty string and
  was indistinguishable from a clean tree — the same silent skip by a second
  route. Both contradict the fail-safe philosophy the script states for its own
  first guard ("malformed input fails safe by falling through to the gate rather
  than silently disabling it"). One guard failed closed, the other two failed
  open, with no comment acknowledging the asymmetry.
- **Fix**: Both paths now `exit 2` with a reason on stderr.
  - Strength: the script's stated philosophy now holds throughout; a broken
    environment is loud rather than silent.
  - Trade-off: a genuinely bogus `CLAUDE_PROJECT_DIR` blocks the agent until the
    eight-block cap overrides it. Bounded, but it is a behaviour change.
  - Confidence: HIGH — verified: bogus dir now exits 2 with a message.
  - Blind spot: none significant.
- **Decision**: FIXED — `39b628d`

### F3 — The gate infrastructure is itself outside all lint coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — a real trade-off; stop and think it through
- **Dimension**: Pattern Consistency
- **Location**: `lint-staged.config.js`, `.claude/hooks/quality-gate.sh`
- **Detail**: Neither lint-staged key covers `.js`/`.mjs`/`.cjs`/`.sh`/`.yml`, so
  the two files this change adds are not linted or format-checked by any hook,
  and there is no shellcheck anywhere — locally or in CI. The same gap covers
  `scripts/*.mjs` (the three guard scripts), `eslint.config.js`,
  `astro.config.mjs` and `.github/workflows/ci.yml`. This **predates the change**
  — the removed `package.json` config had identical globs, so it is not a
  regression — but the infrastructure that gates every commit is exactly where a
  subtle bug has the widest blast radius, as F1 and F2 just demonstrated. `npm
run lint` in CI does cover the `.js`/`.mjs` files; nothing covers the `.sh`.
- **Fix**: Not applied. Options for a follow-up: widen the lint-staged globs to
  include `.js`/`.mjs`, and/or add shellcheck as a project linter alongside
  `lint:colors`/`lint:contrast`/`lint:reads`.
  - Strength: closes the blast-radius gap on the files that gate everything else.
  - Trade-off: widening the globs makes more commits pay the code gate; a new
    linter is a new dependency and a new CI step.
  - Confidence: MEDIUM — the gap is certain, the right remedy is a judgement call.
  - Blind spot: shellcheck's noise level on this script is unmeasured.
- **Decision**: PENDING

### F4 — JSON escaping meets a non-JSON-aware tokenizer

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: `lint-staged.config.js:21`
- **Detail**: lint-staged does not run these strings through a shell — it
  re-splits them with `string-argv` and calls `tinyexec` directly, so there is no
  injection risk from metacharacters in filenames. But `string-argv`'s quote
  matching is not backslash-aware, while `JSON.stringify` escapes an embedded `"`
  as `\"`. A filename containing a literal double-quote would therefore be split
  incorrectly. Legal on Linux, effectively never occurs. Worth recording because
  the old string-array form did not have this failure mode at all: for a string
  task lint-staged appends filenames as already-separated argv elements, with no
  stringify → re-tokenize round trip.
- **Fix**: Not applied. If it ever matters, drop the `JSON.stringify` and let the
  eslint leg stay a string entry while only typecheck/test come from the function.
- **Decision**: PENDING

### F5 — The `npm test` leg was never proven by the plan's own criteria

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: plan Progress row 1.5
- **Detail**: Row 1.5 asserts "the configured gate refuses a staged type error",
  and it does — but it fails at `typecheck`, so the chain never reaches
  `npm test`. The third command in the gate had no automated coverage. Manual row
  1.7 covers it and is still pending. Verified by hand during this review (see
  Evidence base); the leg works.
- **Fix**: Not applied — 1.7 covers it. A future gate row could assert the test
  leg specifically, with a type-valid failing test.
- **Decision**: PENDING

### F6 — Epilogue commit message miscounts the manual rows

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: commit `a4eacee`
- **Detail**: The epilogue message says "Eleven manual rows remain pending"; the
  actual count is 14 (6 + 5 + 3). The plan's Progress section is correct; only the
  commit message is wrong, and it is immutable history.
- **Fix**: None — recorded here so the number in the log is not trusted.
- **Decision**: NOTED

### F7 — An archived plan references a section this change renumbered

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: `context/archive/2026-09-11-testing-api-boundary-contract/plan.md:321`
- **Detail**: Inserting the new cookbook entry as §6.6 pushed "Per-rollout-phase
  notes" to §6.7. That archived plan says "Add a §6.6 note", meaning the old
  section. Archived folders are read-only by convention and the text correctly
  described the document at its time, so it was deliberately left alone.
- **Fix**: None.
- **Decision**: NOTED

## Pending manual verification (unchanged by this review)

14 rows remain `- [ ]` — 1.6–1.11, 2.7–2.11, 3.4–3.6. See the plan's Progress
section. Rows 1.10 and 2.7 are partly evidenced by probes run during this review
and during the implementation run, but none were marked done.
