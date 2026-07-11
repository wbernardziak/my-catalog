# Filter the board-game catalog — Plan Brief

> Full plan: `context/changes/filter-catalog/plan.md`

## What and why

Give a household member the ability to filter the shared catalog to quickly find the
right title (FR-004, roadmap slice S-03). Today the catalog only lists everything newest-
first; as the collection grows, "we're 4 people with 45 minutes — what can we play?"
takes too much scanning.

## Starting point

The catalog page (`src/pages/catalog.astro`) is fully server-rendered: it calls
`listGames()` and renders each row as a card. It already reads a URL query param
(`?error=`), and `listGames` is a single unfiltered query. All the columns worth
filtering on — genre, min/max players, average play minutes, loan status — already exist
in the `games` table. No `played` column exists yet (that's the separate S-04 slice).

## Desired end state

A member sets any mix of four filters in a form above the list, clicks Apply, and sees
only matching games. Filters live in the URL (bookmarkable, forgiving of junk input), a
Clear link resets, and over-filtering shows a distinct "No games match your filters"
message rather than the empty-catalog one.

## Key decisions made

| Decision            | Choice                                   | Why (1 sentence)                                                        | Source |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Where filtering runs | Server-side via URL query params         | Matches the SSR-first architecture and the existing `searchParams` pattern; keeps the list server-rendered and bookmarkable. | Plan   |
| Filter scope        | Existing columns only (genre, players, time, loan) | Ships all of FR-004's value now with no dependency on the unfinished S-04 played column. | Plan   |
| Genre input         | Dropdown of distinct live genres         | Genre is free text; a self-populating dropdown avoids typos and only offers matchable values. | Plan   |
| Player-count match  | Single "party of N" fits `min ≤ N ≤ max` | Directly answers the everyday "we are N tonight" question with one input. | Plan   |
| Play-time match     | Single "up to X minutes" (`avg ≤ X`)     | Maps to "we have ~45 min, what fits?"; one input.                      | Plan   |
| Form behavior       | Plain GET form + Apply/Clear, above list | Pure HTML, no React island — fully matches the SSR-first convention.    | Plan   |
| Bad params          | Validate per-field, silently drop invalid | A stale or hand-edited URL never errors the page; mirrors the create endpoint's zod approach. | Plan   |
| Empty state         | Distinct "no matches" + Clear link       | Distinguishes over-filtered from truly-empty; gives a one-click escape. | Plan   |

## Scope

**In scope:** filter by genre, player count, max play time, loan status; genre dropdown;
distinct empty state; forgiving param validation.

**Out of scope:** played-status filter (needs S-04), migrations/indexes, sorting,
text search, saved views, filter chips, client-side/instant filtering, preserving filters
across add/edit/delete redirects.

## Architecture / approach

Two seams. **Service layer:** an exported pure `parseGameFilters(searchParams)` (zod,
drops invalid), a filter-aware `listGames(supabase, filters?)` that conditionally chains
`.eq/.lte/.gte` constraints (AND), and a `listGenres()` for the dropdown. **Page layer:**
a server-rendered `CatalogFilters.astro` GET form whose input `name`s match the parser
keys, wired into `catalog.astro`, which branches the empty state on whether filters are
active. No React island, no schema change.

## Phases at a glance

| Phase                          | Delivers                                              | Key risk                                             |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| 1. Service + query layer       | `parseGameFilters`, filter-aware `listGames`, `listGenres`, unit tests | Getting param-key ↔ form-name contract and range predicate right |
| 2. Filter UI + catalog wiring  | `CatalogFilters.astro` form, page wiring, split empty states | Form value persistence + distinct empty-state UX     |

**Prerequisites:** S-01 (catalog) done — present. No new access, no migration.
**Estimated effort:** ~1–2 short sessions across 2 phases.

## Open risks and assumptions

- Filters are lost on add/edit/delete redirects (those go to plain `/catalog`) — accepted
  as out of scope; re-applying after a mutation can come later if it annoys in practice.
- Genre dropdown omits genres with no live games — intended (they'd match nothing).
- The `played` filter from the roadmap's wording is deliberately deferred to S-04.

## Success criteria (summary)

- A member can narrow the catalog by any combination of genre, player count, max time,
  and loan status, and see only matching games.
- Over-filtering shows a clear "no matches" state with a one-click Clear.
- Hand-edited/garbage URL params never break the page — invalid ones are ignored.
