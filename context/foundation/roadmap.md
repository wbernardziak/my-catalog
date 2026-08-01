---
project: MyCatalog
version: 1
status: draft
created: 2026-07-09
updated: 2026-08-01
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

| ID   | Change ID                  | Outcome (user can …)                                            | Prerequisites | PRD refs                        | Status  |
| ---- | -------------------------- | --------------------------------------------------------------- | ------------- | ------------------------------- | ------- |
| F-01 | llm-recommendation-service | (foundation) LLM recommendation service wired with guardrails   | —             | FR-007, FR-008, NFR             | done    |
| S-01 | add-and-view-games         | add a board game with details and see it in the shared catalog  | —             | FR-001, FR-002, FR-003          | done    |
| S-02 | edit-and-archive-games     | edit a game and mark it deleted without losing history          | S-01          | FR-002                          | done    |
| S-03 | filter-catalog             | filter the catalog by genre, players, time, and status          | S-01          | FR-004                          | done    |
| S-04 | played-loan-and-preference | mark a game played, set loan status, and record a like/dislike  | S-01          | FR-003, FR-005                  | done    |
| S-05 | ai-play-recommendation     | enter play context and get AI-ranked suggestions with reasoning | F-01, S-01    | US-01, FR-007, FR-008           | done    |
| S-06 | preference-stats           | view preference statistics per household member                 | S-04          | FR-006                          | done    |
| S-07 | visual-identity-themes     | see a board-game visual identity and pick one of three themes   | S-01…S-06     | — (post-PRD-v1; NFR responsive) | planned |

## Streams

Navigation aid — groups slices that share a prerequisite chain. The canonical order is still the dependency graph below; this table is a proposed reading order across parallel paths.

| Stream | Theme                      | Chain                                      | Note                                                                                                                          |
| ------ | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A      | Catalog & collection state | `S-01` → `S-02` / `S-03` / `S-04` → `S-06` | The north-star spine; branches (edit, filter, per-member state) all run parallel off `S-01`.                                  |
| B      | AI recommendation          | `F-01` → `S-05`                            | `F-01` runs parallel with Stream A from the start; `S-05` joins Stream A at `S-01` (needs a populated catalog).               |
| C      | Presentation               | (`S-01`…`S-06`) → `S-07`                   | Cross-cutting; deliberately last so the token extraction sweeps every finished screen once instead of being redone per slice. |

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
- **Status:** done

### S-02: Edit and archive games

- **Outcome:** a household member can edit an existing game's details and mark a game as deleted, without removing it from stored history (soft delete).
- **Change ID:** edit-and-archive-games
- **PRD refs:** FR-002 (edit + mark-deleted, preserving stored history)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kept separate from S-01 so the first slice stays a clean create+list; soft-delete carries the "catalog history is not silently lost" NFR, so it is verified on its own rather than buried in initial CRUD.
- **Status:** done

### S-03: Filter the catalog

- **Outcome:** a household member can filter the board-game catalog (e.g. by genre, player count, available time, played status, loan status) to quickly find matching titles.
- **Change ID:** filter-catalog
- **PRD refs:** FR-004
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Reads the same catalog data as S-01 and can be built independently of edit/state slices; sequenced after S-01 only because it needs games to filter.
- **Status:** done

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
- **Status:** done

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
- **Status:** done

### S-06: Preference statistics per member

- **Outcome:** a household member can view preference statistics per household member (e.g. liked/disliked counts across played titles).
- **Change ID:** preference-stats
- **PRD refs:** FR-006 (nice-to-have)
- **Prerequisites:** S-04
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Lowest priority (the only nice-to-have FR); depends on the per-member preference data from S-04. Safe to defer or park if capacity runs short.
- **Status:** done

### S-07: Board-game visual identity with theme selection

- **Outcome:** a household member sees MyCatalog in a board-game visual identity instead of the starter's space theme — **Felt Table as the default** — and can switch between three built-in themes (Felt Table, Bright Shelf, Punchboard) from inside the app, with the choice persisting across visits and rendering server-side so no screen flashes the wrong theme.
- **Change ID:** visual-identity-themes
- **PRD refs:** — (no FR covers visual identity; PRD v1 is feature-complete as of S-05. Touches the NFR "works on current desktop and mobile browsers as a responsive web app" — all three themes must hold up at mobile widths.)
- **Prerequisites:** S-01…S-06 (all themed surfaces must exist before the sweep)
- **Parallel with:** — (last slice; nothing else in flight)
- **Blockers:** —
- **Themes (design decided 2026-08-01, see the identity pitch):**
  - **Felt Table (default)** — felt `#1d3b32`, card stock `#f2e9d8`, brass `#c8a24a`, walnut `#6b4a2f`, lacquer `#8c3b32`; old-style serif titles. Closest to the current dark UI, so it carries the smallest diff.
  - **Bright Shelf** — paper `#f6f4ef`, ink `#17181c`, meeple red `#c0442a`, pine `#204b45`, amber `#e8b23c`; one grotesque at two weights. The only light theme; proves the token layer actually works.
  - **Punchboard** — press black `#17171a`, chipboard `#ded0b4`, token orange `#d98324`, rust `#b04a2a`, board teal `#2e6e6b`; condensed uppercase, square corners, hard offset shadows.
- **Scope beyond colour:** retire the starter's fingerprints (`Layout.astro` default title "10x Astro Starter", `Welcome.astro` hero copy, `public/template.png`, the starter favicon); rename the `bg-cosmic` utility so the metaphor lives in the code; one SVG mark shipped as favicon + Topbar wordmark; a shared badge system where genre, played state, and loan status read through shape as well as colour (pips for player count, die for duration) across catalog, play, and stats.
- **Unknowns:**
  - Where the theme choice persists — a cookie read server-side (no migration, no flash, per-browser) vs. a Supabase profile column (syncs across devices, needs a migration + RLS). Owner: user. Blocks: no (plan on the cookie under the `low-complexity` goal; confirm during `/10x-plan`).
  - Whether Punchboard's condensed display face is self-hosted as an inlined webfont or falls back to a system condensed stack. Owner: user. Blocks: no (system stack is the safe default; the theme degrades rather than breaks).
- **Risk:** The widest-touching change so far — the blue→purple gradient and `text-purple-300` are hardcoded across ~10 files and every screen uses `bg-cosmic`. Mitigated by doing it in that order: first move colour into the token block that already exists in `src/styles/global.css` (whose `--primary`/`--accent`/`--card` set is pure grayscale and unused today), then themes two and three are data rather than code. Shipping three themes instead of one is only affordable _because_ of that extraction; if the extraction is skipped, this slice triples in cost.
- **Status:** planned

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested task title                                            | Ready for `/10x-plan` | Notes                                                          |
| ---------- | -------------------------- | --------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| F-01       | llm-recommendation-service | Wire guarded LLM recommendation service                         | yes                   | Run `/10x-plan llm-recommendation-service`; parallel with S-01 |
| S-01       | add-and-view-games         | Add and view board games (north star)                           | yes                   | Run `/10x-plan add-and-view-games`                             |
| S-02       | edit-and-archive-games     | Edit and soft-delete board games                                | no                    | Needs S-01                                                     |
| S-03       | filter-catalog             | Filter the board-game catalog                                   | no                    | Needs S-01                                                     |
| S-04       | played-loan-and-preference | Played/loan status and binary preference                        | no                    | Needs S-01                                                     |
| S-05       | ai-play-recommendation     | AI "what should we play?" recommendation with reasoning         | no                    | Needs F-01 + S-01                                              |
| S-06       | preference-stats           | Preference statistics per member                                | no                    | Needs S-04; nice-to-have                                       |
| S-07       | visual-identity-themes     | Board-game identity + three-theme selector (default Felt Table) | yes                   | Run `/10x-plan visual-identity-themes`; all prerequisites done |

## Open Roadmap Questions

(PRD `## Open Questions` is empty. Per-slice unknowns live in their slices; none block planning today.)

- **S-07 ships ahead of the PRD.** PRD v1 has no requirement covering visual identity or user-selectable themes — it was written for the MVP feature set, which closed with S-05. S-07 is recorded here as agreed scope; if more post-MVP presentation work follows, fold it into a PRD v2 rather than growing the roadmap past its source document. Owner: user. Blocks: no.

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
- **S-01: a logged-in household member can add a board game with its details (title, authors, genre, player count, average play time, loan status) and immediately see it in the shared catalog list.** — Zarchiwizowano 2026-07-10 → `context/archive/2026-07-09-add-and-view-games/`. Lekcja: —.
- **S-02: a household member can edit an existing game's details and mark a game as deleted, without removing it from stored history (soft delete).** — Zarchiwizowano 2026-07-11 → `context/archive/2026-07-10-edit-and-archive-games/`. Lekcja: —.
- **S-03: a household member can filter the board-game catalog (e.g. by genre, player count, available time, played status, loan status) to quickly find matching titles.** — Zarchiwizowano 2026-07-11 → `context/archive/2026-07-11-filter-catalog/`. Lekcja: —.
- **S-04: a household member can mark a game as played, set its loan status, and record a binary like/dislike for a played title — with played state and preference attributable to the correct member.** — Zarchiwizowano 2026-07-24 → `context/archive/2026-07-21-played-loan-and-preference/`. Lekcja: —.
- **S-06: a household member can view preference statistics per household member (e.g. liked/disliked counts across played titles).** — Zarchiwizowano 2026-07-24 → `context/archive/2026-07-24-preference-stats/`. Lekcja: —.
- **S-05: from a "What should we play?" flow, a household member enters play context (player count, available time, genre) and receives AI-ranked board-game suggestions drawn only from the household catalog, each with a short reasoning; a clear failure state if the AI is unavailable, and a "no suitable game found" state when nothing matches.** — Zarchiwizowano 2026-07-28 → `context/archive/2026-07-24-ai-play-recommendation/`. Lekcja: —.
