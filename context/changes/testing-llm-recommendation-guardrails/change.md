---
change_id: testing-llm-recommendation-guardrails
title: "Test rollout phase 4: LLM recommendation guardrails"
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Phase 4 of the phased test rollout in `context/foundation/test-plan.md` (§3).

Goal: prove recommendations stay inside the eligible catalog, fail visibly, and
send only minimal data under adversarial provider responses.

Risks covered:

- #3 — a recommendation names a board game the household does not own, or one
  currently loaned out, presented as a confident suggestion (High × Medium;
  PRD US-01, PRD FR-007, interview Q1).
- #5 — the AI service is unavailable or returns an invalid response, and the
  user sees an empty or fabricated recommendation instead of a clear failure
  state (High × Medium; PRD §NFR, roadmap F-01 guardrails).
- #7 — the recommendation prompt, an error body, or the client bundle carries
  more household data — or a provider secret — than the request needs
  (High × Low; PRD §NFR).

Test type per the plan: contract tests with a stubbed provider — adversarial
responses (hallucinated title, ineligible game, malformed JSON with 200,
timeout) plus a minimal prompt-payload assertion. Deterministic and independent
of the Docker/Supabase `db` project, so it belongs in the `unit` vitest project.

Open questions for research: no HTTP-mocking layer is installed yet (§4 lists
"none yet — see §3 Phase 4"), and cookbook §6.5 is still TBD — decide whether a
provider stub at the service seam is enough or MSW is warranted.
