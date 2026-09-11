---
change_id: testing-api-boundary-contract
title: "Test rollout phase 1: API boundary contract"
status: implemented
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Phase 1 of the phased test rollout in `context/foundation/test-plan.md` (§3).

Goal: prove every endpoint denies an unauthenticated caller on its own, binds
every per-member write to the session's member id, and rejects invalid input
without persisting a side effect.

Risks covered: #2 (a handler's own session guard is the only gate on `/api/*`,
hand-copied seven times) and #4 (malformed / wrong-typed / out-of-range input
accepted at an API boundary). Risk #2 was amended in the test plan on
2026-09-11 after research — see research.md.

Layer: integration at the route handlers — the cheapest layer for these risks,
and it establishes the request-level harness phases 2–4 reuse.

Watch the anti-patterns named in the test plan's risk-response table: testing
only the 200 path with a stubbed session, treating a redirect as proof of
denial, and asserting a zod schema back at itself instead of driving a request
through the boundary.
