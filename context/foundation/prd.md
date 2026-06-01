---
project: "MyCatalog"
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# MyCatalog PRD

## Vision & Problem Statement

My wife and I have an unorganized collection of books, board games, and games for various consoles. For the MVP, the scope is narrowed to board games: when shopping, lending games to friends, or choosing a game for a gathering, it is difficult to quickly check what is already in the collection, what has been played, what is currently loaned out, and to whom.

MyCatalog should be useful because it uses AI/LLM-assisted recommendations to suggest what to play based on context such as player count, play time, genre, played status, and ratings.

At 100x scale, cross-household aggregate popularity could improve recommendations later, but MVP recommendations remain household-local.

## User & Persona

Primary persona: two household members jointly managing a home board game collection. The collection is shared, but each person may have different preferences and a different usage state for each title.

## Success Criteria

### Primary

- A household member can log in, add board games with basic fields, mark a game as played, rate it, enter recommendation criteria, and receive AI-assisted suggested games from the catalog.

### Secondary

- Catalog is useful even before recommendations are perfect: the household can reliably see owned, played, and loaned board games.

### Guardrails

- Recommendation results should be understandable and include reasoning.
- Personal usage state, ratings, and preferences should remain attributable to the correct household member.

## User Stories

### US-01: Get a board game recommendation

- **Given** a logged-in household member and a shared catalog with at least a few board games
- **When** they enter recommendation criteria such as player count, available time, and genre
- **Then** they see AI-assisted suggested board games from the catalog

#### Acceptance Criteria

- Recommendations only use board games from the household catalog.
- Recommendations can account for player count, available time, genre, played status, and ratings when those values exist.
- Recommendations may use an LLM to rank matching games and explain the result, but the LLM must not suggest games outside the household catalog.
- If no game matches the criteria, the user sees that no suitable game was found.

## Functional Requirements

### Account & Access

- FR-001: Household member can create an account and log in with email/password. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.

### Catalog Management

- FR-002: Household member can add, edit, and mark board games as deleted in the shared catalog without removing them from stored history. Priority: must-have
  > Socrates: Counter-argument considered: deleting games risks losing catalog history. Resolution: revised to mark as deleted instead of removing from storage.
- FR-003: Household member can store board game details: title, authors, genre, player count, average play time, played status, and loan status. Priority: must-have
  > Socrates: Counter-argument considered: borrower tracking can wait. Resolution: borrower name/details removed from MVP requirement.
- FR-004: Household member can filter the board game catalog. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.

### Preferences & Recommendations

- FR-005: Household member can record a binary preference for played titles. Priority: must-have
  > Socrates: Counter-argument considered: binary liked/disliked is enough. Resolution: revised from 1-5 rating to binary preference.
- FR-006: Household member can view preference statistics per household member. Priority: nice-to-have
  > Socrates: Counter-argument considered: ratings already capture preferences. Resolution: kept as nice-to-have, not required for MVP proof.
- FR-007: Household member can request AI/LLM-assisted board game recommendations using criteria like player count, available time, and genre. Priority: must-have
  > Socrates: Counter-argument considered: deterministic filtering may be simpler for MVP. Resolution: kept AI-assisted recommendation as must-have because recommendation quality is the product's differentiator.
- FR-008: Household member can see LLM-generated reasoning for a recommendation. Priority: must-have
  > Socrates: Counter-argument considered: reasoning can wait because it is nice-to-have. Resolution: revised to must-have because AI recommendations need understandable justification.

## Non-Functional Requirements

- Recommendation results appear within 5 seconds for a normal household catalog.
- AI recommendation prompts must only include the minimum household catalog and preference data needed to answer the request.
- If the AI service is unavailable or returns an invalid response, the user sees a clear failure state instead of a silent or fabricated recommendation.
- Personal preferences are visible only to logged-in household members.
- The app works on current desktop and mobile browsers as a responsive web app.
- Catalog changes are not silently lost; after saving, the user can verify the updated board game immediately.

## Business Logic

MyCatalog recommends board games by matching the current play context against catalog metadata and each household member's recorded preferences, then using an LLM to rank and explain the best options.

The rule uses player count first, then genre, then available time, then household member preferences. The LLM may help rank close matches and produce human-readable reasoning, but it must only choose from eligible games supplied by the app.

The user receives ranked board game suggestions with a short explanation.

The user encounters this rule from a "What should we play?" flow after entering recommendation criteria.

## Access Control

Email/password login for each household member.

Both household members are equal owners. Each can add, modify, delete, filter, and view games in the shared catalog. Each can also keep personal usage state, ratings, and preferences for recommendation purposes.

## Non-Goals

- No books or console games in MVP; board games only.
- No internet lookup for board game metadata.
- No mobile app; responsive web only.
- No borrower-name tracking in MVP; loan status may exist without detailed borrower management.
- No cross-household recommendation learning in MVP.

## Open Questions

No open questions.
