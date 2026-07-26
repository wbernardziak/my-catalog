# AI Play Recommendation with Reasoning — Plan Brief

> Full plan: `context/changes/ai-play-recommendation/plan.md`
> Research: `context/changes/ai-play-recommendation/research.md`

## What & Why

Build the product differentiator: a `/play` "What should we play?" flow where a
household member enters play context (player count, time, genre) and gets
AI-ranked board-game suggestions **from their own catalog**, each with a short
reasoning, plus clear failure and "no suitable game found" states (US-01, FR-007,
FR-008). The hard part — a guarded ranking service — already exists; this slice
wires it into a UI.

## Starting Point

F-01 already delivered `recommend(criteria, candidates)`: a fully-tested service
that returns a typed union, enforces catalog-only ranking in code, caps latency at
8s, and validates model JSON. Candidate assembly (`listCatalogGames` +
`mapRowToCandidateGame`) and a global not-configured banner also exist. What's
missing is everything user-facing: an entry point, a page, and a way to call the
service and render its result.

## Desired End State

A signed-in member opens `/play`, submits criteria, and sees a ranked list of their
own games with per-game reasoning — or a neutral "no suitable game found" panel, or
a red error panel — with a visible loading state that never hangs past ~8s.

## Key Decisions

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Request/response shape | JSON `POST /api/recommendations` + client `fetch` | Transient inline AI results don't fit the app's PRG-everywhere convention; isolated, documented departure | Plan |
| HTTP status | Always `200` with the union in the body | Simplest, most robust client contract — switch on `ok`/`reason` | Plan |
| Candidate scope | Whole live catalog, LLM ranks | Simplest; fits ≤5s NFR at household size; prompt already encodes ranking order | Plan |
| Location | Dedicated `/play` page | Keeps catalog focused; matches the flow naming | Plan |
| Criteria | Player count required; time + genre optional | Matches PRD's primary constraint while keeping the form quick | Plan |
| Candidate derivation | Server-side from DB, never client-sent | Preserves the catalog-only guarantee at the trust boundary | Research |
| Nav entry points | Inline on dashboard + catalog | Topbar renders only on the landing page, not authed pages | Research |
| Testing | Extract pure logic to a tested module; manual-verify route + island | Repo has no Astro/DB/jsdom test harness | Research |

## Scope

**In scope:** a pure view module (`recommendationView.ts`), a JSON route
(`api/recommendations.ts`), a `/play` page + island, and inline nav links.

**Out of scope:** any change to `recommend()` or its tests; a DB migration;
deterministic pre-filtering; result persistence/history; broad JSON/`fetch`
adoption; a Topbar link; jsdom/RTL rendering tests.

## Architecture / Approach

Split along the existing trust boundary. **Server (Phase 1):** a pure, unit-tested
module (criteria validation, recommendation enrichment by `gameId`, `reason` → copy)
plus a JSON route that assembles candidates server-side, calls `recommend()`, and
returns the enriched union. The route enriches recommendations with display fields
so the client never receives the whole catalog. **Client (Phase 2):** a `/play`
shell and an island that collects criteria, `fetch`es the route, and renders
results / failure / no-match using the shared copy map.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Server foundation | Pure view module (tested) + JSON `POST /api/recommendations` | First JSON route in a PRG-only app; correct `null→undefined` preference handling |
| 2. Page + island + nav | `/play` page, criteria form island with all result states, inline entry points | First client `fetch`; island rendering only manually verifiable |

**Prerequisites:** F-01 (done), S-01 catalog (done), S-04 per-member state (done).
An OpenRouter key is needed only for happy-path manual verification; all other
states work without it.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Whole-catalog candidates assume a small household catalog; large catalogs would
  need the deferred pre-filtering path.
- The island's rendering has no automated coverage — correctness of the four result
  states rests on manual verification (consistent with the rest of the app).
- Happy-path and live smoke test require a real OpenRouter key to be present.

## Success Criteria (summary)

- A member gets ranked, catalog-only suggestions with reasoning for valid criteria.
- No-match and failure states render as distinct, readable panels.
- `npm run build` + `npm run lint` pass and the new pure module is unit-tested.
