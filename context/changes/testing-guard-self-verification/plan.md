# Guard Self-Verification Implementation Plan

## Overview

Rollout Phase 6 of `context/foundation/test-plan.md` (Risk #10). The three bespoke gates are
`lint:colors`, `lint:contrast` and `lint:reads`. Together with the CI, commit-hook and
agent-turn wiring, they are what stop whole classes of regression reaching `main`. None of them
has ever been shown to fail. Research proved several of them pass while checking nothing,
or while missing a real violation. This plan fixes every proven hole in the guard itself and
pins each one with a spawn-based self-test that runs in `npm test`. It then asserts that
the wiring cannot be removed unnoticed.

## Current State Analysis

All facts below were re-probed on 2026-09-14 at `a11937e`
(`context/changes/testing-guard-self-verification/research.md`).

- **`scripts/check-color-literals.mjs`**
  - An empty `src/` passes: "No colour literals in 0 files.", exit 0 (`:106`).
  - `PALETTE` (`:29-54`) lacks tailwindcss 4.2.4's `mauve`, `mist`, `olive` and `taupe`.
  - `PREFIX` (`:56-57`) lacks the colour roots `border-s`, `border-e`, `border-bs` and `border-be`.
  - Every one of those passes today.
- **`scripts/check-games-read-guard.mjs`**
  - An empty `src/` passes (`:156`).
  - A comment inside the chain fakes the predicate or a write verb (`:104,110`, raw substring
    checks).
  - `.from("games" as const)` and `.from(T)` never match `TABLE_RE` (`:65`).
- **`scripts/check-contrast.mjs`**
  - It fails closed on every missing block and token, but its `THEMES` list (`:36-40`) is hand-kept
    apart from `src/lib/theme.ts:10`, so a fourth theme is silently unchecked.
  - `GRADIENT_TEXT` (`:96-104`) is hand-kept against `bg-clip-text` sites; there is one today,
    at `src/components/PageTitle.astro:14`.
  - It has no `checks > 0` assertion.
- **Wiring.** No test reads `.github/workflows/ci.yml`, the `package.json` scripts,
  `lint-staged.config.js`, `.husky/pre-commit` or `.claude/settings.json`. Deleting any gate step
  stays green.
- **Seams.** All three guards resolve their root from `import.meta.url`
  (`check-color-literals.mjs:23`, `check-games-read-guard.mjs:45`, `check-contrast.mjs:33`) and
  end in `process.exit`, so they are testable by spawning, not by importing.
  - No test in the repo spawns a process today.
  - One guard spawn takes about 70 ms; the unit suite takes 2.8 s wall.
  - `npm test` runs in CI, in the commit hook and in the Stop hook.

## Desired End State

Every item below is enforced by `npm test`.

- **The colour and games guards cannot pass on an empty scan.** They also cannot pass on a
  scan that found nothing to classify.
- **A known violation always fails, for the right reason.** Each guard fails on a known violation
  with output naming the rule and the fixture file, and a fixture that fails for an unrelated
  reason (such as a missing `src/`) is distinguishable.
- **The colour guard follows the installed Tailwind.** It catches every palette family and every
  colour-taking utility root. The tests derive the expected sets from Tailwind itself, not from
  the guard.
- **The games guard closes its proven bypasses.** A misleading comment, `as const`, or an
  indirected table name either gets caught or fails loudly as unrecognised.
- **The contrast guard's lists follow the source.** It fails when a registered theme has no entry,
  when an entry names an unregistered theme, when `bg-clip-text` sites and gradient entries
  disagree, or when zero assertions ran.
- **The wiring cannot be removed unnoticed.** Removing a required step from its `ci.yml` job, a
  gate script from `package.json`, the lint-staged commands, the husky hook, or the Stop-hook
  registration fails `npm test`. So does the hook losing its exec bit, failing `bash -n`, or
  losing its `stop_hook_active` exit.
- **Test-plan §6.8 says how to prove a guard can fail**, and §3 Phase 6 is `complete`.

Verification: every phase ends with a **deliberate-break check** (manual rows). Revert the fix
or delete the wiring line, confirm the new test goes red with the expected message, then
restore it.

### Key Discoveries:

- Tailwind's theme resolves from the scripts directory:
  `createRequire(import.meta.url).resolve("tailwindcss/theme.css")` →
  `node_modules/tailwindcss/theme.css`. Families come from `--color-<family>-<shade>:`
  declarations; `--color-black` and `--color-white` are at `:322-323`.
- `tailwindcss` exports `__unstable__loadDesignSystem`. Its `getClassList()` yields the
  colour-taking utility roots for `red-500`. The v4-only roots `inset-shadow`, `text-shadow`,
  `drop-shadow`, `inset-ring` and `mask-*-from/to` are caught today only because `\b` matches
  after a hyphen (research, Guard 1).
- Widening the palette and prefix list produces zero hits in today's `src/`.
- No `.from(<identifier>)` call and no `Array.from` exists in `src/` outside `src/test/`, so an
  identifier-argument rule has no false positives today.
- `src/lib/theme.ts:10` is `export const THEMES = ["felt", "shelf", "punchboard"] as const;`
  `felt` renders from `:root`; the others from `.theme-<name>` (`theme.ts:23`,
  `global.css:22,116,189`).
- `tsconfig.json` includes `**/*` and the Vitest `unit` project collects any `*.test.ts` outside
  `src/test/db/**`. A `scripts/*.test.ts` is type-checked, linted with type-aware rules, and run
  by `npm test` with no config change. `@types/node` is installed.
- `lint-staged.config.js` is an ES module whose `*.{ts,tsx,astro}` entry is a function
  (`:18-25`), so it can be imported and called.
- `.claude/hooks/quality-gate.sh:26-28` exits 0 on `stop_hook_active: true` before touching
  the project directory. Malformed input falls through to `cd` and `git status`, which fail
  closed with exit 2 (`:33-36,52-55`).
- `yaml` is installed only transitively (via `@astrojs/check`), so it is not used.

## What We're NOT Doing

- **Impl-review F3** (widening lint-staged globs to `.js`/`.mjs`, adding shellcheck). It is
  deferred and recorded in test-plan §7 with its re-evaluation trigger. The plan's anti-pattern
  column rules out adding lint coverage without a deliberate-break check, and CI already runs
  `eslint .` over `scripts/**/*.mjs`.
- Parsing `ci.yml` as YAML or detecting `if: false` on a job. That is a documented limit of
  the job-scoped text match.
- Scanning extensions the guards skip today (`.mts`, `.mdx`, `.svg`, `.html`, `public/`). No
  source of this kind exists, and no risk names it.
- Floors pinned to today's counts (78 files, 2 reads). That would be an implementation mirror.
- Driving the Stop hook's dirty-tree branch from a test. It would run `npm test` recursively.
- Following a chain split across statements, or a `;` inside a string. Both already fail
  closed as unrecognised or unguarded.
- Adding lint or `lint:*` to the Stop hook. That is out of scope by §6.6's design.

## Implementation Approach

1. **Harness and floors first.** Phase 1 adds the shared `--root` seam and the harness that
   every later phase reuses, and closes the vacuous-pass defect common to two guards.
2. **Then one phase per guard,** each pairing the fix with its pinning tests.
3. **Then the wiring.**
4. **Then the docs.**

Every phase follows this shape:

- **Fix the defect in the guard.** Tests written against today's code would lock in the defect.
- **Take expected values from outside the guard:** Tailwind's own data, `src/lib/theme.ts`, the
  real `global.css`, hand-written violating snippets, or the Risk #6 wording.
- **Assert output, not only exit status:** the rule name and the fixture file must appear.
- **Break it deliberately once,** to watch the test fail.

## Critical Implementation Details

- **`--root` is a command-line flag, never an env var.** An environment variable left set in a
  shell could silently point CI or a developer's run at the wrong tree. That is the exact
  vacuous-pass failure this phase exists to remove.
  - The root is used only when passed explicitly.
  - When overridden, the guard prints the root it scanned.
  - Tailwind's theme is always resolved from the script's own location, never from `--root`, so
    fixture trees need no `node_modules`.
- **Spawn budget.** Group each guard's cases into as few spawns as possible: one tree holding
  several known-bad files, with per-file assertions on the output. Target about 20 spawns in total.
  The added cost must stay under 1.5 s, because the commit hook and the Stop hook pay it too.
  Measure it as the median of 3 runs of `/usr/bin/time -f %e npm test`, once before Phase 1
  starts and once after Phase 5 lands; a single run is too noisy to compare.
- **Hook test recursion guard.** Run the Stop hook with `CLAUDE_PROJECT_DIR` set to a fresh temp
  dir **and** `GIT_DIR` set to a nonexistent path inside that dir.
  - `GIT_DIR` is what makes `git status` fail regardless of where the temp dir lives. `os.tmpdir()`
    is `/tmp` locally and on GitHub runners, but TMPDIR can point inside a worktree (some sandboxes
    and devcontainers do). Without `GIT_DIR`, git would discover the parent repo, and a dirty `.ts`
    there would run `npm test` inside `npm test`.
  - If the `stop_hook_active` guard ever broke, the script would reach `git status`, fail and exit 2. It would never reach `npm test`.
  - Never run the hook with the real project dir from a test.
- **Comment stripping must preserve offsets.** Replace comment characters with spaces and keep
  newlines, so reported line numbers stay correct. Skip `"…"`, `'…'` and `` `…` `` literals,
  including a `//` inside a URL string. Template interpolation (`${…}`) may be treated as string
  content; that is a documented simplification.
- **The blanker cannot see regex literals, so it must fail closed when it loses track.** A regex
  containing a quote (such as `/["']/`) flips its string state. From there, a `//` inside a real
  string reads as a comment and can blank a `.from("games")` line: a silent pass. No such regex
  exists in `src/` today. Rather than add a tokenizer (`require("typescript")` costs about 385 ms
  per spawn), the blanker reports any file it finishes while still inside a string, template or
  block comment as `unrecognised`. Record regex literals as a documented limit in the guard header.

## Phase 1: Guard harness and empty-scan floors

### Overview

Add an explicit root override to all three guards and a shared temp-tree harness. Make the colour
and games guards fail when their scan found nothing. Pin known-bad, known-good, empty and missing
trees for both scanners.

### Changes Required:

#### 1. Root override on all three guards

**File**: `scripts/check-color-literals.mjs`, `scripts/check-games-read-guard.mjs`, `scripts/check-contrast.mjs`

**Intent**: Let a test point a guard at a fixture tree without copying the script.

**Contract**:

- `node scripts/<guard>.mjs [--root=<absolute dir>]`.
- Default root is unchanged (the repo root via `import.meta.url`).
- With `--root`, all `src/` paths resolve under it, and the guard logs `Scanned root: <dir>` on
  stdout.
- An unknown argument exits 1 with a usage line, so a typo cannot silently mean "default root".
- The `package.json` scripts are unchanged.

#### 2. Empty-scan floors

**File**: `scripts/check-color-literals.mjs`, `scripts/check-games-read-guard.mjs`

**Intent**: A scan that saw nothing must fail, matching the games guard's own "report, don't
assume" rule (`check-games-read-guard.mjs:23-27`).

**Contract**:

- Colours: exit 1 with a message naming the root when 0 files matched the extensions.
- Games: exit 1 when 0 files were scanned, or when 0 `games` reads were classified.
  - A write-only tree still fails on the 0-reads floor.
  - Oracle: Risk #6 says the catalog has read paths that must carry the predicate. A tree with none
    means the scan is broken, not clean.
- A missing `src/` directory exits 1 with an explicit "no src/ under <root>" message instead
  of an `ENOENT` stack trace, so a wrong-root failure is distinguishable from a violation.

#### 3. Shared guard test harness

**File**: `scripts/guardHarness.ts` (new)

**Intent**: One helper for building a temp fixture tree and running a guard against it, reused by
every guard test in this plan.

**Contract**:

- `makeTree(files: Record<string, string>): string` writes files under a fresh `os.tmpdir()`
  directory and returns its path. The test removes it in `afterAll`.
- `runGuard(script: string, root?: string): { status: number; stdout: string; stderr: string }` uses
  `spawnSync(process.execPath, [script, …])` with the repo root as `cwd`.

#### 4. Floor and baseline self-tests

**File**: `scripts/check-color-literals.test.ts`, `scripts/check-games-read-guard.test.ts` (new)

**Intent**: Prove each scanner fails on a real violation for the right reason, passes on clean
input, and refuses a vacuous scan.

**Contract**:

| Test                     | Behaviour asserted                                                                                                                                                                                            | Regression caught                   | Edge/boundary                                                                                                  | Anti-pattern avoided                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| colours known-bad        | a tree with `bg-red-500`, `#1d3b32` and `style="color: red"` in three files fails; the output names each file and its rule tag (`[tailwind-colour-utility]`, `[raw-colour-literal]`, `[inline-style-colour]`) | a rule regex broken or deleted      | three rules, one spawn                                                                                         | exit-code-only assertion                  |
| colours known-good       | a tree with token classes (`bg-card text-foreground`) passes and reports a non-zero file count                                                                                                                | a false positive on the house idiom | the exempt paths `src/styles/global.css` and `src/components/BrandMark.astro`, holding literals, still pass    | —                                         |
| colours empty / missing  | an empty `src/` fails with the floor message; a missing `src/` fails with the no-src message; neither prints "No colour literals"                                                                             | vacuous pass (research Summary 1)   | the two failure reasons are distinguishable                                                                    | a fixture that fails for the wrong reason |
| reads known-bad          | a tree with one unguarded read and one split-statement chain fails; the output lists `unguarded` and `unrecognised` with the right files                                                                      | the classifier broken               | a write chain ending `.insert(…).select()` in the same tree is not reported (the ORDER MATTERS note, `:29-33`) | —                                         |
| reads known-good         | a guarded read plus writes pass with "1 `games` read(s)"                                                                                                                                                      | a false positive                    | —                                                                                                              | pinning today's count of 2                |
| reads empty / write-only | an empty `src/` fails the file floor; a tree with only writes fails the reads floor                                                                                                                           | vacuous pass                        | `src/test/` fixtures are exempt and do not count as reads                                                      | —                                         |

The expected strings come from hand-written snippets and the guards' documented rule names, not
from running the guard first and copying its output.

### Success Criteria:

#### Automated Verification:

- Guard self-tests pass: `npx vitest run --project unit scripts/`
- Full unit suite passes: `npm test`
- Real repo still clean: `npm run lint:colors && npm run lint:reads && npm run lint:contrast`
- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification:

- Deliberate break: removing the colour floor turns the empty-tree test red
- Deliberate break: removing the games reads floor turns the write-only test red
- `npm test` wall time before and after recorded

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Colour guard tracks the installed Tailwind

### Overview

Replace the hardcoded palette with families read from Tailwind's `theme.css` at runtime. Add the
missing logical-border roots. Prove, against Tailwind's own data, that every family and every
colour-taking utility root is caught.

### Changes Required:

#### 1. Runtime palette

**File**: `scripts/check-color-literals.mjs`

**Intent**: A Tailwind upgrade that adds a colour family can never again open a silent hole.

**Contract**:

- `PALETTE` is built from `--color-<family>-<shade>:` declarations in
  `createRequire(import.meta.url).resolve("tailwindcss/theme.css")`, plus `white` and `black`
  from `--color-white` and `--color-black`.
- If the file cannot be resolved, or yields fewer than 10 families, the guard exits 1, naming
  the path. A theme.css format change fails closed.
- The header comment explains the source.

#### 2. Missing utility roots

**File**: `scripts/check-color-literals.mjs`

**Intent**: Close the `border-s/e/bs/be` hole (research, Guard 1 probes).

**Contract**:

- `PREFIX` gains `border-s|border-e|border-bs|border-be`.
- The header comment records that the v4 roots `inset-shadow`, `text-shadow`, `drop-shadow`,
  `inset-ring` and `mask-*-from/to` are caught through their inner prefix, and that the
  self-test below is what guarantees it.

#### 3. Tailwind-derived self-tests

**File**: `scripts/check-color-literals.test.ts`

**Intent**: Oracle the guard against Tailwind, not against the guard's own lists.

**Contract**:

| Test                  | Behaviour asserted                                                                                                                                                                                                                                                                                              | Regression caught                                                                                                          | Edge/boundary                                                                      | Anti-pattern avoided                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| every family          | the test takes family names from Tailwind's design system (every `bg-<family>-500` class in `getClassList()`), **not** by re-parsing `theme.css` the way the guard does; a fixture holds one line `bg-<family>-500` per family plus `bg-white` and `bg-black`; the guard reports a hit on **every** line number | a stale palette (proven: `mauve`, `mist`, `olive`, `taupe`), or a bug in the guard's `theme.css` parse that drops a family | variant prefix `hover:bg-mauve-500` and opacity `text-olive-700/70` on extra lines | expected set copied from the guard's `PALETTE`, or derived with the guard's own parsing (implementation mirror) |
| every colour root     | the test calls `__unstable__loadDesignSystem` over `theme.css`, collects every `<root>` with a `<root>-red-500` class, and writes one line per root; every line is reported                                                                                                                                     | a stale prefix (proven: `border-s/e/bs/be`)                                                                                | roots matched only via an inner prefix still count                                 | a hand-listed root fixture that falls behind                                                                    |
| proven-hole sentinels | a fixed fixture of the four literal classes `bg-mauve-500`, `text-olive-700`, `border-s-red-500`, `border-e-red-500` fails                                                                                                                                                                                      | the derived tests silently weakening, e.g. the design-system API returning nothing                                         | the derived tests also assert a non-trivial set size (≥ 20 families, ≥ 30 roots)   | derived tests that pass vacuously on an empty list                                                              |

Load the design system once per file (about 280 ms) and share it between "every family" and
"every colour root". If `__unstable__loadDesignSystem` disappears in a Tailwind upgrade, both
tests fail loudly. The recovery is to switch them to hand-listed fixtures, not to delete them. Say
so in a comment.

### Success Criteria:

#### Automated Verification:

- Guard self-tests pass: `npx vitest run --project unit scripts/`
- Real repo still clean: `npm run lint:colors`
- Full unit suite passes: `npm test`
- Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual Verification:

- Deliberate break: filtering `mauve` out turns "every family" red
- Deliberate break: removing `border-s` turns "every colour root" and the sentinel red
- Real-repo `lint:colors` file count unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Games-read guard bypasses

### Overview

Close the three proven bypasses so each is caught or reported as unrecognised, and pin every
probe from the research table.

### Changes Required:

#### 1. Comment-blind classification

**File**: `scripts/check-games-read-guard.mjs`

**Intent**: A comment inside a chain can no longer fake the predicate or a write verb.

**Contract**:

- Before matching, the source is passed through a comment blanker. It replaces `//…` and
  `/*…*/` with spaces, preserves newlines, and skips string and template literals.
- Classification runs on the blanked text; line numbers are unchanged.
- If the blanker reaches end of file still inside a string, template literal or block comment, the
  file is reported as `unrecognised` with a message naming the likely cause (an unterminated
  literal, or a regex literal containing a quote). See Critical Implementation Details.
- The header's rule description is updated, and records regex literals as a known limit.

#### 2. `as const` table argument

**File**: `scripts/check-games-read-guard.mjs`

**Intent**: `.from("games" as const)` is treated exactly like `.from("games")`.

**Contract**: `TABLE_RE` accepts an optional `\s+as\s+const` after the quoted name.

#### 3. Indirected table names fail closed

**File**: `scripts/check-games-read-guard.mjs`

**Intent**: A `.from(<identifier>)` the scanner cannot resolve is reported, not assumed safe.

**Contract**:

- In any scanned file whose blanked source contains the string literal `"games"`, `'games'` or
  `` `games` ``, every `.from(` whose argument does not start with a quote is reported with a new
  kind, `indirect`.
- The message says to use the literal table name.
- `Array.from(` and `Buffer.from(`, meaning a capitalised receiver immediately before `.from`,
  are excluded.
- The reported outcome is exit 1.

#### 4. Bypass self-tests

**File**: `scripts/check-games-read-guard.test.ts`

**Intent**: Pin each research probe as a behaviour.

**Contract**:

| Test                    | Behaviour asserted                                                                                                                                         | Regression caught                                                        | Edge/boundary                                                                                                       | Anti-pattern avoided                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| comment fakes predicate | `.select("*") /* no .is("deleted_at", null) */;` is reported `unguarded`                                                                                   | substring match on comments (research probe)                             | `// .insert( elsewhere` inside a guarded read's chain still passes, now for the right reason: classified as a read  | asserting only exit code, which the old write misclassification also produced                                                |
| comment fakes write     | `.select("*") // .update( later` then `;` on the next line is reported `unguarded`                                                                         | write-verb match on comments                                             | —                                                                                                                   | —                                                                                                                            |
| string keeps `//`       | `.select("*").eq("url", "https://x//y").is("deleted_at", null);` passes                                                                                    | the blanker eating string content and hiding the predicate               | a line number reported for a later violation in the same file is correct                                            | —                                                                                                                            |
| blanker loses sync      | a file with `const re = /["']/;` followed by `s.from("games").select("*").eq("u", "https://x");` is reported (`unrecognised` or `unguarded`), never passes | a regex literal desyncing the blanker and hiding a read (plan review F3) | a file with a quote-free regex such as `/\d+/` is scanned normally                                                  | a fixture that passes because the read was blanked away                                                                      |
| `as const`              | `.from("games" as const).select("*");` is reported `unguarded`                                                                                             | `TABLE_RE` too narrow                                                    | the guarded `as const` variant passes                                                                               | —                                                                                                                            |
| indirect name           | `const T = "games"; s.from(T).select("*");` is reported `indirect`                                                                                         | silent bypass                                                            | `Array.from(rows)` in the same file is not reported; a `.from(T)` in a file with no `games` literal is not reported | a heuristic that false-positives on `preferenceStats.ts`-style tables (`game_played` does not contain the `"games"` literal) |
| real repo               | `npm run lint:reads` on the repo still reports 2 reads, exit 0                                                                                             | a false positive introduced on production code                           | `games.ts:83` `.insert(...).select()` stays a write                                                                 | —                                                                                                                            |

Group the fixtures into one tree with one file per case, run a single spawn, and assert per-file
lines, except the known-good cases, which share a second spawn.

### Success Criteria:

#### Automated Verification:

- Guard self-tests pass: `npx vitest run --project unit scripts/`
- Real repo still clean: `npm run lint:reads`
- Full unit suite passes: `npm test`
- Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual Verification:

- Deliberate break: bypassing the comment blanker turns both comment tests red
- Deliberate break: reverting `TABLE_RE` turns the `as const` test red

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Contrast guard coverage

### Overview

Make the contrast guard fail when its hand-kept lists drift from the source: registered themes,
gradient-text sites, and an empty assertion run. Pin that, and pin one real contrast violation,
against a copy of the real stylesheet.

### Changes Required:

#### 1. Theme registry coverage

**File**: `scripts/check-contrast.mjs`

**Intent**: A theme added to the app cannot escape the contrast check.

**Contract**:

- Each `THEMES` entry gains a `key` matching `src/lib/theme.ts` (`felt` → `:root`, `shelf`,
  `punchboard`).
- The guard reads `<root>/src/lib/theme.ts` and extracts the string array from
  `export const THEMES = [ … ] as const`. If the pattern is not found, it exits 1, naming the
  file.
- It pushes a failure for every registered key with no entry (message: "theme `<key>` is
  registered in src/lib/theme.ts but has no contrast entry") and for every entry key not
  registered.

#### 2. Gradient-text site count

**File**: `scripts/check-contrast.mjs`

**Intent**: A new `bg-clip-text` heading cannot ship unchecked.

**Contract**:

- The guard counts `bg-clip-text` occurrences across `<root>/src` (the same extension set as the
  colour guard).
- A count that differs from `GRADIENT_TEXT.length` is a failure naming both numbers and
  pointing at the list.

#### 3. Zero-assertion floor

**File**: `scripts/check-contrast.mjs`

**Intent**: A run that asserted nothing fails.

**Contract**: `checks === 0` exits 1. This is defensive: no fixture can reach it while the lists
are non-empty, so it is not separately tested. State that in a comment.

#### 4. Contrast self-tests

**File**: `scripts/check-contrast.test.ts` (new)

**Intent**: Prove coverage drift and a real contrast failure are caught, using the real
stylesheet as the known-good baseline.

**Contract**: each test builds a tree containing a copy of the real `src/styles/global.css` and
`src/lib/theme.ts`, plus one `bg-clip-text` file, and then applies one mutation.

| Test                  | Behaviour asserted                                                                                                                                                                        | Regression caught                     | Edge/boundary                                                                                                                                                                                                                                                                      | Anti-pattern avoided                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| baseline              | the unmutated copy passes with a non-zero assertion count                                                                                                                                 | a false positive on the real design   | —                                                                                                                                                                                                                                                                                  | a hand-written miniature CSS that is not the real design                  |
| unregistered theme    | adding `"neon"` to the copied `THEMES` array, with a `.theme-neon` block, fails naming `neon`                                                                                             | fourth-theme drift (research Guard 3) | removing `"shelf"` from the registry fails as "not registered"                                                                                                                                                                                                                     | —                                                                         |
| gradient drift        | a second `bg-clip-text` file fails naming counts 2 vs 1                                                                                                                                   | a new gradient heading unchecked      | —                                                                                                                                                                                                                                                                                  | —                                                                         |
| real contrast failure | setting `--foreground` in the `.theme-shelf` block of the copy to that block's own `--background` value fails, with a message naming `Bright Shelf · ground`, `--foreground` and `1.00:1` | the matrix logic broken               | the independent oracle is WCAG: identical colours are 1:1. It must be `--background`, not `--card`: on the card surface the `.bg-card` rule re-points `--foreground` to `--card-foreground` (`global.css:287`), so a `--card`-valued foreground is never compared against `--card` | a mutation to a value the test computes with the guard's own `contrast()` |
| registry unparseable  | a `theme.ts` without the `THEMES` array fails naming the file                                                                                                                             | a silent skip when the registry moves | —                                                                                                                                                                                                                                                                                  | —                                                                         |

Four mutated trees plus the baseline come to 5 spawns. If the budget is tight, batching is not
possible here, because each mutation must be isolated to prove its own message.

### Success Criteria:

#### Automated Verification:

- Guard self-tests pass: `npx vitest run --project unit scripts/`
- Real repo still clean: `npm run lint:contrast` (87 assertions, 3 themes)
- Full unit suite passes: `npm test`
- Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual Verification:

- Deliberate break: removing registry coverage turns "unregistered theme" red
- Deliberate break: removing the gradient count turns "gradient drift" red

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Gate wiring assertions

### Overview

A test that fails when any gate is disconnected from where it runs: CI jobs, `package.json`
scripts, the commit hook, and the agent-turn hook.

### Changes Required:

#### 1. Wiring test

**File**: `scripts/gate-wiring.test.ts` (new)

**Intent**: "The gate exists, therefore it runs" becomes an asserted fact rather than an
assumption.

**Contract**:

| Test                   | Behaviour asserted                                                                                                                                                                                                                                 | Regression caught                                     | Edge/boundary                                                                           | Anti-pattern avoided                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CI `ci` job            | inside the `ci:` job block of `ci.yml`, each of these appears as a `run:` line: `npm ci`, `npx astro sync`, `npm run typecheck`, `npm run lint`, `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads`, `npm run build`, `npm test` | a step deleted, or moved to the wrong job             | the workflow triggers on `pull_request`; a commented-out `# - run:` line does not count | a match anywhere in the file                                     |
| CI `db-tests` job      | its block carries `npx supabase start` and `npm run test:db`                                                                                                                                                                                       | the RLS suite dropped from CI                         | —                                                                                       | —                                                                |
| package.json scripts   | the parsed `scripts` contain `prepare` equal to `husky`, `typecheck`, `lint`, `lint:colors`, `lint:contrast` and `lint:reads` pointing at their script files, `test` running `--project unit` without `--passWithNoTests`, and `test:db`           | a gate script deleted or neutered                     | each `lint:*` script file exists on disk                                                | —                                                                |
| lint-staged            | importing `lint-staged.config.js` and calling the `*.{ts,tsx,astro}` function with `["a.ts"]` yields commands containing `eslint --fix`, `npm run typecheck` and `npm test`                                                                        | the commit gate reduced to lint-only                  | the returned `eslint` command includes the staged file                                  | a text grep over the config source                               |
| husky hook             | `.husky/pre-commit` invokes `lint-staged`; its git index mode is `100755`                                                                                                                                                                          | the hook removed or not executable                    | —                                                                                       | —                                                                |
| Stop hook registration | the parsed `.claude/settings.json` has a `Stop` hook whose command ends in `.claude/hooks/quality-gate.sh`, and that file exists                                                                                                                   | registration dropped or path renamed                  | —                                                                                       | —                                                                |
| Stop hook health       | git index mode `100755`; `bash -n` exits 0; with stdin `{"stop_hook_active":true}`, `CLAUDE_PROJECT_DIR` set to a fresh temp dir and `GIT_DIR` set to a nonexistent path inside it, it exits 0; with stdin `{}` and the same env, it exits 2       | exec bit lost, syntax error, or the loop guard broken | the second case proves the first exit 0 came from the guard, not from a clean tree      | running the hook against the real project (recursive `npm test`) |

**Job-block rule for `ci.yml`.** After the `jobs:` line, a job key is a line matching
`/^  [a-z][\w-]*:\s*$/`. A job's block runs from its key to the next such line or end of file.
Lines whose first non-space character is `#` are ignored, both as keys and as steps. This matters
because `ci.yml:31-33` carries two-space-indented comments between `ci:` and `db-tests:`, and `on:`
has two-space keys (`push:`, `pull_request:`) that sit before `jobs:`.

Git modes come from `git ls-files -s <path>`, so they reflect the committed index, which is
what CI checks out. That makes one spawn for all paths. The hook contributes 3 spawns.

### Success Criteria:

#### Automated Verification:

- Wiring test passes: `npx vitest run --project unit scripts/gate-wiring.test.ts`
- Full unit suite passes: `npm test`
- Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual Verification:

- `npm test` under 1.5 s slower than the Phase 1 baseline (median of 3 × `/usr/bin/time -f %e npm test`)
- Deliberate break: deleting the `lint:reads` step from `ci.yml` turns the CI test red
- Deliberate break: moving that step into `db-tests` still turns it red
- Deliberate break: clearing the hook's exec bit turns the hook-health test red (`git update-index --chmod=-x`, then restore with `--chmod=+x`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Test-plan and project docs

### Overview

Record the patterns shipped, update the stale rows, and close the rollout phase.

### Changes Required:

#### 1. Cookbook §6.8

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.8 TBD with how to prove a guard can fail.

**Contract**: §6.8 "Proving a guard can fail" covers:

- `--root` and never an env var;
- the `guardHarness.ts` helpers;
- the fixture location, in a temp dir, never under `src/`;
- asserting the rule name and file, not only the exit status;
- a known-good baseline plus an empty-scan case;
- oracles from Tailwind, the app registry or the real stylesheet;
- one spawn per tree and the ~1.5 s budget;
- the deliberate-break step;
- how to add a new guard to `gate-wiring.test.ts`.

#### 2. Stale stack, gate and status rows

**File**: `context/foundation/test-plan.md`

**Intent**: Keep §3, §4, §5 and §7 true.

**Contract**:

- §3 Phase 6 Status is `complete`, with the change folder path.
- §4 "bespoke deterministic gates": replace "None of the three has a self-test…" with what now
  exists.
- §4 "existing suite": update the file and test counts.
- §5 "guard self-tests": Required becomes "required (wired <date>)".
- §6.7: add a Phase 6 note naming the production guard defects fixed.
- §7: add "Lint coverage for `.sh` and lint-staged `.js`/`.mjs` (impl-review F3)", with its
  re-evaluation trigger (a hook-script or `.mjs` defect reaching `main` that `eslint .` or the
  wiring test did not catch).

#### 3. Project rules

**File**: `CLAUDE.md`

**Intent**: Future agents know the guards are self-tested and how to extend them.

**Contract**: under the Gates list, add one sentence: guard self-tests and the wiring test live in
`scripts/*.test.ts` and run in `npm test`; adding a guard means adding its self-test and its
entry in `scripts/gate-wiring.test.ts` (see test-plan §6.8).

### Success Criteria:

#### Automated Verification:

- Formatting holds: `npx prettier --check context/foundation/test-plan.md CLAUDE.md`
- Full gate set green: `npm run typecheck && npm run lint && npm run lint:colors && npm run lint:contrast && npm run lint:reads && npm test`

#### Manual Verification:

- A fresh agent session finds §6.8 and `gate-wiring.test.ts` when asked how to add a guard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Spawn-based self-tests per guard, run against temp fixture trees, in `scripts/*.test.ts`.
- Expected sets come from Tailwind's `theme.css` and design system, `src/lib/theme.ts`, the
  real `global.css`, and hand-written violating snippets.
- Every guard has a known-good baseline, known-bad cases asserting the rule and file in the
  output, and an empty or unparseable case whose failure message is distinguishable.

### Integration Tests:

- `scripts/gate-wiring.test.ts` over `ci.yml`, `package.json`, `lint-staged.config.js`,
  `.husky/pre-commit`, `.claude/settings.json` and the hook script's mode, syntax and loop guard.

### Manual Testing Steps:

1. Per phase, the deliberate-break rows: remove the fix or wiring, watch the named test go red
   with the expected message, and restore it.
2. Before Phase 1 and after Phase 5, record `npm test` wall time as the median of 3 runs of
   `/usr/bin/time -f %e npm test`.
3. After Phase 6, the fresh-session check on §6.8.

## Performance Considerations

About 20 node spawns at ~70 ms each. `npm test` runs in CI, in the commit hook and in the Stop
hook, so the added wall time is capped at 1.5 s and measured. The design-system load in the
Phase 2 roots test is in-process and runs once per file.

## Migration Notes

None. The guards keep their current CLI and default behaviour; `--root` is opt-in. After Phase 2
the real repo must still report zero colour literals, and Research already confirmed the widened
palette and prefix list produce no hits in `src/`.

## References

- Research: `context/changes/testing-guard-self-verification/research.md`
- Test plan §2 Risk #10 and its guidance (amended 2026-09-14), §3 Phase 6, §6.8
- Prior research: `context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md` (Risk E)
- Impl-review F3: `context/archive/2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md`
- Guard patterns: `scripts/check-games-read-guard.mjs:23-27` (fail-closed reporting), `.claude/hooks/quality-gate.sh:26-36` (fail-closed hook guards)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Guard harness and empty-scan floors

#### Automated

- [x] 1.1 Guard self-tests pass: `npx vitest run --project unit scripts/` — 1e69ade
- [x] 1.2 Full unit suite passes: `npm test` — 1e69ade
- [x] 1.3 Real repo still clean: `npm run lint:colors && npm run lint:reads && npm run lint:contrast` — 1e69ade
- [x] 1.4 Typecheck passes: `npm run typecheck` — 1e69ade
- [x] 1.5 Lint passes: `npm run lint` — 1e69ade

#### Manual

- [ ] 1.6 Deliberate break: removing the colour floor turns the empty-tree test red
- [ ] 1.7 Deliberate break: removing the games reads floor turns the write-only test red
- [ ] 1.8 `npm test` wall time before and after recorded

### Phase 2: Colour guard tracks the installed Tailwind

#### Automated

- [x] 2.1 Guard self-tests pass: `npx vitest run --project unit scripts/`
- [x] 2.2 Real repo still clean: `npm run lint:colors`
- [x] 2.3 Full unit suite passes: `npm test`
- [x] 2.4 Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual

- [ ] 2.5 Deliberate break: filtering `mauve` out turns "every family" red
- [ ] 2.6 Deliberate break: removing `border-s` turns "every colour root" and the sentinel red
- [ ] 2.7 Real-repo `lint:colors` file count unchanged

### Phase 3: Games-read guard bypasses

#### Automated

- [x] 3.1 Guard self-tests pass: `npx vitest run --project unit scripts/`
- [x] 3.2 Real repo still clean: `npm run lint:reads`
- [x] 3.3 Full unit suite passes: `npm test`
- [x] 3.4 Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual

- [ ] 3.5 Deliberate break: bypassing the comment blanker turns both comment tests red
- [ ] 3.6 Deliberate break: reverting `TABLE_RE` turns the `as const` test red

### Phase 4: Contrast guard coverage

#### Automated

- [x] 4.1 Guard self-tests pass: `npx vitest run --project unit scripts/`
- [x] 4.2 Real repo still clean: `npm run lint:contrast` (87 assertions, 3 themes)
- [x] 4.3 Full unit suite passes: `npm test`
- [x] 4.4 Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual

- [ ] 4.5 Deliberate break: removing registry coverage turns "unregistered theme" red
- [ ] 4.6 Deliberate break: removing the gradient count turns "gradient drift" red

### Phase 5: Gate wiring assertions

#### Automated

- [x] 5.1 Wiring test passes: `npx vitest run --project unit scripts/gate-wiring.test.ts`
- [x] 5.2 Full unit suite passes: `npm test`
- [x] 5.3 Typecheck and lint pass: `npm run typecheck && npm run lint`

#### Manual

- [ ] 5.4 `npm test` under 1.5 s slower than the Phase 1 baseline (median of 3 × `/usr/bin/time -f %e npm test`)
- [ ] 5.5 Deliberate break: deleting the `lint:reads` step from `ci.yml` turns the CI test red
- [ ] 5.6 Deliberate break: moving that step into `db-tests` still turns it red
- [ ] 5.7 Deliberate break: clearing the hook's exec bit turns the hook-health test red (`git update-index --chmod=-x`, then restore with `--chmod=+x`)

### Phase 6: Test-plan and project docs

#### Automated

- [x] 6.1 Formatting holds: `npx prettier --check context/foundation/test-plan.md CLAUDE.md`
- [x] 6.2 Full gate set green: `npm run typecheck && npm run lint && npm run lint:colors && npm run lint:contrast && npm run lint:reads && npm test`

#### Manual

- [ ] 6.3 A fresh agent session finds §6.8 and `gate-wiring.test.ts` when asked how to add a guard
