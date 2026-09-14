# Test Plan Refresh (2026-09-14) — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-09-14/plan.md`
> Research: `context/changes/test-plan-refresh-2026-09-14/research.md`

## What and Why

The first five-phase test rollout is complete, so `context/foundation/test-plan.md` has no
queued work and several of its facts are out of date. The refresh interview raised five
new risks where the app depends on outside systems. Research found that none of them holds
exactly as worded, but each has a real, narrower defect underneath. This plan writes the
corrected risks and a new rollout queue into the guide.

## Starting Point

- §2 holds risks #1–#7, all covered. §3 lists five phases, all `complete`.
- §3 and §7 rule out browser testing unless a deployed-shape risk appears.
- §4/§5 have stale facts: 150→188 unit tests, CLI 2.23→2.98, "Phase 5 still owes", colour
  checks "local".

## Desired End State

- §2 adds #8–#11, each with response guidance that already carries the decisions below.
- §3 queues Phases 6–9, so `/10x-test-plan` routes to Phase 6.
- Optional work (a Playwright slice, a real-provider smoke test) is a dated §7 exclusion
  with a revisit trigger.
- Every §4/§5 fact is current. No application code changes: the defects become the goals
  of Phases 6–9.

## Key Decisions Made

| Decision                         | Choice                                                             | Why (1 sentence)                                                                                | Source          |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------- |
| Risk framing                     | A+B merge; every risk reworded per research                        | One unlogged branch hides retired models, quota and bad keys alike                              | Research        |
| §2 edit authority                | Append #8–#11; #1–#7 verbatim                                      | Archived plans and §6 cite #1–#7 by number; the guide amends, it does not rewrite               | Plan            |
| §3 queue                         | 6 Guards (#10) → 7 Config (#9) → 8 Provider (#8) → 9 Session (#11) | Every queued phase is offline, cheap, and fixes a proven defect; guards protect all later gates | Plan            |
| Playwright / real-provider smoke | §7 exclusions with triggers, not §3 rows                           | A "maybe" row would block the orchestrator; no browser-only regression ever reached prod        | Research + Plan |
| `OPENROUTER_MODEL`               | Make it runtime-read (`access: "secret"`)                          | Restores the documented "swap without a deploy" contract                                        | Plan            |
| Daily quota 429                  | Own `quota_exhausted` reason + "try again tomorrow" copy + logging | "Try again shortly" is untrue for a daily cap                                                   | Plan            |
| Existing-account signup          | Neutral confirm-email copy, no account detection                   | True in every case; keeps Supabase anti-enumeration                                             | Plan            |
| Live prod parity                 | Pre-deploy checklist, wired as §5's pre-prod row                   | Deploy is manual and parity needs credentials, so it can't be a CI gate                         | Plan            |

## Scope

**In scope:**

- §2 rows #8–#11, four guidance rows, and a dated note with challenger findings
- §3 rows 6–9 and the new browser paragraph
- New §7 exclusions
- Corrected §4/§5 facts and planned gates
- §6.8–6.11 placeholders
- The §8 ledger entry

**Out of scope:**

- Any code, script, config or CI change (those belong to Phases 6–9)
- Rewording #1–#7, and any change to §1
- Issue #43
- Archiving the stray `bootstrap-verification` and `deployment` folders

## Architecture / Approach

Edit the one file in reading order, one coherent block per phase, so the guide stays
consistent after each phase. Each planning decision goes into §2's response guidance as the
test oracle, so the downstream phase inherits it. New Source cells cite evidence only, per
principle #3. Run Prettier after each phase so table realignment doesn't flood the commit
diff.

## Phases at a Glance

| Phase                    | What it delivers                                                                       | Key risk                                               |
| ------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. §2 Risk Map additions | #8–#11 plus guidance and a dated note                                                  | Code anchors slipping into Source cells                |
| 2. §3 queue + §7         | Phases 6–9 queued; browser and smoke work as triggered exclusions                      | A non-literal status breaking the orchestrator's parse |
| 3. §4/§5/§6/§8 facts     | Current stack facts, planned gates, placeholders, corrected §6 line references, ledger | A stale fact left behind                               |

**Prerequisites:**

- `research.md` present (done).
- The six planning decisions (made 2026-09-14).
- Per `lessons.md`, before `/10x-implement`: a GitHub tracking issue, one issue per phase (label `enhancement`), and a `feat/test-plan-refresh-2026-09-14` branch.
  **Estimated effort:** ~1 session across 3 small phases.

## Open Risks and Assumptions

- Phase 7's research must still ground whether the Cloudflare Git integration builds or
  deploys, the hosted Supabase Site URL, and whether the OpenRouter secrets are set in
  production. These are carried as "context to ground" and don't block this documentation
  change.
- Phase 8's fixtures depend on confirming the provider's real 429/402 and Supabase
  rate-limit shapes, which research recalled rather than captured.
- §1's "empty hot-spot window" line stays stale by design; the §2 note gives current figures.

## Success Criteria (Summary)

- `/10x-test-plan --status` reports Phase 6 "Guard self-verification" as current.
- A fresh reader can act on #8–#11 from the guide alone, without opening `research.md`.
- No stale fact from the research list remains in §4/§5.
