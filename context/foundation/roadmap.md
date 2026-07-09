---
project: MyCatalog
version: 1
status: draft
created: 2026-07-09
updated: 2026-07-09
prd_version: 1
main_goal: low-complexity
top_blocker: capacity
---

# Roadmap: MyCatalog

> Derived from `context/foundation/prd.md` (v1) + auto-probed codebase.
> Edit in place; archive after full replacement.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

MyCatalog helps a two-person household manage a shared board-game collection: when shopping, lending to friends, or picking a game for a gathering, it makes it easy to see what is owned, what has been played, and what is currently loaned out. Its differentiator is AI/LLM-assisted recommendations that suggest what to play from the household's own catalog based on context (player count, play time, genre, played status, preferences). MVP scope is board games only, household-local, responsive web.

## North star

**S-01: A household member can add board games and see them in the shared catalog** — this is the smallest end-to-end flow (here "north star" = the smallest complete, user-visible slice whose successful delivery proves the product's core bet, placed as early as prerequisites allow) that proves MyCatalog is useful, because a reliable catalog is valuable on its own (the secondary success criterion) even before AI recommendations exist — matching the chosen `low-complexity` goal of shipping certain value first and deferring AI risk.

> Read as: everything else only matters once the household can trustworthily record and see its collection. AI recommendation (S-05) builds on this foundation of real catalog data.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                         | Prerequisites | PRD refs                | Status   |
| ---- | -------------------------- | ----------------------------------------------------------- | ------------- | ----------------------- | -------- |
| F-01 | llm-recommendation-service | (foundation) LLM recommendation service wired with guardrails | —             | FR-007, FR-008, NFR     | done     |
| S-01 | add-and-view-games         | add a board game with details and see it in the shared catalog | —             | FR-001, FR-002, FR-003  | ready    |
| S-02 | edit-and-archive-games     | edit a game and mark it deleted without losing history       | S-01          | FR-002                  | proposed |
| S-03 | filter-catalog             | filter the catalog by genre, players, time, and status       | S-01          | FR-004                  | proposed |
| S-04 | played-loan-and-preference | mark a game played, set loan status, and record a like/dislike | S-01          | FR-003, FR-005          | proposed |
| S-05 | ai-play-recommendation     | enter play context and get AI-ranked suggestions with reasoning | F-01, S-01    | US-01, FR-007, FR-008   | proposed |
| S-06 | preference-stats           | view preference statistics per household member              | S-04          | FR-006                  | proposed |

## Streams

Navigation aid — groups slices that share a prerequisite chain. The canonical order is still the dependency graph below; this table is a proposed reading order across parallel paths.

| Stream | Theme                    | Chain                                             | Note                                                                          |
| ------ | ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| A      | Catalog & collection state | `S-01` → `S-02` / `S-03` / `S-04` → `S-06`        | The north-star spine; branches (edit, filter, per-member state) all run parallel off `S-01`. |
| B      | AI recommendation        | `F-01` → `S-05`                                   | `F-01` runs parallel with Stream A from the start; `S-05` joins Stream A at `S-01` (needs a populated catalog). |

## Baseline

What is already in place in the codebase as of `2026-07-09` (auto-probed + user-confirmed).
Foundations below assume these are present and do NOT recreate them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui (`src/pages/`, `src/components/ui/`).
- **Backend / API:** present — Astro API routes; only auth endpoints exist so far (`src/pages/api/auth/*`). No domain/catalog APIs yet.
- **Data:** partial — Supabase client + CLI configured (`supabase/config.toml`, `@supabase/ssr`), but no migrations and no schema (`supabase/migrations/` absent). Each catalog slice adds its own migration.
- **Auth:** present — full email/password flow (`src/lib/supabase.ts`, `src/middleware.ts`, signin/signup/signout endpoints + pages, protected-route redirects). Satisfies FR-001; catalog slices reuse it and gate their routes.
- **Deploy / infra:** present — Cloudflare Workers (`@astrojs/cloudflare`, wrangler), CI (`.github/workflows/ci.yml`), deploy complete.
- **Observability:** absent — no error-tracking or logging library. Not required by any must-have FR; left out under the `low-complexity` goal.

## Foundations

### F-01: LLM recommendation service integration

- **Outcome:** (foundation) a server-side LLM recommendation service is wired — provider client + secret/key management via the existing Cloudflare env, plus the prompt/response contract that constrains suggestions to eligible catalog games and enforces the NFR guardrails (minimum household data in the prompt, clear failure state on invalid/unavailable response, results within 5s).
- **Change ID:** llm-recommendation-service
- **PRD refs:** FR-007, FR-008, NFR (5s latency, minimum-data prompts, explicit AI failure state)
- **Unlocks:** S-05 (AI play recommendation) — S-05 cannot be safely planned or verified until the provider contract and failure-state behavior exist; this foundation also carries the NFR guardrails so they are not reinvented per slice.
- **Prerequisites:** — (deploy/secrets baseline present)
- **Parallel with:** S-01 (both depend only on baseline)
- **Blockers:** —
- **Unknowns:**
  - Which LLM provider/model? (tech-stack declares `has_ai: true` but no SDK is installed) — Owner: user. Blocks: no (provider/library choice is `/10x-plan`'s job; obtaining an API key is self-serve).
- **Risk:** Sequenced early and in parallel so the differentiator's integration risk is retired before S-05; kept thin (a guarded contract, not a recommendation UX) so it does not become "build the whole AI layer" ahead of a user-facing slice.
- **Status:** done

## Slices

### S-01: Add and view board games

- **Outcome:** a logged-in household member can add a board game with its details (title, authors, genre, player count, average play time, loan status) and immediately see it in the shared catalog list.
- **Change ID:** add-and-view-games
- **PRD refs:** FR-001 (login-gated), FR-002 (add), FR-003 (game-level fields), Success Criteria (secondary: reliably see owned games)
- **Prerequisites:** — (baseline auth present)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The north star and the schema/RLS seed for every later slice; sequenced first because a populated catalog is a prerequisite for edit, filter, per-member state, and recommendation. Establishes the shared-catalog access pattern (all authenticated members share the catalog) that the rest of the roadmap reads.
- **Status:** ready

### S-02: Edit and archive games

- **Outcome:** a household member can edit an existing game's details and mark a game as deleted, without removing it from stored history (soft delete).
- **Change ID:** edit-and-archive-games
- **PRD refs:** FR-002 (edit + mark-deleted, preserving stored history)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kept separate from S-01 so the first slice stays a clean create+list; soft-delete carries the "catalog history is not silently lost" NFR, so it is verified on its own rather than buried in initial CRUD.
- **Status:** proposed

### S-03: Filter the catalog

- **Outcome:** a household member can filter the board-game catalog (e.g. by genre, player count, available time, played status, loan status) to quickly find matching titles.
- **Change ID:** filter-catalog
- **PRD refs:** FR-004
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Reads the same catalog data as S-01 and can be built independently of edit/state slices; sequenced after S-01 only because it needs games to filter.
- **Status:** proposed

### S-04: Played status, loan, and personal preference

- **Outcome:** a household member can mark a game as played, set its loan status, and record a binary like/dislike for a played title — with played state and preference attributable to the correct member.
- **Change ID:** played-loan-and-preference
- **PRD refs:** FR-003 (played status), FR-005 (binary preference for played titles)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Is played status per-member or catalog-level? PRD persona says "each person may have a different usage state," so this slice models it per member — Owner: user. Blocks: no (planning can proceed on the per-member default; confirm during `/10x-plan`).
- **Risk:** Introduces per-member state with RLS attribution (the one layer worth care under this goal); sequenced after S-01 because it annotates existing catalog games. Feeds richer recommendations in S-05 but is not a hard prerequisite for it.
- **Status:** proposed

### S-05: AI play recommendation with reasoning

- **Outcome:** from a "What should we play?" flow, a household member enters play context (player count, available time, genre) and receives AI-ranked board-game suggestions drawn only from the household catalog, each with a short reasoning; a clear failure state if the AI is unavailable, and a "no suitable game found" state when nothing matches.
- **Change ID:** ai-play-recommendation
- **PRD refs:** US-01, FR-007, FR-008
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-03, S-04 (once F-01 and S-01 are done)
- **Blockers:** —
- **Unknowns:**
  - How should ties be broken among close matches (player count → genre → time → member preference per Business Logic) before the LLM ranks? — Owner: user. Blocks: no (Business Logic defines the order; `/10x-plan` designs the implementation).
- **Risk:** The differentiator, but deliberately sequenced after the catalog north star per the `low-complexity` goal so it recommends over real data. Consumes S-04 preference/played data when present but degrades gracefully without it ("when those values exist").
- **Status:** proposed

### S-06: Preference statistics per member

- **Outcome:** a household member can view preference statistics per household member (e.g. liked/disliked counts across played titles).
- **Change ID:** preference-stats
- **PRD refs:** FR-006 (nice-to-have)
- **Prerequisites:** S-04
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Lowest priority (the only nice-to-have FR); depends on the per-member preference data from S-04. Safe to defer or park if capacity runs short.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested task title                                  | Ready for `/10x-plan` | Notes                                   |
| ---------- | -------------------------- | ----------------------------------------------------- | --------------------- | --------------------------------------- |
| F-01       | llm-recommendation-service | Wire guarded LLM recommendation service               | yes                   | Run `/10x-plan llm-recommendation-service`; parallel with S-01 |
| S-01       | add-and-view-games         | Add and view board games (north star)                 | yes                   | Run `/10x-plan add-and-view-games`      |
| S-02       | edit-and-archive-games     | Edit and soft-delete board games                      | no                    | Needs S-01                              |
| S-03       | filter-catalog             | Filter the board-game catalog                         | no                    | Needs S-01                              |
| S-04       | played-loan-and-preference | Played/loan status and binary preference              | no                    | Needs S-01                              |
| S-05       | ai-play-recommendation     | AI "what should we play?" recommendation with reasoning | no                  | Needs F-01 + S-01                       |
| S-06       | preference-stats           | Preference statistics per member                      | no                    | Needs S-04; nice-to-have                |

## Open Roadmap Questions

(No cross-cutting open questions — PRD `## Open Questions` is empty. Per-slice unknowns live in their slices; none block planning today.)

## Parked

- **Preference statistics per member (FR-006)** — Why parked-adjacent: nice-to-have; kept as S-06 but lowest priority under the `low-complexity` goal and `capacity` blocker — defer if evening hours run short.
- **Books and console games** — Why parked: PRD §Non-Goals; MVP is board games only.
- **Internet lookup for board-game metadata** — Why parked: PRD §Non-Goals.
- **Native mobile app** — Why parked: PRD §Non-Goals; responsive web only.
- **Borrower-name / detailed loan tracking** — Why parked: PRD §Non-Goals; loan status exists without borrower details.
- **Cross-household recommendation learning** — Why parked: PRD §Non-Goals; recommendations stay household-local in MVP.

## Done

(Empty at first generation. `/10x-archive` adds an entry here — and flips that slice's `Status` to `done` — when a change whose `Change ID` matches a roadmap slice is archived.)

- **F-01: (foundation) a server-side LLM recommendation service is wired — provider client + secret/key management via the existing Cloudflare env, plus the prompt/response contract that constrains suggestions to eligible catalog games and enforces the NFR guardrails (minimum household data in the prompt, clear failure state on invalid/unavailable response, results within 5s).** — Zarchiwizowano 2026-07-09 → `context/archive/2026-07-09-llm-recommendation-service/`. Lekcja: —.
