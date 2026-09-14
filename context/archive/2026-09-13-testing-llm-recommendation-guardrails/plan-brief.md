# Test rollout phase 4: LLM recommendation guardrails — Plan Brief

> Full plan: `context/changes/testing-llm-recommendation-guardrails/plan.md`
> Research: `context/changes/testing-llm-recommendation-guardrails/research.md`

## What and why

Phase 4 of the phased test rollout covers Risks #3, #5 and #7 — recommendations must stay
inside the eligible catalog, fail visibly, and send only minimal household data to the
provider. Research changed the job: the catalog-only guarantee is already enforced in code
and already covered by 12 passing tests, so this phase instead proves the guarantee nobody
has ever asserted (the outbound prompt payload), closes the branches the suite misses, and
repairs two defects the research exposed.

## Starting point

`recommend()` calls OpenRouter through the bare global `fetch` and filters the model's
`gameId`s against the caller's candidate list. The suite drives that real path through
`vi.stubGlobal("fetch")` — but inspects the request body exactly once, for a latency flag,
and no test reaches the route that assembles those candidates from database rows.

## Desired end state

A regression turns `npm test` red when: a household field beyond the minimal contract
reaches the provider; a fabricated provider answer is reported to the user as a no-match; a
recommended game does not fit the requested player count or appears twice; or an
unexercised provider-failure branch changes behaviour. `test-plan.md` then describes this
boundary truthfully, with §6.5 written and the contract-test gate marked wired.

## Key decisions made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Mocking layer | `vi.stubGlobal("fetch")`, no dependency | `fetch` is called bare on the global; there is no SDK and no DI seam, and the stub already captures both directions | Research |
| Payload assertion layer | New route-level test | `recommend()` receives sanitized candidates, so only the route proves the whole chain and both allow-lists | Plan |
| Loaned titles | Dropped from the phase, backported out of Risk #3 | No PRD line asks for it; a prior change answered the question with a badge, so a test would assert a wish | Plan |
| Criteria enforcement | Player count only, post-hoc | The one criterion with a numeric, requirement-derived oracle (`prd.md:102`); time and genre are soft by wording | Plan |
| Hallucinated answer | New `out_of_catalog` reason + copy + log | `prd.md:93` demands a clear failure state; today it renders as "adjust your criteria" with no log | Plan |
| Guard exhausts the list | Returns `no_match` | Nothing in the catalog fits the count — the neutral copy is literally true and actionable | Plan |
| Extra response hardening | Duplicates only | The one case with a visible consequence (duplicate cards and React keys); length, rank and empty reason go to §6.5 as known-unguarded | Plan |
| Island error collapse | Out of scope | Real Risk #5 gap, but UI work that would open a React-render test layer §4 does not plan | Plan |

## Scope

**In scope:** route-level payload and envelope tests; three uncovered provider branches plus
request-shape assertions; the `out_of_catalog` union member with its copy and log; a
post-hoc player-count guard and duplicate collapse; cookbook §6.5; `test-plan.md`
corrections and the gate row.

**Out of scope:** excluding loaned or played games; enforcing time or genre; the island's
generic-error panel; list-length, `rank` and empty-`reason` hardening; any mocking library
or structural ratchet; the prompt text, model choice and the whole-catalog decision.

## Architecture / approach

Two test homes, split by what each can prove. The service suite keeps everything that takes
candidates as input — failure shapes, the allow-list, the new reason, the guard. The new
route suite starts from fat database rows and captures the real outbound request: the only
level where both allow-lists (`row → CandidateGame` and `CandidateGame → prompt`) are under
test at once. The post-parse block gains a fixed order: allow-list → `out_of_catalog` →
dedupe → player guard → `no_match`.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Route harness + payload | Risk #7's assertion, from database rows | Import-time env binding makes a test pass for the wrong reason |
| 2. Provider-suite gaps | Three uncovered branches + request shape | The 8s cap is unassertable; settling for "a signal was passed" |
| 3. `out_of_catalog` split | A hallucinated answer stops looking like a no-match | Changes a shipped union and user-facing copy |
| 4. Player guard + dedupe | Criteria fit stops being prompt-only | A boundary fixture that is off the boundary makes the break-check lie |
| 5. Cookbook + backports | §6.5, Risk #3 correction, gate wired | Re-adding the loaned clause later if the evidence is not recorded |

**Prerequisites:** none for the automated work beyond the existing `unit` project — no
Docker, no new dependency. The two manual `/play` checks in phases 3 and 4 need `.dev.vars`
configured.
**Estimated effort:** ~2-3 sessions across five phases; phases 3 and 4 carry the only
production edits.

## Open risks and assumptions

- Phases 3 and 4 change behaviour users see; Phase 3 also changes a shipped union.
- The player-count guard can empty a result that today renders — intended, but it makes
  `no_match` more frequent for a model that ignores the criteria.
- Time and genre stay unenforced by choice; a complaint about a 3-hour suggestion for a
  45-minute evening is the signal to revisit.

## Success criteria (summary)

- A leak of any household field into the prompt fails the suite — including one introduced
  by a future spread in either allow-list.
- A provider answer naming games the household does not own shows a distinct error, not
  "adjust your criteria", and leaves a log line.
- A recommendation that cannot be played by the requested number of people never reaches the
  page.
