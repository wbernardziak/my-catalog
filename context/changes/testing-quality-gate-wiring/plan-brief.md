# Quality-gate wiring — plan brief

> Full plan: `context/changes/testing-quality-gate-wiring/plan.md`
> Research: `context/changes/testing-quality-gate-wiring/research.md`

## What and why

Rollout Phase 5 — the last row of the phased test rollout — owes the **local
edit-loop gate**. CI already runs every gate this project has; locally there is
effectively none, so a type error or a broken assertion can reach a commit, and
the agent can report success over a red tree.

## Starting point

`.husky/pre-commit` is one line, `npx lint-staged`, running `eslint --fix` and
`prettier --write`. Nothing type-checks and nothing runs a test before a commit.
Neither that hook nor the lint-staged config has changed since `4155f02`
("Initial commit") — the narrow scope is the starter template's default, not a
decision. There is no agent-loop gate at all: `git ls-files .claude/` is empty.

## Desired end state

A code change cannot reach a commit, or be reported as done by the agent,
without `tsc --noEmit` and the unit suite passing. Both layers run the same two
commands, so "green" has one local definition.

## Key decisions made

| Decision            | Choice                                  | Why                                                                                                                                                   | Source      |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Pre-commit contents | lint-staged + typecheck + unit          | Closes the failure §7 records — four `tsc` errors through a green lint and build                                                                      | Plan        |
| Pre-commit trigger  | Only when `.ts`/`.tsx`/`.astro` staged  | A docs commit paying 10s is what produces habitual `--no-verify`                                                                                      | Plan        |
| Agent gate          | Blocking `Stop` hook, exit 2            | Exit 2 prevents stopping and feeds stderr back — a real gate, not an alarm                                                                            | Plan        |
| Stop-hook scope     | Skip when the tree is unchanged         | A question-answering turn should cost nothing                                                                                                         | Plan        |
| Bypass policy       | Documented as legitimate escape         | CI is the real boundary; an openly escapable gate beats one people disable                                                                            | Plan        |
| Close-out           | Full, matching phases 1–4               | This is the last rollout row; the guide would otherwise sit permanently stale                                                                         | Plan        |
| `db` suite          | Excluded from both local gates          | Needs Docker; a gate failing on a stopped daemon teaches bypass                                                                                       | Research    |
| Typecheck placement | Inside lint-staged, as a function entry | A worktree gate admits a broken staged commit (proven); a function entry appends no filenames, so tsc runs project-wide inside lint-staged's stashing | Plan review |

## Scope

**In scope:** a new `lint-staged.config.js` replacing the JSON block;
`.husky/pre-commit`; a new committed `.claude/settings.json` and
`.claude/hooks/quality-gate.sh`; the §6 cookbook entry and the §5/§3 row updates.

**Out of scope:** CI (already complete); `test:db` in either local gate; the
three project linters at commit time; enforcing the bypass; `asyncRewake`
(recorded as the fallback, not the design).

## Architecture / approach

Two layers, two questions. The husky hook gates **commits** — everyone, but only
at commit time. The `Stop` hook gates **turns** — the agent, before it reports
success, with no commit needed. Both invoke `npm run typecheck && npm test`.

The `Stop` script carries two mandatory guards, in order: `stop_hook_active`
first (Claude Code overrides a Stop hook after eight consecutive blocks, so a
broken tree would otherwise burn eight turns), then a working-tree check.

## Phases at a glance

| Phase              | What it delivers                                              | Key risk                                                                        |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Pre-commit gate | `.husky/pre-commit` runs typecheck + unit when code is staged | Gating the wrong commits — a deletion-only or docs commit paying the cost       |
| 2. Agent Stop hook | Committed settings + gate script with both guards             | Guard order wrong: eight burned turns; or stdout pollution voiding the decision |
| 3. Close-out       | §6 cookbook entry, §5 gate rows, §3 row → `complete`          | Documenting intent rather than what is actually wired                           |

**Prerequisites:** none — every command the gates call already exists and passes.
**Estimated effort:** ~1 session across 3 phases; the config is small, the
deliberate-break checks are most of the work.

## Open risks and assumptions

- The `Stop` hook only reaches people using Claude Code; the husky hook is the
  layer that covers everyone. The floor is the commit gate, not the turn gate.
- ~5.4s per code-editing turn may prove annoying in a long `/10x-implement`
  session, where that skill already runs the suite per phase. Phase 2's manual
  rows exist to find out; `asyncRewake` is the recorded fallback.
- Neither gate is enforceable. `--no-verify` and `disableAllHooks` remain, by
  decision. If either becomes routine, the honest response is to make the gate
  cheaper, not to try to close the escape.

## Success criteria (summary)

- A staged type error or failing assertion aborts the commit, watched to fail.
- A failing assertion at turn end blocks the agent from stopping and hands it
  the failure text, watched to fail.
- A docs-only commit and a question-answering turn both stay fast.
