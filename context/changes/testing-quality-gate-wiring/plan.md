# Quality-gate wiring — implementation plan

## Overview

Close the last row of the phased test rollout by adding the **local edit-loop
gate** in two layers: a blocking Claude Code `Stop` hook for the agent loop, and
an extended husky `pre-commit` hook as the floor for everyone. CI is already
complete and is not touched.

## Current State Analysis

`.github/workflows/ci.yml` runs the full gate stack — `typecheck`, `lint`, the
three project linters, `build`, `npm test` in the `ci` job, and `npm run test:db`
in `db-tests`. `--passWithNoTests` is gone, so an empty suite fails. §4 of the
test plan states the remainder plainly: "What Phase 5 still owes: the local
edit-loop gate alone."

Locally there is effectively no gate. `.husky/pre-commit` contains one line,
`npx lint-staged`, which runs `eslint --fix` on `*.{ts,tsx,astro}` and
`prettier --write` on `*.{json,css,md}`. Nothing type-checks and nothing runs a
test before a commit lands. Neither file has changed since `4155f02`
("Initial commit") — this scope is the starter template's default, not a
decision anyone made.

There is no agent-loop gate at all: `git ls-files .claude/` is empty and no hook
exists anywhere in the repo.

## Desired End State

A code change cannot reach a commit, or be reported as done by the agent,
without `tsc --noEmit` and the unit suite passing — unless it is _deliberately_
bypassed (`--no-verify`, `disableAllHooks`), which stays available by decision.
CI remains the enforcing boundary; these layers move the signal earlier, they do
not replace it.

Verifiable by: staging a file carrying a deliberate type error and confirming
`git commit` refuses it; and by having the agent finish a turn over a failing
assertion and confirming it is prevented from stopping, with the failure text
handed back to it.

### Key Discoveries:

- The latency budget is already spent: `npx eslint` on a **single file** costs
  **4.73s** because the config is type-aware (`research.md`, measured at
  `14a54f6`). `typecheck && npm test` adds **5.37s**. The gate roughly doubles a
  commit that already costs ~5s; it does not introduce a wait where none existed.
- `tsc --noEmit <file>` **ignores `tsconfig.json`** — every `@/*` alias then
  fails to resolve. So typecheck cannot be a _string_ `lint-staged` entry, which
  appends staged filenames. A **function** entry in a JS config returns a
  complete command and appends nothing ("These strings are considered complete
  and should include the filename arguments, if wanted" — lint-staged 16.4.0),
  so a project-wide command can run inside lint-staged.
- **A pre-commit gate must grade the index, not the working tree.** Verified
  2026-09-14: with a broken version staged and the working copy fixed,
  `npm run typecheck` passes, so a working-tree gate admits a broken commit.
  lint-staged hides unstaged changes around its tasks — by default only for
  _partially staged_ files, and for all tracked files with `--hide-unstaged`.
  Untracked files are hidden by neither.
- `Stop` hooks take **no matcher** and fire on every turn, including a turn that
  only answered a question.
- Exit code 2 on a `Stop` hook **prevents Claude from stopping and continues the
  conversation**, with stderr shown as the reason — the opposite of the intuitive
  reading, and exactly the behaviour wanted here.
- Claude Code overrides a `Stop` hook after it **blocks eight times in a row**;
  the script must parse `stop_hook_active` from its stdin JSON and exit 0 when
  true.
- `.claude/settings.json` is the documented shareable location ("Single project
  / Yes, can be committed to the repo"). It is untracked but **not** ignored
  here — `.gitignore:31` covers only `.claude/**/10x-*`.
- `vitest.config.ts:9-13` already designates `unit` as "the edit-loop default"
  and `db` as the Docker-bound suite.

## What We're NOT Doing

- **Not touching CI.** Every gate it owes is wired; re-litigating it is the
  scope error this phase has already corrected twice.
- **Not putting `test:db` in either local gate.** It needs Docker, and a gate
  that fails because a daemon is not running teaches people to bypass it — the
  exact failure this phase exists to prevent.
- **Not adding `lint`/`lint:colors`/`lint:contrast`/`lint:reads` to the
  pre-commit path.** `lint-staged` already runs ESLint on staged files, and the
  three project linters are cheap CI checks that guard whole-tree invariants.
- **Not enforcing the bypass.** `--no-verify` and `disableAllHooks` stay
  available and get documented as deliberate escapes; CI is the real boundary.
- **Not using `asyncRewake`.** It cannot block, so it is fast feedback rather
  than a gate. Recorded in Phase 2 as the fallback if turn latency proves
  intolerable.

## Implementation Approach

Two layers answering two different questions. The husky hook gates **commits**
— every contributor, agent or human, but only at commit time. The `Stop` hook
gates **turns** — the agent, before it reports success, with no commit needed.
Phase 5 wants both because "landing mid-edit" (`test-plan.md:230`) describes a
regression that never reaches a commit at all.

**What the pair does not cover.** The two layers partition the work rather than
overlapping it: the `Stop` hook's tree guard means it sits out any turn that
ended in a commit, because the tree is then clean — which is every
`/10x-implement` phase, since each ends by committing. That is intended (the
commit gate already graded that content), but it has one consequence worth
naming: a `git commit --no-verify` skips husky _and_ leaves a clean tree, so it
skips the `Stop` hook too. Both layers miss the same commit, and CI is the only
thing left. This is the accepted cost of leaving the bypass unenforced; it is
not a case the local gates can close.

Both layers run the same two commands, `npm run typecheck && npm test`, so
there is one definition of "green" locally and no second place to keep in sync.

## Critical Implementation Details

**Sequencing inside the Stop-hook script.** The `stop_hook_active` check must
come first, before the working-tree check and before any command runs. Reversed,
a genuinely broken tree blocks eight consecutive turns and then gets overridden
anyway, having burned eight full agent turns.

**stdout must not be polluted.** Claude Code parses hook stdout as JSON only when
it starts with `{`. Anything a shell profile prints first silently voids the
decision. The gate script communicates through exit codes and stderr only, which
sidesteps this entirely.

---

## Phase 1: Pre-commit gate

### Overview

Extend the commit-time floor to typecheck and the unit suite, gated on whether
any code file is staged.

### Changes Required:

#### 1. lint-staged configuration, moved to JS

**File**: `lint-staged.config.js` (new), replacing the `lint-staged` block in
`package.json`

**Purpose**: Run the project-wide gate _inside_ lint-staged, so it grades the
staged snapshot rather than the working tree. That is the whole point: a
working-tree gate admits a commit whose staged content is broken (verified — see
Key Discoveries).

**Contract**: Exports an object. The `*.{json,css,md}` key keeps
`prettier --write` as today. The `*.{ts,tsx,astro}` key becomes a **function**
returning the ordered command list — `eslint --fix` on the matched files, then
`npm run typecheck`, then `npm test`. Filenames are appended only to `eslint`;
the other two are complete commands and get none, which is precisely why a
function entry is required.

Gating on the glob is what keeps a docs-only commit instant: with no
`.ts`/`.tsx`/`.astro` staged the key does not match and neither command runs. No
`--diff-filter` logic is needed either — lint-staged matches staged files
already, and a pure deletion leaves nothing for the glob to match.

The JSON `lint-staged` block must be _removed_ from `package.json` in the same
change; two config sources would let one silently win.

#### 2. The pre-commit hook

**File**: `.husky/pre-commit`

**Purpose**: Ensure the gate sees only what is being committed.

**Contract**: Stays a single `npx lint-staged` line, plus `--hide-unstaged`.
Without that flag lint-staged hides unstaged changes only for _partially staged_
files, so an unrelated unstaged edit to another tracked file would still reach
the project-wide `tsc` and fail a commit that is actually fine.

Residual, to be stated in §6 rather than solved: untracked files are hidden by
neither flag, so a new untracked `.ts` carrying errors can still fail the gate.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- `npm run build` passes
- The configured gate itself refuses a staged type error: with a broken `.ts`
  staged, running the hook's command exits non-zero. Asserts the deliverable,
  not just that the repo is currently green — rows above would all pass with the
  hook never written

#### Manual Verification:

- Deliberate-break check, type error: introduce a real `tsc` error in a staged
  `.ts` file, confirm `git commit` aborts naming the typecheck failure, restore
- Deliberate-break check, failing test: break one assertion, stage it, confirm
  `git commit` aborts naming the test failure, restore
- A docs-only commit (`*.md` staged, no code) completes without running typecheck
  or the suite, and is visibly fast
- A commit that only deletes a `.ts` file does not trigger the gate (nothing
  staged matches the glob)
- Staged-vs-worktree check: stage a broken version, fix the working copy,
  confirm the commit is still refused — the failure this design exists to close
- `git commit --no-verify` still bypasses, as designed

**Implementation note**: Stop for human confirmation before continuing.

---

## Phase 2: Agent Stop hook

### Overview

Add a committed Claude Code `Stop` hook so the agent cannot report success over
a red tree.

### Changes Required:

#### 1. The gate script

**File**: `.claude/hooks/quality-gate.sh` (new, executable)

**Purpose**: Run the same two commands the pre-commit hook runs, and block the
agent from ending its turn when either fails.

**Contract**: Reads the hook input JSON on stdin. Exits 0 immediately when
`stop_hook_active` is `true` — read with `node`, not `jq`, since node is already
a hard prerequisite here and jq is not; then exits 0 when the working tree has no
modified or untracked files; otherwise runs `npm run typecheck` then `npm test`, and on
failure writes the failing command's output to **stderr** and exits **2**.
Communicates only through exit codes and stderr — never stdout JSON.

The guard order is load-bearing and the exit code is counter-intuitive, so the
skeleton is given rather than described:

```bash
#!/usr/bin/env bash
INPUT=$(cat)
# First: the eight-block cap. Must precede everything else.
# node, not jq: node is already a hard prerequisite of this repo and jq is not.
# Exits 0 only when the flag is literally true; malformed input fails safe by
# falling through to the gate rather than silently disabling it.
if printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.exit(JSON.parse(d).stop_hook_active===true?0:1)}catch{process.exit(1)}})'; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Nothing changed -> nothing to gate (a question-answering turn).
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi
if ! OUT=$(npm run typecheck 2>&1); then
  printf 'Quality gate: typecheck failed\n%s\n' "$OUT" >&2
  exit 2   # blocks STOPPING; the agent keeps working with this as the reason
fi
if ! OUT=$(npm test 2>&1); then
  printf 'Quality gate: unit suite failed\n%s\n' "$OUT" >&2
  exit 2
fi
exit 0
```

#### 2. The hook registration

**File**: `.claude/settings.json` (new, committed)

**Purpose**: Register the script on the `Stop` event for everyone who clones the
repo.

**Contract**: A `hooks.Stop` array with one entry whose `hooks` list holds a
single `{ "type": "command", "command": "..." }` object pointing at the script
via `${CLAUDE_PROJECT_DIR}`. **No `matcher`** — `Stop` does not support one. No
`timeout` — the command default is 600s and the gate takes ~5s.

Note this file is currently absent and untracked; `.gitignore:31` ignores only
`.claude/**/10x-*`, so no ignore-rule change is needed.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- `.claude/hooks/quality-gate.sh` is executable and tracked by git
- `.claude/settings.json` is tracked by git
- The script exits 0 and runs no commands when fed `{"stop_hook_active":true}`
  on stdin against a dirty tree

#### Manual Verification:

- Deliberate-break check: leave a failing assertion in the tree, let the agent
  end a turn, confirm it is prevented from stopping and is handed the failure
  text, restore
- A turn that only answers a question (clean tree) runs no commands and adds no
  perceptible latency
- The turn-cost increase on a turn that did edit code is ~5s and tolerable in
  practice
- The hook does not double-run against `/10x-implement`'s own per-phase
  verification in a way that makes a long session unpleasant
- A turn that ends in a commit runs no gate (clean tree), confirming the
  partition between the two layers is the one described — observed, not assumed

**Implementation note**: Stop for human confirmation before continuing.

---

## Phase 3: Close-out

### Overview

Make the guide describe what is actually wired, and finish the rollout.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md` §6

**Purpose**: Document both gates the way §6.1–§6.5 document the test layers, so
the next contributor knows what runs when and how to escape it.

**Contract**: A new sub-section covering: what each layer runs, when each fires
(staged code files / a dirty tree), the two commands being identical across both,
and `--no-verify` plus `disableAllHooks` named as deliberate escapes with CI as
the backstop. Records the measured costs so a future reader can judge the
trade-off rather than re-measure it.

#### 2. Gate rows

**File**: `context/foundation/test-plan.md` §5

**Purpose**: The `CI test step + edit-loop gate` row currently says the
edit-loop gate is "required after §3 Phase 5". It lands in this change.

**Contract**: Row updated to the wired state with the date; the `lint` row's
"local (husky/lint-staged)" cell corrected to reflect that the local hook now
also runs typecheck and the unit suite.

#### 3. Rollout row

**File**: `context/foundation/test-plan.md` §3

**Purpose**: Close the last rollout row.

**Contract**: Phase 5 Status → `complete`, with the Change folder cell pointing
at `context/changes/testing-quality-gate-wiring/`. The archive path that rows
1–4 show lands when `/10x-archive` runs, which is after this change closes — it
is not this phase's to write.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass
- `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads` pass
- `npm run test:db` passes

#### Manual Verification:

- §6's new sub-section alone is enough for a contributor to know what runs at
  commit time, what runs at turn end, and how to escape each
- §5 and §3 match what is actually wired, checked row by row
- Every rollout row in §3 now reads `complete`

**Implementation note**: Stop for human confirmation before continuing.

---

## Testing Strategy

This phase ships no test code — it wires gates around the suite that already
exists. Verification is therefore behavioural, and in this repo's idiom that
means deliberate-break checks: each gate must be **watched to fail** for its own
reason before it is believed.

### Deliberate-break checks:

- A real `tsc` error, staged → the commit aborts (Phase 1)
- A failing assertion, staged → the commit aborts (Phase 1)
- A failing assertion left in the tree at turn end → the agent is blocked from
  stopping (Phase 2)
- `{"stop_hook_active":true}` on stdin with a dirty tree → the script exits 0
  without running anything (Phase 2)

### Manual testing steps:

1. Break the type system in a staged file; confirm the commit aborts; restore.
2. Break an assertion; confirm both the commit gate and the turn gate catch it;
   restore.
3. Commit a docs-only change; confirm it stays fast.
4. Answer a question with a clean tree; confirm no commands run.

## Performance Considerations

Measured at `14a54f6`: `typecheck` 3.61–3.71s, `npm test` 1.60–1.73s, the pair
5.37s. The pre-commit hook already costs ~4.73s through type-aware ESLint, so a
code commit moves from roughly 5s to roughly 10s. A docs-only commit is
unchanged.

The `Stop` hook adds ~5.4s to turns that edited code and nothing to turns that
did not. If that proves intolerable in a long implementation session, the
recorded fallback is `asyncRewake` — background execution that wakes Claude on
exit 2 — accepting that it surfaces failures rather than blocking them.

## References

- Research: `context/changes/testing-quality-gate-wiring/research.md`
- Rollout row and gate table: `context/foundation/test-plan.md` §3 row 5, §5, §4
- Hook mechanics: `code.claude.com/docs/en/hooks`, verified 2026-09-14
- Suite split rationale: `vitest.config.ts:9-13`
- Prior close-out shape: `context/archive/2026-09-13-testing-llm-recommendation-guardrails/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles.

### Phase 1: Pre-commit gate

#### Automated

- [x] 1.1 `npm run typecheck` passes — ba6c5ba
- [x] 1.2 `npm run lint` passes — ba6c5ba
- [x] 1.3 `npm test` passes — ba6c5ba
- [x] 1.4 `npm run build` passes — ba6c5ba
- [x] 1.5 The configured gate refuses a staged type error: hook command exits non-zero — ba6c5ba

#### Manual

- [ ] 1.6 Deliberate-break check, type error: staged `tsc` error aborts the commit, restored
- [ ] 1.7 Deliberate-break check, failing test: staged failing assertion aborts the commit, restored
- [ ] 1.8 A docs-only commit skips the gate and is visibly fast
- [ ] 1.9 A commit that only deletes a `.ts` file does not trigger the gate (nothing staged matches the glob)
- [ ] 1.10 Staged-vs-worktree check: a broken staged version with a fixed working copy is still refused
- [ ] 1.11 `git commit --no-verify` still bypasses, as designed

### Phase 2: Agent Stop hook

#### Automated

- [x] 2.1 `npm run typecheck` passes — af28fb5
- [x] 2.2 `npm run lint` passes — af28fb5
- [x] 2.3 `npm test` passes — af28fb5
- [x] 2.4 `.claude/hooks/quality-gate.sh` is executable and tracked by git — af28fb5
- [x] 2.5 `.claude/settings.json` is tracked by git — af28fb5
- [x] 2.6 The script exits 0 and runs no commands on `{"stop_hook_active":true}` with a dirty tree — af28fb5

#### Manual

- [ ] 2.7 Deliberate-break check: a failing assertion at turn end blocks the agent from stopping and hands it the failure text, restored
- [ ] 2.8 A question-answering turn with a clean tree runs no commands
- [ ] 2.9 The ~5s turn cost on code-editing turns is tolerable in practice
- [ ] 2.10 The hook does not double-run against `/10x-implement` in a way that makes a long session unpleasant
- [ ] 2.11 A turn that ends in a commit runs no gate, confirming the partition between the two layers

### Phase 3: Close-out

#### Automated

- [x] 3.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass — 0a7d3d4
- [x] 3.2 `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads` pass — 0a7d3d4
- [x] 3.3 `npm run test:db` passes — 0a7d3d4

#### Manual

- [ ] 3.4 §6's new sub-section alone explains what runs when and how to escape each gate
- [ ] 3.5 §5 and §3 match what is actually wired, checked row by row
- [ ] 3.6 Every rollout row in §3 reads `complete`
