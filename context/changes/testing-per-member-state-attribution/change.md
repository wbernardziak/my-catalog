---
change_id: testing-per-member-state-attribution
title: "Test rollout phase 2: per-member state attribution"
status: preparing
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Phase 2 of the phased test rollout in `context/foundation/test-plan.md` (§3).

Goal: prove played state and preference stay bound to the correct household
member at both the query and the policy layer.

Risk covered: #1 — a household member's played state or like/dislike is
attributed to the other member, or one member's personal state is readable or
writable as the other's. Rated High impact × High likelihood, the highest-fear
row in the map (interview Q1 and Q3).

Layer: integration plus DB-level RLS verification against local Supabase.

Response intent (from §2 Risk Response Guidance):

- **Prove**: Member A's write to their own played/preference state never becomes
  readable or writable as Member B's, and A's read of the shared catalog returns
  A's own state rather than a merged or arbitrary row.
- **Challenge**: that "the query filters by user id" proves attribution — the
  database must deny it too, not just the application query.
- **Ground**: where household-member identity enters the request, how it reaches
  the persisted row, and whether RLS or app code is the actual authority.
- **Anti-pattern**: asserting against a mocked Supabase client that returns
  whatever the query asked for — such a test cannot fail.

Phase 1 (`context/archive/2026-09-11-testing-api-boundary-contract/`) covered the
application half of member attribution: `played` and `preference` writes take the
member id from the session, never from the request. It deliberately proved
nothing at the policy layer, and its `src/test/supabaseDouble.ts` is the exact
anti-pattern named above — the double models no rows and honours no filters. This
phase needs the real database.

Local Supabase prerequisite: `project_id` was the starter default until
2026-09-12 and collided with another repo's stack, so `supabase start` silently
reused that project's containers. It is now `my-catalog` on ports 54330-54339
(API 54331), with this repo's four migrations applied. Research should confirm
the tests will talk to that stack.
