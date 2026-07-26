---
date: 2026-07-24T17:09:36Z
researcher: Wojciech Bernardziak
git_commit: d0eeefb6390608dc84d993722179fb1c42338c9c
branch: main
repository: my-catalog
topic: "S-05 AI play recommendation — wiring the guarded LLM service into a 'What should we play?' flow"
tags: [research, codebase, ai-play-recommendation, recommendations, llm, catalog]
status: complete
last_updated: 2026-07-24
last_updated_by: Wojciech Bernardziak
---

# Research: S-05 AI play recommendation with reasoning

**Date**: 2026-07-24T17:09:36Z
**Researcher**: Wojciech Bernardziak
**Git Commit**: d0eeefb6390608dc84d993722179fb1c42338c9c
**Branch**: main
**Repository**: my-catalog

## Research Question

What does the codebase already provide, and what conventions must S-05
(`ai-play-recommendation`) follow, to build the "What should we play?" flow:
a household member enters play context (player count, available time, genre)
and receives AI-ranked board-game suggestions from the household catalog, each
with reasoning — plus clear failure and "no suitable game found" states
(US-01, FR-007, FR-008)?

## Summary

**The hard part is already built.** F-01 delivered a complete, fully-tested,
guarded ranking service — `recommend(criteria, candidateGames)` at
[`src/lib/services/recommendations.ts:59`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L59)
— that returns a discriminated union (`ok:true` with ranked reasons, or `ok:false`
with a typed `reason`), enforces the catalog-only invariant **in code** (not just
the prompt), bounds latency to an 8s hard abort, and validates the model JSON with
Zod. The env (`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`) is wired, and a missing key
already raises a **global config banner automatically** on every page.

S-05 is therefore a **thin wiring slice**, not an AI build. It needs three things:

1. **Assemble `CandidateGame[]`** for the calling member — reuse
   `listCatalogGames(supabase, userId, {})` and map each row with
   `mapRowToCandidateGame(row, { played, preference })`. No new DB work.
2. **A server entry point** that calls `recommend()` and returns the result.
3. **A page + island** for entering criteria and rendering ranked results /
   failure / no-match states.

**The one real design decision:** every existing mutating route in this app is
PRG (form POST → server redirect), and there is **no JSON API and no client-side
`fetch` precedent** anywhere. A recommendation flow that shows transient AI results
inline naturally wants a JSON route + client `fetch`. That is a deliberate,
isolated departure from convention and is the main thing `/10x-plan` must decide
(see [Open Questions](#open-questions)).

## Detailed Findings

### The F-01 recommendation service (the prerequisite, done)

- `recommend(criteria: RecommendationCriteria, candidateGames: CandidateGame[]): Promise<RecommendationResult>` — [`recommendations.ts:59`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L59).
- Returns **without throwing** a discriminated union ([`types.ts:180`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/types.ts#L180)):
  - `{ ok: true, recommendations: RankedRecommendation[] }` — sorted by `rank` (1 = best), each with `gameId` + human-readable `reason`.
  - `{ ok: false, reason }` where `reason ∈ {not_configured, timeout, provider_error, invalid_response, no_match}`.
- **Guardrails baked in** (S-05 must NOT reinvent):
  - No key → `not_configured`, no network call ([`recommendations.ts:63`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L63)).
  - Empty candidates → `no_match`, no network call ([`recommendations.ts:67`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L67)).
  - Catalog-only invariant enforced **after** parsing: any returned `gameId` not in the input candidate set is dropped; if that empties the list → `no_match` ([`recommendations.ts:135-144`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L135)).
  - 8s `AbortSignal.timeout` hard cap; abort → typed `timeout` ([`recommendations.ts:101`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L101)).
  - Ranking guidance in the system prompt already follows PRD Business Logic order: player-count fit → genre → time → preference ([`recommendations.ts:42-50`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.ts#L42)).
- **Fully unit-tested** with a mocked `fetch` for all failure modes + happy path ([`recommendations.test.ts`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/recommendations.test.ts)). **The service needs no new tests.**
- The only open F-01 item is optional: a live smoke test with a real key (plan.md step 3.6). Worth doing during S-05 manual verification.

### Assembling `CandidateGame[]` with the caller's per-member state

- **Reuse `listCatalogGames`** — [`catalogGames.ts:53`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/catalogGames.ts#L53):
  `listCatalogGames(supabase, memberId, filters): Promise<CatalogGame[]>`. It runs `listGames` + `listMemberState` in parallel and merges: `played = state.played.has(id)`, `preference = state.preference.get(id) ?? null` ([`catalogGames.ts:28-44`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/catalogGames.ts#L28)).
- **Soft-deleted games are already excluded** — `listGames` filters `.is("deleted_at", null)` ([`games.ts:31`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/games.ts#L31)). Recommendations therefore only see live catalog rows for free.
- **Map to the contract** via `mapRowToCandidateGame(row, state?)` — [`types.ts:136`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/types.ts#L136). A `CatalogGame` extends `GameRow` so it is a valid argument; the mapper reads only snake_case fields.
- **⚠ Type mismatch to handle at the call site:** `CatalogGame.preference` is `"liked" | "disliked" | null` ([`types.ts:97`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/types.ts#L97)) but `mapRowToCandidateGame`'s `state.preference` param is `"liked" | "disliked" | undefined` ([`types.ts:138`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/types.ts#L138)). Convert `null → undefined`: `preference: catalogGame.preference ?? undefined`. Passing `null` is both a TS error and would set an invalid `CandidateGame.preference`.
- **Recommended one-liner** for the plan:
  ```ts
  const candidates = (await listCatalogGames(supabase, user.id, {}))
    .map(g => mapRowToCandidateGame(g, { played: g.played, preference: g.preference ?? undefined }));
  const result = await recommend(criteria, candidates);
  ```

### Auth, Supabase client, and RLS scoping

- The server Supabase client is built **per call site** with `createClient(request.headers, cookies)` — [`supabase.ts:5`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/supabase.ts#L5). It returns `null` when unconfigured; every caller null-checks it. Middleware does **not** put the client on `context.locals` — only the user.
- The authenticated user is resolved in middleware and stored at `context.locals.user` — [`middleware.ts:12`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/middleware.ts#L12). Use `context.locals.user.id` as `memberId`.
- **RLS is single-household read-all:** SELECT on `games`, `game_played`, `game_preference` is `using (true)` for `authenticated`; writes are write-own (`member_id = auth.uid()`). So member state does **not** auto-scope to the caller on read — you must pass `memberId` explicitly, which `listCatalogGames`/`listMemberState` already do ([`memberGameState.ts:114-115`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/services/memberGameState.ts#L114)).

### API-route conventions (and the JSON departure)

- Every route: `export const prerender = false;` + `export const POST: APIRoute = async (context) => {…}` (uppercase verb). Client via `createClient(context.request.headers, context.cookies)`; user via `context.locals.user`.
- **All existing mutating routes are PRG** — they `context.redirect(...)`, never return JSON:
  - not configured → redirect to `/catalog?error=...` ([`api/games/index.ts:57`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/api/games/index.ts#L57)).
  - unauthenticated → `context.redirect("/auth/signin")` (defense-in-depth self-gate, [`api/games/[id]/preference.ts:26`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/api/games/%5Bid%5D/preference.ts#L26)).
  - validation fail → first zod issue message in `?error=` ([`api/games/index.ts:78`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/api/games/index.ts#L78)).
- Input is **FormData** (`await context.request.formData()`), validated by a module-scope zod schema via `.safeParse` ([`api/games/index.ts:67-76`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/api/games/index.ts#L67)).
- **There is no JSON API route and no `Response`-with-status precedent in the repo.** A transient AI result rendered inline is the natural exception; see Open Questions.

### Page shell, island, and nav conventions

- **Auth gating for pages** is by prefix in `PROTECTED_ROUTES = ["/dashboard", "/catalog", "/stats"]` — [`middleware.ts:4`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/middleware.ts#L4). A new `/play` page must be **added to this array**.
- **Page shell** (mirror `stats.astro`/`catalog.astro`): wrap in `<Layout title="…">`; frontmatter builds the client + reads `Astro.locals.user`, branches into `configured` / `loadError` / data; body is `bg-cosmic min-h-screen` → `mx-auto max-w-…` → gradient `<h1>` + `← Dashboard` back link. Server error read from `Astro.url.searchParams.get("error")` ([`catalog.astro:12`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/catalog.astro#L12)).
- **Island pattern** (from `GameForm.tsx`): default-export component, mounted `client:load`; one `useState` per field; local `validate()`; native `<form method="POST">` that proceeds unless client validation fails ([`GameForm.tsx:116`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/components/catalog/GameForm.tsx#L116)). **Reuse the shared primitives** `FormField`, `SubmitButton` (uses `useFormStatus`), `ServerError` from `src/components/auth/`.
- **shadcn/ui inventory is tiny** — only `button.tsx` under `src/components/ui/`; inputs/selects/cards are hand-rolled Tailwind. Icons via `lucide-react`, class merge via `cn()`. Genre input uses a `datalist` suggestion pattern ([`GameForm.tsx:171`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/components/catalog/GameForm.tsx#L171)).
- **Failure/empty-state styling already exists:** red panel `rounded-2xl border border-red-500/30 bg-red-900/20 p-6 text-red-200` (map `timeout`/`provider_error`/`invalid_response`/`not_configured` here); neutral empty-state `border-white/10 bg-white/5 … text-blue-100/70` (map `no_match` — the "no suitable game found" state) — see `catalog.astro:57-79`.
- **Navigation:** authed links live in [`Topbar.astro:13-18`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/components/Topbar.astro#L13). Add a "What should we play?" link there, and — because the page shells use inline `← Dashboard` links rather than mounting Topbar — also add an inline entry point on `dashboard.astro`/`catalog.astro`.

### Config / not-configured UX (free for S-05)

- `config-status.ts` already declares an **OpenRouter** entry: `configured: Boolean(OPENROUTER_API_KEY)`, Polish message "OpenRouter nie jest skonfigurowany — rekomendacje AI są wyłączone." ([`config-status.ts:19`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/lib/config-status.ts#L19)).
- `Layout.astro:22-37` renders `missingConfigs` as an error `<Banner>` on **every page**, so a missing key surfaces globally with no S-05 work. The per-result `not_configured` copy still maps to the red panel for the in-flow case.

### Testing conventions

- **Vitest, node environment, pure-unit only.** `vitest.config.ts` aliases `@/*`→`src` and `astro:env/server`→`src/test/astro-env-server.stub.ts` (reads `process.env`).
- **No Astro-context mock, no DB mock, no React Testing Library / jsdom exist** in the repo — explicitly noted in [`id-endpoints.test.ts:11`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/src/pages/api/games/id-endpoints.test.ts#L11) and `GameForm.test.ts` (tests only the pure `fromRow` helper, not rendering).
- **Implication for S-05:** extract pure logic — criteria→payload building and `reason`→user-copy mapping — into a testable module (e.g. `src/lib/services/recommendationView.ts`) and unit-test that. Do not attempt to render the island or mock the handler; cover route branches by manual verification, as the rest of the app does.

## Code References

- `src/lib/services/recommendations.ts:59` — `recommend()`, the guarded ranking service (the F-01 prerequisite; reuse as-is).
- `src/types.ts:15-40` — `RecommendationCriteria` + `CandidateGame` contracts S-05 imports.
- `src/types.ts:136-157` — `mapRowToCandidateGame(row, state?)`; note the `null`→`undefined` preference handling.
- `src/types.ts:180-185` — `RecommendationResult` union; each `reason` maps to user-facing copy.
- `src/lib/services/catalogGames.ts:53` — `listCatalogGames(supabase, memberId, filters)`; reuse to build candidates.
- `src/lib/services/games.ts:31` — `.is("deleted_at", null)`; soft-deleted games already excluded.
- `src/lib/services/memberGameState.ts:109-134` — `listMemberState`; per-member played/preference read scoped by explicit `memberId`.
- `src/lib/supabase.ts:5` / `src/middleware.ts:4,12` — client construction, `PROTECTED_ROUTES`, `context.locals.user`.
- `src/pages/api/games/index.ts:56-87` — API-route conventions (prerender, auth gate, zod, PRG redirect + `?error=`).
- `src/pages/catalog.astro:12,57-79` — page shell, `?error=` read, red/neutral state panels.
- `src/components/catalog/GameForm.tsx:116-175` — island form conventions + reusable auth primitives + genre `datalist`.
- `src/lib/config-status.ts:19-25` + `src/layouts/Layout.astro:22-37` — OpenRouter not-configured banner (automatic).
- `vitest.config.ts` + `src/test/astro-env-server.stub.ts` — test harness; pure-unit only.

## Architecture Insights

- **Guardrails live in the service, not the UI.** The catalog-only invariant, latency cap, and typed failure states are all enforced inside `recommend()`. S-05 should treat the service as the trust boundary and **not** re-implement any of it — the UI only maps `reason` → copy and renders `recommendations`.
- **Server owns candidate derivation.** Mirroring the "enforced in code" ethos, S-05 should re-derive the candidate list server-side from the DB (never trust a client-sent list of games), so the catalog-only guarantee cannot be bypassed by the client.
- **The app is uniformly PRG + FormData with server-rendered error panels.** S-05's transient, inline AI result is the first flow that does not fit PRG cleanly — the single genuine architectural choice in this slice.
- **Graceful degradation is a first-class pattern** (`config-status.ts` + null-returning clients). `not_configured` is not an error path bolted on — it is the same degradation shape used for Supabase.
- **Per-member state is app-enforced, not RLS-enforced** (read-all RLS). Correct attribution depends on always passing the right `memberId` — a standing lesson for anything that reads member state.

## Historical Context (from prior changes)

- `context/archive/2026-07-09-llm-recommendation-service/plan.md` — F-01 plan: the full service contract, guardrail rationale (catalog-only enforced in code, 8s abort, minimum-data prompt), and the "What We Are NOT Doing" list that explicitly defers the UI/route/DB-sourcing to S-05. Records the Vitest harness deviation (`astro:env/server` stub instead of `getViteConfig`).
- `context/archive/2026-07-09-llm-recommendation-service/plan.md:423` — the one still-open F-01 item: an optional live smoke test with a real key. Good candidate to close during S-05 manual verification.
- `context/archive/2026-07-21-played-loan-and-preference/` — S-04, source of the per-member `game_played`/`game_preference` tables and read-all RLS that S-05's candidate enrichment reads.
- `context/foundation/roadmap.md:128-139` — S-05 slice definition, prerequisites (F-01, S-01), and the recorded unknown about tie-breaking order before the LLM ranks.
- `context/foundation/lessons.md` — applies to the plan/implement handoff: after plan-review, create a GitHub tracking issue + per-phase issues and a `feat/ai-play-recommendation` branch; push any migration to prod as the final step (S-05 likely needs **no** migration).

## Related Research

None prior for this change (this is the first `research.md` under
`context/changes/ai-play-recommendation/`). Closest related artifact is the F-01
plan under `context/archive/2026-07-09-llm-recommendation-service/`.

## Open Questions

1. **JSON route + client `fetch`, or PRG?** (The one real decision.) Transient AI
   results rendered inline fit a JSON `POST /api/recommendations` + client `fetch`
   far better than the app's PRG-everywhere convention, but that introduces the
   first JSON API route and first client `fetch`. Recommend the JSON route as a
   deliberate, isolated, documented departure — `/10x-plan` should confirm.
2. **Candidate scope — whole catalog vs. pre-filter.** Send all live games and let
   the LLM rank (simplest, fits the ≤5s NFR at a two-user catalog size), or
   deterministically pre-filter by player count/genre/time first (the PRD Business
   Logic order) and let the LLM only break ties? The roadmap records this as the
   slice's unknown ([`roadmap.md:136-137`](https://github.com/wbernardziak/my-catalog/blob/d0eeefb6390608dc84d993722179fb1c42338c9c/context/foundation/roadmap.md#L136)). For a small household catalog, whole-catalog is likely fine.
3. **HTTP status mapping.** If JSON: map `ok`/`no_match` → 200, and
   `not_configured`/`provider_error`/`timeout`/`invalid_response` → a 5xx (e.g. 503)?
   Or always 200 with the union in the body? Low-stakes; plan-level choice.
4. **Where results render.** A dedicated `/play` page (recommended) vs. a section on
   `/catalog`. `/play` keeps the catalog page focused and matches the "What should we
   play?" flow naming.
