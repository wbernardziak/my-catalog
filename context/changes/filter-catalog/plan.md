# Filter the board-game catalog — Implementation Plan

## Overview

Give a household member the ability to filter the shared catalog to quickly find
matching titles (FR-004, roadmap slice S-03). Filtering is **server-side via URL
query params**: `catalog.astro` parses the active filters from `Astro.url`,
re-queries the DB, and re-renders the server-side list. A plain server-rendered
`<form method="GET">` above the list holds four controls — genre, player count,
max play time, loan status — with an Apply button and a Clear link.

## Current state analysis

- `src/pages/catalog.astro` is fully server-rendered: it calls `listGames(supabase)`
  and maps each row to a `<GameCard client:load>` island. It **already reads a query
  param** (`Astro.url.searchParams.get("error")`, `catalog.astro:9`), so the URL-param
  pattern is established.
- `src/lib/services/games.ts` — `listGames` is a single unfiltered query:
  `.is("deleted_at", null).order("created_at", { ascending: false })`. No filter args.
- Schema (`supabase/migrations/20260710120000_create_games.sql` +
  `20260710193510_add_games_deleted_at.sql`) exposes these filterable columns:
  `genre text` (free text), `min_players int`, `max_players int`,
  `avg_play_minutes int`, `loan_status text` (`available`|`loaned`), `deleted_at`.
- **`played` status does not exist yet** — it is owned by the still-`proposed` S-04
  slice. It is therefore out of scope here (see "What we are NOT doing").
- Tests: vitest via `npm test`. The pattern (`src/pages/api/games/index.test.ts`)
  exercises exported pure functions/zod schemas directly — no Supabase client is
  mocked. The filter parser must follow this: a pure, exported, unit-testable function.
- Target scale is `small` (household); row counts are tiny, so query performance and
  indexing are non-concerns.

## Desired end state

A logged-in member visits `/catalog`, sets any combination of the four filters, clicks
**Apply**, and the list re-renders showing only games where every active filter matches
(AND semantics). The active filter values are reflected in the URL (bookmarkable and
shareable). Add/edit/delete flows redirect to plain `/catalog`, so those mutations clear
any active filters — filters are not preserved across them, an acceptable behavior for
this slice (see "What we are NOT doing"). **Clear** returns to the unfiltered catalog. When filters match nothing, a distinct "No games match your
filters" state with a Clear link appears — separate from the pre-existing "No games yet"
empty state. Hand-edited or malformed params never error the page: each is validated and
silently dropped, and only the valid ones apply.

### Key discoveries:

- `catalog.astro:9` already reads `searchParams` — the URL-param approach extends an
  existing pattern rather than introducing a new one.
- `games.ts:22` `listGames` is the single list query; extending it (optional filter arg)
  keeps one code path for both filtered and unfiltered listing.
- `index.test.ts` shows the house testing style: unit-test the exported zod schema /
  pure function, not the DB call. The filter parser mirrors `newGameSchema`.
- `genre` is free text with no enum, so the dropdown must be populated from a distinct
  query over live rows (`listGenres`), not a static list.

## What we are NOT doing

- **No `played` filter** — the column belongs to S-04 (`played-loan-and-preference`),
  which is not built. When S-04 lands, a played filter can be added to the same schema.
- **No migration** — all filtered columns already exist; no new index (household scale).
- **No sorting, full-text search, saved filter views, or filter pills/chips UI.**
- **No client-side/instant filtering** — filtering is a server round-trip on Apply.
- **No preservation of filters across add/edit/delete redirects** — those existing flows
  redirect to plain `/catalog`; re-applying filters after a mutation is out of scope.
- **No range inputs** — player count is a single "party of N"; play time is a single
  "up to X minutes"; both are deliberately single-value.

## Implementation approach

Two phases. Phase 1 puts all logic behind pure, testable seams: an exported
`parseGameFilters(searchParams)` zod-based parser and a filter-aware `listGames`, plus a
`listGenres` helper for the dropdown. Phase 2 wires the server-rendered filter form and
the catalog page, and splits the empty states. The list stays server-rendered; the filter
form is a plain Astro `<form method="GET">` — no new React island.

## Phase 1: Filtering in the service + query layer

### Overview

Introduce the typed filter contract, a forgiving URL-param parser, filter-aware listing,
and the distinct-genres query — everything the page needs, unit-tested in isolation.

### Changes required:

#### 1. Filter contract type

**File**: `src/types.ts`

**Purpose**: Add a `GameFilters` type describing the four optional, already-validated
filter values the list query and the form both speak.

**Contract**: `export interface GameFilters { genre?: string; players?: number;
maxMinutes?: number; loanStatus?: LoanStatus }`. All fields optional; an absent field
means "no constraint on this dimension". Reuses the existing `LoanStatus` union.

#### 2. Forgiving filter parser

**File**: `src/lib/services/gameFilters.ts` (new)

**Purpose**: Turn a `URLSearchParams` (from `Astro.url.searchParams`) into a `GameFilters`,
silently dropping any param that is missing, malformed, or out of range — so a stale or
hand-edited URL never errors the page (matches the create endpoint's zod approach).

**Contract**: `export function parseGameFilters(params: URLSearchParams): GameFilters`.
Backed by a zod schema over raw string inputs, each field wrapped so a parse failure
yields "field omitted" rather than a thrown error (e.g. `.catch(undefined)` per field,
or per-field `safeParse`). Rules: `genre` → non-empty trimmed string else dropped;
`players` → coerced positive int (1–99) else dropped; `maxMinutes` → coerced positive int
(1–6000, mirroring `newGameSchema`'s bounds) else dropped; `loanStatus` → `available` |
`loaned` else dropped. Query-param key names (`genre`, `players`, `maxMinutes`,
`loan`) are the canonical contract the form's input `name`s in Phase 2 must match.

#### 3. Player-count / play-time predicate note

**File**: `src/lib/services/games.ts`

**Purpose**: Define the matching semantics used by the query so the intent is
unambiguous. A `players` value N matches a game when `min_players ≤ N ≤ max_players`
(a party of N fits the game). `maxMinutes` value X matches when `avg_play_minutes ≤ X`.
`genre` and `loanStatus` are exact equality.

**Contract**: no separate export — documented at the `listGames` call site; encoded
directly in the query builder in change #4.

#### 4. Filter-aware `listGames`

**File**: `src/lib/services/games.ts`

**Purpose**: Accept an optional `GameFilters` and apply each present filter as an
additional constraint on the existing live-catalog query, preserving the current
`deleted_at is null` + `created_at desc` behavior when no filters are passed (existing
callers keep working).

**Contract**: `listGames(supabase, filters?: GameFilters): Promise<GameRow[]>`. Build on
the current query object and conditionally chain: `genre` → `.eq("genre", genre)`;
`players` → `.lte("min_players", players).gte("max_players", players)`; `maxMinutes` →
`.lte("avg_play_minutes", maxMinutes)`; `loanStatus` → `.eq("loan_status", loanStatus)`.
Absent fields add no constraint. All present filters combine as AND (chained `.eq/.lte/
.gte` on one PostgREST query is AND by construction).

#### 5. Distinct live genres for the dropdown

**File**: `src/lib/services/games.ts`

**Purpose**: Provide the set of genres actually present in the live catalog, so the genre
dropdown self-populates and can only offer values that can match something.

**Contract**: `listGenres(supabase): Promise<string[]>`. Select `genre` where
`deleted_at is null`, dedupe by **exact stored value** (case-sensitive) and sort
case-insensitively **for display only** — so every returned option value matches the
case-sensitive `.eq("genre", …)` query in change #4 (a case-insensitive dedup would
collapse "Strategy"/"strategy" into one option that hides the other casing's rows).
Household-scale data makes a client-side distinct trivial; avoids a Postgres `distinct`
RPC. Throws on DB error, like `listGames`.

### Success criteria:

#### Automated verification:

- [ ] Type-checking passes: `npm run build` (Astro's build runs `astro check`-level TS)
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm test`
- [ ] New tests cover `parseGameFilters`: all-valid params → full `GameFilters`; each
      malformed/out-of-range param individually dropped while valid siblings survive;
      empty `URLSearchParams` → `{}`; whitespace-only genre dropped.

#### Manual verification:

- [ ] (Deferred to Phase 2 — Phase 1 has no user-visible surface; verify via tests only.)

**Implementation note**: Phase 1 is pure logic with unit coverage and no UI. Once
automated checks are green, proceed to Phase 2 without a separate manual gate.

---

## Phase 2: Filter UI + catalog wiring

### Overview

Add the server-rendered filter form and wire the catalog page to parse filters, query
with them, populate the genre dropdown, and distinguish the two empty states.

### Changes required:

#### 1. Filter form component

**File**: `src/components/catalog/CatalogFilters.astro` (new)

**Purpose**: Render a plain `<form method="GET" action="/catalog">` above the list with
four controls, an "Apply filters" submit button, and a "Clear" link to `/catalog`.
Controls preserve the currently-applied values so the form reflects the active filter
state after navigation.

**Contract**: Props: `{ genres: string[]; current: GameFilters }`. Inputs, by `name`
(must match the parser keys from Phase 1 change #2): `genre` → `<select>` with an
"All genres" empty option plus one option per `genres` entry, `selected` when it equals
`current.genre`. If `current.genre` is set but not present in `genres` (a stale or
hand-edited `?genre=` whose genre no longer has live rows), append it as an extra
`selected` option so the control reflects the active filter instead of silently falling
back to "All genres"; `players` → `<input type="number" min="1" max="99">` valued
`current.players`; `maxMinutes` → `<input type="number" min="1">` valued
`current.maxMinutes`; `loan` → `<select>` with All / Available / Loaned, `selected` per
`current.loanStatus`. Empty inputs submit as empty strings and are dropped by the parser,
so no hidden-field juggling is needed. Styled to match the existing glass-panel Tailwind
idiom used in `catalog.astro` / `GameCard`.

#### 2. Wire the catalog page

**File**: `src/pages/catalog.astro`

**Purpose**: Parse filters from the URL, fetch filtered games and the genre list, render
the filter form, and branch the empty state on whether filters are active.

**Contract**: In the frontmatter, call `parseGameFilters(Astro.url.searchParams)` →
`filters`; when `supabase` is configured, call `listGames(supabase, filters)` and
`listGenres(supabase)` (both inside the existing try/catch that sets `loadError`). Compute
`hasActiveFilters = Object.keys(filters).length > 0`. Render `<CatalogFilters
genres={genres} current={filters} />` above the games `<section>`. Replace the single
empty-state branch: when `games.length === 0`, show "No games yet…" if
`!hasActiveFilters`, else "No games match your filters." plus a Clear link to `/catalog`.
The `error` param handling and the Add-a-game sidebar are unchanged.

#### 3. Empty-state copy

**File**: `src/pages/catalog.astro`

**Purpose**: Ensure the over-filtered state is visually distinct from the truly-empty
catalog and offers a one-click escape.

**Contract**: Two message variants under the existing empty-state container styling; the
filtered variant includes an `<a href="/catalog">` "Clear filters" link. Routine markup —
no snippet needed.

### Success criteria:

#### Automated verification:

- [ ] Type-checking / build passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Formatting clean: `npm run format` leaves the new files unchanged (or run once)
- [ ] Existing tests still pass: `npm test`

#### Manual verification:

- [ ] With several games of differing genres/players/times/loan status, each filter alone
      narrows the list correctly (genre exact; players N shows only games whose range
      includes N; maxMinutes shows only games ≤ X; loan status matches).
- [ ] Combining two+ filters applies AND — only games matching all active filters show.
- [ ] The genre dropdown lists exactly the distinct genres of live games and nothing else.
- [ ] Applied filter values persist in the form and URL after Apply; Clear returns to the
      full catalog.
- [ ] Over-filtering (a combination that matches nothing) shows "No games match your
      filters" + a working Clear link — not the "No games yet" message.
- [ ] A hand-edited URL with junk params (`?players=abc&maxMinutes=-5&loan=foo`) renders
      the catalog without error, dropping the bad params.
- [ ] Filter form is usable/responsive on a narrow (mobile) viewport.

**Implementation note**: After all automated checks pass, stop for human confirmation of
the manual steps above before considering the slice done.

---

## Testing strategy

### Unit tests:

- `parseGameFilters` (new `gameFilters.test.ts`): full valid set; each param dropped in
  isolation on malformed/out-of-range input while valid siblings persist; empty params →
  `{}`; whitespace/edge values.
- Player-count / play-time boundary reasoning is exercised through the parser's range
  bounds; the DB predicate itself is not unit-tested (consistent with the codebase not
  mocking Supabase — see `createGame`/`listGames` having no query-level tests).

### Integration tests:

- None automated (matches the current codebase — no DB integration harness). Covered by
  the manual verification steps.

### Manual testing steps:

1. Seed 4–5 games spanning genres, player ranges, play times, and both loan states.
2. Apply each filter individually; confirm the narrowing per the rules above.
3. Apply a genre + players + maxMinutes combo; confirm AND behavior.
4. Force an empty result; confirm the distinct empty state + Clear.
5. Edit the URL with garbage params; confirm no error and bad params ignored.
6. Check the form on a mobile-width viewport.

## Performance considerations

None. Household-scale data (target_scale: small) means every query returns a handful of
rows; the existing partial index on live rows already covers the base scan. No new index
is warranted.

## Migration notes

No migration. All filtered columns (`genre`, `min_players`, `max_players`,
`avg_play_minutes`, `loan_status`) already exist. Because no migration ships, the
"push migrations to production" lesson does not apply to this slice.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-004)
- Existing list query: `src/lib/services/games.ts:22`
- Existing searchParams usage: `src/pages/catalog.astro:9`
- Test-style reference: `src/pages/api/games/index.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is
> completed. Do not rename step titles.

### Phase 1: Filtering in the service + query layer

#### Automated

- [x] 1.1 Type-checking passes: `npm run build` — 783c0ae
- [x] 1.2 Linting passes: `npm run lint` — 783c0ae
- [x] 1.3 Unit tests pass: `npm test` — 783c0ae
- [x] 1.4 New `parseGameFilters` tests cover valid/partial/invalid/empty cases — 783c0ae

### Phase 2: Filter UI + catalog wiring

#### Automated

- [x] 2.1 Type-checking / build passes: `npm run build` — 98e21ef
- [x] 2.2 Linting passes: `npm run lint` — 98e21ef
- [x] 2.3 Formatting clean: `npm run format` — 98e21ef
- [x] 2.4 Existing tests still pass: `npm test` — 98e21ef

#### Manual

- [x] 2.5 Each filter alone narrows the list correctly — 98e21ef
- [x] 2.6 Combining filters applies AND semantics — 98e21ef
- [x] 2.7 Genre dropdown lists exactly the live distinct genres — 98e21ef
- [x] 2.8 Filter values persist in form + URL; Clear returns to full catalog — 98e21ef
- [x] 2.9 Over-filtered state shows the distinct "no matches" message + Clear link — 98e21ef
- [x] 2.10 Junk URL params render without error and are dropped — 98e21ef
- [x] 2.11 Filter form is usable/responsive on a mobile viewport — 98e21ef
