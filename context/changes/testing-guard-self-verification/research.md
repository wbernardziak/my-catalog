---
date: 2026-09-14T14:49:14+02:00
researcher: Claude (Opus 5) for Wojciech Bernardziak
git_commit: a11937ee5219efb4a3a7dbcc84fff8f7e75aef88
branch: main
repository: wbernardziak/my-catalog
topic: "Ground test-plan rollout Phase 6 — guard self-verification (Risk #10)"
tags: [research, test-plan, quality-gates, guards, lint-colors, lint-contrast, lint-reads, ci, stop-hook]
status: complete
last_updated: 2026-09-14
last_updated_by: Claude (Opus 5)
---

# Research: Ground rollout Phase 6 — guard self-verification (Risk #10)

**Date**: 2026-09-14T14:49:14+02:00
**Researcher**: Claude (Opus 5) for Wojciech Bernardziak
**Git Commit**: a11937ee5219efb4a3a7dbcc84fff8f7e75aef88
**Branch**: main
**Repository**: wbernardziak/my-catalog

Permalink base for every `path:line` below:
`https://github.com/wbernardziak/my-catalog/blob/a11937ee5219efb4a3a7dbcc84fff8f7e75aef88/<path>#L<line>`

## Research Question

Ground rollout Phase 6 of `context/foundation/test-plan.md` (Risk #10: a quality gate or
guard reports green while checking nothing, or while missing a real violation). Verify,
not accept, the §2 Risk Response Guidance:

- _Prove_: each guard exits non-zero on a known-bad fixture and on an empty or zero-match
  scan; the colour guard's palette tracks the installed Tailwind; removing a gate step
  from CI or a guard script from `package.json` fails `npm test`; the Stop-hook script
  parses (`bash -n`).
- _Challenge_: "the gate exists, therefore it runs"; "exit 0 means clean"; "`.mjs` is
  unlinted".
- _Avoid_: widening lint globs or adding shellcheck without a deliberate-break check;
  fixtures that fail for the wrong reason.
- _Ground_: each guard's scan root, file floor and hardcoded lists; how a fixture root can
  be injected; which gate steps the workflow and `package.json` must carry.

Hot-spot evidence that raised the risk (likelihood, not anchors): `scripts` (2/30d),
`.github/workflows` (4/30d).

## Summary

The refresh research (`context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md:349-418`,
at `c1f9a83`) holds at `a11937e`: no commit since touched `scripts/`, `.github/`,
`.claude/`, `.husky/`, `lint-staged.config.js`, `package.json` or `vitest.config.ts`.
Every claim below was **re-probed today** against scratch copies of the guards.

1. **Two guards pass vacuously on an empty tree — confirmed.** `lint:colors` prints
   "No colour literals in 0 files." and `lint:reads` prints "All 0 `games` read(s) across 0
   files", both exit 0. `lint:contrast` is **not** vacuous in the same way: every missing
   block, surface, or token already pushes a failure. Its gap is a different one (item 4).
2. **The colour guard has real holes today — confirmed and wider than first recorded.**
   - Palette: the installed tailwindcss 4.2.4 defines `mauve`, `mist`, `olive`, and `taupe`,
     and `PALETTE` lists none of them. `bg-mauve-500`, `text-olive-700`, `bg-mist-100`,
     `border-taupe-200` and `hover:bg-mauve-500` all exit 0.
   - Prefix: Tailwind's design system has colour roots `border-s`, `border-e`, `border-bs` and
     `border-be`. `border-s-red-500`, `border-e-red-500` and `border-bs-red-500` all exit 0.
   - The other v4-only roots (`inset-shadow`, `text-shadow`, `drop-shadow`, `inset-ring`,
     `mask-*-from/to`) are caught **by accident**: `\b` matches after the hyphen, so the
     inner `shadow`, `ring` or `from` prefix matches.
   - Widening palette and prefix produces **zero** hits in today's `src/`, so the fix breaks
     nothing.
3. **The games-read guard can be fooled — confirmed, with one correction.**
   - A comment inside the chain counts: `.select("*") /* no .is("deleted_at", null) */;`
     passes.
   - `.from("games" as const)` and `.from(T)` are invisible, so the fail-closed "unrecognised"
     branch is never reached.
   - **Correction:** a trailing `// TODO .update( later` placed _after_ the `;` does **not**
     fool it. The chain stops at the first `;` (`scripts/check-games-read-guard.mjs:78-82`).
     The comment has to sit inside the statement.
   - A `;` inside a string (`.select(\`id; notes\`)`) cuts the chain early. That fails
     closed as a false positive, not open.
4. **The contrast guard's gap is list drift, not an empty scan.**
   - `THEMES` (`scripts/check-contrast.mjs:36-40`) is hand-kept apart from `src/lib/theme.ts:10`
     (`["felt", "shelf", "punchboard"]`). A fourth theme with its own `.theme-x` block is
     never checked.
   - `GRADIENT_TEXT` (`:96-104`) is hand-kept against the `bg-clip-text` sites. There is one
     today: `src/components/PageTitle.astro:14`.
   - The only fully vacuous path is `THEMES = []`, which gives "Contrast OK: 0 assertions".
5. **Nothing detects a removed gate — confirmed.** No test reads `.github/workflows/ci.yml`,
   `package.json` scripts, `.husky/pre-commit`, `.claude/settings.json` or
   `lint-staged.config.js`.
6. **Fixture injection needs no production change, with one caveat.** All three guards
   resolve their root from `import.meta.url`:
   - `check-color-literals.mjs:23` and `check-games-read-guard.mjs:45` use `new URL("..", …)`.
   - `check-contrast.mjs:33` uses `../src/styles/global.css`.

   Copying the script into `<tmp>/scripts/` and building `<tmp>/src/` was verified to work.
   The caveat: a guard that derives its palette from `node_modules/tailwindcss` would stop
   resolving from a temp copy. An explicit root override (an env var or argv) survives
   that. Copying does not.

7. **Cost is negligible.** One guard spawn takes about 70 ms (5 spawns in 0.35 s). The unit
   suite takes 2.8 s wall. `npm test` also runs in the commit hook and the Stop hook, so
   ~15 spawns (≈1 s) is the practical budget.

**Verdict on the response guidance:** mostly correct, with three adjustments.

- **Keep:** a known-bad fixture per guard, empty-scan floors, the palette tracking Tailwind,
  and the wiring assertion.
- **Adjust:** the "empty or zero-match scan" clause applies to `lint:colors` and `lint:reads`.
  For `lint:contrast`, the equivalent is "the theme list tracks `src/lib/theme.ts`".
- **Add:** the prefix hole (`border-s/e/bs/be`) sits beside the palette hole. "Palette tracks
  Tailwind" alone would leave it open.
- **Downgrade:** `bash -n` on the Stop hook is cheap but low-signal. It parses today, and a
  wrong settings path or a lost exec bit are the likelier breaks. A wiring assertion over
  `.claude/settings.json` and the tracked `100755` mode catches more for the same cost.
  Keep `bash -n` as the syntax layer only.

## Detailed Findings

### Guard 1 — `scripts/check-color-literals.mjs` (`lint:colors`)

- **Root:** `ROOT` is `new URL("..", import.meta.url)` (`:23`); it scans `src/` recursively (`:75`).
- **Extensions:** `.astro .tsx .ts .jsx .js .css` (`:25`). It skips `.mts`, `.mjs`, `.mdx`, `.svg`,
  `.html` and all of `public/`.
- **Exempt:** `src/styles/global.css` and `src/components/BrandMark.astro` (`:27`).
- **Hardcoded lists:** `PALETTE` (`:29-54`, 24 families plus white and black) and `PREFIX` (`:56-57`).
- **Rules:**
  - Tailwind utility regex (`:63`).
  - Raw literal `#hex`, `rgb(a)`, `hsl(a)`, `oklch`, `oklab`, `color-mix` (`:67`).
  - Inline-style colour property (`:71`).
- **Output and exit:** it exits 1 on any hit (`:97-104`). Otherwise it logs a file count (`:106`),
  with **no floor**.
- **Today:** "No colour literals in 78 files.", exit 0.

**Probes** (scratch copy, fixture in `src/lib/x.tsx`):

| Fixture                                         | Exit              | Expected |
| ----------------------------------------------- | ----------------- | -------- |
| `bg-red-500`                                    | 1                 | 1        |
| `bg-mauve-500`, `text-olive-700`, `bg-mist-100` | 0                 | **1**    |
| `border-taupe-200`, `hover:bg-mauve-500`        | 0                 | **1**    |
| `border-s-red-500`, `border-e-red-500`          | 0                 | **1**    |
| `border-bs-red-500`                             | 0                 | **1**    |
| `inset-shadow-red-500`, `text-shadow-red-500`   | 1                 | 1        |
| `drop-shadow-red-500`, `inset-ring-red-500`     | 1                 | 1        |
| `mask-b-from-red-500`                           | 1                 | 1        |
| empty `src/`                                    | 0                 | **1**    |
| missing `src/`                                  | throws (non-zero) | 1        |

**Where the truth lives.**

- **Palette:** read the families from
  `node_modules/tailwindcss/theme.css` by matching `--color-<family>-500:` declarations. There
  are 26 families today; `--color-black` and `--color-white` are at `:322-323`.
- **Prefix set:** tailwindcss exports `__unstable__loadDesignSystem`. Its `getClassList()`
  yields these colour roots for `red-500`:
  `accent bg border border-b border-be border-bs border-e border-l border-r border-s border-t border-x border-y caret decoration divide drop-shadow fill from inset-ring inset-shadow mask-*-from mask-*-to outline placeholder ring ring-offset shadow stroke text text-shadow to via`.
  The API is marked unstable, so it is a probe, not a runtime dependency.

**Two viable designs for "palette tracks Tailwind"** (a decision for `/10x-plan`):

- **(a) Derive at runtime.** The guard reads `theme.css`, so it self-heals on a Tailwind bump,
  but it needs `node_modules` resolvable. That holds in CI, since `npm ci` runs first
  (`.github/workflows/ci.yml:18`). A guard copied to a temp dir cannot resolve it, which is
  why an explicit root override is needed.
- **(b) Keep the hardcoded list and add a drift test.** The guard stays trivial, and a unit
  test compares `PALETTE` with `theme.css` families. A bump then fails `npm test` loudly
  instead of self-healing. This needs the lists exported or parsed, and the guard runs
  top-level with `process.exit`, so it cannot be imported as-is.

**Oracle for fixtures:** Tailwind's own `theme.css` and the design-system class list, both
independent of the guard's source. Taking the expected palette from `PALETTE` itself would be
the oracle problem.

### Guard 2 — `scripts/check-games-read-guard.mjs` (`lint:reads`)

- **Root:** `ROOT` at `:45`, same idiom as guard 1. It scans `src/`, extensions
  `.astro .tsx .ts .jsx .js` (`:47`).
- **Exempt:** prefix `src/test/` (`:53-57`).
- **Match:** `TABLE_RE` `/\.from\(\s*(["'`])games\1\s\*\)/g` (`:65`).
- **Chain:** text from the match to the first `;` or 1200 chars (`:70`, `:78-82`).
- **Classification** (`:104-122`):
  - Write verb first, then `.select(`, which requires `PREDICATE` (`:66`).
  - Anything else is "unrecognised" and **reported**.
- **Output:** no floor (`:156`).
- **Today:** "All 2 `games` read(s) across 69 files", exit 0.
- **The 2 reads:** `src/lib/services/games.ts:31` and `:65`. The other `.from("games")` sites at
  `:83,113,147,169` are writes.

**Probes** (scratch copy, fixture in `src/lib/q.ts`):

| Fixture                                                           | Exit | Expected | Note                                          |
| ----------------------------------------------------------------- | ---- | -------- | --------------------------------------------- |
| `s.from("games").select("*");`                                    | 1    | 1        | unguarded                                     |
| `…select("*").is("deleted_at", null);`                            | 0    | 0        | known-good                                    |
| `let q = s.from("games"); q = q.select("*");`                     | 1    | 1        | unrecognised, fails closed                    |
| write then separate unguarded read                                | 1    | 1        | per-statement classification works            |
| `select("*"); // TODO .update( later`                             | 1    | 1        | comment after `;` is outside the chain        |
| `select("*") /* no .is("deleted_at", null) */;`                   | 0    | **1**    | comment inside chain fakes the guard          |
| `…is("deleted_at", null)` then `// .insert( elsewhere` before `;` | 0    | 0        | right answer, wrong reason (classed as write) |
| `s.from("games" as const).select("*");`                           | 0    | **1**    | invisible to `TABLE_RE`                       |
| `const T = "games"; s.from(T).select("*");`                       | 0    | **1**    | invisible to `TABLE_RE`                       |
| ``select(`id; notes`)`` with no predicate                         | 1    | 1        | `;` in string cuts chain — fails closed       |
| empty `src/`                                                      | 0    | **1**    | vacuous                                       |

**A floor needs a stated oracle.** "At least 2 reads" is today's count taken from the code, a
mild mirror. The independent statement is `test-plan.md` Risk #6 and the guard's own header
(`:5-7`): `listGames` and `listGenres` are the two catalog read paths. A lower floor of
"≥ 1 file scanned and ≥ 1 read classified" is enough to catch the vacuous case without
freezing the count.

**Comment stripping** would close the `/* */` hole. It needs care not to strip `//` inside
string literals, such as URLs. Both `.from("games" as const)` and `.from(T)` are out of reach
for a regex. An honest fix widens `TABLE_RE` to tolerate `as const`. For an identifier
argument, the choice is to report it (fail closed) or to record it as a known limit.

### Guard 3 — `scripts/check-contrast.mjs` (`lint:contrast`)

- **Input:** `CSS_PATH` at `:33`, one file: `src/styles/global.css`.
- **Hand lists:**
  - `THEMES` (`:36-40`)
  - `CARD_CONTEXT_SELECTOR` (`:43`)
  - `SURFACES` (`:49-53`)
  - `INK_ROLES` (`:56-63`)
  - `PAIRS` (`:69-79`)
  - `GRADIENT_TEXT` (`:96-104`)
- **Fails closed on:**
  - a missing card rule (`:155-160`)
  - a missing theme block (`:168-170`)
  - a missing surface token (`:182-184`)
  - a missing ink role (`:189-191`)
  - a missing pair token (`:208-210`)
  - a missing gradient token (`:223-226`, `:230-233`)
- **Today:** "Contrast OK: 87 assertions across 3 themes."
- **Gaps:**
  - `THEMES` drifts from `src/lib/theme.ts:10`. The CSS carries `:root` (`global.css:22`),
    `.theme-shelf` (`:116`) and `.theme-punchboard` (`:189`). A fourth `.theme-x` block
    added to the CSS and to `theme.ts` is silently unchecked.
    - **Oracle:** `theme.ts` `THEMES`, which drives the real class names (`theme.ts:23`
      builds `theme-${theme}`). `felt` maps to `:root`, the one special case.
  - `GRADIENT_TEXT` drifts from `bg-clip-text` occurrences in `src/`. There is exactly one
    today (`PageTitle.astro:14`), as the guard's own comment (`:92-94`) says.
  - `blockFor` (`:107-117`) takes the first `${selector} {` match. `.theme-punchboard :is(`
    at `global.css:306,314` does not collide, because the space-plus-`{` form is required.
  - No `checks > 0` assertion (`:246-255`). This matters only if the hand lists are emptied.

### Wiring — what must stay present

| Surface                         | Must carry                                                                                                                                                         | Where today                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `package.json` scripts          | `prepare: husky`, `typecheck`, `lint`, `lint:colors`, `lint:contrast`, `lint:reads`, `test` (without `--passWithNoTests`), `test:db`                               | `package.json:5-22`                                               |
| `.github/workflows/ci.yml` `ci` | `npm ci`, `npx astro sync`, `npm run typecheck`, `npm run lint`, `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads`, `npm run build`, `npm test` | `ci.yml:18-30`                                                    |
| `ci.yml` `db-tests`             | `npx supabase start …`, `npm run test:db`                                                                                                                          | `ci.yml:48-49`                                                    |
| `.husky/pre-commit`             | `npx lint-staged --hide-unstaged`                                                                                                                                  | `.husky/pre-commit:1`                                             |
| `lint-staged.config.js`         | the `*.{ts,tsx,astro}` entry returning `eslint --fix …`, `npm run typecheck`, `npm test`                                                                           | `lint-staged.config.js:18-25`                                     |
| `.claude/settings.json`         | a `Stop` hook with command `${CLAUDE_PROJECT_DIR}/.claude/hooks/quality-gate.sh`                                                                                   | `.claude/settings.json`                                           |
| hook file                       | tracked mode `100755`; `bash -n` passes (verified today, exit 0)                                                                                                   | `git ls-files -s` → `100755` for the hook and `.husky/pre-commit` |

**Parsing `ci.yml`.**

- `yaml@2.8.4` is installed only **transitively**, through `@astrojs/check` →
  `@astrojs/language-server` → `@astrojs/yaml2ts`. Importing a transitive package is fragile.
- A line-level text assertion over `- run: npm run lint:reads` is dependency-free.
  It is also robust enough, because the workflow is hand-written.
- The honest weakness of text matching: a step moved into a job that never runs, or a job
  marked `if: false`, would still match. Record it as a known limit, or scope the match to
  the `ci:` job block.

**`lint-staged.config.js` is an ES module** that exports a function entry, so a test can import
it and call the `*.{ts,tsx,astro}` function with a fake file list. It then asserts the three
commands, which is behaviour rather than text.

### Stop hook — `.claude/hooks/quality-gate.sh`

- It fails closed on:
  - malformed hook input (`:26-28`)
  - a bad project dir (`:33-36`)
  - a `git status` error (`:52-55`)
- It exits 0 when no `*.ts`, `*.tsx` or `*.astro` path changed (`:56-58`).
- It runs only `typecheck` and `npm test` (`:60-68`). It never runs `lint` or `lint:*`.
  That is by design, per §6.6, and not a Phase 6 target.
- `bash -n` passes today. The script's only behaviour that a unit test could drive
  offline is the stdin guard. It exits 0 when `stop_hook_active` is `true`: pipe
  `{"stop_hook_active":true}` in and assert exit 0 with no command run.
  - **This is a behavioural check, not just a syntax check, and it costs one spawn.**
  - Driving the dirty-tree branch would run the whole suite recursively inside `npm test`.
    **Do not.**

### Lint coverage — the "`.mjs` is unlinted" premise

Still false, as the plan already records. `eslint.config.js` includes a `scripts/**/*.mjs`
block with `disableTypeChecked` and node globals, and it is spread into the exported config.
CI runs `eslint .`. `tsconfig.json` includes `**/*`, so a `*.test.ts` placed anywhere,
including beside the scripts, is type-checked and linted with type-aware rules.
Impl-review F3 (widening lint-staged globs, shellcheck) is still PENDING. By the plan's own
anti-pattern it is **not** a Phase 6 target unless it comes with a deliberate-break check.

### Test placement and harness

- **No existing test spawns a process.** No file in `src/` or `scripts/` uses
  `child_process`, `execFile` or `spawnSync`. Phase 6 introduces the first spawn-based test,
  so it sets the pattern.
- **Where a test could live.** The `unit` project uses Vitest's default include and
  excludes only `src/test/db/**` (`vitest.config.ts`). Either location is collected by
  `npm test` with no config change:
  - `scripts/*.test.ts`, which sits beside the guards;
  - under `src/test/`, a folder already exempt from `lint:reads` (`check-games-read-guard.mjs:53-57`).
- **Fixture content is itself scanned.** A fixture written as a `.ts` file under `src/` would
  trip `lint:colors` and `lint:reads` in the real repo. Fixtures must be generated into an OS
  temp dir at test time, or held as strings, never committed under `src/`. A test file under
  `src/` that contains `bg-mauve-500` as a string literal trips `lint:colors` once the guard is
  fixed. That argues for placing guard tests under `scripts/`, outside the scanned root, or
  for building the literal from parts.
- **Right failure reason.** Each known-bad fixture should assert the guard's **output names the
  rule and the fixture file** (`[tailwind-colour-utility]`, `unguarded` or `unrecognised`), not
  only a non-zero exit. A missing `src/` also exits non-zero, via an `ENOENT` throw. That is the
  "fails for the wrong reason" trap the plan names.

## Code References

- `scripts/check-color-literals.mjs:23` — `ROOT` from `import.meta.url` (fixture seam)
- `scripts/check-color-literals.mjs:25-27` — extensions and exemptions
- `scripts/check-color-literals.mjs:29-57` — hardcoded `PALETTE` and `PREFIX` (stale)
- `scripts/check-color-literals.mjs:63` — utility regex; `\b` after hyphen explains accidental v4 coverage
- `scripts/check-color-literals.mjs:106` — success path with no file floor
- `scripts/check-games-read-guard.mjs:45,47,53-57` — root, extensions, exempt prefix
- `scripts/check-games-read-guard.mjs:65-70` — `TABLE_RE`, `PREDICATE`, write verbs, window
- `scripts/check-games-read-guard.mjs:78-82` — chain ends at first `;`
- `scripts/check-games-read-guard.mjs:104-122` — raw substring classification (comment-foolable)
- `scripts/check-games-read-guard.mjs:156` — success path with no floor
- `scripts/check-contrast.mjs:33,36-40,96-104` — CSS path, hand-kept theme and gradient lists
- `scripts/check-contrast.mjs:155-243` — fail-closed branches
- `scripts/check-contrast.mjs:246-255` — no `checks > 0` assertion
- `src/lib/theme.ts:10,23` — `THEMES` source of truth and `theme-${theme}` class mapping
- `src/styles/global.css:22,116,189,285` — theme blocks and card rule
- `src/components/PageTitle.astro:14` — the sole `bg-clip-text` site
- `src/lib/services/games.ts:31,65` — the two guarded reads
- `.github/workflows/ci.yml:18-30,48-49` — gate steps
- `package.json:5-22` — scripts, including `prepare: husky`
- `lint-staged.config.js:18-25` — function entry (importable)
- `.husky/pre-commit:1` — `npx lint-staged --hide-unstaged`
- `.claude/settings.json` — Stop hook registration
- `.claude/hooks/quality-gate.sh:26-28` — `stop_hook_active` guard (offline-drivable)
- `node_modules/tailwindcss/theme.css:322-323` and `--color-<family>-<shade>` — palette oracle (tailwindcss 4.2.4)
- `vitest.config.ts` — `unit` project collects any `*.test.ts` outside `src/test/db/**`

## Architecture Insights

- **The guards are ratchets, deliberately not tests.** A new read path or a new colour is new
  code that no behavioural test calls (`check-games-read-guard.mjs:12-15`). Phase 6 tests the
  ratchets themselves, so its oracles have to come from outside the scripts: Tailwind's
  `theme.css`, `theme.ts`, the Risk #6 wording, and hand-written violating snippets.
- **"Report, don't assume" is already the stated philosophy.** It appears in the games guard's
  unrecognised branch (`:23-27`) and in the Stop hook's fail-closed guards. The vacuous
  empty-scan success lines contradict it, the same asymmetry impl-review F2 found and fixed in
  the hook.
- **All three guards are top-level scripts ending in `process.exit`.** They are testable by
  spawning, not by importing. Extracting the lists into an importable module would enable
  drift tests but change the scripts' shape. Spawning with a root override is the smaller
  change.
- **`npm test` has three runners:** CI, the commit hook, and the Stop hook. Anything added
  there is paid on every agent turn that touches `.ts`. About 70 ms per spawn keeps a
  per-guard self-test well inside budget. A full `vitest` or `npm` subprocess inside a test
  would not.

## Historical Context (from prior changes)

- `context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md:349-418` — first
  grounding of Risk E→#10: the vacuous passes, stale palette, and "nothing detects a removed
  gate". Its proposed cheapest-layer order was floors → derived palette → per-guard
  fixture self-tests with a root override → wiring test → optional `bash -n`.
- `context/archive/2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md` — F1/F2
  (fixed in `39b628d`): the hook's fail-open paths. F3 (PENDING): lint-staged globs and
  shellcheck. F5: a gate leg that was never actually observed running, the precedent for
  "exists ≠ runs".
- `context/archive/2026-09-14-testing-quality-gate-wiring/plan.md:422-442` — deliberate-break
  checks were run on the commit gate and the Stop hook only, never on the three `lint:*`
  guards.
- `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/` — introduced `lint:reads`
  as a source ratchet (§3 Phase 3), and chose the write-first ordering the probes confirm.
- `context/archive/2026-08-01-visual-identity-themes/` — origin of `lint:colors` and
  `lint:contrast`. The Punchboard 1.24:1 failure explains why the contrast guard exists
  (`check-contrast.mjs:5-10`).

## Related Research

- `context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md`
- `context/archive/2026-09-14-testing-quality-gate-wiring/research.md`

## Corrections to the test plan (candidates for backport into §2)

1. **Response guidance, #10 "Prove".** "Exits non-zero on an empty or zero-match scan" fits
   `lint:colors` and `lint:reads` only. For `lint:contrast`, prove instead that its theme list
   tracks `src/lib/theme.ts`.
2. **Response guidance, #10 "Prove".** "Palette tracks the installed Tailwind" misses the
   colour-root prefix hole (`border-s/e/bs/be`). It should read "palette **and colour-utility
   roots** track the installed Tailwind".
3. **Response guidance, #10 cheapest layer.** `bash -n` alone is low-signal. Asserting the
   hook's registration (`.claude/settings.json`), its tracked exec mode, and its
   `stop_hook_active` exit-0 path costs the same and catches the likelier breaks.
4. **No misleading hot-spot evidence.** `scripts` and `.github/workflows` are where the
   defects actually are.

## Open Questions

- **Palette design:** (a) derive at runtime from `theme.css` (self-healing, needs a root
  override for fixture tests) or (b) hardcoded plus a drift test (loud on bump, needs the lists
  importable)? A decision for `/10x-plan`.
- **Floor for `lint:reads`:** "≥ 1 read" (catches vacuous) or "≥ 2 reads" (freezes today's
  count)? The former avoids the implementation mirror.
- **Games guard: strip comments, or document the limit?** Stripping is a production
  change to the guard. The `/* */` hole is real but requires a deliberately misleading
  comment.
- **`ci.yml` check:** plain text match, or scoped to the `ci:` job block? And does it also
  assert `db-tests` runs `npm run test:db`?
- **F3** (lint-staged globs, shellcheck): leave out of Phase 6 explicitly, or close it with a
  deliberate-break check? The plan's anti-pattern column says "not without one".
