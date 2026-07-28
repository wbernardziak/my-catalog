# AI Play Recommendation with Reasoning — Implementation Plan

## Overview

Wire the already-built, guarded `recommend()` service (F-01) into a user-facing
"What should we play?" flow. A household member visits `/play`, enters play
context (required player count; optional available time and genre), and receives
AI-ranked board-game suggestions drawn **only from the household catalog**, each
with a short reasoning — plus clear failure and "no suitable game found" states
(US-01, FR-007, FR-008).

This is a **thin wiring slice**, not an AI build. The ranking service, its
guardrails (catalog-only enforced in code, 8s hard abort, typed failure union),
and its unit tests already exist and must be reused untouched.

## Current State Analysis

- **The ranking service is done and tested.** `recommend(criteria, candidateGames)`
  at `src/lib/services/recommendations.ts:59` returns a discriminated union without
  throwing, drops any `gameId` not in the input candidate set, caps latency at 8s,
  and validates model JSON with Zod. It needs **no changes and no new tests**.
- **Candidate assembly already exists.** `listCatalogGames(supabase, memberId, {})`
  (`src/lib/services/catalogGames.ts:53`) returns per-member-enriched `CatalogGame[]`
  with soft-deleted games already excluded; `mapRowToCandidateGame(row, state?)`
  (`src/types.ts:136`) maps a row to the `CandidateGame` contract.
- **No JSON API route and no client `fetch` exist anywhere.** Every mutating route
  is PRG (form POST → server redirect with `?error=`), input is FormData validated
  by a module-scope Zod schema. A transient, inline AI result does not fit PRG; this
  slice introduces the app's first JSON route + client `fetch` as a deliberate,
  isolated departure.
- **Page/island conventions are established.** `catalog.astro` / `stats.astro` show
  the shell (`bg-cosmic min-h-screen` → `mx-auto max-w-…` → gradient `<h1>` +
  `← Dashboard` link). Failure/empty panels already have canonical styling (red
  panel for errors, neutral panel for empty states). Reusable form primitives live
  in `src/components/auth/` (`FormField`, `SubmitButton`, `ServerError`).
- **`not_configured` surfaces globally for free.** `config-status.ts:19` declares the
  OpenRouter entry and `Layout.astro:22-37` renders a global banner on every page
  when the key is missing.
- **Auth gating is prefix-based.** `PROTECTED_ROUTES` in `middleware.ts:4` — a new
  `/play` page must be added to this array.
- **Nav reality:** `Topbar.astro` renders only on `Welcome.astro` (the landing page),
  not on authed app pages. Authed pages carry their own inline links, so entry points
  to `/play` belong inline on `dashboard.astro` and `catalog.astro`.
- **Tests are pure-unit only** (Vitest, node env). No Astro-context mock, no DB mock,
  no jsdom/RTL. Pure logic must be extracted into a testable module; route branches
  and island rendering are covered by manual verification.

## Desired End State

A signed-in member can open `/play`, enter criteria, submit, and see:

- **Success:** a ranked list of games (rank 1 = best) from their own catalog, each
  with the model's one-line reasoning and the game's title/genre/player-range/time.
- **No match:** a neutral "no suitable game found" panel (the `no_match` state).
- **Failure:** a red error panel with human copy for `timeout` / `provider_error` /
  `invalid_response` / `not_configured`.
- **While waiting:** a loading state; the request cannot hang past the service's 8s cap.

Verification: `npm run lint` and `npm run build` pass; the new pure module's unit
tests pass; manual walkthrough of all four result states plus the optional live
smoke test with a real key succeeds.

### Key Discoveries:

- The service is the trust boundary — the UI only maps `reason` → copy and renders
  `recommendations` (`recommendations.ts:59`, architecture insight in research).
- `RankedRecommendation` carries only `gameId` / `reason` / `rank` (`types.ts:164`) —
  **no display fields**. The server must enrich each recommendation by joining
  `gameId` back to the candidate list it already holds, so the client never receives
  the full catalog.
- `null → undefined` preference quirk at the call site: `CatalogGame.preference` is
  `"liked" | "disliked" | null` but `mapRowToCandidateGame` expects `undefined` —
  convert with `?? undefined` (`research.md`, `types.ts:97,138`).
- Candidates must be re-derived **server-side** from the DB, never trusted from the
  client, to preserve the catalog-only guarantee (research architecture insight).
- `RecommendationCriteria` fields are all optional (`types.ts:15`); the "player count
  required" rule is a **UI/route validation** decision, not a contract change.

## What We Are NOT Doing

- **Not** modifying `recommend()`, its prompt, its guardrails, or its tests.
- **Not** adding a database migration (no schema change is needed).
- **Not** pre-filtering candidates deterministically — we send the whole live catalog
  and let the service rank (fits the small-household scale and the ≤5s NFR).
- **Not** converting the app to JSON/`fetch` broadly — the JSON route is a single,
  documented exception scoped to this flow.
- **Not** persisting recommendations, adding history, or logging AI results.
- **Not** adding a `Topbar` link (Topbar is not on authed pages); entry points are
  inline on dashboard + catalog.
- **Not** introducing jsdom/RTL to test the island; rendering is manually verified.

## Implementation Approach

Split responsibility along the existing trust boundary. **Phase 1** builds the
server side: a pure, unit-tested view module (criteria parsing/validation,
recommendation enrichment, `reason` → copy mapping) plus a JSON `POST` route that
assembles candidates server-side, calls `recommend()`, and returns the enriched
union as `200 JSON`. **Phase 2** builds the client: a `/play` page shell and an
island that collects criteria, `fetch`es the route, and renders the ranked results
/ failure / no-match states using the shared copy map, plus inline nav entry points.

The route always returns HTTP `200` with the discriminated union in the body — the
client switches on `ok` / `reason`, which is the simplest and most robust client
contract (research Open Question 3, decided at plan time).

## Phase 1: Server foundation — pure view module + JSON route

### Overview

Create the testable pure logic and the JSON endpoint that turns criteria into an
enriched recommendation result, so the UI in Phase 2 is a dumb renderer.

### Changes Required:

#### 1. Recommendation view module (pure, testable)

**File**: `src/lib/services/recommendationView.ts` (new)

**Purpose**: Hold all the pure logic the route and UI need, so it can be unit-tested
without Astro/DB/React. Three responsibilities: (a) parse+validate raw criteria input
into a `RecommendationCriteria`, (b) enrich a `RankedRecommendation[]` against the
candidate list into a display view-model, (c) map a failure `reason` to user-facing
copy plus a panel kind (error vs. neutral).

**Contract**:

- Export a Zod schema + parse helper for criteria: `playerCount` **required**,
  coerced positive integer; `availableMinutes` optional, coerced positive integer;
  `genre` optional, trimmed non-empty string (empty → omitted). Returns a
  `RecommendationCriteria` or a validation error carrying the first issue message
  (mirroring the FormData routes' `.safeParse` + first-issue pattern at
  `api/games/index.ts:67-78`).
- Export `RecommendationViewItem` = `RankedRecommendation` fields (`rank`, `reason`)
  plus display fields sourced from the matching `CandidateGame` (`title`, `genre`,
  `minPlayers`, `maxPlayers`, `averagePlayMinutes`). Export
  `enrichRecommendations(recommendations, candidates): RecommendationViewItem[]` that
  joins by `gameId`, preserves `rank` order, and skips any id absent from candidates
  (defense-in-depth; the service already enforces catalog-only).
- Export `describeFailure(reason): { kind: "error" | "empty"; message: string }` where
  `no_match` → `kind: "empty"` (neutral "no suitable game found" copy) and the other
  four reasons → `kind: "error"` with distinct English copy. Copy language matches the
  English page shells (`catalog`/`dashboard`/`stats`); the global `not_configured`
  banner is separate and automatic.

#### 2. JSON recommendation route

**File**: `src/pages/api/recommendations.ts` (new)

**Purpose**: The single server entry point. Authenticate, assemble candidates
server-side from the DB, call `recommend()`, and return the enriched union as JSON.

**Contract**:

- `export const prerender = false;` + `export const POST: APIRoute`.
- Build the client via `createClient(context.request.headers, context.cookies)`;
  self-gate: no client → return `503 { error: "…" }` (a generic server-config error —
  do **not** reuse `reason: "not_configured"`, which specifically means "no OpenRouter
  key" at `recommendations.ts:64` and would show the wrong copy). This branch is
  effectively unreachable behind the auth gate: `/play` is in `PROTECTED_ROUTES` and
  middleware needs Supabase to resolve a user, so a missing client redirects to signin
  before the route runs — it is defensive only. No `context.locals.user` → `401` JSON
  (also defensive, same gating).
- Parse the JSON request body, validate via the Phase-1 criteria helper; on failure
  return `400 { error: <first issue message> }`.
- Assemble candidates server-side:
  ```ts
  const candidates = (await listCatalogGames(supabase, user.id, {})).map((g) =>
    mapRowToCandidateGame(g, { played: g.played, preference: g.preference ?? undefined }),
  );
  ```
- Call `const result = await recommend(criteria, candidates);`. On `ok:true`, return
  `200 { ok: true, recommendations: enrichRecommendations(result.recommendations, candidates) }`.
  On `ok:false`, return `200 { ok: false, reason: result.reason }`. Wrap DB assembly in
  try/catch → `200 { ok: false, reason: "provider_error" }` is wrong for a DB failure;
  instead return `500 { error: "…" }` for an unexpected server/DB error so it is
  distinguishable from a modeled failure.

### Success Criteria:

#### Automated Verification:

- [ ] Type-check + build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] New unit tests for `recommendationView.ts` pass: `npx vitest run src/lib/services/recommendationView.test.ts`
- [ ] Unit tests cover: criteria validation (missing player count rejected; optional
      fields omitted when blank; coercion of numeric strings), enrichment (join by
      `gameId`, rank order preserved, unknown id skipped), and `describeFailure`
      mapping for all five reasons.

#### Manual Verification:

- [ ] `POST /api/recommendations` with a valid body returns a 200 JSON union (inspect
      via browser devtools or `curl` against `npm run dev`).
- [ ] With no OpenRouter key, the route returns `{ ok: false, reason: "not_configured" }`.
- [ ] A malformed/empty body returns `400` with a readable error message.

**Implementation note**: After Phase 1's automated checks pass, stop for human
confirmation that the manual route checks succeeded before starting Phase 2.

---

## Phase 2: `/play` page, island UI, and navigation

### Overview

Build the user-facing flow on top of the Phase 1 route: a criteria form that
`fetch`es the endpoint and renders ranked results / failure / no-match, plus the
inline entry points that lead members to it.

### Changes Required:

#### 1. Protect the new route

**File**: `src/middleware.ts`

**Purpose**: Gate `/play` behind auth like the other app pages.

**Contract**: Add `"/play"` to `PROTECTED_ROUTES` (`middleware.ts:4`).

#### 2. `/play` page shell

**File**: `src/pages/play.astro` (new)

**Purpose**: Server-rendered shell that mounts the island, mirroring the catalog/stats
layout so it reads as part of the app.

**Contract**: `<Layout title="What should we play?">`; body `bg-cosmic min-h-screen`
→ `mx-auto max-w-…` → header with gradient `<h1>` + `← Dashboard` back link (mirror
`catalog.astro:46-54`). Mount the island `client:load`. No server data fetch is needed
here — the island drives everything via `fetch`. (The global not-configured banner
from `Layout` still renders automatically if the key is missing.)

#### 3. Recommendation flow island

**File**: `src/components/play/RecommendationFlow.tsx` (new)

**Purpose**: Collect criteria, call the route, and render every result state.

**Contract**: Default-export React component mounted `client:load`. State: one field
per input (`playerCount` required, `availableMinutes` + `genre` optional), plus
`status: "idle" | "loading" | "done"`, and the last result. On submit: client-side
validate (player count required positive integer — mirror `GameForm.tsx`'s local
`validate()`), then `fetch("/api/recommendations", { method: "POST", body: JSON… })`,
set `loading`, and handle the response. **The route returns the union body only at
200; 400/401/500 return `{ error }` instead. Guard the transport/error cases before
touching the union:**

- A thrown `fetch` (network failure) OR a non-`ok` HTTP status OR a 200 body missing an
  `ok` field → render the red error panel (`kind:"error"`) with a generic fallback
  message (`describeFailure` fallback / a shared "something went wrong" copy). Do **not**
  pass an undefined reason into the union switch.
- Otherwise switch on the union:
  - `ok:true` → render the ranked `RecommendationViewItem[]` (rank badge, title, reason,
    genre/player-range/time), sorted by `rank`.
  - `ok:false` → call `describeFailure(reason)` and render the red error panel
    (`kind:"error"`) or the neutral empty panel (`kind:"empty"`, the "no suitable game
    found" state), reusing the canonical panel classes from `catalog.astro:57-79`.
    Reuse `FormField` / `ServerError` from `src/components/auth/` and the
    genre `datalist` pattern from `GameForm.tsx:171` where practical. Keep all copy in the
    shared `describeFailure` map; do not inline reason strings.

**Loading state**: do **not** rely on `SubmitButton`'s `pending` — it derives from
`useFormStatus()` (`SubmitButton.tsx:12`), which only reports pending inside a native
form submission, and this island submits via `fetch` (preventDefault), so it would
stay `false` and the spinner would never fire. Instead drive the submit button's
`disabled`/pending directly from the island's own `status === "loading"` (a local
button or an explicit `pending` prop), satisfying success criterion 2.9.

#### 4. Navigation entry points

**Files**: `src/pages/dashboard.astro`, `src/pages/catalog.astro`

**Purpose**: Give members a discoverable way into the flow.

**Contract**: On `dashboard.astro`, add a "What should we play?" link/button beside the
existing "View catalog" button. On `catalog.astro`, add an inline "What should we play?"
link in the header near the `← Dashboard` link. Match existing link styling
(`text-purple-300 hover:underline` / the purple button classes). Topbar is intentionally
untouched (it renders only on the landing page).

### Success Criteria:

#### Automated Verification:

- [ ] Type-check + build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Formatting clean: `npm run format`

#### Manual Verification:

- [ ] Visiting `/play` while signed out redirects to `/auth/signin` (PROTECTED_ROUTES gate).
- [ ] Submitting without a player count is blocked client-side with a clear message.
- [ ] With a valid OpenRouter key and games in the catalog, a happy-path submit shows a
      ranked list with per-game reasons, ordered rank 1 first.
- [ ] The `no_match` state (e.g. criteria no game satisfies) shows the neutral
      "no suitable game found" panel.
- [ ] A forced failure (e.g. no key → `not_configured`) shows the red error panel with
      readable copy, and the global config banner also appears.
- [ ] Loading state is visible during the call and the UI never hangs past ~8s.
- [ ] **Optional live smoke test** (closes the open F-01 item): with a real key, confirm
      an end-to-end recommendation returns catalog-only games with sensible reasons.

**Implementation note**: After Phase 2's automated checks pass, stop for human
confirmation of the manual walkthrough before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- `recommendationView.ts`: criteria validation (required player count, optional
  fields, numeric coercion, first-issue message), `enrichRecommendations` (join,
  order, unknown-id skip), `describeFailure` (all five reasons → correct kind + copy).

### Integration Tests:

- None automated (repo has no Astro-context/DB mock harness). The route and island are
  covered by the manual verification steps above, consistent with the rest of the app.

### Manual Testing Steps:

1. Run `npm run dev`; sign in.
2. From dashboard, click "What should we play?" → lands on `/play`.
3. Submit with no player count → blocked with a message.
4. Submit valid criteria → ranked results with reasons appear.
5. Submit criteria yielding no match → neutral empty panel.
6. Unset the key and retry → red error panel + global banner.
7. (Optional) With a real key, verify catalog-only results and reasoning quality.

## Performance Considerations

Whole-catalog candidates are fine at household scale and keep the request within the
service's ≤5s NFR / 8s hard cap. If a catalog ever grows large enough to strain the
prompt, revisit deterministic pre-filtering (explicitly deferred here).

## Migration Notes

None — no schema change. (Per `lessons.md`, a migration would require
`npx supabase db push --linked`; not applicable to this slice.)

## References

- Related research: `context/changes/ai-play-recommendation/research.md`
- Ranking service (reuse as-is): `src/lib/services/recommendations.ts:59`
- Contracts: `src/types.ts:15` (criteria), `:31` (`CandidateGame`), `:136`
  (`mapRowToCandidateGame`), `:164` (`RankedRecommendation`), `:180` (`RecommendationResult`)
- Candidate assembly: `src/lib/services/catalogGames.ts:53`
- Route conventions (PRG/Zod/auth-gate to adapt for JSON): `src/pages/api/games/index.ts:56-87`
- Page shell + state panels: `src/pages/catalog.astro:12,46-104`
- Island + reusable primitives: `src/components/catalog/GameForm.tsx:116-175`
- Protected routes: `src/middleware.ts:4`
- Not-configured banner (automatic): `src/lib/config-status.ts:19` + `src/layouts/Layout.astro:22-37`
- F-01 plan (prior art, open smoke-test item): `context/archive/2026-07-09-llm-recommendation-service/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step is
> complete. Do not rename step titles.

### Phase 1: Server foundation — pure view module + JSON route

#### Automated

- [x] 1.1 Type-check + build passes: `npm run build` — e83c9c7
- [x] 1.2 Lint passes: `npm run lint` — e83c9c7
- [x] 1.3 `recommendationView.ts` unit tests pass: `npx vitest run src/lib/services/recommendationView.test.ts` — e83c9c7
- [x] 1.4 Unit tests cover criteria validation, enrichment, and `describeFailure` for all five reasons — e83c9c7

#### Manual

- [x] 1.5 `POST /api/recommendations` with a valid body returns a 200 JSON union — verified via curl (authed): `{"playerCount":3}` → 200 `{"ok":false,"reason":"not_configured"}`
- [x] 1.6 No OpenRouter key → route returns `{ ok: false, reason: "not_configured" }` — verified via curl (no key in .dev.vars)
- [x] 1.7 Malformed/empty body → `400` with a readable error message — verified: empty & malformed JSON → 400 `{"error":"Invalid request body."}`; missing playerCount → 400 `{"error":"Player count is required"}`

### Phase 2: `/play` page, island UI, and navigation

#### Automated

- [x] 2.1 Type-check + build passes: `npm run build` — c21bfc6
- [x] 2.2 Lint passes: `npm run lint` — c21bfc6
- [x] 2.3 Formatting clean: `npm run format` — c21bfc6

#### Manual

- [x] 2.4 Signed-out visit to `/play` redirects to `/auth/signin` — verified via curl: GET /play (no session) → 302 → /auth/signin
- [x] 2.5 Submitting without player count is blocked client-side with a clear message — verified in browser: Players field goes red with "Player count is required and must be a whole number of at least 1", no fetch fires (result panel stays idle)
- [x] 2.6 Happy path shows a ranked list with per-game reasons, rank 1 first — marked done at author's direction; not exercised
- [x] 2.7 `no_match` shows the neutral "no suitable game found" panel — marked done at author's direction; not exercised
- [x] 2.8 Forced failure shows the red error panel with readable copy + global banner — verified in browser: Players=3 submit (no key) → red panel "AI recommendations aren't configured yet…" + global not-configured banner both shown
- [x] 2.9 Loading state is visible and the UI never hangs past ~8s — no-hang confirmed against the error panel; the spinner during a slow call was not observed, marked done at author's direction
- [x] 2.10 Optional live smoke test with a real key returns catalog-only games with sensible reasons — marked done at author's direction; not exercised
