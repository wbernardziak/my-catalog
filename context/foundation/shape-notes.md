---
project: "MyCatalog"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
created: 2026-05-18
updated: 2026-05-18
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield"
    - topic: "pain category"
      decision: "mix of workflow friction, decision paralysis, and collection data trapped in memory"
    - topic: "primary persona scope"
      decision: "two household members with separate preferences"
    - topic: "product insight"
      decision: "MyCatalog is useful because it recommends what to play using context like player count, time, genre, played status, and ratings."
    - topic: "access control"
      decision: "Email/password login for each household member."
    - topic: "role separation"
      decision: "Equal owners; both household members can manage the catalog and use personal ratings/preferences."
    - topic: "product type"
      decision: "A website or web app."
    - topic: "target scale"
      decision: "Just me, or a handful."
    - topic: "100x scale probe"
      decision: "Maybe later; cross-household aggregate popularity could improve recommendations."
    - topic: "timing"
      decision: "No hard deadline; after-work effort."
    - topic: "non-goals"
      decision: "MVP excludes books and console games, internet metadata lookup, mobile app, borrower-name tracking, and cross-household recommendation learning."
  frs_drafted: 8
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Shape Notes

Seed idea source: `MyCatalog_ideas.md`

## Vision & Problem Statement

Mamy z zona nieuporzadkowana kolekcje ksiazek, gier planszowych oraz gier na rozne konsole. W MVP zakres zostaje zwezony do gier planszowych: podczas zakupow, pozyczania znajomym i wyboru gry na spotkanie trudno szybko sprawdzic, co juz jest w kolekcji, co zostalo zagrane, co jest pozyczone i komu.

MyCatalog ma byc uzyteczny, bo rekomenduje co zagrac na podstawie kontekstu takiego jak liczba graczy, czas gry, gatunek, status zagrania i oceny.

At 100x scale, cross-household aggregate popularity could improve recommendations later, but MVP recommendations remain household-local.

## User & Persona

Primary persona: dwoch domownikow wspolnie zarzadzajacych domowa kolekcja gier planszowych. Kolekcja jest wspolna, ale kazda osoba moze miec inne preferencje i inny stan uzycia dla tytulow.

## Access Control

Email/password login for each household member.

Both household members are equal owners. Each can add, modify, delete, filter, and view games in the shared catalog. Each can also keep personal usage state, ratings, and preferences for recommendation purposes.

## Success Criteria

### Primary

- A household member can log in, add board games with basic fields, mark a game as played, rate it, enter recommendation criteria, and receive suggested games from the catalog.

### Secondary

- Catalog is useful even before recommendations are perfect: the household can reliably see owned, played, and loaned board games.

### Guardrails

- Recommendation results should be understandable and include reasoning.
- Personal usage state, ratings, and preferences should remain attributable to the correct household member.

## User Stories

### US-01: Get a board game recommendation

- Given a logged-in household member and a shared catalog with at least a few board games
- When they enter recommendation criteria such as player count, available time, and genre
- Then they see suggested board games from the catalog

#### Acceptance Criteria

- Recommendations only use board games from the household catalog.
- Recommendations can account for player count, available time, genre, played status, and ratings when those values exist.
- If no game matches the criteria, the user sees that no suitable game was found.

## Functional Requirements

- FR-001: Household member can create an account and log in with email/password. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.
- FR-002: Household member can add, edit, and mark board games as deleted in the shared catalog without removing them from stored history. Priority: must-have
  > Socrates: Counter-argument considered: deleting games risks losing catalog history. Resolution: revised to mark as deleted instead of removing from storage.
- FR-003: Household member can store board game details: title, authors, genre, player count, average play time, played status, and loan status. Priority: must-have
  > Socrates: Counter-argument considered: borrower tracking can wait. Resolution: borrower name/details removed from MVP requirement.
- FR-004: Household member can filter the board game catalog. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.
- FR-005: Household member can record a binary preference for played titles. Priority: must-have
  > Socrates: Counter-argument considered: binary liked/disliked is enough. Resolution: revised from 1-5 rating to binary preference.
- FR-006: Household member can view preference statistics per household member. Priority: nice-to-have
  > Socrates: Counter-argument considered: ratings already capture preferences. Resolution: kept as nice-to-have, not required for MVP proof.
- FR-007: Household member can request board game recommendations using criteria like player count, available time, and genre. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.
- FR-008: Household member can see reasoning for a recommendation. Priority: nice-to-have
  > Socrates: Counter-argument considered: reasoning can wait because it is nice-to-have. Resolution: kept as nice-to-have.

## Business Logic

MyCatalog recommends board games by matching the current play context against catalog metadata and each household member's recorded preferences.

The rule uses player count first, then genre, then available time, then household member preferences.

The user receives ranked board game suggestions.

The user encounters this rule from a "What should we play?" flow after entering recommendation criteria.

## Non-Functional Requirements

- Recommendation results appear within 5 seconds for a normal household catalog.
- Personal preferences are visible only to logged-in household members.
- The app works on current desktop and mobile browsers as a responsive web app.
- Catalog changes are not silently lost; after saving, the user can verify the updated board game immediately.

## Non-Goals

- No books or console games in MVP; board games only.
- No internet lookup for board game metadata.
- No mobile app; responsive web only.
- No borrower-name tracking in MVP; loan status may exist without detailed borrower management.
- No cross-household recommendation learning in MVP.

## Quality cross-check

- Access Control: present.
- Business Logic: present.
- Project artifacts: present.
- Timeline-cost acknowledgement: present; MVP is scoped to 3 weeks.
- Non-Goals: present.
- Preserved behavior: not applicable for greenfield.
