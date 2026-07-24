# Preference statistics per member — Implementation Plan

## Overview

Add a read-only `/stats` page that shows **preference statistics per household member**
(roadmap slice S-06, PRD FR-006 — nice-to-have). For each member it displays three
counts — **Played**, **Liked**, **Disliked** — in a side-by-side comparison table
(rows = metrics, columns = You / Other member). The view is built entirely on the
per-member data S-04 already stores; it reads existing rows and adds no tables, no
RLS, and no migration.

## Current State Analysis

- **The data already exists and is per-member.** `game_played` and `game_preference`
  each carry `member_id` (`default auth.uid()`) and enforce that a preference implies
  a played row (composite FK). Preference is `text check in ('liked','disliked')`.
  See `supabase/migrations/20260722092117_create_member_game_state.sql`.
- **Cross-member reads are already allowed.** Both tables have `for select … using (true)`
  RLS for `authenticated` (`…_create_member_game_state.sql`:59-63, 86-90). The S-04
  plan-brief states this read-all was chosen **specifically to give S-06 its
  cross-member stats for free**. So no RLS or schema work is needed to read every
  member's counts.
- **Only the current member's identity is nameable.** Identity is `auth.uid()`. There
  is **no `profiles`/`members` table**, and the app's Supabase client is the
  anon/authenticated cookie-session client (`src/lib/supabase.ts`) — it **cannot query
  `auth.users` via PostgREST**. The current member's email is available via
  `Astro.locals.user` (used in `Topbar.astro`:11, `dashboard.astro`:14); other
  members are readable only as opaque `member_id` uuids.
- **Established patterns to follow:**
  - Services in `src/lib/services/` take a non-null Supabase client, return plain
    shapes, and throw on real DB error (`memberGameState.ts`, `catalogGames.ts`).
  - Aggregation/decision logic is a **pure, unit-tested function** fed by a thin
    DB-fetch wrapper — the `mergeAndFilterCatalog` / `listCatalogGames` seam
    (`catalogGames.ts`:28-60) and `gameFilters.ts`. Small data volume → in-memory.
  - Pages fetch server-side in frontmatter, guarded by `if (supabase && user)`, with
    a `configured` flag for the null-client case and a `loadError` fallback
    (`catalog.astro`:20-43).
  - New protected pages are added to `PROTECTED_ROUTES` in `src/middleware.ts`:4.
- **Read-all is broader than "my household".** The SELECT `using (true)` means "any
  authenticated user of this Supabase project" under the documented single-household
  assumption. That is exactly what makes the You + Other view possible today; it also
  means if the project ever served more than one household, this page would leak
  across them (already flagged in the S-04 migration comment — out of scope here).

## Desired End State

A signed-in member visits `/stats` (via a Topbar link) and sees a comparison table:
Played / Liked / Disliked counts for **You** and, when they exist, each **Other member**,
computed from live per-member rows. When no member has any played/preference data, a
friendly empty message links to `/catalog`. No write actions, no schema change.

### Key discoveries:

- Read-all RLS makes cross-member counts a plain `select` — no RPC/group-by needed
  (`…_create_member_game_state.sql`:59-63, 86-90).
- `game_preference` rows only exist for played titles (composite FK), so
  `likedCount + dislikedCount ≤ playedCount` always holds — no need to cross-check
  played when counting preferences.
- Other members cannot be named from the anon client — the "You + Other member"
  labeling (no emails for others) is a direct consequence, not a UX preference.

## What We Are NOT Doing

- **No `profiles`/`members` table, no trigger, no email resolution for other members.**
  Other members are labeled generically ("Other member").
- **No migration and no RLS changes** — the feature is pure read over existing tables.
- **No write/interaction** — no editing preferences from this page.
- **No derived metrics** (like-ratio %, catalog totals) — three raw counts only.
- **No per-genre / per-time breakdowns**, no charts — a plain counts table.
- **No change to `/catalog`, `/dashboard`, or the recommendation flow.**

## Implementation Approach

Bottom-up along the existing service seam: a **pure aggregation function**
`computeMemberStats(played, preference, currentMemberId)` that groups the two row
arrays by `member_id` and produces one `MemberStat` per member (current member first,
labeled "You"; others labeled "Other member", deterministically ordered). A thin
`listPreferenceStats(supabase, currentMemberId)` wrapper fetches all `game_played` and
`game_preference` rows (small data volume) and delegates to the pure function. The
`/stats` page renders the result through a small `PreferenceStatsTable.astro` component,
guarded exactly like `catalog.astro`. Add `/stats` to `PROTECTED_ROUTES` and a Topbar
link.

Member ordering and labeling (deterministic so table columns are stable):

1. The current member (`member_id === currentMemberId`) is always first and labeled
   **"You"** — included even if they have zero rows, so the current member always sees
   their own column.
2. Every other `member_id` appearing in any row is included, sorted by `member_id`
   string. With the documented two-person household there is exactly one; it is
   labeled **"Other member"**. If more than one ever appears, they are labeled
   "Other member", "Other member 2", … so the view degrades gracefully.

## Phase 1: Stats service + types + unit tests

### Overview

Add the `MemberStat` contract and the pure aggregation logic plus its DB wrapper, with
unit tests. No UI yet.

### Changes Required:

#### 1. `MemberStat` contract type

**File**: `src/types.ts`

**Purpose**: Declare the per-member stat shape the page and table render, alongside the
other DTOs.

**Contract**: New exported `interface MemberStat { memberId: string; isCurrent: boolean;
label: string; playedCount: number; likedCount: number; dislikedCount: number }`.
`label` is the display label ("You" / "Other member"). Add a short doc comment in the
S-06 style of the surrounding types.

#### 2. Preference-stats service (pure core + DB wrapper)

**File**: `src/lib/services/preferenceStats.ts` (new)

**Purpose**: Compute per-member Played/Liked/Disliked counts from the raw per-member
rows, and provide the thin Supabase fetch that feeds it — mirroring the
`catalogGames.ts` pure-core + wrapper split.

**Contract**:

- `computeMemberStats(played: { member_id: string }[], preference: { member_id: string;
preference: "liked" | "disliked" }[], currentMemberId: string): MemberStat[]` — pure.
  Groups both arrays by `member_id`; `playedCount` = played rows for that member,
  `likedCount`/`dislikedCount` = preference rows split by value. Always emits the
  current member first (label "You", `isCurrent: true`), even with zero counts; then
  every other member_id seen in either array, sorted by `member_id`, labeled
  "Other member" (suffix `2`, `3`, … when more than one). No Supabase import.
- `listPreferenceStats(supabase: SupabaseClient, currentMemberId: string):
Promise<MemberStat[]>` — fetches all rows: `game_played.select("member_id")` and
  `game_preference.select("member_id, preference")`, throws on either DB error (message
  style matching `memberGameState.ts`), then returns `computeMemberStats(...)`. Uses the
  same `SupabaseClient = NonNullable<ReturnType<typeof createClient>>` alias as the
  sibling services.
- `hasAnyData(stats: MemberStat[]): boolean` — pure. `true` iff at least one member has
  a non-zero count (`playedCount + likedCount + dislikedCount > 0` for some row).
  **This is the empty-state predicate the page must use — not `stats.length === 0`.**
  Because `computeMemberStats` always emits the current member as a "You" row even with
  zero counts (see the labeling rule above), the returned array is never empty, so a
  length check would render an all-zeros table instead of the friendly empty state.
  (Equivalent to "any `game_played` row exists", since a preference implies a played
  row via the composite FK — but expressed over `stats` so page and test share it.)

#### 3. Unit tests for the pure aggregation

**File**: `src/lib/services/preferenceStats.test.ts` (new)

**Purpose**: Lock the counting and ordering/labeling rules, following the existing
`catalogGames.test.ts` / `gameFilters.test.ts` style (pure function, no DB mock).

**Contract**: Cases — (a) empty input → single "You" row with all zeros; (b) current
member with played + mixed liked/disliked → correct counts; (c) a second member's rows
counted separately and labeled "Other member", with "You" always first; (d) a member
with played rows but no preferences → liked/disliked 0, played > 0; (e) ordering is
deterministic across input order; (f) >1 other member → "Other member", "Other member 2";
(g) `hasAnyData`: `false` for the empty-input result (single zero "You" row), `true` once
any member has a non-zero count.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npx vitest run src/lib/services/preferenceStats.test.ts`
- [ ] Full unit suite still green: `npm test`
- [ ] Lint (type-aware) passes: `npm run lint` — ESLint's type-checked rules are the type gate for the pure `.ts` service/test; the full `astro build` is deferred to the Phase 2 gate

#### Manual Verification:

- [ ] `computeMemberStats` output for a hand-built fixture matches expected counts and
      "You"-first ordering when eyeballed

**Implementation note**: After this phase and all automated checks pass, stop for human
confirmation before starting Phase 2. Progress checkboxes live in `## Progress` below.

---

## Phase 2: Stats page + navigation

### Overview

Render the stats through a new protected `/stats` page + table component, wire the route
guard and a nav link.

### Changes Required:

#### 1. Protected-route registration

**File**: `src/middleware.ts`

**Purpose**: Gate `/stats` behind auth like the other member-scoped pages.

**Contract**: Add `"/stats"` to the `PROTECTED_ROUTES` array (`:4`).

#### 2. Preference-stats table component

**File**: `src/components/catalog/PreferenceStatsTable.astro` (new)

**Purpose**: Render the comparison table (rows = Played/Liked/Disliked, columns = each
member's `label`) from a `MemberStat[]`, matching the cosmic/glass styling of the
existing catalog components.

**Contract**: Props `{ stats: MemberStat[] }`. First column = metric name; one column
per member using `label` as the header (the current member's "You" column visually
distinguished). Wrap the table in an `overflow-x-auto` container so it scrolls rather
than overflowing on narrow mobile. Purely presentational — no client directive.

#### 3. Stats page

**File**: `src/pages/stats.astro` (new)

**Purpose**: Server-fetch the stats and render the table or the empty state, guarded
exactly like `catalog.astro`.

**Contract**: Frontmatter mirrors `catalog.astro`:20-43 — `createClient`, read
`Astro.locals.user`, `configured`/`loadError` flags. When `supabase && user`, call
`listPreferenceStats(supabase, user.id)` in a try/catch. Empty state is decided by
**`hasAnyData(stats)` === false** — NOT `stats.length === 0` (the array always carries a
"You" row, so a length check would render an all-zeros table). When empty, render a
friendly message ("No preferences recorded yet — mark games played and rate them to see
stats here.") linking to `/catalog`, instead of the table. Otherwise render
`PreferenceStatsTable`. Include a back link to `/dashboard` like
`catalog.astro`:53. Wrap in `Layout title="Stats"`.

#### 4. Navigation link

**File**: `src/components/Topbar.astro`

**Purpose**: Give members a way to reach `/stats`.

**Contract**: Add a `<a href="/stats">Stats</a>` link in the authenticated nav group
(`:12-14`), styled like the existing Dashboard link.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Format check clean: `npx prettier --check .` (non-mutating check; exits non-zero on drift — not `npm run format`, which writes files and always passes)

#### Manual Verification:

- [ ] Visiting `/stats` while signed out redirects to `/auth/signin`
- [ ] With preference data present, the table shows correct Played/Liked/Disliked for
      "You" and "Other member", You column first
- [ ] With no data at all, the friendly empty message + catalog link shows instead of a
      table
- [ ] Table scrolls (does not overflow the page) on a narrow mobile viewport
- [ ] Topbar "Stats" link navigates to `/stats`; the current member's own counts match
      what they set on `/catalog`

**Implementation note**: After this phase and all automated checks pass, stop for human
confirmation of the manual steps.

---

## Testing Strategy

### Unit tests:

- `computeMemberStats`: counting (played/liked/disliked), You-first ordering, zero
  states, played-without-preference, multiple other members, input-order independence.

### Integration tests:

- None automated (no new API route; the page is a server-rendered read). Covered by the
  manual steps below.

### Manual testing steps:

1. Sign in as member A; on `/catalog` mark a few games played and like/dislike some.
2. Open `/stats` (Topbar link) — confirm A's counts under "You".
3. Sign in as member B in another session; set some played/preferences.
4. Reopen `/stats` as A — confirm an "Other member" column with B's counts.
5. On a fresh/empty account, confirm the empty message + `/catalog` link.
6. Sign out, hit `/stats` directly — confirm redirect to sign-in.
7. Narrow the viewport — confirm the table scrolls horizontally, page does not.

## Performance Considerations

Two unbounded `select member_id` reads, grouped in memory. Correct for the documented
small household data volume (PRD `data_volume: small`), consistent with the existing
in-memory merge in `catalogGames.ts`. At large scale this would become a SQL
`group by member_id` (or an RPC) — out of scope.

## Migration Notes

None. No schema, RLS, or data migration — the feature reads existing tables only. (So
the "push migrations to prod" lesson does not apply to this change.)

## References

- Roadmap slice S-06: `context/foundation/roadmap.md`
- PRD FR-006: `context/foundation/prd.md`
- Per-member data model + read-all RLS: `supabase/migrations/20260722092117_create_member_game_state.sql`
- Pure-core + DB-wrapper pattern to mirror: `src/lib/services/catalogGames.ts`:28-60
- Guarded page pattern to mirror: `src/pages/catalog.astro`:20-43
- Member identity source: `src/components/Topbar.astro`:11, `src/pages/dashboard.astro`:14

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is
> completed. Do not rename step titles.

### Phase 1: Stats service + types + unit tests

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/lib/services/preferenceStats.test.ts` — ec3acc0
- [x] 1.2 Full unit suite green: `npm test` — ec3acc0
- [x] 1.3 Lint (type-aware) passes: `npm run lint` — ec3acc0

#### Manual

- [ ] 1.4 `computeMemberStats` fixture output matches expected counts + "You"-first ordering

### Phase 2: Stats page + navigation

#### Automated

- [x] 2.1 Build passes: `npm run build` — e27f914
- [x] 2.2 Lint passes: `npm run lint` — e27f914
- [x] 2.3 Format check clean: `npx prettier --check .` (scoped to this change's files; repo-wide `.` reports pre-existing out-of-scope debt — see run report) — e27f914

#### Manual

- [ ] 2.4 Signed-out `/stats` redirects to `/auth/signin`
- [ ] 2.5 Table shows correct counts for "You" + "Other member", You column first
- [ ] 2.6 No-data state shows friendly message + catalog link
- [ ] 2.7 Table scrolls (no page overflow) on narrow mobile
- [ ] 2.8 Topbar "Stats" link works; current member's counts match `/catalog`
