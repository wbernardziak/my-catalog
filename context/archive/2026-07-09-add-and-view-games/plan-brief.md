# Add and View Board Games — Plan Brief

> Full plan: `context/changes/add-and-view-games/plan.md`
> Roadmap slice: `context/foundation/roadmap.md` (S-01, north star)

## What & Why

Build MyCatalog's first domain feature: a logged-in household member adds a board game
(title, authors, genre, player-count range, average play time, loan status) and
immediately sees it in a shared catalog. This is the roadmap's north star — a reliable
catalog is valuable on its own (the secondary success criterion) before any AI — and
it is the schema/RLS seed the entire rest of the roadmap builds on.

## Starting Point

Auth is fully built (Supabase SSR client, middleware route-gating, form-POST auth
endpoints, React-island auth forms), but **no database schema exists yet** —
`supabase/migrations/` is empty. The `CandidateGame` contract in `src/types.ts` already
defines the shape catalog rows must map into for the AI service (player count is a
range, by contract). This slice writes the first migration and the first domain UI.

## Desired End State

A protected `/catalog` page lists the shared catalog and hosts an add-game form; adding
a game returns you to `/catalog` with it visible. Both household members see one shared
catalog. Every row carries enough structured data to feed the future recommendation UI.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Player count | Range (`min_players`/`max_players`) | The `CandidateGame` contract mandates a range and warns against a single value | Plan (from types.ts) |
| Genre | Free-text + `<datalist>` suggestions | Consistency for later filtering/recommendations without an enum migration | Plan |
| Loan status in S-01 | `loan_status` column, simple add-time value | Honors roadmap's S-01 field list; seeds the column so S-04 need not re-migrate | Plan |
| Schema seed scope | Only S-01 fields + `created_by`/timestamps | YAGNI; no speculative `deleted_at`/played columns — later slices own their migrations | Plan |
| RLS model | Any authenticated user reads+writes all rows; store `created_by` | Matches PRD "both members are equal owners of the shared catalog" | Plan (from PRD) |
| Routing/UX | `/catalog` page lists games and hosts the add form | Single "add … and immediately see it" surface matching the slice outcome | Plan |
| Submit flow | React island → `POST /api/games` → redirect; list is Astro SSR | Mirrors the existing auth pattern exactly | Plan |
| Required fields | Title required; genre/players/time required-lenient; authors optional | Guarantees clean mapping into `CandidateGame` | Plan |
| Authors storage | Postgres `text[]` | Structured; user enters comma-separated, split server-side | Plan |

## Scope

**In scope:** first migration (`games` table + shared-catalog RLS); catalog domain
types + row→`CandidateGame` mapper; a games service; `POST /api/games` with zod
validation; protected `/catalog` SSR list + `AddGameForm` island; dashboard link.

**Out of scope:** edit/soft-delete (S-02), filtering (S-03), played/preference/loan
management (S-04), AI recommendation UI (S-05), household/multi-tenant entity, genre
enum or normalized authors table.

## Architecture / Approach

Bottom-up in three layers, each independently verifiable. **Data:** a Supabase
migration creates `public.games` with four per-operation RLS policies for the
`authenticated` role (`using (true)`); `src/types.ts` gains `GameRow`/`NewGameInput` +
`mapRowToCandidateGame`; `src/lib/services/games.ts` owns `listGames`/`createGame`.
**API:** `src/pages/api/games/index.ts` validates the form with zod and redirects
(POST-redirect-GET, auth `?error=` convention). **UI:** `src/pages/catalog.astro`
SSR-lists games and renders `AddGameForm.tsx` (client validation mirroring
`SignUpForm`); `/catalog` is added to `PROTECTED_ROUTES`.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Data layer & schema seed | Migration + RLS, catalog types/mapper, games service | Getting the shared-catalog RLS right (it's the seed pattern for the whole app) |
| 2. Add-game API route | zod-validated `POST /api/games` with redirect flow | Authors-field encoding contract (single string → `text[]`) must match the form |
| 3. Catalog page & form | Protected `/catalog` list + `AddGameForm` island + dashboard link | Form field `name`s must match the zod schema keys |

**Prerequisites:** Local Supabase running (Docker) for migration verification; existing
auth baseline (present).
**Estimated effort:** ~2–3 evening sessions across the 3 phases.

## Open Risks & Assumptions

- Shared-catalog RLS means any future signup can see the catalog — acceptable for a
  private 2-person MVP (revisit if the product ever opens up).
- Authors is display-only in MVP (not in `CandidateGame`); stored as `text[]` for
  future structure but with no per-author querying yet.
- `min ≤ max` players and positive minutes are enforced in both zod and DB checks.

## Success Criteria (summary)

- A logged-in member can add a game and immediately see it in `/catalog`.
- `/catalog` is login-gated; a second member sees the same shared catalog.
- Persisted rows map cleanly into `CandidateGame` (structured genre + player range +
  minutes), ready for the S-05 recommendation flow.
