---
change_id: ai-play-recommendation
title: AI play recommendation with reasoning
status: impl_reviewed
created: 2026-07-24
updated: 2026-07-26
---

## Notes

Roadmap slice S-05 (US-01, FR-007, FR-008). The product differentiator: a
"What should we play?" flow where a household member enters play context
(player count, available time, genre) and gets AI-ranked board-game suggestions
drawn only from the household catalog, each with a short reasoning — plus clear
failure and "no suitable game found" states.

Builds on F-01 (`recommend()` service, already done/archived) and S-01 (catalog).
Consumes S-04 per-member played/preference data when present, degrades gracefully
without it.

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
