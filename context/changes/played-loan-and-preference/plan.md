# S-04: Played status, loan, and personal preference — Implementation Plan

## Overview

Let a household member mark a game **played**, toggle its **loan status**, and record a **binary like/dislike** for played titles — with played state and preference attributed to the correct member. Per-member state lives in two new tables (`game_played`, `game_preference`) with "read-all / write-own" RLS; loan status stays a shared column on `games` with a new quick-toggle. The catalog gains played/preference filters, and `mapRowToCandidateGame` is wired to populate the per-member fields the recommendation contract already declares (data only — the AI "what should we play?" flow is S-05).

## Current State Analysis

- **`games`** is a single shared catalog table (`supabase/migrations/20260710120000_create_games.sql`). `loan_status text not null default 'available' check (loan_status in ('available','loaned'))` already exists but is only set at add/edit time — no toggle flow (`src/types.ts:51`). `created_by uuid default auth.uid()` is attribution-only, not access-gating. RLS is the "shared catalog" pattern: `authenticated` gets full CRUD with `using (true)`.
- **No household/member entity** beyond the Supabase auth user. "Per member" must be modeled as `member_id references auth.users(id) default auth.uid()`, mirroring `games.created_by`. No `profiles`/`household` table.
- **The S-04 contract is already stubbed**: `CandidateGame.played?: boolean` + `preference?: "liked" | "disliked"` (`src/types.ts:38-39`); `mapRowToCandidateGame` leaves them undefined "owned by S-04, no source column yet" (`src/types.ts:96-108`); `src/lib/services/recommendations.ts:80-81` already forwards them. So vocabulary is fixed: **played = boolean, preference = `"liked" | "disliked"`**.
- **Mutation pattern** (`src/pages/api/games/**`): small HTML **form POST → API route → service fn (non-null `SupabaseClient`) → Post/Redirect/Get to `/catalog`** with `?error=` on failure; auth-gated on `context.locals.user`. No JSON API, no toasts, no optimistic UI. Reference: `src/pages/api/games/[id]/delete.ts`.
- **Catalog rendering** (`src/pages/catalog.astro`): server-side `listGames`/`listGenres`, renders `CatalogFilters` + a list of `GameCard client:load`. `GameCard` (`src/components/catalog/GameCard.tsx`) receives only `game: GameRow`; the action-button row is at `GameCard.tsx:62`, the loan badge at `:44-51`.
- **Filters** are URL-query-driven: `parseGameFilters` (`src/lib/services/gameFilters.ts`) → `GameFilters` → `listGames` PostgREST predicates → echoed back into `CatalogFilters`. Loan already plugs in; played/preference are per-member so they cannot be a plain `.eq` on `games`.

## Desired End State

A logged-in member, on `/catalog`, can: click **Played / Not played** on any card (their own state, not the other member's); when a game is played, click **Like / Dislike** (or clear); click **Loan / Return** to flip the shared loan badge. They can filter the catalog to "played / not played" and "liked / disliked" for themselves. Each member sees their own toggles reflect their own state, while both can read each other's state (enabling S-06 stats later). `mapRowToCandidateGame(row, state)` returns populated `played`/`preference`, so S-05 inherits live data. Verified by: migration applies locally and to prod, unit tests green, and manual walkthrough of all three toggles + both filters as two different users.

### Key Discoveries:
- `CandidateGame` fields fix the contract: `src/types.ts:38-39`. Update the mapper + its test (`src/types.test.ts:36-39`).
- Service shape to copy: `src/lib/services/games.ts` (non-null `SupabaseClient` param, throw-on-error, `.maybeSingle()` → `null` for not-found).
- Route shape to copy: `src/pages/api/games/[id]/delete.ts` (null-client / auth / `?error=` / PRG).
- Filter plumbing to extend: `src/lib/services/gameFilters.ts`, `GameFilters` (`src/types.ts:77`), `src/components/catalog/CatalogFilters.astro`.
- Data volume is **small** (PRD `target_scale.data_volume: small`) — in-memory merge of per-member state onto the game list is acceptable and simplest; no complex PostgREST joins required.

## What We Are NOT Doing

- No borrower-name/loan-history tracking (PRD Non-Goals; loan is a shared boolean-ish status only).
- No per-member loan status — a physical copy is loaned globally; loan stays on `games`.
- No AI recommendation flow / "what should we play?" UI (that is S-05). We only populate the data the mapper feeds it.
- No preference statistics view (that is S-06, nice-to-have).
- No 1–5 rating — preference is binary `liked`/`disliked` (FR-005).
- No change to the shared-catalog RLS on `games` itself.

## Implementation Approach

Bottom-up along the established seam: **schema+RLS → service+types → API routes → UI**. Per-member state is keyed `(game_id, member_id)` with `member_id default auth.uid()`; "played" is represented by the **existence of a `game_played` row** (mark = insert, unmark = delete), and unmarking played **cascades to delete** the member's `game_preference` row (FR-005: preference only for played titles). Loan is a flip of the existing shared column. Per-member state is merged onto the catalog list in a new `listCatalogGames` view-model function that also applies the played/preference filters in memory, leaving `listGames` untouched for catalog-level filters.

## Phase 1: Per-member state schema + RLS

### Overview

Add `game_played` and `game_preference` tables with granular per-operation RLS (read-all, write-own), then push to prod.

### Changes required:

#### 1. Migration for per-member state tables

**File**: `supabase/migrations/20260721HHMMSS_create_member_game_state.sql` (timestamp > `20260710193510`, format per convention)

**Purpose**: Create the two per-member tables so played and preference are attributable to the correct member and only writable by that member, while remaining readable by both household members (for S-06).

**Contract**: Both tables have `game_id`, `member_id uuid not null default auth.uid()`, `created_at`/`updated_at timestamptz not null default now()`, and `unique (game_id, member_id)`.
- `game_played`: `game_id uuid not null references public.games(id) on delete cascade`, `member_id ... references auth.users(id)`. Its `unique (game_id, member_id)` is the key the preference FK references.
- `game_preference`: adds `preference text not null check (preference in ('liked','disliked'))` **and a composite FK `(game_id, member_id) references public.game_played (game_id, member_id) on delete cascade`** (FR-005 enforced in DB — a preference cannot exist without a played row, and un-marking played cascades the preference away for free; no app-layer cascade needed). It does **not** need its own direct FK to `games`/`auth.users` — both are reached transitively through `game_played`.

RLS enabled on both; four `authenticated` policies each — SELECT `using (true)`; INSERT `with check (member_id = auth.uid())`; UPDATE `using (member_id = auth.uid()) with check (member_id = auth.uid())`; DELETE `using (member_id = auth.uid())`.

```sql
-- game_played: existence of a row == "this member has played this game"
create table public.game_played (
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, member_id)
);
-- game_preference: binary like/dislike; only meaningful for a played title (enforced in DB via composite FK)
--   preference text not null check (preference in ('liked','disliked'))
--   foreign key (game_id, member_id) references public.game_played (game_id, member_id) on delete cascade
--   -> un-marking played auto-deletes the preference; "disliked without played" is impossible.
-- both tables: enable RLS + the four policies above.
```

### Success Criteria:

#### Automated Verification:
- Migration applies cleanly locally: `npx supabase db reset` (or `npx supabase migration up`)
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:
- Migration pushed to prod: `npx supabase db push --linked` (required last step for schema work — see `context/foundation/lessons.md`)
- In Supabase Studio, member A can insert their own `game_played` row but cannot insert one with a different `member_id`; both members can `select` all rows.

**Implementation note**: After all automated checks pass, stop for human confirmation of the manual RLS check before Phase 2. Progress checkboxes live in `## Progress`.

---

## Phase 2: Service layer + types

### Overview

Add persistence services for played/preference/loan, a catalog view-model that merges per-member state and applies played/preference filters, extend `GameFilters` + `parseGameFilters`, and wire `mapRowToCandidateGame`. Unit-test the logic.

### Changes required:

#### 1. Per-member state service

**File**: `src/lib/services/memberGameState.ts` (new)

**Purpose**: Encapsulate the per-member mutations and reads the routes and catalog page need, mirroring `games.ts` conventions (non-null `SupabaseClient`, throw-on-error).

**Contract**:
- `setPlayed(supabase, gameId, memberId, played: boolean): Promise<void>` — `played=true` upserts a `game_played` row (idempotent on the unique key); `played=false` deletes the member's `game_played` row. The `game_preference` row is removed automatically by the composite FK's `on delete cascade` — **no app-layer cascade-clear** (FR-005 enforced in DB).
- `setPreference(supabase, gameId, memberId, preference: "liked" | "disliked" | null): Promise<{ ok: boolean }>` — upserts/deletes `game_preference`; `null` clears. When no `game_played` row exists for `(gameId, memberId)`, the insert violates the composite FK — catch the FK-violation error (Postgres code `23503`) and return `{ ok: false }` (caller shows "mark as played first") rather than throwing.
- `listMemberState(supabase, memberId): Promise<{ played: Set<string>; preference: Map<string, "liked" | "disliked"> }>` — the member's played game-ids and preference map, for merge/filtering.

#### 2. Loan status service

**File**: `src/lib/services/games.ts` (extend)

**Purpose**: Set the shared loan status of one live game to a desired value.

**Contract**: `setLoan(supabase, id, status: "available" | "loaned"): Promise<GameRow | null>` — writes `loan_status = status` directly (desired-state, **not** read-modify-write), scoped to `deleted_at is null`, stamps `updated_at`, `.maybeSingle()` → `null` for unknown/deleted id. Single round-trip and idempotent — consistent with the `played` endpoint's desired-state contract. Mirrors `updateGame`/`softDeleteGame`.

#### 3. Catalog view-model + per-member filtering

**File**: `src/lib/services/games.ts` (add) or a small new module

**Purpose**: Produce the list the catalog page renders, enriched with the current member's played/preference and narrowed by the new filters.

**Contract**: `listCatalogGames(supabase, memberId, filters: GameFilters): Promise<CatalogGame[]>` — calls `listGames(supabase, filters)` for catalog-level constraints, calls `listMemberState`, then delegates the enrichment/narrowing to a **pure core function** and returns its result. Define `CatalogGame = GameRow & { played: boolean; preference: "liked" | "disliked" | null }` in `src/types.ts`.

**Pure core (unit-testable, no Supabase)**: `mergeAndFilterCatalog(games: GameRow[], state: { played: Set<string>; preference: Map<string, "liked" | "disliked"> }, filters: GameFilters): CatalogGame[]` — merges each row with the member's state and applies `filters.played` / `filters.preference` in memory (small data volume; includes the "not played" case). Extracting this keeps the decision logic testable as a pure function (like `gameFilters`), so no Supabase mock is introduced — consistent with the project's documented "no DB handler mock" convention (`src/pages/api/games/id-endpoints.test.ts`). `listCatalogGames` becomes a thin DB-fetch wrapper around it.

#### 4. Filter contract extension

**File**: `src/types.ts` and `src/lib/services/gameFilters.ts`

**Purpose**: Let the catalog accept played/preference filters scoped to the current member.

**Contract**: `GameFilters` gains `played?: boolean` and `preference?: "liked" | "disliked"`. `filterSchema` gains keys `played` (`z.enum(["true","false"])`→boolean, `.catch(undefined)`) and `preference` (`z.enum(["liked","disliked"])`, `.catch(undefined)`); `parseGameFilters` maps them into `GameFilters`. Query-param key names are the CatalogFilters form contract.

#### 5. Wire the recommendation mapper

**File**: `src/types.ts` (and `src/types.test.ts`)

**Purpose**: Populate the per-member fields the recommendation service already forwards.

**Contract**: `mapRowToCandidateGame(row: GameRow, state?: { played: boolean; preference?: "liked" | "disliked" }): CandidateGame` — sets `played`/`preference` from `state` when provided; omitting `state` preserves today's undefined behavior. Update any call sites (currently only `src/types.test.ts`).

### Success Criteria:

#### Automated Verification:
- Type-check/lint passes: `npm run lint`
- Unit tests pass: `npx vitest run` (new tests for the pure `mergeAndFilterCatalog` merge+filter incl. "not played", and `mapRowToCandidateGame` with/without state, and `parseGameFilters` new params — all pure, no Supabase mock)
- Build passes: `npm run build`

#### Manual Verification:
- `listCatalogGames` returns correct `played`/`preference` for the calling member against local Supabase seeded with two members.
- `setPlayed(false)` cascade-clear and `setPreference` played-guard verified against local Supabase / Studio (these touch the DB and are intentionally not unit-tested — no handler mock exists in this project, per `src/pages/api/games/id-endpoints.test.ts`).

**Implementation note**: Stop for human confirmation after automated checks before Phase 3.

---

## Phase 3: API routes

### Overview

Three PRG endpoints mirroring `delete.ts`, one per action.

### Changes required:

#### 1. Played endpoint

**File**: `src/pages/api/games/[id]/played.ts` (new)

**Purpose**: Set the current member's played state for a game.

**Contract**: `POST`. Null-client → `?error=`; `!context.locals.user` → `/auth/signin`; missing id → not-found redirect. Validate form field `played` with zod (`z.enum(["true","false"])`). Call `setPlayed(supabase, id, user.id, played)`. PRG to `/catalog`; `?error=` on thrown error.

#### 2. Preference endpoint

**File**: `src/pages/api/games/[id]/preference.ts` (new)

**Purpose**: Set/clear the current member's like/dislike for a played game.

**Contract**: `POST`. Same guards. Validate form field `preference` with zod (`z.enum(["liked","disliked","clear"])`; `"clear"`→`null`). Call `setPreference`; when it returns `{ ok: false }` (not played), redirect with a friendly `?error=` ("Mark the game as played first."). PRG to `/catalog`.

#### 3. Loan endpoint

**File**: `src/pages/api/games/[id]/loan.ts` (new)

**Purpose**: Flip a game's shared loan status.

**Contract**: `POST`. Same guards. Validate form field `loanStatus` with zod (`z.enum(["available","loaned"])`) — the desired state, mirroring `played`. Call `setLoan(supabase, id, loanStatus)`; `null` → `GAME_NOT_FOUND_MESSAGE`. PRG to `/catalog`.

### Success Criteria:

#### Automated Verification:
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:
- `curl -X POST` (or the UI in Phase 4) each endpoint while signed in produces the expected DB change and redirect; while signed out redirects to `/auth/signin`.

**Implementation note**: Stop for human confirmation after automated checks before Phase 4.

---

## Phase 4: Catalog UI

### Overview

Pass per-member state to the cards, add the three toggles and the two filters.

### Changes required:

#### 1. Catalog page wiring

**File**: `src/pages/catalog.astro`

**Purpose**: Load per-member state and hand it to each card.

**Contract**: Replace `listGames(supabase, filters)` with `listCatalogGames(supabase, Astro.locals.user.id, filters)`; pass each `CatalogGame` to `GameCard`. (User is guaranteed by middleware `PROTECTED_ROUTES`, but keep a defensive guard.)

#### 2. GameCard controls

**File**: `src/components/catalog/GameCard.tsx`

**Purpose**: Render and submit the three per-game actions.

**Contract**: `Props` becomes `{ game: CatalogGame }`. Add to the action row (`GameCard.tsx:62`), each as a small `<form method="POST">` PRG (mirroring the delete form): **Played/Not played** → `/api/games/{id}/played` (posts opposite of `game.played`); when `game.played`, **Like / Dislike** (highlight the active one; posting the active value again or a Clear control posts `preference=clear`) → `/api/games/{id}/preference`; **Loan/Return** → `/api/games/{id}/loan` (posts `loanStatus` = the opposite of the current `game.loan_status`, i.e. the desired state, flipping the existing badge at `:44-51`). Like/Dislike controls are hidden when `!game.played`.

#### 3. Catalog filter controls

**File**: `src/components/catalog/CatalogFilters.astro`

**Purpose**: Expose played/preference filters for the current member.

**Contract**: Add a played control (all / played / not-played → param `played` = `""`/`true`/`false`) and a preference control (all / liked / disliked → param `preference`). Echo active values from the `current: GameFilters` prop, matching the existing GET-form pattern.

### Success Criteria:

#### Automated Verification:
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:
- As member A: mark a game played → Like/Dislike controls appear; like it; un-mark played → preference is gone. Loan toggle flips the badge.
- Filters "played"/"not played" and "liked"/"disliked" narrow the list correctly for A.
- As member B (second account): B's toggles reflect B's own state, independent of A; loan badge (shared) matches what A set.
- Responsive: controls usable on a mobile-width viewport.

**Implementation note**: Final phase — confirm the full manual walkthrough before closing the change.

---

## Testing Strategy

### Unit tests (Vitest) — pure functions only (no Supabase mock, per project convention):
- `mergeAndFilterCatalog` merges the calling member's state and applies `played`/`preference` filters (including "not played").
- `mapRowToCandidateGame` populates `played`/`preference` from `state` and leaves them undefined without it.
- `parseGameFilters` accepts/rejects the new `played`/`preference` params (forgiving `.catch(undefined)`).

### DB-touching logic — verified manually against local Supabase / Studio (no handler mock exists in this project):
- `setPlayed(false)` deletes both the played row and any preference row (cascade-clear).
- `setPreference` returns `{ ok: false }` when the game is not played for that member; upserts/clears otherwise.

### Manual steps:
1. Two accounts (A, B). Confirm played/preference are independent per member; loan is shared.
2. Un-mark played clears preference.
3. Both filters narrow correctly and echo active state in the form.
4. Signed-out POST to each endpoint redirects to `/auth/signin`.

## Migration Notes

New tables only; no data backfill (no prior per-member state exists). `on delete cascade` chains keep rows consistent under a future hard delete: deleting a game cascades `game_played`, which in turn cascades `game_preference` (composite FK). Soft-deleted games simply drop out of the catalog listing, so stale per-member rows are harmless. **Push to prod with `npx supabase db push --linked` as the final step of Phase 1.**

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: FR-003, FR-005; NFR "personal preferences visible only to logged-in members"
- Similar implementation: `src/lib/services/games.ts`, `src/pages/api/games/[id]/delete.ts`, `src/components/catalog/GameCard.tsx`
- Lesson: push migrations to prod — `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is done. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Per-member state schema + RLS

#### Automated
- [x] 1.1 Migration applies cleanly locally (`npx supabase db reset`) — 4489714
- [x] 1.2 Lint passes (`npm run lint`) — 4489714
- [x] 1.3 Build passes (`npm run build`) — 4489714

#### Manual
- [ ] 1.4 Migration pushed to prod (`npx supabase db push --linked`)
- [ ] 1.5 RLS verified in Studio: write-own enforced, read-all works

### Phase 2: Service layer + types

#### Automated
- [x] 2.1 Lint passes (`npm run lint`) — ebcbf7f
- [x] 2.2 Unit tests pass (`npx vitest run`) — ebcbf7f
- [x] 2.3 Build passes (`npm run build`) — ebcbf7f

#### Manual
- [ ] 2.4 `listCatalogGames` returns correct per-member state against seeded local DB
- [ ] 2.5 `setPlayed(false)` cascade-clear and `setPreference` played-guard verified against local Supabase / Studio

### Phase 3: API routes

#### Automated
- [x] 3.1 Lint passes (`npm run lint`)
- [x] 3.2 Build passes (`npm run build`)

#### Manual
- [ ] 3.3 Each endpoint produces expected DB change + redirect; signed-out redirects to signin

### Phase 4: Catalog UI

#### Automated
- [ ] 4.1 Lint passes (`npm run lint`)
- [ ] 4.2 Build passes (`npm run build`)

#### Manual
- [ ] 4.3 Played → like/dislike appears; un-mark clears preference; loan toggle flips badge
- [ ] 4.4 Played/preference filters narrow correctly and echo active state
- [ ] 4.5 Second account: state independent per member, loan shared
- [ ] 4.6 Controls usable on mobile-width viewport
