---
date: 2026-09-14T09:34:08+02:00
researcher: Wojciech Bernardziak
git_commit: 14a54f6dcb4c021a883cf4de9091b2278aa2103f
branch: main
repository: my-catalog
topic: "Rollout phase 5 — grounding the local edit-loop gate (Claude Code hooks + husky pre-commit)"
tags: [research, codebase, quality-gates, husky, lint-staged, claude-code-hooks, ci]
status: complete
last_updated: 2026-09-14
last_updated_by: Wojciech Bernardziak
---

# Research: rollout phase 5 — the local edit-loop gate

**Date**: 2026-09-14T09:34:08+02:00
**Researcher**: Wojciech Bernardziak
**Git Commit**: `14a54f6dcb4c021a883cf4de9091b2278aa2103f`
**Branch**: main
**Repository**: my-catalog

## Research Question

Ground rollout Phase 5 of `context/foundation/test-plan.md`: "Quality-gate
wiring". Risks covered: cross-cutting. The CI half is already wired; what this
phase owes is the **local edit-loop gate**. Scope confirmed with the user:
**both layers** — Claude Code hooks for the agent loop, husky pre-commit as the
floor.

Response intent to verify, not accept: prove the suite cannot silently become
optional, and that a regression cannot land mid-edit.

## Summary

Five findings change how this phase should be planned.

1. **The narrow pre-commit hook was never a decision.** `.husky/pre-commit` and
   the `lint-staged` config have not changed since `4155f02 Initial commit` —
   they are the starter template's defaults. Nothing in `context/` records a
   deliberate choice to keep typecheck and tests out of it.

2. **The latency objection is much weaker than the change brief assumed.** The
   existing hook already costs **~4.7s** for a single file, because ESLint here
   is type-aware. Adding typecheck and the unit suite moves a commit from ~5s to
   ~10s — not from free to 7s.

3. **`tsc` cannot be a normal lint-staged entry.** lint-staged passes staged
   filenames; `tsc --noEmit <file>` ignores `tsconfig.json` and every `@/*`
   alias then fails to resolve. Typecheck has to run whole-project.

4. **The Stop hook mechanics are the opposite of the obvious reading.** Exit 2
   on a `Stop` hook does not halt the agent — it _prevents Claude from stopping
   and continues the conversation_, feeding stderr back as the reason. That is
   exactly the behaviour this gate wants, and it comes with a loop hazard that
   has a documented guard (`stop_hook_active`).

5. **One stale claim in the test plan.** §4 credits the CI test step to
   `1b3980b`. It was `04f826a`. The conclusion (the step predates the plan) is
   right and in fact stronger.

## Detailed Findings

### The current local gate

- `.husky/pre-commit` contains exactly `npx lint-staged`.
- `package.json` `lint-staged`: `eslint --fix` on `*.{ts,tsx,astro}`,
  `prettier --write` on `*.{json,css,md}`.
- `git log --follow -- .husky/pre-commit` returns a single commit, `4155f02`
  ("Initial commit"). Same for the `lint-staged` block in `package.json`.
- Consequence recorded in `context/foundation/test-plan.md:223`: "Nothing
  type-checked this repo before [2026-09-11] … phase 1's own harness shipped
  four `tsc` errors through a green lint and build."

So the hook's scope is inherited, not chosen. `test-plan.md:222` lists
`lint | local (husky/lint-staged) + CI | required (wired)` in a way that reads
as deliberate; it is not.

An independent confirmation from a prior reviewer, who used the hook's real
narrowness as grounds to put a new guard in CI instead:
`context/archive/2026-09-13-testing-catalog-integrity-soft-delete/reviews/plan-review.md:31-34`
— "`lint-staged` runs `eslint --fix` and `prettier` only, despite
`test-plan.md` §5 describing `lint:colors`/`lint:contrast` as 'local'."

### Measured cost of each candidate gate step

Wall-clock on this machine, warm, at `14a54f6`:

| Step                                      | Wall clock | Notes                                               |
| ----------------------------------------- | ---------- | --------------------------------------------------- |
| `npx eslint src/middleware.ts` (one file) | **4.73s**  | type-aware rules pay full project analysis          |
| `npm run typecheck`                       | 3.61–3.71s | `tsc --noEmit`                                      |
| `npm test` (unit)                         | 1.60–1.73s | vitest self-reports 1.13–1.24s; the rest is startup |
| `npm run typecheck && npm test`           | **5.37s**  | the two run back to back                            |
| `npm run test:db`                         | ~2.9s      | **plus** a running Docker/Supabase stack            |

The decisive number is the first one. The hook a developer already lives with
costs ~4.7s before any of this phase's work. The marginal cost of a full local
gate is ~5.4s on top, roughly doubling a commit rather than introducing a wait
where none existed.

The `--no-verify` worry in `change.md:35` is real but should be re-anchored to
~10s, not to the ~7s guessed there with a wrong baseline.

### The `tsc`-in-lint-staged constraint

lint-staged appends staged file paths to each command. Passing files to `tsc`
makes it ignore `tsconfig.json` entirely. Verified:

```
$ npx tsc --noEmit src/middleware.ts
src/middleware.ts(1,34): error TS2307: Cannot find module 'astro:middleware'
src/middleware.ts(2,30): error TS2307: Cannot find module '@/lib/supabase'
src/middleware.ts(3,47): error TS2307: Cannot find module '@/lib/theme'
```

Every one is a false positive caused by the dropped project config. A typecheck
gate must therefore either be a plain line in `.husky/pre-commit` (outside
lint-staged) or a lint-staged **function** entry that ignores its arguments.
This is a mechanical constraint, not a preference.

### Which suite belongs in the edit loop

`vitest.config.ts:9-13` already answers this, in the config author's own words:

> `unit` — hermetic, no network, no Docker. The edit-loop default (`npm test`).
> `db` — drives a real local Supabase stack (`npm run test:db`).

Corroborated by the phase that built the split:
`context/archive/2026-09-12-testing-per-member-state-attribution/plan.md:75`
("**Not making the default `npm test` depend on Docker.**") and
`plan-brief.md:37` ("Keeps the edit loop fast and Docker-free while still gating
the DB suite").

**The db suite must stay out of both local gates.** A gate that fails because
Docker is not running trains people to pass `--no-verify`, which is the exact
failure mode this phase exists to prevent.

### Claude Code hook mechanics (verified against the docs, 2026-09-14)

A subagent's first pass on this was wrong on every load-bearing point; the
following is from `code.claude.com/docs/en/hooks` and `/hooks-guide` directly.

- **`Stop` takes no matcher.** The matcher-support table lists `Stop` under "no
  matcher support | always fires on every occurrence". Matchers filter tool
  names and apply to tool events only. A `matcher` on a Stop hook is noise.
- **Exit 2 on `Stop` blocks _stopping_.** The table reads: "`Stop` | Yes |
  Prevents Claude from stopping, continues the conversation." Stderr becomes the
  reason — "the blocking message is the reason from your JSON's blocking
  decision when it makes one, and your stderr text otherwise." So a failing gate
  does not halt the agent; it hands the agent the failure and makes it keep
  working. That is the desired behaviour, but it is the opposite of the
  intuitive reading and must be stated plainly in the plan.
- **Loop guard is mandatory.** "Claude Code overrides a Stop hook after it
  blocks eight times in a row without progress. Your hook script needs to check
  whether it already triggered a continuation. Parse the `stop_hook_active`
  field from the JSON input and exit early if it's `true`". The documented
  snippet:

  ```bash
  INPUT=$(cat)
  if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
    exit 0  # Allow Claude to stop
  fi
  ```

  A Stop-hook gate written without this can burn eight full turns on a failure
  it cannot fix. `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises the cap.

- **Default `command` timeout is 600s**, not 30s (30s applies to
  `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`; 10s to
  `MessageDisplay`). A ~5s gate is nowhere near it; no `timeout` needed.
- **Hook object fields**: `type` (`command` | `http` | `mcp_tool` | `prompt` |
  `agent`), plus optional `if`, `timeout`, `statusMessage`, `once` (skills
  only). Command hooks add `command`, `args`, `async`, `asyncRewake`, `shell`.
- **Blocking JSON shape** is `{"decision": "block", "reason": "…"}`. Note the
  stdout footgun the guide documents: anything a shell profile prints before the
  JSON means stdout no longer starts with `{` and the JSON is silently ignored.
- **Placement**: the location table gives `.claude/settings.json` as "Single
  project / Yes, can be committed to the repo"; `.claude/settings.local.json` is
  "No, gitignored". A gate the team should get belongs in
  `.claude/settings.json`.

### Where `.claude/` stands in this repo

- Nothing under `.claude/` is tracked: `git ls-files .claude/` is empty.
- The only file present is `.claude/settings.local.json`, holding a permissions
  allowlist. It is ignored by the **user's global** gitignore
  (`/home/vanos/.config/git/ignore:1`), not by the repo's.
- The repo's `.gitignore:31` ignores only `.claude/**/10x-*`.

So `.claude/settings.json` is untracked-but-not-ignored: committing one is a
clean, normal addition. No `.gitignore` change is needed.

### CI is genuinely done

`.github/workflows/ci.yml` — `ci` job runs `typecheck`, `lint`, `lint:colors`,
`lint:contrast`, `lint:reads`, `build`, `npm test`; `db-tests` job boots a
trimmed Supabase stack and runs `npm run test:db`. `package.json` `test` is
`vitest run --project unit`, with no `--passWithNoTests`.

Dates verified from git:

| What                                              | Commit    | Date       |
| ------------------------------------------------- | --------- | ---------- |
| `npm test` added to CI                            | `04f826a` | 2026-07-09 |
| `lint:contrast` added to CI                       | `1b3980b` | 2026-08-01 |
| `--passWithNoTests` dropped; typecheck step added | `d3a297b` | 2026-09-11 |
| `db-tests` job                                    | `9902521` | 2026-09-12 |
| `lint:reads` step                                 | `93a8866` | 2026-09-13 |

**Correction for §4.** The plan says the test step "was already wired in commit
`1b3980b`". `1b3980b` added `npm run lint:contrast`; `npm test` came from
`04f826a`, two months earlier. The claim's substance holds and strengthens.

## Code References

- `.husky/pre-commit:1` — the whole hook: `npx lint-staged`
- `package.json` `lint-staged` — `eslint --fix`, `prettier --write`; unchanged since `4155f02`
- `vitest.config.ts:9-13` — names `unit` as "the edit-loop default", `db` as Docker-bound
- `vitest.config.ts:20-26` — `unit` project, excludes `src/test/db/**`
- `vitest.config.ts:27-40` — `db` project, `fileParallelism: false`, 30s/20s timeouts
- `.github/workflows/ci.yml:20-29` — the `ci` job's gate sequence
- `.github/workflows/ci.yml:34-50` — the `db-tests` job
- `.claude/settings.local.json` — permissions only; no hooks anywhere in the repo
- `.gitignore:31` — `.claude/**/10x-*`, the only `.claude` rule in-repo

## Architecture Insights

- **The repo already separates gates by cost.** Docker-bound work is a separate
  vitest project and a separate CI job precisely so the fast path stays fast.
  The edit-loop gate should inherit that principle rather than re-litigate it:
  local gate = lint + typecheck + `unit`; `db` stays opt-in.
- **Guard scripts are a house pattern.** `lint:colors`, `lint:contrast` and
  `lint:reads` are bespoke `scripts/*.mjs` checks wired into CI. A quality gate
  that composes existing npm scripts fits the grain; a new bespoke mechanism
  does not.
- **Two layers answer two different questions.** The husky hook gates _commits_
  (human or agent, but only at commit time). The Stop hook gates _turns_ (the
  agent, before it reports success, with no commit needed). Phase 5 wants both
  because a regression that never reaches a commit is exactly what "landing
  mid-edit" means in `test-plan.md:230`.

## Historical Context (from prior changes)

- `context/archive/2026-09-11-testing-api-boundary-contract/reviews/impl-review.md:44-52`
  — typecheck exists at all because a reviewer caught §5 claiming
  "lint + typecheck | husky/lint-staged + CI | required (wired)" when husky ran
  `eslint --fix` only. The fix added typecheck **to CI, explicitly not to husky**
  — the first time this boundary was drawn, and drawn by default rather than by
  argument.
- `context/archive/2026-09-11-testing-api-boundary-contract/plan-brief.md:38`
  — "Drop `--passWithNoTests` once tests exist … phase 5 keeps the edit-loop
  work". Phase 5's scope has been "the edit loop" since 2026-09-11.
- `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/plan.md:682`
  — a prior phase corrected this same billing: "both §4 and §5 still billed
  dropping `--passWithNoTests` to Phase 5 though it went in Phase 1 — Phase 5
  now owes the edit-loop gate alone."
- `context/archive/2026-07-09-llm-recommendation-service/plan.md:142-143`
  — `--passWithNoTests` was _deliberately_ added so CI would pass before tests
  existed, then deliberately dropped once they did. The gate has been managed
  consciously at the CI layer throughout; only the local layer drifted.
- **No prior art on Claude Code hooks.** An exhaustive search of `context/`
  found zero hits for `.claude/settings.json`, `PostToolUse`, `Stop` hooks or
  "gating the agent" beyond the two Phase 5 rows in `test-plan.md:171,230`. This
  phase is the first time the mechanism is chosen.

## Related Research

- `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/research.md:73`
  — "That has a consequence for the local edit-loop gate; see Open Questions" —
  the nearest prior pointer at this phase.
- `context/archive/2026-09-12-testing-per-member-state-attribution/plan.md:367`
  — the cost argument that produced the `db` split.

## Open Questions

1. **Does the husky hook run typecheck + unit on every commit, or only when
   `*.ts`/`*.tsx`/`*.astro` are staged?** A docs-only commit paying 10s is the
   kind of friction that produces `--no-verify`. lint-staged can gate on the
   glob; a plain husky line cannot without extra scripting.
2. **`async` / `asyncRewake` for the Stop hook.** The reference lists both as
   command-hook fields, with `asyncRewake` described as "run in background, wake
   Claude on exit code 2". If that works as it reads, the agent gate could cost
   the turn nothing and still surface failures. I did not find guide-level
   documentation or an example, so this needs verification before it is planned
   as the primary mechanism rather than a refinement.
3. **Does the Stop hook fire for every turn, including ones with no edits?**
   `Stop` has no matcher, so it fires on every occurrence — including a turn
   that only answered a question. The script likely needs a cheap "did anything
   change" guard (`git diff --quiet`) to avoid running the suite on a
   conversational turn.
4. **Interaction with `/10x-implement`'s own verification.** The implement skill
   already runs the suite per phase. A Stop hook doing the same could double the
   work on every turn of a long implementation session. Worth measuring before
   committing to the design.
5. **Team reach.** A committed `.claude/settings.json` only gates people using
   Claude Code. The husky hook covers everyone. That asymmetry is an argument
   for the pre-commit layer being the real floor and the Stop hook being the
   fast feedback loop — worth stating explicitly in the plan.
