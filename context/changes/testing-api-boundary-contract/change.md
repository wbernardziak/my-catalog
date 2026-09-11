---
change_id: testing-api-boundary-contract
title: "Test rollout phase 1: API boundary contract"
status: preparing
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Phase 1 of the phased test rollout in `context/foundation/test-plan.md` (§3).

Goal: prove every endpoint denies unauthenticated and non-owning callers and
rejects invalid input without persisting a side effect.

Risks covered: #2 (unauthenticated or non-owning request reaches a catalog or
per-member-state endpoint) and #4 (malformed / wrong-typed / out-of-range input
accepted at an API boundary).

Layer: integration at the route handlers — the cheapest layer for these risks,
and it establishes the request-level harness phases 2–4 reuse.

Watch the anti-patterns named in the test plan's risk-response table: testing
only the 200 path with a stubbed session, treating a redirect as proof of
denial, and asserting a zod schema back at itself instead of driving a request
through the boundary.
