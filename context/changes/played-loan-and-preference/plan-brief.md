# S-04: Played status, loan, and personal preference — Plan Brief

> Full plan: `context/changes/played-loan-and-preference/plan.md`

## What & why

Let a household member mark a game **played**, toggle its **loan status**, and record a **binary like/dislike** for played titles — with played state and preference attributed to the correct member (PRD FR-003, FR-005). This is the slice the roadmap flags as "worth care": it introduces the first per-member state dimension with RLS attribution, and it fills the `played`/`preference` contract the recommendation layer (S-05) already expects.

## Starting point

`games` is a single shared catalog table with a `loan_status` column that is set at add/edit time but never toggled. There is no household/member entity — identity is the Supabase auth user. `CandidateGame.played`/`preference` are declared in `src/types.ts` but always undefined, and `mapRowToCandidateGame` explicitly leaves them so ("owned by S-04"). All mutations follow one pattern: HTML form POST → API route → service → redirect to `/catalog`.

## Desired end state

On `/catalog`, a signed-in member can toggle Played / Like-Dislike (only when played) / Loan-Return on any card, seeing their own per-member state; both members can read each other's state (for S-06 later) but only write their own. The catalog can be filtered to played/not-played and liked/disliked for the current member. `mapRowToCandidateGame` returns live `played`/`preference`, so S-05 inherits real data.

## Key decisions made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Per-member data model | Two tables: `game_played`, `game_preference` | Clean separation of concerns (user preference over a single combined table) | Plan |
| Cross-member visibility (RLS) | Read-all, write-own (`member_id = auth.uid()`) | Enables S-06 per-member stats; matches "equal owners" model; no one overwrites another's state | Plan |
| Preference ↔ played | Preference requires played; un-marking played clears preference | Directly realizes FR-005; no "liked but never played" inconsistency | Plan |
| Loan status | Stays shared on `games` + quick card toggle | A physical copy is loaned globally; loan is a catalog attribute, not per-person | Plan |
| Recommendation wiring | Wire `mapRowToCandidateGame` (data only, not the AI flow) | S-04 owns this data; closes the contract S-05 already forwards | Plan |
| Catalog filters | Include played/preference filters (scoped to member) | User chose to include; merged/filtered in memory (small data volume) | Plan |
| Testing | Unit tests on services + mapper + filter parsing | Matches repo pattern; covers cascade + played-guard logic | Plan |

## Scope

**In scope:** two per-member tables + RLS; `setPlayed`/`setPreference`/`toggleLoan` services + catalog view-model; three PRG API routes; GameCard toggles; played/preference filters; `mapRowToCandidateGame` wiring; unit tests.

**Out of scope:** the AI "what should we play?" flow (S-05); preference stats view (S-06); borrower/loan-history tracking; per-member loan; 1–5 ratings; changes to `games` RLS.

## Architecture / approach

Bottom-up along the existing seam: **schema+RLS → service+types → API routes → UI**. Played = existence of a `game_played` row (mark = insert, unmark = delete + cascade-clear preference). Loan = flip of the shared column. Per-member state is merged onto the game list in a new `listCatalogGames(supabase, memberId, filters)` view-model that also applies the played/preference filters in memory, leaving `listGames` untouched.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Schema + RLS | `game_played` + `game_preference` tables, write-own policies, prod push | Getting RLS predicates right (write-own vs read-all) |
| 2. Services + types | mutations, catalog view-model, filters, mapper wiring, unit tests | Cascade-clear + played-guard correctness |
| 3. API routes | played / preference / loan PRG endpoints | Consistency with existing guard/redirect conventions |
| 4. Catalog UI | card toggles + played/preference filters | Per-member state rendering + mobile usability |

**Prerequisites:** S-01 (catalog) done — present. Local Supabase + linked prod project for the migration push.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open risks & assumptions

- In-memory merge/filter of per-member state assumes small data volume (PRD `data_volume: small`) — correct for MVP; would need a SQL join at larger scale.
- RLS "read-all" intentionally lets members see each other's preferences (required for S-06); confirm this matches the household's privacy expectation during manual verification.
- `mapRowToCandidateGame` signature change is safe because the only current caller is `src/types.test.ts` (S-05 not built yet) — verify no other call site appears at implementation time.

## Success criteria (summary)

- A member can mark played, like/dislike a played game, and toggle loan — state is theirs alone; loan is shared.
- Un-marking played removes that member's preference.
- Catalog filters by played/preference work per member; recommendation candidates carry live `played`/`preference`.
