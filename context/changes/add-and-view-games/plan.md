# Add and View Board Games — Implementation Plan

## Overview

Seed the catalog domain for MyCatalog. A logged-in household member can add a board
game with its details and immediately see it in a shared, protected catalog list.
This slice (S-01, the roadmap north star) creates the **first** Supabase migration —
the `games` table and its RLS policies — and establishes the shared-catalog access
pattern (all authenticated members read and write one shared catalog) that every
later slice inherits. It also introduces the catalog service layer that maps rows
into the existing `CandidateGame` contract used by the AI recommendation service.

## Current State Analysis

- **No database schema exists.** `supabase/migrations/` is absent; the Supabase CLI
  and SSR client are configured (`supabase/config.toml`, `@supabase/ssr`) but no
  domain tables exist. This slice creates the first migration.
- **Auth is complete and reusable.** `src/lib/supabase.ts` exposes
  `createClient(headers, cookies)` (returns `null` when Supabase env is missing).
  `src/middleware.ts` resolves `context.locals.user` and gates `PROTECTED_ROUTES`
  (`["/dashboard"]` today). Auth API routes are form-POST → redirect with an
  `?error=` query param (`src/pages/api/auth/signup.ts`). Auth UI is React islands
  with client-side validation (`src/components/auth/SignUpForm.tsx`) rendered inside
  SSR `.astro` pages.
- **The target contract already exists.** `src/types.ts` defines `CandidateGame`
  (`id, title, genre, minPlayers, maxPlayers, averagePlayMinutes, played?,
  preference?`) and explicitly states player count is a **range**, not a single
  value ("do not collapse to a single `playerCount`"). S-01 owns mapping its rows
  into this shape.
- **Tooling available:** `zod` (v4), `lucide-react`, Tailwind 4, shadcn/ui
  ("new-york", only `button.tsx` installed so far). `cn()` helper in
  `src/lib/utils.ts`.

## Desired End State

A protected `/catalog` page lists every game in the shared catalog. On the same page,
an add-game form lets a member enter a game's details; on submit the game is persisted
and the member is returned to `/catalog` where the new game is immediately visible.
Every persisted row carries enough structured data (genre, player range, play minutes)
to map cleanly into `CandidateGame` for the future recommendation UI (S-05).

Verification: log in, open `/catalog`, add a game, confirm it appears in the list;
confirm an unauthenticated request to `/catalog` redirects to `/auth/signin`; confirm
a second logged-in member sees the same shared catalog.

### Key Findings:

- Auth SSR-page + React-form-island + form-POST-API pattern to mirror:
  `src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/signup.ts`,
  `src/pages/auth/signup.astro`.
- `CandidateGame` in `src/types.ts` is the authoritative downstream shape; player
  count is a `minPlayers`/`maxPlayers` range by contract.
- `createClient(...)` returns `null` when unconfigured — every DB touch point must
  handle the null client the way auth routes do (graceful "not configured" path).
- RLS convention (from CLAUDE.md): enable RLS on new tables with granular
  per-operation, per-role policies. Migration naming: `YYYYMMDDHHmmss_short.sql`.

## What We Are NOT Doing

- No edit or soft-delete UI (S-02 owns `deleted_at` + edit; no `deleted_at` column
  is added now).
- No played status, per-member preference, or loan *management* UX (S-04). This slice
  adds a plain `loan_status` value settable at add time only — no toggling flow.
- No filtering / search (S-03).
- No AI recommendation UI or wiring (S-05 / F-01 already done).
- No household/multi-tenant entity — the catalog is a single shared catalog for all
  authenticated users (per PRD).
- No genre enum/lookup table, no normalized authors table.

## Implementation Approach

Build bottom-up in three testable phases: (1) data layer — migration + RLS + shared
types + a catalog service that owns row↔contract mapping; (2) a zod-validated
form-POST API endpoint that reuses the auth redirect convention; (3) the protected
`/catalog` SSR page plus the `AddGameForm` React island, wired into the middleware and
linked from the dashboard. Each phase leaves the app in a working, verifiable state.

## Phase 1: Data layer & schema seed

### Overview

Create the first Supabase migration (the `games` table + shared-catalog RLS), add the
DB/DTO types and a row→`CandidateGame` mapper to `src/types.ts`, and add a catalog
service that lists and inserts games.

### Required Changes:

#### 1. Games table migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_games.sql` (new)

**Purpose**: Seed the shared catalog table with the fields S-01 needs plus audit
columns, and establish the shared-catalog RLS pattern the whole app inherits.

**Contract**: Table `public.games` with columns:
- `id uuid primary key default gen_random_uuid()`
- `title text not null` (enforce non-empty via `check (char_length(trim(title)) > 0)`)
- `authors text[] not null default '{}'` (Postgres array; may be empty)
- `genre text not null`
- `min_players int not null check (min_players >= 1)`
- `max_players int not null check (max_players >= min_players)`
- `avg_play_minutes int not null check (avg_play_minutes > 0)`
- `loan_status text not null default 'available' check (loan_status in ('available','loaned'))`
- `created_by uuid not null default auth.uid() references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

RLS: `alter table public.games enable row level security;` with **four granular
per-operation policies for the `authenticated` role** — `select`/`insert`/`update`/`delete`
all with `using (true)` / `with check (true)` (shared catalog: every authenticated
member may read and write every row). `created_by` is stored for later attribution
but is **not** used to gate access. No policy for the `anon` role.

No `deleted_at`, `played`, or `preference` columns — those belong to S-02/S-04.

#### 2. Catalog domain types

**File**: `src/types.ts`

**Purpose**: Add the DB row shape, the create-input DTO, and a mapper so the service
(and later S-05) convert a stored row into the existing `CandidateGame` contract in
one place.

**Contract**: Add and export:
- `GameRow` — snake_case shape matching the table (`id`, `title`, `authors: string[]`,
  `genre`, `min_players`, `max_players`, `avg_play_minutes`, `loan_status`,
  `created_by`, `created_at`, `updated_at`).
- `LoanStatus = "available" | "loaned"`.
- `NewGameInput` — the validated create payload (camelCase: `title`, `authors: string[]`,
  `genre`, `minPlayers`, `maxPlayers`, `avgPlayMinutes`, `loanStatus`).
- `mapRowToCandidateGame(row: GameRow): CandidateGame` — maps `min_players`→`minPlayers`
  etc.; `played`/`preference` left undefined (owned by S-04). Keep the existing
  `CandidateGame` comment about the provisional mapping honest by pointing to this fn.

#### 3. Catalog service

**File**: `src/lib/services/games.ts` (new)

**Purpose**: Single place for catalog persistence, mirroring the
`src/lib/services/recommendations.ts` service-module style. Callers pass an already
constructed Supabase client (as API routes / pages do), keeping the null-client check
at the call site.

**Contract**: Export:
- `listGames(supabase): Promise<GameRow[]>` — selects all games ordered by
  `created_at desc`; throws on Supabase error.
- `createGame(supabase, input: NewGameInput): Promise<GameRow>` — inserts one row
  (mapping camelCase input → snake_case columns; `created_by` is filled by the DB
  default from `auth.uid()`), returns the inserted row via `.select().single()`.

The `supabase` parameter is the non-null client type returned by `createClient`.

### Success Criteria:

#### Automated Verification:

- Type-check passes: `npm run lint` (ESLint is type-checked in this repo)
- Migration applies cleanly against a local DB: `npx supabase db reset` (or
  `npx supabase migration up`) with Docker running
- Build passes: `npm run build`

#### Manual Verification:

- In the Supabase Studio / SQL editor, confirm the `games` table exists with RLS
  enabled and four `authenticated` policies.
- Insert a row as an authenticated user succeeds; an `anon` select returns nothing.

**Implementation note**: After Phase 1 passes automated verification, stop for human
confirmation that the migration + RLS behave as expected before proceeding.

---

## Phase 2: Add-game API route

### Overview

A form-POST endpoint that validates input with zod and persists via the catalog
service, following the auth routes' redirect-with-`?error=` convention.

### Required Changes:

#### 1. Create-game endpoint

**File**: `src/pages/api/games/index.ts` (new)

**Purpose**: Accept the add-game form submission, validate it, persist it, and redirect
back to the catalog — the server half of the create flow.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`.
- Read `context.request.formData()`.
- Build the Supabase client via `createClient(context.request.headers, context.cookies)`;
  if `null`, redirect to `/catalog?error=<encoded "Supabase is not configured">`
  (mirrors `signup.ts`).
- Require `context.locals.user`; if absent, redirect to `/auth/signin` (defense in
  depth alongside middleware).
- Validate with a zod schema → `NewGameInput`: `title` non-empty after trim; `genre`
  non-empty; `minPlayers`/`maxPlayers`/`avgPlayMinutes` coerced positive ints with
  `maxPlayers >= minPlayers` (zod `.refine`); `authors` parsed from the form (split a
  single comma/newline-separated field into a trimmed, empty-filtered `string[]`);
  `loanStatus` defaults to `"available"`.
- On validation failure: redirect to `/catalog?error=<first message>` (no server-side
  field re-population in MVP — client validation is the primary UX; this is the
  fallback).
- On success: call `createGame(...)`, then `redirect("/catalog")` (POST-redirect-GET).

**Contract note** — authors form encoding: the form submits authors as one text field;
the endpoint and the React form must agree that authors is a single
comma/newline-separated string split server-side into `text[]`. This is the one
non-obvious contract between Phase 2 and Phase 3.

### Success Criteria:

#### Automated Verification:

- Type-check / lint passes: `npm run lint`
- Build passes: `npm run build`
- (If a unit test is added) zod schema rejects `maxPlayers < minPlayers`, non-positive
  minutes, and empty title, and parses `"A, B"` → `["A","B"]`: `npm test`

#### Manual Verification:

- `curl`/browser POST with valid fields creates a row and 302-redirects to `/catalog`.
- POST with `maxPlayers < minPlayers` redirects to `/catalog?error=...` and creates
  nothing.
- POST while logged out redirects to `/auth/signin`.

**Implementation note**: Stop for human confirmation after automated checks pass.

---

## Phase 3: Catalog page & add-game form

### Overview

The protected `/catalog` SSR page renders the shared catalog list and hosts the
`AddGameForm` React island; middleware protects the route and the dashboard links to it.

### Required Changes:

#### 1. Protect the catalog route

**File**: `src/middleware.ts`

**Purpose**: Gate `/catalog` behind auth like `/dashboard`.

**Contract**: Add `"/catalog"` to `PROTECTED_ROUTES`.

#### 2. Add-game form island

**File**: `src/components/catalog/AddGameForm.tsx` (new)

**Purpose**: Client-validated add-game form, mirroring `SignUpForm.tsx`, that POSTs to
`/api/games`.

**Contract**: Default-exported React component. `method="POST" action="/api/games"`,
`noValidate`, `onSubmit` runs local validation and calls `e.preventDefault()` on
failure (same shape as `SignUpForm`). Fields: `title` (text), `authors` (single text
input, comma-separated — label clarifies), `genre` (text input with an associated
`<datalist>` of common genres, e.g. Strategy, Family, Party, Cooperative, Deck-builder,
Abstract — free entry still allowed), `minPlayers`/`maxPlayers`/`avgPlayMinutes`
(number inputs), `loanStatus` (select: Available / Loaned, default Available). Client
validation: title required; genre required; players ≥ 1 and `min ≤ max`; minutes > 0.
Accepts an optional `serverError?: string | null` prop rendered via the existing
`ServerError` component. Reuse `FormField`/`SubmitButton` where they fit.

**Contract note**: field `name` attributes must match the Phase 2 zod schema keys
(`title`, `authors`, `genre`, `minPlayers`, `maxPlayers`, `avgPlayMinutes`,
`loanStatus`).

#### 3. Catalog page

**File**: `src/pages/catalog.astro` (new)

**Purpose**: SSR list of the shared catalog + the add-game island; the single
"see and add" surface.

**Contract**: Frontmatter builds the Supabase client from `Astro.request.headers` /
`Astro.cookies`; if non-null, calls `listGames(supabase)` and maps rows for display;
if null, renders the "Supabase not configured" state (reuse `config-status` messaging
style). Reads `?error=` from `Astro.url.searchParams` and passes it to
`<AddGameForm serverError={...} client:load />`. Renders each game (title, authors,
genre, `min–max players`, `~N min`, loan status) and an empty-state message when the
catalog has no games. Uses `Layout.astro` and Tailwind consistent with existing pages.

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Purpose**: Give the authenticated user a way to reach the catalog.

**Contract**: Add a link/button to `/catalog` alongside the existing sign-out form.

### Success Criteria:

#### Automated Verification:

- Type-check / lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Logged out, visiting `/catalog` redirects to `/auth/signin`.
- Logged in, `/catalog` renders (empty-state when no games).
- Submitting the form with valid data returns to `/catalog` with the new game visible.
- Submitting invalid data (client) blocks submit and shows inline errors; a bypassed
  invalid POST shows the server error banner on `/catalog`.
- A second logged-in account sees the same games (shared catalog confirmed).
- Page is usable/responsive on a mobile viewport.

**Implementation note**: Stop for human confirmation of the manual UI checks before
considering the slice complete.

---

## Testing Strategy

### Unit tests:

- zod add-game schema (Phase 2): rejects empty title, `maxPlayers < minPlayers`,
  non-positive minutes; parses comma/newline authors into a trimmed `string[]`.
- `mapRowToCandidateGame`: maps snake_case row fields to the `CandidateGame` range
  shape and leaves `played`/`preference` undefined.
- (Follow the existing `src/lib/services/recommendations.test.ts` style/setup, incl.
  `src/test/astro-env-server.stub.ts` for `astro:env` imports.)

### Integration tests:

- Not required for MVP; the manual verification steps cover the end-to-end create+view
  flow and RLS behavior.

### Manual testing steps:

1. Log in; navigate dashboard → `/catalog`.
2. Add a game with all fields; confirm PRG returns to `/catalog` and the game shows.
3. Add a game with empty authors; confirm it saves (authors optional → empty array).
4. Try `maxPlayers < minPlayers`; confirm the client blocks it.
5. Log out; hit `/catalog` directly; confirm redirect to sign-in.
6. Log in as the second household member; confirm the shared catalog is visible.

## Performance Considerations

Household-scale data (tens of games); a single unfiltered `select ... order by
created_at desc` is fine. No pagination needed for MVP (S-03 adds filtering later).

## Migration Notes

This is the first migration in the project. Later slices extend this table via their
own migrations (S-02 adds `deleted_at`; S-04 adds per-member played/preference tables).
`created_by` is seeded now so S-04's attribution work has an owner column to build on.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-003)
- Downstream contract: `src/types.ts` (`CandidateGame`)
- Patterns to mirror: `src/components/auth/SignUpForm.tsx`,
  `src/pages/api/auth/signup.ts`, `src/lib/services/recommendations.ts`,
  `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is
> complete. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer & schema seed

#### Automated

- [x] 1.1 Type-check/lint passes: `npm run lint` — d59229c
- [x] 1.2 Migration applies cleanly: `npx supabase db reset` — d59229c
- [x] 1.3 Build passes: `npm run build` — d59229c

#### Manual

- [x] 1.4 `games` table exists with RLS enabled and four `authenticated` policies — d59229c
- [x] 1.5 Authenticated insert succeeds; `anon` select returns nothing — d59229c

### Phase 2: Add-game API route

#### Automated

- [x] 2.1 Type-check/lint passes: `npm run lint`
- [x] 2.2 Build passes: `npm run build`
- [x] 2.3 zod schema unit tests pass: `npm test`

#### Manual

- [x] 2.4 Valid POST creates a row and redirects to `/catalog`
- [x] 2.5 Invalid POST (`maxPlayers < minPlayers`) redirects with `?error=` and creates nothing
- [x] 2.6 Logged-out POST redirects to `/auth/signin`

### Phase 3: Catalog page & add-game form

#### Automated

- [ ] 3.1 Type-check/lint passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`

#### Manual

- [ ] 3.3 Logged-out `/catalog` redirects to `/auth/signin`
- [ ] 3.4 Logged-in `/catalog` renders (empty-state when no games)
- [ ] 3.5 Valid form submit returns to `/catalog` with the new game visible
- [ ] 3.6 Invalid submit blocked client-side; bypassed invalid POST shows server error banner
- [ ] 3.7 Second account sees the same shared catalog
- [ ] 3.8 Page is responsive on a mobile viewport
