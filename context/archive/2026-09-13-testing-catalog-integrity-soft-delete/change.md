---
change_id: testing-catalog-integrity-soft-delete
title: "Test rollout phase 3: catalog integrity under soft-delete"
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T16:49:06Z
---

## Notes

Phase 3 of the phased test rollout in `context/foundation/test-plan.md` (§3).

Goal: prove deleted games leave every read path but stay in storage, and filter
composition never drops live games.

Risk covered: #6 — soft-delete composes wrongly with catalog reads: deleted
games leak back into the catalog, or live games vanish from a filtered view.
Rated High impact × Medium likelihood (PRD FR-002; PRD §NFR "catalog changes are
not silently lost"; interview Q1).

Layer: integration over the query layer plus one endpoint-level check.

Response intent (from §2 Risk Response Guidance):

- **Prove**: A soft-deleted game is absent from every catalog read path,
  including each filter combination, yet still retrievable from storage; a live
  game is never dropped by filter composition.
- **Challenge**: that excluding deleted rows in one query proves it everywhere;
  that "it disappeared from the list" is the same as "it was deleted".
- **Ground**: every read path that composes the deleted-row condition with
  filters, and the layer at which that condition is applied.
- **Anti-pattern**: happy-path filter tests that never assert the deleted/live
  boundary; snapshotting a result list.

Phase 2 (`context/archive/2026-09-12-testing-per-member-state-attribution/`) built
the real local Supabase harness this phase reuses. Per the §3 order rationale,
phase 3 also has partial existing coverage already, so the marginal signal is
lower — research should establish what the existing catalog and filter tests do
and do not assert before the plan adds more.

Prior art to read: archive `2026-07-10-edit-and-archive-games/plan.md` (where
soft-delete was introduced) and `2026-07-11-filter-catalog/plan.md` (where the
filter composition landed).
