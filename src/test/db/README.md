# Database-backed tests

These tests drive a **real local Supabase stack**. They are the only place in this
repo where a claim about authorization or row visibility is legitimate.

## What this harness proves

- **Real policy behaviour.** Queries go out over `@supabase/supabase-js` carrying a
  real member's JWT, so the RLS predicates that run are the ones production runs.
  A loosened `with check` shows up here and nowhere else.
- **Real row visibility.** Two members' rows genuinely coexist in the database, so a
  read that forgets to scope by `member_id` returns the other member's rows — the
  regression that no other suite in this repo can see. The same applies to
  soft-delete: a deleted row is really there, so a query that drops
  `.is("deleted_at", null)` really returns it
  (`catalogIntegrity.test.ts`).

## What it costs

- Docker, and a stack started with `npx supabase start` (this repo's stack is
  `project_id = "my-catalog"` on ports 54330-54339, API `54331`).
- Seconds per run rather than milliseconds. That is why these tests live in their own
  vitest project, out of `npm test`.

## What it does NOT prove

Its reach stops in three places, and a claim beyond them needs a different test:

- **It proves the migrations' policies, not production's.** The stack is built from
  `supabase/migrations/` on a fresh database. If a migration was never pushed
  (`npx supabase db push --linked` — see `context/foundation/lessons.md`), production
  can be running policies this suite has never seen. Green here is not "prod is safe".
- **It does not exercise the app's own authentication.** Members here are
  `@supabase/supabase-js` clients holding a JWT directly; the app builds a
  cookie-bound SSR client per request (`src/lib/supabase.ts`) behind a session guard.
  So this suite proves what the _database_ does with a given identity, never that the
  app resolves the right identity in the first place — that is the API-boundary
  suite's job (`src/pages/api/games/boundary.test.ts`).
- **It says nothing about what a user sees.** Nothing here renders a page. A read
  proven correctly scoped at the service layer can still be displayed wrongly.
- **The shape gate in `npm test` is not a substitute for this suite.**
  `src/lib/services/games.test.ts` asserts that `games.ts` still _issues_
  `is(deleted_at, null)`, which catches the commonest regression in milliseconds
  without Docker. It proves nothing about whether the database withholds the row,
  because the double honours no filters. Green there is not green here.

## Contrast with `src/test/supabaseDouble.ts`

The double is the right tool for "was a write issued?" and nothing more — it models no
rows and honours no filters, so it can never prove that a query came back scoped. Its
own doc comment says so. When a question is about **whether the data that came back was
the right member's**, or **whether the database would refuse**, it belongs here.

## Fixture helpers worth knowing

- `createGame(member, title, overrides?)` — the third argument varies `genre`,
  `min_players`, `max_players`, `avg_play_minutes` and `loan_status`, which is
  what makes a catalog-filter test possible. Omit it and the row keeps the fixed
  values every older call site relies on.
- `markDeleted(member, gameId)` — stamps `deleted_at` the way the app does. Use
  it for fixtures in tests whose subject is a **read**, so a read assertion never
  fails because `softDeleteGame` regressed; the one test whose subject is the
  deletion calls the real service instead.
- `deleteGames(member, ids)` — teardown only, and a **hard** delete. The app never
  hard-deletes. Reaching for this instead of `markDeleted` is how a suite quietly
  stops testing soft-delete.

## Rules

- **Never skip.** If no stack is reachable, `requireLocalStack()` throws with
  instructions. A database suite that quietly passes without a database is
  indistinguishable from one with no assertions.
- **Seed played before preference.** A composite FK means a `game_preference` row
  cannot exist without the matching `game_played` row for the same member.
- **Assert state, not errors, for denied writes.** RLS refuses UPDATE and DELETE by
  matching zero rows, not by raising; only INSERT raises `42501`. Read the row back and
  assert it is unchanged, and pair every denial with a positive control — otherwise the
  test also passes when the row never existed.
- **Fresh members per run.** `createTwoMembers()` signs up two new members with unique
  emails. Games are cleaned up; the auth users are not (that would need a service_role
  key this codebase deliberately does not have).

## Running

```bash
npx supabase start     # once
npm run test:db
```

`SUPABASE_URL` / `SUPABASE_KEY` override the defaults — intended for pointing at a
**different local stack**. The harness refuses any non-localhost host: this suite signs
up users it cannot delete and hard-deletes `games` rows, which cascades every member's
played and preference state away irreversibly. Targeting a hosted project therefore
needs a deliberate `DB_TESTS_ALLOW_REMOTE=1`, and you almost certainly do not want it.
