# Follow-ups from the 2026-09-12 implementation review

Deferred findings from `../reviews/impl-review.md`. Everything else was fixed in
the review-fix commit.

## F9 — Untested authorization claims only the db suite can check

Deferred as scope growth: both are real gaps, but neither is Risk #1, which is
what phase 2 was scoped to. Worth folding into a later rollout phase or a small
change of their own.

### The `anon` role is untested

Two migrations assert the same thing in comments and nothing verifies it:

- `supabase/migrations/20260710120000_create_games.sql:29-31` — "No `anon` policy
  exists, so unauthenticated requests see nothing."
- `supabase/migrations/20260722092117_create_member_game_state.sql:47` — same claim
  for the per-member tables.

`src/pages/api/games/boundary.test.ts` proves the _application_ rejects a
sessionless request. That is a different claim from _the database_ rejecting the
`anon` role — the app guard could be removed and the database would still be the
backstop, or not, and today nobody knows which.

`anonClient()` already exists in `src/test/db/harness.ts` (unexported). One test
asserting empty reads and denied writes across `games`, `game_played` and
`game_preference` as `anon` would close the repo's largest untested authorization
claim.

### The composite FK enforcing FR-005 is untested

`game_preference` has a composite FK to `game_played (game_id, member_id)`
(`supabase/migrations/20260722143000_member_game_state_pk_and_indexes.sql:37-41`),
so a preference cannot exist without a played row. The application depends on this
being enforced by the database: `src/lib/services/memberGameState.ts:88-95` catches
SQLSTATE `23503` plus the constraint name and turns it into the user-facing "mark as
played first". `seedMemberState` exists partly to work around the constraint.

No test inserts a preference without a played row to confirm the database still
raises. If the FK were dropped, that user-facing path would go dead silently.
