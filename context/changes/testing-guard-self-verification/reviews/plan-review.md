<!-- PLAN-REVIEW-REPORT -->

# Plan review: Guard Self-Verification

- **Plan**: `context/changes/testing-guard-self-verification/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: NEEDS REVISION at review → **SOUND** after fixes
- **Findings**: 1 critical, 4 warnings, 2 observations

## Verdicts

| Dimension           | At review | After fixes |
| ------------------- | --------- | ----------- |
| End-State Alignment | PASS      | PASS        |
| Lean Execution      | PASS      | PASS        |
| Architectural Fit   | PASS      | PASS        |
| Blind Spots         | WARNING   | PASS        |
| Plan Completeness   | WARNING   | PASS        |

## Grounding

10/10 paths ✓ (three guard scripts, `ci.yml`, `package.json`, `lint-staged.config.js`,
`.husky/pre-commit`, `.claude/settings.json`, `src/lib/theme.ts`, `src/styles/global.css`),
6/6 symbols ✓ (`TABLE_RE`, `PALETTE`, `PREFIX`, `THEMES`, `GRADIENT_TEXT`, `stop_hook_active`),
brief↔plan ✓.

Risky claims verified directly rather than by subagent:

- `__unstable__loadDesignSystem` is exported with types (`tailwindcss/dist/lib.d.mts`)
- `allowJs: true` is inherited from `astro/tsconfigs/base.json`, so importing `lint-staged.config.js` type-checks
- `.bg-card` re-points `--foreground` to `--card-foreground` (`global.css:287`)
- no regex literal containing a quote exists in `src/`
- `require("typescript")` takes 385 ms; the design-system load takes 280 ms
- `os.tmpdir()` is `/tmp`
- `ci.yml` has two-space comment lines at `:31-33`

## Findings

### F1 — Progress titles don't match the Success Criteria bullets

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Plan Completeness
- **Location**: `## Progress`, manual rows of Phases 1–5; also rows 4.2 and 6.2–6.3
- **Detail**: The manual Success Criteria bullets were paraphrased in their Progress rows, which breaks the progress contract. The numbers lined up; only the wording drifted.
- **Fix**: Reword the phase bullets to match the Progress row titles. A mechanical check afterwards found 0 mismatches and 0 checkboxes outside Progress.
- **Decision**: FIXED

### F2 — The Stop-hook test's recursion guard assumes the temp dir isn't in a git repo

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Blind Spots
- **Location**: Phase 5 "Stop hook health"; Critical Implementation Details
- **Detail**: The `{}` case falls through to `git status`, which is expected to fail. If TMPDIR sits inside a worktree, git finds the parent repo, and a dirty `.ts` file there would run `npm test` inside `npm test`.
- **Fix**: Spawn the hook with `GIT_DIR` set to a nonexistent path inside the temp dir, and state it as part of the recursion guard.
- **Decision**: FIXED

### F3 — The comment blanker can lose sync on a regex literal and hide a violation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Blind Spots
- **Location**: Phase 3 change #1
- **Detail**: A regex containing a quote flips the blanker's string state. A later `//` inside a real string then blanks the rest of the line, which can include a `.from("games")`: a silent pass. It is latent (no such regex in `src/`). A proper tokenizer would cost about 385 ms per spawn.
- **Fix**: When the blanker ends a file still inside a string, template or block comment, report the file as `unrecognised`. Add a "blanker loses sync" fixture, and document regex literals as a limit.
- **Decision**: FIXED

### F4 — The contrast mutation test names the wrong surface and the wrong ratio

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Blind Spots
- **Location**: Phase 4 "real contrast failure"
- **Detail**: Setting `--foreground` to `--card` is never compared against `--card`, because the card rule re-points it. On the ground it is compared against `--background` (about 1.1:1, not 1:1). The stated oracle and the expected message were wrong.
- **Fix**: Set `--foreground` to the block's own `--background`, and assert `Bright Shelf · ground`, `--foreground` and `1.00:1`.
- **Decision**: FIXED

### F5 — The "every family" test reads palette families the same way the guard does

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Blind Spots
- **Location**: Phase 2 change #3
- **Detail**: The guard and the test both parsed `--color-<family>-<shade>:` from `theme.css`, so a parse bug would drop the same family on both sides: an implementation mirror.
- **Fix**: Take the test's family set from the design system's `bg-<family>-500` classes, loaded once per file and shared with the roots test.
- **Decision**: FIXED

### F6 — Row 5.4 (time budget) is listed as automated but has no command

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Plan Completeness
- **Location**: Phase 5 criteria; rows 1.8 / 5.4
- **Detail**: The row compared against a baseline recorded with no method, and a single run is noisy.
- **Fix**: Measure as the median of 3 × `/usr/bin/time -f %e npm test` before Phase 1 and after Phase 5, and move 5.4 under Manual.
- **Decision**: FIXED

### F7 — The ci.yml job-block splitter has comment lines at job indent

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Plan Completeness
- **Location**: Phase 5 "CI `ci` job"
- **Detail**: "To the next two-space job key" was ambiguous. `ci.yml:31-33` has two-space `#` lines, and `on:` has two-space keys.
- **Fix**: Pin the rule: after `jobs:`, a job key matches `/^  [a-z][\w-]*:\s*$/`, a block runs to the next key or end of file, and `#` lines are ignored.
- **Decision**: FIXED
