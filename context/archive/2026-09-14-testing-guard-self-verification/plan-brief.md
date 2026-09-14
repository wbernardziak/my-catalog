# Guard Self-Verification — Plan Brief

> Full plan: `context/changes/testing-guard-self-verification/plan.md`
> Research: `context/changes/testing-guard-self-verification/research.md`

## What and Why

This is rollout Phase 6 of the test plan (Risk #10): prove that the quality gates can actually
fail. `lint:colors`, `lint:contrast`, `lint:reads` and the CI, commit and agent-turn wiring guard
every other risk, yet none has ever been shown to fail. Research proved two of them pass on an
empty tree, and one misses real Tailwind classes. Removing any gate from CI stays green.

## Starting Point

- **Colour guard:** hardcodes a palette that lags tailwindcss 4.2.4 (`mauve`, `mist`, `olive`,
  `taupe`) and misses the `border-s/e/bs/be` colour utilities.
- **Games-read guard:** can be fooled by a comment, by `as const`, or by an indirected table name.
- **Contrast guard:** keeps its theme list by hand, apart from `src/lib/theme.ts`.
- **Gate wiring:** no test reads `ci.yml`, `package.json` or the hook configuration.

## Desired End State

`npm test` fails when:

- a guard scans nothing;
- a guard misses a known violation;
- a guard's lists drift from Tailwind, the app's theme registry or its `bg-clip-text` sites;
- any gate is disconnected from CI, `package.json`, lint-staged, husky or the Stop hook.

Every fix has been deliberately broken once to watch its test go red. Test-plan §6.8 tells the
next contributor how to do the same for a new guard.

## Key Decisions Made

| Decision          | Choice                                                                                                         | Why                                                       | Source          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------- |
| Palette source    | Derived at runtime from `tailwindcss/theme.css`, fail closed if the file is missing or too small               | A Tailwind bump can never reopen the hole                 | Plan            |
| Utility roots     | Add `border-s/e/bs/be`; the test derives every root from Tailwind's design system                              | The expected set comes from Tailwind, not the guard       | Research + Plan |
| Empty-scan floors | ≥ 1 file (colours); ≥ 1 file and ≥ 1 read (games)                                                              | Catches a vacuous scan without freezing today's counts    | Plan            |
| Games bypasses    | Blank comments, accept `as const`, report `.from(<identifier>)` in files naming `games`                        | Every bypass is caught or reported unrecognised           | Plan            |
| Contrast drift    | Guard asserts registry coverage, the gradient-site count and zero assertions                                   | A new theme fails CI the day it lands                     | Research + Plan |
| Fixture seam      | `--root=<dir>` CLI flag, never an env var                                                                      | A stray env var is itself a vacuous-pass vector           | Plan            |
| Wiring check      | Job-scoped `ci.yml` text match, parsed JSON, imported lint-staged, and hook mode, syntax and loop-guard checks | Catches removed or misplaced steps with no new dependency | Plan            |
| Test location     | `scripts/*.test.ts`, outside the scanned `src/`                                                                | Fixture strings can't trip the real guards                | Plan            |
| Impl-review F3    | Deferred and recorded in §7                                                                                    | No lint-glob widening without a deliberate-break check    | Research        |

## Scope

**In scope:**

- the root override and floors;
- the colour, games and contrast guard fixes, with self-tests;
- the wiring test;
- §6.8 and the §3/§4/§5/§7 docs;
- the `CLAUDE.md` note.

**Out of scope:**

- shellcheck and wider lint-staged globs (F3);
- YAML parsing and `if: false` detection;
- extensions the guards don't scan today;
- driving the hook's dirty-tree branch;
- split-statement chain following.

## Architecture / Approach

Each guard gains an opt-in `--root`. A shared `scripts/guardHarness.ts` writes temp trees and runs
the guard with `spawnSync`, so assertions are made on the exit status and on output naming the
rule and file. Expected sets come from outside the guard. That means Tailwind's `theme.css` and
design system, `src/lib/theme.ts`, a copy of the real `global.css`, or hand-written snippets.
`scripts/gate-wiring.test.ts` reads the config surfaces directly. The Stop hook runs against a
non-git temp dir, so a broken loop guard exits 2 instead of recursing into `npm test`.

## Phases at a Glance

| Phase                     | What it delivers                                                                                        | Key risk                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Harness and floors     | `--root`, `guardHarness.ts`, empty-scan floors, and baseline self-tests for the colour and games guards | Fixtures failing for the wrong reason (missing `src/` vs a real violation) |
| 2. Colour tracks Tailwind | Runtime palette, missing border roots, Tailwind-derived tests                                           | The unstable design-system API changing in an upgrade                      |
| 3. Games bypasses         | Comment blanker (fails closed on lost sync), `as const`, `indirect` report, pinned probes               | The blanker eating `//` inside strings, or losing sync on a regex literal  |
| 4. Contrast coverage      | Registry, gradient and zero-check assertions; mutation tests on the real CSS                            | The `theme.ts` regex breaking on a refactor (fails closed)                 |
| 5. Wiring                 | CI job steps, scripts, lint-staged, husky, Stop hook registration and health                            | The job-block splitter misreading the workflow                             |
| 6. Docs                   | §6.8 cookbook, §3/§4/§5/§6.7/§7 updates, `CLAUDE.md`                                                    | —                                                                          |

**Prerequisites:** a GitHub tracking issue plus per-phase issues and a `feat/testing-guard-self-verification`
branch after plan review (`lessons.md`).
**Estimated effort:** ~2–3 sessions across 6 phases. Phases 2–4 are independent after Phase 1.

## Open Risks and Assumptions

- **About 20 spawns must stay under +1.5 s on `npm test`.** It runs on every commit and on agent
  turns that touch code. The time is measured in Phases 1 and 5.
- **`__unstable__loadDesignSystem` may change.** The roots test then fails loudly, and the
  recovery is a hand-listed fixture, not deletion.
- **The `indirect` rule assumes future table names stay literal.** A legitimate
  `.from(tableName)` in a file mentioning `games` will need the literal name.

## Success Criteria (Summary)

- Deleting any gate step, script or hook registration makes `npm test` fail with a message
  naming it.
- Each proven research bypass (empty tree, `bg-mauve-500`, `border-s-red-500`, a comment-faked
  predicate, `as const`, `.from(T)`, a fourth theme) is caught or reported.
- The real repo stays green on all three guards with unchanged counts.
