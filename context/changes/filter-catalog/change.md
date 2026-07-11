---
change_id: filter-catalog
title: Filter the board-game catalog
status: implementing
created: 2026-07-11
updated: 2026-07-11
roadmap_ref: S-03
---

# Filter the board-game catalog

Slice S-03 from `context/foundation/roadmap.md`. A household member can filter the
shared catalog to quickly find matching titles, satisfying FR-004.

Filtering is server-side via URL query params: `catalog.astro` re-queries the DB per
request and re-renders the server-side list, matching the SSR-first architecture and
the existing `searchParams` pattern already in the page. Filters are bookmarkable and
survive add/edit/delete redirects.

Scope is the columns that exist today — **genre** (dropdown of distinct live genres),
**player count** (a party of N fits the game's min–max range), **max play time**
(`avg_play_minutes ≤ X`), and **loan status** (available/loaned). Played status is
deferred to when S-04 lands its column; no migration ships in this slice.

PRD refs: FR-004 (household member can filter the board game catalog).
