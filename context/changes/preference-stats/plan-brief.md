# Preference statistics per member — Plan Brief

> Full plan: `context/changes/preference-stats/plan.md`

## What & why

Give a household member a read-only `/stats` view of **preference statistics per
household member** — Played / Liked / Disliked counts for each member, side by side
(PRD FR-006, roadmap S-06). It's the last MVP slice and the only nice-to-have; it exists
to let the household compare who has played and liked what.

## Starting point

The per-member data is already there: S-04's `game_played` and `game_preference` tables
carry `member_id` and were **deliberately given read-all RLS so any member can read
everyone's rows** — precisely to enable this slice. What's missing is a view that
aggregates and shows it. Identity is only `auth.uid()`: the current member's email is
available (`Astro.locals.user`), but there is no `profiles` table and the anon Supabase
client can't read `auth.users`, so other members can't be named.

## Desired end state

A signed-in member opens `/stats` (Topbar link) and sees a comparison table: rows =
Played/Liked/Disliked, columns = **You** and **Other member**, computed from live rows.
No data yet → a friendly message linking to `/catalog`. No writes, no schema change.

## Key decisions made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Whose stats | Both members: **You + Other member** | Realizes FR-006 "per member" plural with zero new schema | Plan |
| Member labeling | "You" (current) / "Other member" (unnamed) | Anon client can't resolve other members' emails; no profiles table | Plan |
| Metrics | **Played, Liked, Disliked** counts | Directly answers "preference statistics"; clear and complete | Plan |
| Location | New protected `/stats` page + Topbar link | Room to grow, matches the per-page pattern (`catalog.astro`) | Plan |
| Empty state | Friendly message + link to `/catalog` | Guides the user to the action that fills the view | Plan |
| Layout | Side-by-side comparison table (scrolls on mobile) | At-a-glance comparison; compact | Plan |
| Aggregation | Pure `computeMemberStats` + thin DB wrapper, in memory | Mirrors `mergeAndFilterCatalog`; small data volume, no RPC | Plan |

## Scope

**In scope:** `MemberStat` type; pure aggregation service + unit tests; `/stats` page;
`PreferenceStatsTable.astro`; `PROTECTED_ROUTES` entry; Topbar link.

**Out of scope:** any migration / RLS / schema change; a `profiles` table or email
resolution; write actions; derived metrics (ratios, totals); charts; per-genre breakdowns.

## Architecture / approach

Bottom-up on the existing service seam. `computeMemberStats(played, preference,
currentMemberId)` is a pure function grouping rows by `member_id` → one `MemberStat` per
member (current first, "You"; others "Other member", deterministic order).
`listPreferenceStats(supabase, memberId)` fetches all `game_played` + `game_preference`
rows and delegates to it. `stats.astro` renders via `PreferenceStatsTable.astro`, guarded
exactly like `catalog.astro`. No migration — reads existing tables only.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Service + types + tests | `MemberStat`, `computeMemberStats` + `listPreferenceStats`, unit tests | Ordering/labeling ("You" first, "Other member" suffixing) correctness |
| 2. Page + navigation | `/stats` page, table component, route guard, Topbar link | Empty-state trigger + mobile table overflow |

**Prerequisites:** S-04 done (present) — `game_played` / `game_preference` live in prod.
No new migration, so no prod push needed.
**Estimated effort:** ~1 short session across 2 phases.

## Open risks & assumptions

- Read-all RLS = "any authenticated user of this project"; the You + Other view assumes
  the documented single household. Multi-household would leak across — out of scope
  (already flagged in the S-04 migration).
- Other members remain unnamed; if the household later wants real names, that's a
  follow-up `profiles`-table change, not this slice.
- In-memory grouping assumes small data volume (PRD `data_volume: small`) — correct for
  MVP; a SQL `group by` would be the large-scale form.

## Success criteria (summary)

- A member sees Played/Liked/Disliked counts for themselves ("You") and each other
  member, You column first, matching what they set on `/catalog`.
- With no preference data, they see a friendly empty message linking to the catalog.
- `/stats` is auth-gated and the table stays within the page on mobile.
