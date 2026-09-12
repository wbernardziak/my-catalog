---
date: 2026-09-12T16:17:27Z
researcher: Wojciech Bernardziak
git_commit: 4a705aef5e181930a2b83b0da7baadd8cb741af5
branch: main
repository: wbernardziak/my-catalog
topic: "Per-member state attribution: where member identity enters, what enforces it, and what a test could actually catch"
tags: [research, codebase, rls, supabase, member-attribution, game_played, game_preference, test-rollout-phase-2]
status: complete
last_updated: 2026-09-12
last_updated_by: Wojciech Bernardziak
---

# Research: Per-member state attribution

**Date**: 2026-09-12T16:17:27Z
**Researcher**: Wojciech Bernardziak
**Git Commit**: 4a705aef5e181930a2b83b0da7baadd8cb741af5
**Branch**: main
**Repository**: wbernardziak/my-catalog

## Research Question

Rollout Phase 2 of `context/foundation/test-plan.md`, covering Risk #1: a household
member's played state or like/dislike is attributed to the other member, or one
member's personal state is readable or writable as the other's.

Per §2 Risk Response Guidance, ground: where household-member identity enters the
request, how it reaches the persisted row, and **whether RLS or app code is the
actual authority**. Verify — do not accept — the guidance's claim that "the
database must deny it too, not just the application query".

Scope agreed before research: writes, reads and aggregates; static reading of the
policies **plus a live probe** against the local stack.

## Summary

The guidance is half right, and the half that is wrong is the half the phase was
going to be built on.

**Writes are enforced by the database.** `game_played` and `game_preference` both
carry `with check (member_id = auth.uid())` on INSERT and `using` + `with check` on
UPDATE/DELETE. A live probe with two real authenticated members confirms it: member
B's attempt to insert a row carrying A's `member_id` is rejected `403`, and B's
UPDATE and DELETE against A's rows affect zero rows. A DB-level write-own test
would pass today. It is worth writing as a regression guard, but it will not expose
a gap.

**Reads are not enforced by anything except one line of application code.** SELECT
is `using (true)` on both tables. The only thing scoping a read to one member is the
pair of `.eq("member_id", memberId)` calls in `listMemberState`
(`src/lib/services/memberGameState.ts:114-115`). Every scoped read path in the app —
`/catalog` and `/api/recommendations` — funnels through that one function. Drop
either filter and the app silently merges both members' state, with no error and no
database backstop.

**And the risk is misnamed.** Risk #1 says "readable or writable as the other's",
which reads as an isolation guarantee. The PRD does not offer one.
`context/foundation/prd.md:45` asks that state stay **attributable** to the correct
member; `prd.md:94` puts the confidentiality boundary at "logged-in household
members", i.e. signed-in vs. anonymous, not member vs. member. FR-006 (`prd.md:82`,
per-member preference statistics) actively **requires** cross-member reads, and
`/stats` is built on them. A test asserting "member B cannot read member A's
preference" would fail by design — the same trap that forced Risk #2 to be amended
during phase 1.

So the testable content of Risk #1 is: **write-own holds at the policy layer, and
reads attribute the right rows to the right member.** Not isolation.

## Detailed Findings

### The authority question, answered empirically

Live probe against the local stack (`http://127.0.0.1:54331`), two real signed-up
members, requests issued to PostgREST with each member's own access token:

| #   | Action as member B                    | Result                                                   |
| --- | ------------------------------------- | -------------------------------------------------------- |
| 1   | read A's `game_played` row            | `200`, **row returned**                                  |
| 2   | read A's `game_preference` row        | `200`, **row returned**                                  |
| 3   | UPDATE A's preference to `disliked`   | `200`, `[]` — 0 rows; A's row still `liked`              |
| 4   | INSERT a row carrying A's `member_id` | `403` `42501` new row violates row-level security policy |
| 5   | DELETE A's played row                 | `200`, `[]` — 0 rows; A's row survives                   |
| 6   | read `game_played` **anonymously**    | `200`, `[]` — no `anon` policy exists                    |

Post-probe DB state confirmed A's rows intact and unmodified. Probes 3 and 5 are the
subtle ones: RLS denies a non-matching write by making the rows _invisible as write
targets_, so PostgREST answers `200` with an empty array, not an error. A test that
asserts "the write was denied" by looking for an error status would pass for the
wrong reason — and would also pass if the row simply did not exist.

The live policies (`pg_policies` on the running stack) match the migrations exactly:

| table             | SELECT | INSERT                   | UPDATE                          | DELETE                   |
| ----------------- | ------ | ------------------------ | ------------------------------- | ------------------------ |
| `games`           | `true` | `true`                   | `true` / `true`                 | `true`                   |
| `game_played`     | `true` | `member_id = auth.uid()` | `member_id = auth.uid()` (both) | `member_id = auth.uid()` |
| `game_preference` | `true` | `member_id = auth.uid()` | `member_id = auth.uid()` (both) | `member_id = auth.uid()` |

All twelve policies target role `authenticated` only; no policy targets `anon`,
`public` or `service_role`, which is why probe 6 sees nothing. No migration contains
a `grant` — RLS is the only access control these migrations author.

### Why the app runs under RLS at all

`src/lib/supabase.ts:9-16` builds an `@supabase/ssr` server client with
`SUPABASE_KEY` (the **anon** key, `README.md:103`) seeded from the caller's own
`Cookie` header. The anon key is the `apikey`; the caller's access token, read from
those cookies, becomes the bearer. There is no `service_role` key anywhere in the
repo. The policies above are therefore live at runtime, not bypassed — which is what
makes a DB-level test meaningful in the first place.

`src/middleware.ts:16-19` resolves identity with `supabase.auth.getUser()` (not
`getSession()`), so `locals.user.id` is a server-verified subject rather than a
trusted cookie payload. A throw or a null client leaves `locals.user = null` —
it fails closed (`:20-27`).

### Where the member id enters a write

Two endpoints, identical shape:

- `src/pages/api/games/[id]/played.ts:54` — `setPlayed(supabase, id, context.locals.user.id, …)`
- `src/pages/api/games/[id]/preference.ts:57` — `setPreference(supabase, id, context.locals.user.id, preference)`

Neither reads a member id from the request; the only `form.get` calls are `filters`,
`played` / `preference`. `src/lib/services/memberGameState.ts` is the only module
that writes either table — upsert and delete for played (`:39`, `:50`), for
preference (`:83`, `:75`), each delete filtered on both `game_id` and `member_id`.

One structural note for the plan: `memberGameState.ts` takes `memberId: string` as a
plain argument and is agnostic about its origin. The safety property is a **call-site
invariant**, not a type-level one — nothing in the signature distinguishes a session
id from request data. Today both call sites are correct, and RLS would reject a
mismatch anyway.

### Where the member id enters a read — the single point of failure

`src/lib/services/memberGameState.ts:114-115`:

```ts
supabase.from("game_played").select("game_id").eq("member_id", memberId),
supabase.from("game_preference").select("game_id, preference").eq("member_id", memberId),
```

Its own docstring (`:104-107`) states the situation plainly: "RLS would permit
reading every member's rows (read-all), but the caller scopes to one `memberId`
here". Both scoped read paths route through it:

- `/catalog` → `catalog.astro:33` → `listCatalogGames(supabase, user.id, filters)` → `catalogGames.ts:58`
- `/api/recommendations` → `recommendations.ts:60` → the same `listCatalogGames`

The catalog is **not** a SQL join. `catalogGames.ts:58` runs the member-agnostic
`listGames` and the member-scoped `listMemberState` in parallel, then merges in
memory on `game.id` (`catalogGames.ts:28-44`).

What a dropped filter would do, in order of nastiness:

1. **`played` becomes a union.** Every game _anyone_ played renders as played for you.
2. **`preference` becomes non-deterministic.** `memberGameState.ts:125-131` builds
   `new Map(rows.map(...))` — last write wins per `game_id` — and neither query has an
   `.order()`. _Whose_ like surfaces depends on PostgREST row order. No error, no tell.
3. **A click then writes the wrong thing.** The toggles post _desired_ state derived
   from what was rendered (`GameCard.tsx:65`, `value={game.played ? "false" : "true"}`),
   so a user acting on the other member's state silently flips their own row — via a
   write that RLS correctly attributes to them.

That third step is the sharp edge: correct write-own enforcement does not save you
from a wrong read. The two halves of Risk #1 are not independent.

### `/stats` is cross-member on purpose

`src/lib/services/preferenceStats.ts:111-112` queries both tables with **no**
`.eq("member_id", …)`; `currentMemberId` is used only to label and order
(`:87-88` → "You" / "Other member" / "Other member N"). This is FR-006 working as
designed (`prd.md:82`), and the docstring says so (`:105-107`).

A test asserting "stats are scoped to one member" would fail against intent. The
real failure mode here is **mislabeling**: a wrong `currentMemberId` puts the other
member's counts under "You", and because other members are anonymous the UI gives
the user no way to detect it.

### The provider boundary

`/api/recommendations` is the only path where per-member state leaves the system.
`recommendations.ts:73-82` puts `played` and `preference` into the prompt payload
sent to OpenRouter. A wrong-member read here would transmit the other member's
preferences to a third party, colliding with `prd.md:92` ("prompts must only include
the minimum … data needed"). Worth noting that `recommendations.ts:46` tells the
model to rank by "**household** preference" while the data supplied is one member's —
the wording overstates what is sent; the behaviour is single-member.

### Client-side crossings

No member id reaches any form field: hidden inputs are `filters`, `played`,
`preference`, `loanStatus` only (`GameCard.tsx:64-65`, `:83-84`, `:100-101`,
`:120-121`). One member UUID _is_ serialized into page HTML — `created_by` rides
along on `CatalogGame` into the `client:load` island (`types.ts:63`,
`catalog.astro:95`) though it is never rendered. That identifies who added a game,
not who owns a state row; noting it as an observation, not an attribution bug.

## Code References

- `src/lib/services/memberGameState.ts:114-115` — the two `.eq("member_id", …)` calls; the sole authority for read attribution
- `src/lib/services/memberGameState.ts:125-131` — unordered `Map` build; last-write-wins makes a merged read non-deterministic
- `src/lib/services/memberGameState.ts:39,50,75,83` — every write to the two tables
- `src/lib/services/catalogGames.ts:58` — parallel fetch of shared catalog + member state
- `src/lib/services/catalogGames.ts:28-44` — the in-memory merge on `game.id`
- `src/lib/services/preferenceStats.ts:111-112` — deliberately unscoped, cross-member read
- `src/pages/api/games/[id]/played.ts:54`, `src/pages/api/games/[id]/preference.ts:57` — session-derived member id
- `src/pages/catalog.astro:24,33` — `Astro.locals.user` is the only id source
- `src/pages/api/recommendations.ts:60`, `src/lib/services/recommendations.ts:73-82` — member state into the LLM prompt
- `src/lib/supabase.ts:9-16` — anon key + caller cookies, so RLS applies at runtime
- `src/middleware.ts:16-19` — `getUser()` verification; `:5` `PROTECTED_ROUTES` excludes `/api/*`
- `supabase/migrations/20260722092117_create_member_game_state.sql:59-109` — all eight per-member policies
- `supabase/migrations/20260722092117_create_member_game_state.sql:50-56` — the "one household == one tenant" assumption
- `supabase/migrations/20260722143000_member_game_state_pk_and_indexes.sql:28-41` — composite PKs and the `game_preference → game_played` FK
- `src/test/supabaseDouble.ts:3-21` — states it honours no filters; cannot catch a dropped `.eq`

## Architecture Insights

- **Authorization is deliberately coarse and lives in RLS, not app code.** The app
  layer contributes "is there a session" plus "the member id is mine". The database
  contributes write-own and the composite FK forcing played-before-preference.
- **The trust boundary is the Supabase project, not the member.** There is no
  `profiles` / `household` / `membership` table; "household" is implicit — every
  authenticated user of the project is a member. The migration comment
  (`20260722092117…:50-56`) names this and flags that a second household would
  require a membership predicate on the SELECT policies.
- **Read-all is a feature dependency, not an oversight.** S-06 preference statistics
  cannot work without it.
- **The asymmetry is the whole story of this phase.** Writes: two independent layers
  agree (call site + RLS). Reads: one layer, one function, two lines.

## Historical Context (from prior changes)

- `context/archive/2026-07-21-played-loan-and-preference/plan-brief.md:22` — the original decision: "Read-all, write-own (`member_id = auth.uid()`) — enables S-06 per-member stats; matches 'equal owners' model; no one overwrites another's state"
- `context/archive/2026-07-21-played-loan-and-preference/plan.md:295` — `1.5 RLS verified in Studio: write-own enforced, read-all works`. **This manual Studio checkbox is the only verification write-own has ever received.**
- `context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:113-121` — finding **F7** raised exactly the read-all concern (personal like/dislike history, unlike `games`, is not shared data). Resolved as OBSERVATION/LOW by **adding the household-as-tenant comment; the policy was not changed.**
- `context/archive/2026-07-24-preference-stats/plan-brief.md:15-19` — S-06 confirms it _depends on_ read-all; "no RLS or schema work is needed"
- `context/archive/2026-07-24-ai-play-recommendation/research.md:148` — the standing lesson: "Per-member state is app-enforced, not RLS-enforced (read-all RLS). Correct attribution depends on always passing the right `memberId`."
- `context/archive/2026-09-11-testing-api-boundary-contract/research.md:54-60` — phase 1's explicit deferral: "What phase 1 can prove cheaply is the app-layer half … **The policy half is phase 2.**"
- `context/archive/2026-09-11-testing-api-boundary-contract/research.md:274-279` — the second deferral: anything claiming to prove authorization "belongs to phase 2's local-Supabase harness"

### What already exists, and why it is not enough

- `src/pages/api/games/boundary.test.ts:170-211` — asserts a request carrying
  `{ memberId: "member-b", member_id: "member-b" }` still writes `member_id: "member-a"`.
  App-layer only; its own doc comment defers the policy half to phase 2.
- `src/pages/api/games/boundary.test.ts:233-240` — asserts the played delete filters on
  both `game_id` and `member_id`, via `filterSummary()`.
- `src/lib/services/preferenceStats.test.ts:14-83` — pure in-memory grouping/labelling;
  depends on cross-member reads being allowed.
- `src/lib/services/catalogGames.test.ts` — exercises `mergeAndFilterCatalog` only,
  single-member, no DB.

All of the above run against `src/test/supabaseDouble.ts`, which "models no rows and
honours no filters". **No existing test would fail if the member filter were removed
from a read**, and nothing has ever asserted policy behaviour against a real database.

## Related Research

- `context/archive/2026-09-11-testing-api-boundary-contract/research.md` — phase 1; the RLS truth table at `:104-108` and the two deferrals above
- `context/archive/2026-07-24-ai-play-recommendation/research.md:94,148` — the "must pass `memberId` explicitly" lesson

## Corrections to `context/foundation/test-plan.md` §2 (for backport)

1. **Risk #1 wording.** "readable or writable as the other's" reads as isolation. The
   PRD offers attribution (`prd.md:45`) and a signed-in-vs-anonymous confidentiality
   boundary (`prd.md:94`), and FR-006 requires cross-member reads. Suggest: "…is
   attributed to the wrong household member — a member's own view shows the other
   member's played state or like/dislike, or a write lands under the wrong member."
2. **Risk #1 "Must challenge" cell.** "the database must deny it too, not just the
   application query" is true for writes only, and the database already does deny
   those. Suggest splitting: writes — the DB _does_ deny, assert it as a regression
   guard; reads — SELECT is `using (true)`, so the app filter is the sole authority
   and that is where the untested gap is.
3. **Risk #1 "Likely cheapest layer".** Unchanged in substance (integration +
   DB-level policy verification), but the two halves want different layers: policy
   verification for writes, and a real-database read test for attribution.

No file anchors are proposed for §2 — these are wording and intent corrections only.

## Open Questions

1. **How should the write-own policy test express denial?** RLS denies UPDATE/DELETE
   by returning zero rows (`200`, `[]`), not an error; only INSERT raises `42501`.
   A test must assert _state unchanged_, not _error raised_, or it will pass vacuously.
   Recommend the plan settle this explicitly.
2. **Does the harness start the local stack, or assume it is running?** No test has
   ever needed a database. `npx supabase start` takes real time and needs Docker, and
   CI currently runs neither. Whether phase 2's suite is CI-gated or local-only is a
   plan decision with a §5 quality-gate consequence.
3. **Does phase 2 change any policy, or only test it?** If the household ever stops
   being one tenant, the SELECT policies need a membership predicate
   (`20260722092117…:50-56`). Recommend explicitly out of scope — but if a migration
   _is_ added, `context/foundation/lessons.md` requires `npx supabase db push --linked`
   as the final step.
4. **Is `/stats` mislabeling worth a test?** A wrong `currentMemberId` swaps "You" with
   an anonymous other member and is undetectable in the UI. It is attribution-shaped
   and in scope for Risk #1, but the cheapest layer is a pure unit test that
   `preferenceStats.test.ts` may already partly cover.
