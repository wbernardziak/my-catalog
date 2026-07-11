# Edit and Archive Board Games — Implementation Plan

## Overview

Extend the S-01 shared catalog so a logged-in household member can (a) **edit** an
existing game's details and (b) **mark a game as deleted without losing history**
(soft delete), satisfying PRD FR-002. Edit is an inline form on each game card,
rendered by a `GameForm` component shared with the add-game flow. Delete is a
two-step inline confirmation that soft-deletes the row; once deleted, the game is
hidden from every query and view — its data remains in the database, but this slice
ships no restore UI.

The slice adds the `deleted_at` column S-01 deliberately deferred, grows the catalog
service with get/update/soft-delete operations, adds two per-id API endpoints under
the established form-POST → post-redirect-get (PRG) → `?error=` convention, and turns
each catalog card into an interactive island.

## Current State Analysis

- **Schema** (`supabase/migrations/20260710120000_create_games.sql`): the `games`
  table has `id, title, authors[], genre, min_players, max_players, avg_play_minutes,
  loan_status, created_by, created_at, updated_at`. There is **no `deleted_at`** —
  S-01 explicitly left it to S-02. `updated_at` has `default now()` but **no
  auto-update trigger**, so an edit must set it in application code. RLS grants the
  `authenticated` role full per-operation access (`update`/`delete` policies already
  exist with `using (true)`), so no new policies are needed for edit/soft-delete.
- **Service** (`src/lib/services/games.ts`): exposes `listGames(supabase)` (all rows,
  `created_at desc`) and `createGame(supabase, input)`. `listGames` currently returns
  every row — it must begin excluding soft-deleted rows. No get-one / update /
  soft-delete functions exist yet. The `SupabaseClient` type alias
  (`NonNullable<ReturnType<typeof createClient>>`) is the established parameter shape.
- **API** (`src/pages/api/games/index.ts`): `POST` handler with `prerender = false`,
  builds the client with `createClient(context.request.headers, context.cookies)`,
  redirects to `/catalog?error=…` when the client is null, checks `context.locals.user`
  (defense in depth) and redirects to `/auth/signin` if absent, validates with
  `newGameSchema` + `parseAuthors`, and on success calls `createGame` then
  `redirect("/catalog")`. **`newGameSchema` and `parseAuthors` are exported** and
  directly reusable by the update endpoint.
- **UI**: `src/pages/catalog.astro` builds the client in frontmatter, calls
  `listGames`, renders the shared-catalog list as **static Astro markup** (no per-card
  interactivity today) plus an `AddGameForm` island in the aside. `AddGameForm`
  (`src/components/catalog/AddGameForm.tsx`) is a client-validated island using
  `FormField`/`SubmitButton`/`ServerError` from `src/components/auth/`, POSTing to
  `/api/games`, with a `GENRE_SUGGESTIONS` datalist and a client `validate()` mirroring
  the server schema.
- **Routing**: `src/middleware.ts` uses `PROTECTED_ROUTES.some(r => pathname.startsWith(r))`
  with `["/dashboard", "/catalog"]`, so any `/catalog/...` subpath is already
  protected. `/api/games/...` is **not** middleware-gated — the endpoints self-check
  `context.locals.user`, which the new endpoints must also do.
- **Types** (`src/types.ts`): `GameRow` (snake_case), `NewGameInput` (camelCase),
  `LoanStatus`, and `mapRowToCandidateGame`. `GameRow` has no `deleted_at` field yet.
- **Tests**: `src/pages/api/games/index.test.ts` (zod schema + `parseAuthors`) and
  `src/types.test.ts` (mapper) establish the vitest style. Test setup stubs
  `astro:env` via `src/test/astro-env-server.stub.ts` (per S-01 plan).

## Desired End State

On `/catalog`, each game card can be switched into an inline edit form (prefilled with
the game's current values, same validation as the add form); saving updates the game
and returns to the catalog with the change visible. Each card also has a Delete action
that requires a second inline confirmation before it soft-deletes the game; a
soft-deleted game immediately disappears from the catalog and is excluded from every
service query, while its row (with a `deleted_at` timestamp) remains in the database.

Verification: log in, open `/catalog`, edit a game and see the update; delete a game
via the two-step confirm and see it vanish; confirm via SQL that the row still exists
with `deleted_at` set and no longer appears in `listGames`; confirm a POST to a
non-existent or already-deleted id redirects to `/catalog?error=…`.

### Key Findings:

- `newGameSchema` and `parseAuthors` are already exported from
  `src/pages/api/games/index.ts:…` and should be **shared**, not duplicated, by the
  update endpoint — the validated payload shape is identical to create.
- `updated_at` has no DB trigger; `updateGame` must set `updated_at = now()` explicitly.
  Same pattern for `softDeleteGame` setting `deleted_at = now()`.
- The `update`/`delete` RLS policies already exist (`using (true)`), so soft-delete
  (an `update` of `deleted_at`) and any future hard-delete are already permitted — no
  migration policy work beyond adding the column.
- Middleware `startsWith` matching means new `/catalog/...` routes would be
  auto-protected, but this slice keeps edit **inline** (no new page route), so the only
  new server surface is under `/api/games/...`, which self-checks auth.
- `AddGameForm`'s client `validate()` already mirrors the server schema field-for-field
  — the shared `GameForm` must preserve this behavior for both modes.

## What We Are NOT Doing

- **No trash / restore UI.** Soft-deleted games are hidden everywhere; recovering one
  is a database operation until a later slice (if ever) adds a restore view.
- **No hard delete.** Rows are never physically removed in this slice.
- **No dedicated edit page or modal.** Edit is inline on the card (decided); no
  `/catalog/[id]/edit` route and no dialog dependency.
- **No new fields.** Played status, per-member preference, and loan *toggling* remain
  S-04. Editing `loan_status` is allowed (it is already an editable field on the form),
  but no per-member state is introduced.
- **No optimistic-concurrency / edit-conflict resolution.** Last write wins; for a
  two-person household concurrent edits of the same game are rare and low-risk.
- **No filtering/search** (S-03).
- **No change to the shared-catalog RLS model** — all authenticated members may edit
  and delete any game.

## Implementation Approach

Build bottom-up in three testable phases, each leaving the app working:

1. **Data layer** — a migration adds the `deleted_at` column; `listGames` starts
   filtering it out; the service gains `getGame`, `updateGame`, and `softDeleteGame`,
   each reporting not-found so callers can redirect. `GameRow` gains `deleted_at`.
2. **API** — two per-id endpoints (`POST /api/games/[id]` for update, `POST
   /api/games/[id]/delete` for soft-delete) reuse the shared zod schema and the auth /
   null-client / `?error=` conventions, translating not-found into a friendly redirect.
3. **UI** — refactor `AddGameForm` into a mode-aware shared `GameForm`, add a
   `GameCard` island that toggles display ↔ inline edit and hosts the two-step delete
   confirm, and render `GameCard` islands from `catalog.astro`.

## Critical Implementation Details

- **`listGames` filtering is load-bearing.** The moment `deleted_at` exists (Phase 1),
  `listGames` must add `.is("deleted_at", null)` in the **same** change, or deleted
  games would still show until Phase 3. Keep the column addition and the query filter
  in one phase so the app is never in a state where a "deleted" game reappears.
- **Not-found is a normal outcome, not an error.** With shared-catalog RLS, an
  `update`/`delete` targeting a missing or already-soft-deleted id returns zero rows
  rather than a DB error. The service must distinguish "0 rows affected" (→ redirect
  with `?error=`) from a real Supabase error (→ generic failure redirect). Prefer
  `.select()` after the mutation with a `deleted_at is null` guard so a concurrent
  delete is caught as not-found.

## Phase 1: Data layer — soft-delete column & service operations

### Overview

Add the `deleted_at` column, exclude soft-deleted rows from `listGames`, and add the
get / update / soft-delete service functions the endpoints need.

### Required Changes:

#### 1. Add `deleted_at` migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_games_deleted_at.sql` (new)

**Purpose**: Add the soft-delete marker S-01 deferred, so a game can be marked deleted
without physical removal.

**Contract**: `alter table public.games add column deleted_at timestamptz;` (nullable,
no default → existing rows are `null` = live). No RLS change (the existing
`authenticated` `update` policy already permits setting `deleted_at`). Optionally add a
partial index `create index on public.games (created_at desc) where deleted_at is null;`
to keep the live-catalog query fast — include only if trivial; household-scale data
does not require it.

#### 2. Add `deleted_at` to `GameRow`

**File**: `src/types.ts`

**Purpose**: Keep the stored-row type honest with the table.

**Contract**: Add `deleted_at: string | null;` to `GameRow`. `mapRowToCandidateGame`
is unaffected (it never maps this field). No new DTO needed — update reuses
`NewGameInput` (the editable fields are identical to create).

#### 3. Filter soft-deleted rows from `listGames`; add get/update/soft-delete

**File**: `src/lib/services/games.ts`

**Purpose**: Make the live catalog exclude deleted games and add the persistence
operations for edit and soft-delete, mirroring the existing `createGame` style.

**Contract**: Modify and export:
- `listGames(supabase)` — add `.is("deleted_at", null)` to the existing select so only
  live games are returned; ordering unchanged.
- `getGame(supabase, id: string): Promise<GameRow | null>` — select a single live row
  by id (`eq("id", id).is("deleted_at", null)`); return `null` when absent (use
  `.maybeSingle()` so no-row is not an error); throw on a real Supabase error. Provided
  for the UI to fetch one game if a future slice needs it; **the Phase 2 endpoints do not
  call it** — they detect not-found from the `null`/`false` returned by
  `updateGame`/`softDeleteGame` themselves. If no near-term UI consumer is expected, drop
  `getGame` from this slice (YAGNI) rather than shipping it unused.
- `updateGame(supabase, id: string, input: NewGameInput): Promise<GameRow | null>` —
  update the editable columns (same camelCase→snake_case mapping as `createGame`) plus
  `updated_at: new Date().toISOString()`, scoped to `eq("id", id).is("deleted_at", null)`,
  returning the updated row via `.select().maybeSingle()`; return `null` when no live
  row matched (unknown or already-deleted id); throw on a real error.
- `softDeleteGame(supabase, id: string): Promise<boolean>` — update
  `deleted_at: new Date().toISOString()` scoped to `eq("id", id).is("deleted_at", null)`,
  `.select().maybeSingle()`; return `true` when a row was marked, `false` when none
  matched (unknown or already deleted); throw on a real error.

**Contract note** — the `.is("deleted_at", null)` guard on `updateGame`/`softDeleteGame`
is what makes not-found and the concurrent-delete race collapse into a `null`/`false`
return the endpoints translate to a redirect, rather than a silent no-op or a 500.

### Success Criteria:

#### Automated Verification:

- [ ] Type-check / lint passes: `npm run lint`
- [ ] Migration applies cleanly against a local DB: `npx supabase db reset` (Docker running)
- [ ] Build passes: `npm run build`
- [ ] Existing unit tests still pass: `npm test`

#### Manual Verification:

- [ ] In Supabase Studio, confirm `games.deleted_at` exists (nullable, null for existing rows).
- [ ] Manually set `deleted_at` on one row; confirm it disappears from `listGames`
      output (via the `/catalog` page after Phase 3, or a quick SQL/`select` check now).

**Implementation note**: After Phase 1 passes automated verification, stop for human
confirmation that the migration + `listGames` filtering behave as expected before
proceeding.

---

## Phase 2: Per-id update & soft-delete endpoints

### Overview

Two form-POST endpoints under `/api/games/[id]` that reuse the shared validation and
the auth / null-client / `?error=` conventions, translating not-found into a friendly
redirect.

### Required Changes:

#### 1. Share the game schema

**File**: `src/pages/api/games/index.ts` (and consumers)

**Purpose**: Avoid duplicating validation between create and update.

**Contract**: `newGameSchema` and `parseAuthors` are already exported. The update
endpoint imports them as-is (the create payload shape equals the update payload shape).
No rename required; if a neutral name reads better, optionally re-export
`newGameSchema` as `gameSchema` — cosmetic, not required.

Also export a single shared not-found message constant (e.g.
`export const GAME_NOT_FOUND_MESSAGE = "That game no longer exists.";`, colocated with
the schema or in `src/lib/services/games.ts`) so both `[id].ts` and `[id]/delete.ts`
reference the same string and a unit test can assert it directly (see criterion 2.3).

#### 2. Update endpoint

**File**: `src/pages/api/games/[id].ts` (new)

**Purpose**: Accept the inline edit form submission for one game, validate it, persist
it, and PRG back to the catalog.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`.
- Read `context.params.id` (Astro dynamic route param).
- Build the client via `createClient(context.request.headers, context.cookies)`;
  null → `redirect("/catalog?error=" + encoded "Supabase is not configured")`.
- If `!context.locals.user` → `redirect("/auth/signin")` (defense in depth).
- Parse `formData()` and validate with `newGameSchema` + `parseAuthors` exactly as
  `index.ts` does; on failure → `redirect("/catalog?error=" + first message)`.
- Call `updateGame(supabase, id, parsed.data)`. If it returns `null` (unknown or
  already-deleted id) → `redirect("/catalog?error=" + encoded "That game no longer
  exists.")`. On a thrown error → `redirect("/catalog?error=" + encoded generic
  "Could not save changes. Please try again.")`.
- On success → `redirect("/catalog")` (PRG).

#### 3. Soft-delete endpoint

**File**: `src/pages/api/games/[id]/delete.ts` (new)

**Purpose**: Mark one game deleted (soft) and PRG back to the catalog.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`.
- Same client-null and auth guards as the update endpoint.
- Read `context.params.id`; call `softDeleteGame(supabase, id)`.
- `false` (unknown or already deleted) → `redirect("/catalog?error=" + encoded "That
  game no longer exists.")`. Thrown error → generic failure redirect. `true` →
  `redirect("/catalog")`.
- No body validation needed beyond the id param.

### Success Criteria:

#### Automated Verification:

- [ ] Type-check / lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass, including coverage of the shared not-found redirect message
      constant (asserting both endpoints reference the same exported string): `npm test`
      — the handler's `null`/`false` → redirect branch itself is covered by manual checks
      2.6/2.8 (no Astro-context/handler mock harness exists in S-01, and this slice does
      not introduce one).

#### Manual Verification:

- [ ] Valid POST to `/api/games/<id>` with edited fields updates the row and 302s to `/catalog`.
- [ ] POST to `/api/games/<id>` with `maxPlayers < minPlayers` redirects to `/catalog?error=…` and changes nothing.
- [ ] POST to `/api/games/<unknown-id>` redirects to `/catalog?error=…` (not a 500 / not a 404 page).
- [ ] POST to `/api/games/<id>/delete` soft-deletes (row gains `deleted_at`, vanishes from `listGames`) and 302s to `/catalog`.
- [ ] A second POST to the same delete URL redirects with `?error=` (already deleted).
- [ ] Both endpoints while logged out redirect to `/auth/signin`.

**Implementation note**: Stop for human confirmation after automated checks pass.

---

## Phase 3: Inline edit + delete UI

### Overview

Refactor `AddGameForm` into a mode-aware shared `GameForm`, add a `GameCard` island
that toggles between the display view and an inline edit form and hosts the two-step
delete confirm, and render `GameCard` islands from `catalog.astro`.

### Required Changes:

#### 1. Shared `GameForm` component

**File**: `src/components/catalog/GameForm.tsx` (new; supersedes `AddGameForm.tsx`)

**Purpose**: One client-validated form used for both add (create) and inline edit,
keeping a single validation source of truth.

**Contract**: Default-exported React component with props:
- `mode: "create" | "edit"`,
- `action: string` (`/api/games` for create, `/api/games/{id}` for edit),
- `initialValues?: GameFormValues` (title, authors-as-string, genre, minPlayers,
  maxPlayers, avgPlayMinutes as strings, loanStatus) — prefill for edit,
- `serverError?: string | null`,
- `onCancel?: () => void` — when provided (edit mode), render a Cancel button that
  calls it; omitted in create mode.
- `submitLabel?`/`pendingText?` — default to the add-flow copy.
- `idPrefix: string` — per-instance prefix for every DOM `id` the form emits (default
  `"create"` for the add flow, e.g. `` `edit-${game.id}` `` for an inline edit). See the
  unique-`id` note below.
Preserve the existing `method="POST"`, `noValidate`, client `validate()` (identical
rules), `clearError` behavior, `FormField`/`SubmitButton`/`ServerError` usage, and the
genre `<datalist>`. Field `name` attributes stay `title, authors, genre, minPlayers,
maxPlayers, avgPlayMinutes, loanStatus` (must keep matching the shared zod schema).

**Contract note (unique `id`s)** — `AddGameForm` today hard-codes DOM ids (`FormField
id="title"|"genre"|"authors"|…`, `<select id="loanStatus">` with `<label
htmlFor="loanStatus">`, `<datalist id="genre-suggestions">`). In Phase 3 the create-mode
form (always mounted in the aside) and an edit-mode form (mounted when a card's
`editing === true`) render **simultaneously**, so static ids would collide — duplicate
`id="title"`, `id="loanStatus"`, `htmlFor="loanStatus"`, and `datalist` ids in one
document, making label clicks focus the wrong form and the datalist binding ambiguous.
`GameForm` must therefore derive **every** emitted id from `idPrefix`: each `FormField
id`, the `<select id>` + its `<label htmlFor>`, and the `<datalist id>` + the field's
`list=` reference (e.g. `` `${idPrefix}-genre-suggestions` ``). Names stay static (POST
relies on them); only ids are prefixed.

**Contract note** — export a small helper to turn a `GameRow` into `GameFormValues`
(join `authors` with `", "`, stringify the numbers, pass `loan_status` through). Keep
it colocated with `GameForm` (or in the card) so edit prefill and the server schema
never drift.

#### 2. Repoint the add flow at `GameForm`

**File**: `src/pages/catalog.astro` (aside) + remove/replace `AddGameForm.tsx`

**Purpose**: The add-game aside now renders `GameForm` in create mode; no behavior
change for S-01.

**Contract**: Replace `<AddGameForm serverError={error} client:load />` with
`<GameForm mode="create" idPrefix="create" action="/api/games" serverError={error} client:load />`.
Delete `AddGameForm.tsx` (or make it a thin re-export) — no other file imports it.

#### 3. `GameCard` island

**File**: `src/components/catalog/GameCard.tsx` (new)

**Purpose**: Make each catalog card interactive: view ↔ inline edit, plus a two-step
delete confirm.

**Contract**: Default-exported React component taking `game: GameRow` (and optionally a
`genreSuggestions` list if `GameForm` needs it passed). Local state:
- `editing: boolean` — false shows the current display markup (title, loan badge,
  authors, genre, player range, minutes) with **Edit** and **Delete** actions; true
  renders `<GameForm mode="edit" idPrefix={`edit-${game.id}`} action={`/api/games/${game.id}`}
  initialValues={fromRow(game)} onCancel={() => setEditing(false)} />`.
- `confirmingDelete: boolean` — the Delete button sets it true, swapping the action row
  for a **Confirm delete / Cancel** pair. Confirm submits a tiny
  `<form method="POST" action={`/api/games/${game.id}/delete`}>` (a submit button);
  Cancel resets to false. No native `confirm()`, no modal.
Move the existing card display markup out of `catalog.astro` into this component's view
mode so the rendered card looks identical when not editing. Card visuals reuse the
current Tailwind classes.

**Contract note** — the delete form and the edit form are **separate** `<form>`s (an
inline edit form must not nest a delete form). The two-step confirm is card-local
state; only the Confirm button triggers the POST.

#### 4. Render `GameCard` islands in the catalog list

**File**: `src/pages/catalog.astro`

**Purpose**: Replace the static `<li>` markup with an island per game.

**Contract**: In the games `<ul>`, render `<li><GameCard game={game} client:load /></li>`
for each game (frontmatter still calls `listGames`, now returning only live rows). The
empty-state, `loadError`, and `not configured` branches are unchanged. Server-side
`?error=` still flows to the create-mode `GameForm` in the aside (inline edit errors
also surface there after PRG, which is acceptable for MVP).

### Success Criteria:

#### Automated Verification:

- [ ] Type-check / lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test`

#### Manual Verification:

- [ ] `/catalog` renders each game as a card with Edit and Delete actions; list looks
      identical to before when not editing.
- [ ] Clicking Edit reveals a prefilled inline form; saving valid changes returns to
      `/catalog` with the update visible.
- [ ] Invalid inline edit (e.g. `max < min`, empty title) is blocked client-side with
      inline errors; a bypassed invalid POST shows the server error banner on `/catalog`.
- [ ] Cancel on the inline edit form restores the display view with no change.
- [ ] Delete requires the two-step confirm; Cancel aborts; Confirm soft-deletes and the
      game disappears from the list.
- [ ] The add-game aside still creates games (S-01 regression check).
- [ ] Cards and inline forms are usable/responsive on a mobile viewport.

**Implementation note**: Stop for human confirmation of the manual UI checks before
considering the slice complete.

---

## Testing Strategy

### Unit tests:

- Extend `src/pages/api/games/index.test.ts` (or a sibling for `[id]`): the shared
  `newGameSchema` still rejects empty title / `max < min` / non-positive minutes and
  parses comma/newline authors (unchanged). Test the **pure logic** the new endpoints
  depend on rather than the handlers: assert the exported not-found message constant is
  the exact user-facing string and that both `[id].ts` and `[id]/delete.ts` reference
  the same constant (no divergent copy). The handler's `null`/`false` → redirect
  branching is covered by manual checks 2.6/2.8 — S-01 deliberately tests only pure
  functions (`index.test.ts` avoids driving the POST handler) and no Astro-context mock
  harness exists, so this slice does not stand one up.
- `fromRow(game)` helper: a `GameRow` maps to the expected string form values
  (authors joined, numbers stringified, loan status passed through).

### Integration tests:

- Not required for MVP; manual verification covers the edit + soft-delete + not-found
  flows and RLS behavior end to end.

### Manual testing steps:

1. Log in; open `/catalog`; add a game (regression); confirm it appears.
2. Edit that game (change title, players, loan status); save; confirm the update shows.
3. Try an invalid inline edit (`max < min`); confirm the client blocks it.
4. Delete the game via the two-step confirm; confirm it disappears.
5. In SQL, confirm the deleted row still exists with `deleted_at` set and is absent
   from `listGames`.
6. POST to `/api/games/<unknown-id>` (and a repeat delete); confirm a friendly
   `?error=` redirect, not a 500 or 404 page.
7. Log out; hit an endpoint directly; confirm redirect to `/auth/signin`.

## Performance Considerations

Household-scale data (tens of games). The `deleted_at is null` filter on the existing
`created_at desc` select is negligible; the optional partial index is a nicety, not a
requirement. Per-card islands (`client:load`) are fine at this scale; if the catalog
ever grows large, islands could switch to `client:visible` — out of scope now.

## Migration Notes

Second migration in the project; additive and backward-compatible (`deleted_at`
nullable, existing rows null = live). No data backfill. Later slices (S-04) add
per-member played/preference tables and may introduce a loan-toggle flow; this slice
leaves `loan_status` editable via the shared form but adds no per-member state.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-002)
- Prior slice (schema/RLS/patterns): `context/archive/2026-07-09-add-and-view-games/plan.md`
- Patterns to mirror: `src/pages/api/games/index.ts` (form-POST/PRG/`?error=`),
  `src/lib/services/games.ts` (service style), `src/components/catalog/AddGameForm.tsx`
  (form island), `src/pages/catalog.astro` (list + island wiring)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is
> complete. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer — soft-delete column & service operations

#### Automated

- [x] 1.1 Type-check/lint passes: `npm run lint` — 269d7dc
- [x] 1.2 Migration applies cleanly: `npx supabase db reset` — 269d7dc
- [x] 1.3 Build passes: `npm run build` — 269d7dc
- [x] 1.4 Existing unit tests still pass: `npm test` — 269d7dc

#### Manual

- [x] 1.5 `games.deleted_at` exists (nullable, null for existing rows) — 269d7dc
- [x] 1.6 A row with `deleted_at` set is excluded from `listGames` — 269d7dc

### Phase 2: Per-id update & soft-delete endpoints

#### Automated

- [x] 2.1 Type-check/lint passes: `npm run lint` — 874cb90
- [x] 2.2 Build passes: `npm run build` — 874cb90
- [x] 2.3 Unit tests pass, including the shared not-found message constant (handler branch covered manually in 2.6/2.8): `npm test` — 874cb90

#### Manual

- [x] 2.4 Valid POST to `/api/games/<id>` updates the row and redirects to `/catalog` — 874cb90
- [x] 2.5 Invalid POST (`max < min`) redirects with `?error=` and changes nothing — 874cb90
- [x] 2.6 POST to an unknown id redirects with `?error=` (not 500 / not 404 page) — 874cb90
- [x] 2.7 POST to `/api/games/<id>/delete` soft-deletes and redirects to `/catalog` — 874cb90
- [x] 2.8 Repeat delete of the same id redirects with `?error=` (already deleted) — 874cb90
- [x] 2.9 Both endpoints while logged out redirect to `/auth/signin` — 874cb90

### Phase 3: Inline edit + delete UI

#### Automated

- [x] 3.1 Type-check/lint passes: `npm run lint` — 00eee94
- [x] 3.2 Build passes: `npm run build` — 00eee94
- [x] 3.3 Unit tests pass: `npm test` — 00eee94

#### Manual

- [x] 3.4 Each game renders as a card with Edit and Delete; identical look when not editing — 00eee94
- [x] 3.5 Edit reveals a prefilled inline form; valid save returns to `/catalog` with the update visible — 00eee94
- [x] 3.6 Invalid inline edit blocked client-side; bypassed invalid POST shows the server error banner — 00eee94
- [x] 3.7 Cancel on the inline edit restores the display view with no change — 00eee94
- [x] 3.8 Delete requires two-step confirm; Cancel aborts; Confirm soft-deletes and the game disappears — 00eee94
- [x] 3.9 The add-game aside still creates games (S-01 regression) — 00eee94
- [x] 3.10 Cards and inline forms are responsive on a mobile viewport — 00eee94
