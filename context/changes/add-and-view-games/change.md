---
change_id: add-and-view-games
title: Add and view board games
status: implemented
created: 2026-07-09
updated: 2026-07-10
roadmap_ref: S-01
---

# Add and view board games

North-star slice S-01 from `context/foundation/roadmap.md`. A logged-in household
member can add a board game with its details (title, authors, genre, player-count
range, average play time, loan status) and immediately see it in the shared catalog.

This is the schema/RLS seed for every later catalog slice (edit/soft-delete, filter,
per-member played/preference, AI recommendation). It creates the first Supabase
migration and establishes the shared-catalog access pattern: all authenticated
household members read and write every game in one shared catalog.

PRD refs: FR-001 (login-gated), FR-002 (add), FR-003 (game-level fields),
Success Criteria (secondary: reliably see owned games).
