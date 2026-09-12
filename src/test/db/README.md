# Database-backed tests

These tests drive a **real local Supabase stack**. They are the only place in this
repo where a claim about authorization or row visibility is legitimate.

## What this harness proves

- **Real policy behaviour.** Queries go out over `@supabase/supabase-js` carrying a
  real member's JWT, so the RLS predicates that run are the ones production runs.
  A loosened `with check` shows up here and nowhere else.
- **Real row visibility.** Two members' rows genuinely coexist in the database, so a
  read that forgets to scope by `member_id` returns the other member's rows — the
  regression that no other suite in this repo can see.

## What it costs

- Docker, and a stack started with `npx supabase start` (this repo's stack is
  `project_id = "my-catalog"` on ports 54330-54339, API `54331`).
- Seconds per run rather than milliseconds. That is why these tests live in their own
  vitest project, out of `npm test`.

## Contrast with `src/test/supabaseDouble.ts`

The double is the right tool for "was a write issued?" and nothing more — it models no
rows and honours no filters, so it can never prove that a query came back scoped. Its
own doc comment says so. When a question is about **whether the data that came back was
the right member's**, or **whether the database would refuse**, it belongs here.

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

`SUPABASE_URL` and `SUPABASE_KEY` override the local defaults if you point elsewhere.
