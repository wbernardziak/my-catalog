---
change_id: edit-and-archive-games
title: Edit and archive board games
status: implementing
created: 2026-07-10
updated: 2026-07-10
roadmap_ref: S-02
---

# Edit and archive board games

Slice S-02 from `context/foundation/roadmap.md`. A household member can edit an
existing board game's details and mark a game as deleted **without removing it from
stored history** (soft delete), building on the shared catalog seeded by S-01.

Edit happens inline on each game card via a `GameForm` shared with the add flow.
Delete is a two-step inline confirm that soft-deletes the row (`deleted_at`), after
which the game is hidden everywhere — history is preserved in the database, and no
restore UI ships in this slice.

PRD refs: FR-002 (add, edit, and mark board games as deleted without removing them
from stored history).
