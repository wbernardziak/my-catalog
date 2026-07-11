# Edit and Archive Board Games — Plan Brief

> Full plan: `context/changes/edit-and-archive-games/plan.md`

## What and why

Let a household member **edit** an existing board game and **mark it deleted without
losing history** (soft delete). This is PRD FR-002 and roadmap slice S-02 — the second
branch off the S-01 catalog north star. Soft delete exists precisely because deleting
games would otherwise lose catalog history (the FR-002 resolution).

## Starting point

S-01 shipped a shared, protected `/catalog`: a `games` table (with `update`/`delete`
RLS already granted to authenticated members), a `games` service with `listGames` +
`createGame`, a form-POST → post-redirect-get (PRG) → `?error=` API convention, and a
client-validated `AddGameForm` island. The table has **no `deleted_at`** (deferred to
this slice), the service has no update/delete operations, and catalog cards are static
markup with no per-item actions.

## Desired end state

Each catalog card can flip into an inline edit form (prefilled, same validation as add)
that saves and returns to the catalog with the change visible; each card also has a
two-step-confirm Delete that soft-deletes the game so it vanishes from the catalog while
its row stays in the database with a `deleted_at` timestamp. No restore UI ships — a
deleted game is hidden everywhere.

## Key decisions made

| Decision | Choice | Why (1 line) |
| --- | --- | --- |
| Edit surface | Inline on the card | No navigation; edits feel immediate |
| Form reuse | One shared `GameForm` (create/edit modes) | Single validation source of truth, no drift |
| Delete confirm | Two-step inline confirm → form-POST | On-brand, no native dialog, no new dependency |
| Deleted visibility | Hidden everywhere, no restore UI | Matches FR-002 (keep history) with minimal surface |
| Per-id routing | Two endpoints: `POST /api/games/[id]` and `.../[id]/delete` | One purpose per route, self-documenting URLs |
| Unknown/deleted id | Redirect to `/catalog?error=…` | Consistent with PRG/`?error=`; handles the concurrent-delete race |
| `updated_at`/`deleted_at` | Set in the service (`now()`), no DB trigger | App-controlled, simplest; no trigger to maintain |

## Scope

**In scope:** `deleted_at` migration; `listGames` excludes deleted rows; `getGame` /
`updateGame` / `softDeleteGame` service ops; update + soft-delete endpoints; a shared
`GameForm` and an interactive `GameCard` island with inline edit and two-step delete.

**Out of scope:** trash/restore UI, hard delete, edit page or modal, new game fields,
per-member state (S-04), edit-conflict resolution (last write wins), filtering (S-03).

## Architecture / approach

Bottom-up, mirroring S-01 at every layer. **Data:** a migration adds nullable
`deleted_at`; `listGames` gains `.is("deleted_at", null)`; new service functions scope
their mutations with the same `deleted_at is null` guard so a missing or already-deleted
id collapses into a `null`/`false` return (→ friendly redirect) rather than a silent
no-op or a 500. **API:** two form-POST endpoints reuse the exported `newGameSchema` +
`parseAuthors` and the auth / null-client / `?error=` guards. **UI:** `AddGameForm`
becomes a mode-aware `GameForm`; a new `GameCard` island toggles display ↔ inline edit
and hosts the two-step delete confirm; `catalog.astro` renders one `GameCard` island
per game.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `deleted_at` column; `listGames` filters it; get/update/soft-delete service ops | Column + `listGames` filter must land together or "deleted" games reappear |
| 2. Per-id endpoints | Update + soft-delete routes with not-found → `?error=` | Distinguishing not-found (0 rows) from a real DB error |
| 3. Inline edit + delete UI | Shared `GameForm`; interactive `GameCard`; islands in the list | Refactoring the add form without regressing S-01 |

**Prerequisites:** S-01 (done). Local Supabase (Docker) for the migration.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open risks and assumptions

- Last-write-wins on concurrent edits — acceptable for a two-person household; no
  conflict UI.
- Inline edit-error feedback surfaces via the same `?error=` banner after PRG (shared
  with the add form) rather than re-opening the specific card — acceptable for MVP;
  client-side validation catches the common cases first.

## Success criteria (summary)

- A member can edit a game and see the change on `/catalog`.
- A member can delete a game via a deliberate two-step confirm; it disappears from the
  catalog but its row persists with `deleted_at` set (history preserved).
- Update/delete of an unknown or already-deleted id fails gracefully with a friendly
  redirect, never a 500 or dead-end.
