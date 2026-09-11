# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `scripts/`,
`supabase/migrations/`.

Note: the 30-day hot-spot window was empty at authoring time (last commit
`2026-08-03`, 0 commits/30d), so churn contributed no likelihood weight.
Ratings below lean on PRD/roadmap/archive evidence and the Phase 2
interview. A 90-day view is cited where it is genuinely informative.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|--------------------------------|
| 1 | A household member's played state or like/dislike is attributed to the other member — or one member's personal state is readable or writable as the other's | High | High | PRD §Success Criteria (Guardrails); PRD FR-005; interview Q1, Q3; hot-spot dirs `src/lib/services` (29/90d), `supabase/migrations` (5/90d) |
| 2 | An unauthenticated request, or an authenticated request for a resource the caller does not own, reaches a catalog or per-member-state endpoint and reads or mutates data it should not | High | High | interview Q4; PRD §Access Control; CLAUDE.md (`PROTECTED_ROUTES` middleware, RLS-per-table rule); hot-spot dirs `src/pages/api/games` (6/90d), `src/pages/api/games/[id]` (7/90d) |
| 3 | A recommendation names a board game the household does not own, or one currently loaned out, presented as a confident suggestion | High | Medium | PRD US-01 acceptance criteria; PRD FR-007 ("the LLM must not suggest games outside the household catalog"); interview Q1; hot-spot dir `src/lib/services` (29/90d) |
| 4 | Malformed, wrong-typed, or out-of-range input is accepted at an API boundary — persisting invalid state or crashing into an unhandled 5xx | Medium | High | interview Q4; CLAUDE.md (validate input with zod); hot-spot dir `src/pages/api` (6/90d) |
| 5 | The AI service is unavailable or returns an invalid response, and the user sees an empty or fabricated recommendation instead of a clear failure state | High | Medium | PRD §Non-Functional Requirements (explicit); roadmap F-01 guardrails; archive `2026-07-09-llm-recommendation-service/plan.md` |
| 6 | Soft-delete composes wrongly with catalog reads — deleted games leak back into the catalog, or live games vanish from a filtered view | High | Medium | PRD FR-002; PRD §NFR ("catalog changes are not silently lost"); interview Q1; archive `2026-07-10-edit-and-archive-games/plan.md`, `2026-07-11-filter-catalog/plan.md` |
| 7 | The recommendation prompt, an error body, or the client bundle carries more household data — or a provider secret — than the request needs | High | Low | PRD §NFR ("prompts must only include the minimum household catalog and preference data needed"); archive `2026-07-09-llm-recommendation-service/plan.md` |

Risk #7 is High impact × Low likelihood, the shape that usually belongs to
observability rather than a test. It earns a row here only because a
payload assertion at the provider boundary is cheap and deterministic — not
because that area is churning.

Risk #2 is the abuse/security row required by the auth + user-input surface
(authorization/IDOR and server-side validation parity). Risk #7 covers the
secret/PII-leak class. Resource abuse is deliberately not a separate row —
see the challenger note below.

**Challenger notes (authoring, 2026-09-02).**

- Dropped a candidate "the recommendation endpoint has no rate limit" risk:
  breaking it would require adding the guard first, so it described missing
  implementation rather than a defect. The cost-abuse concern is folded
  into Risk #2's response guidance (an unauthenticated caller reaching an
  endpoint that spends LLM budget).
- Reframed interview Q1's "a soft-deleted game disappears with no way back"
  into Risk #6's two-sided assertion. As stated, disappearing from the
  catalog *is* the intended soft-delete behaviour; the defect is losing it
  from storage or dropping live rows.
- Excluded theme/visual regression and preference-statistics accuracy from
  the map entirely per interview Q5, despite `src/components/catalog` being
  a 90-day churn leader (20/90d). See §7.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Member A's write to their own played/preference state never becomes readable or writable as Member B's, and A's read of the shared catalog returns A's own state rather than a merged or arbitrary row | That "the query filters by user id" proves attribution — the database must deny it too, not just the application query | Where household-member identity enters the request, how it reaches the persisted row, and whether RLS or app code is the actual authority | Integration plus DB-level policy verification against local Supabase | Asserting against a mocked Supabase client that returns whatever the query asked for — such a test cannot fail |
| #2 | An unauthenticated request, and an authenticated request for a resource the caller does not own, are both denied at the endpoint itself — not merely redirected at the page layer | That middleware `PROTECTED_ROUTES` covers API routes; that "logged in" is the same as "allowed" | Which surfaces the middleware actually gates, how the API layer resolves the caller, and whether ownership is checked separately from authentication | Integration at the route handler | Testing only the 200 path with a stubbed session; treating a redirect as proof of denial |
| #3 | A recommendation response contains only games present in the eligible catalog set the app supplied, and excludes ineligible ones such as loaned titles, even when the provider returns a plausible hallucinated title | That a well-formed provider response is a valid one; that prompt instructions constitute enforcement | The eligible-set boundary, where provider output is parsed, and what the app does with an unmatched title | Contract test with adversarial stubbed provider responses | Calling the real LLM from tests; taking the expected output from the current implementation instead of from the requirement (oracle problem) |
| #4 | A request with a missing, wrong-typed, or out-of-range field is rejected with a validated error response and leaves no persisted side effect | That zod is applied everywhere because CLAUDE.md says so; that an unhandled 500 is an acceptable rejection | Every mutating endpoint's real input boundary and its error-translation path | Integration at the route handler | Asserting a zod schema's shape back at itself instead of driving a request through the boundary |
| #5 | Provider timeout, provider non-2xx, and malformed-JSON-with-200 each surface a distinct clear failure state, and never a rendered empty or invented recommendation | That a 200 from the provider means a usable response; that "no suitable game found" and "the AI failed" may look the same to the user | The failure and error-translation path from the provider boundary to the response the UI consumes | Contract test with stubbed failure responses | Covering only the unavailable case and skipping malformed-but-200 |
| #6 | A soft-deleted game is absent from every catalog read path, including each filter combination, yet still retrievable from storage; a live game is never dropped by filter composition | That excluding deleted rows in one query proves it everywhere; that "it disappeared from the list" is the same as "it was deleted" | Every read path that composes the deleted-row condition with filters, and the layer at which that condition is applied | Integration over the query layer plus one endpoint-level check | Happy-path filter tests that never assert the deleted/live boundary; snapshotting a result list |
| #7 | The outbound prompt payload carries only the fields the request needs, and no provider secret or unrelated household data appears in an error body | That "we only send the catalog" is still true after later edits | The prompt-assembly boundary and what actually crosses it | Payload assertion at the provider boundary | Asserting the prompt string verbatim (brittle); reading the expected payload off the assembly code |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | API boundary contract | Prove every endpoint denies unauthenticated and non-owning callers and rejects invalid input without side effects | #2, #4 | integration (route handlers) | change opened | `context/changes/testing-api-boundary-contract/` |
| 2 | Per-member state attribution | Prove played state and preference stay bound to the correct household member at both the query and the policy layer | #1 | integration + DB-level RLS verification | not started | — |
| 3 | Catalog integrity under soft-delete | Prove deleted games leave every read path but stay in storage, and filter composition never drops live games | #6 | integration (query layer) | not started | — |
| 4 | LLM recommendation guardrails | Prove recommendations stay inside the eligible catalog, fail visibly, and send only minimal data under adversarial provider responses | #3, #5, #7 | contract tests with stubbed provider | not started | — |
| 5 | Quality-gate wiring | Lock the floor: keep the suite non-optional in CI (the step already runs) and gate the agent's edit loop | cross-cutting | gates | partially wired (CI step exists) | — |

**Order rationale.** Phase 1 is the interview's own stated gap (Q4), sits at
the cheapest layer, covers the abuse surface, and establishes the
request-level harness later phases reuse. Phase 2 carries the highest-fear
risk (Q1, Q3) but needs a real local Supabase harness — the expensive infra
step — so it lands second rather than first. Phase 3 reuses that harness and
has partial existing coverage, so its marginal signal is lower. Phase 4 is
deterministic and independent of the database harness, sequenced after the
data-layer risks so it exercises a catalog layer already trusted. Phase 5 is
last on purpose: gating a suite that barely exists is noise.

**No browser/e2e phase is proposed.** Under cost × signal every risk above
has a cheaper deterministic layer that catches it, and interview Q5 rules
out visual regression. The browser tooling noted in §4 is available for
manual verification, not as a rollout phase. Revisit if a risk surfaces
that only the full deployed shape (auth cookie plus handler plus island
hydration) can expose.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | 4.1.x | Plain `vitest.config.ts`, not `getViteConfig` — the Astro Cloudflare adapter's Vite plugin rejects a Vitest config at startup. Resolves the `@/*` alias and stubs `astro:env/server`. `environment: "node"`. |
| test runner script | `npm test` | — | `vitest run --passWithNoTests`; the `--passWithNoTests` flag means an empty run is green, so the CI step below cannot fail on a missing suite — Phase 5 drops the flag once a suite exists. |
| existing suite | — | — | 12 files / ~1,068 lines: 6 in `src/lib/services/`, 3 API-route, plus theme, types, and one component test. |
| API / HTTP mocking | none yet — see §3 Phase 4 | — | No MSW or equivalent installed; the provider boundary is currently exercised without a dedicated mocking layer. |
| DB / RLS verification | Supabase CLI (local stack) | 2.23.x devDependency | `npx supabase start` requires Docker. Not yet used by any test — see §3 Phase 2. |
| e2e | none — deliberately not planned | — | See the §3 rationale; revisit only for a risk the deployed shape alone exposes. |
| accessibility | none yet | — | `eslint-plugin-jsx-a11y` 6.10.2 lints statically; no runtime a11y assertions. Not covered by any rollout phase — out of scope until a risk demands it. |
| bespoke deterministic gates | `lint:colors`, `lint:contrast` | n/a | `scripts/check-color-literals.mjs`, `scripts/check-contrast.mjs`. Already cover the theme surface interview Q5 excluded from further testing. |
| CI | GitHub Actions | n/a | `.github/workflows/ci.yml` runs lint, `lint:colors`, `lint:contrast`, build **and `npm test`** — the test step was already wired in commit `1b3980b`, before this plan was authored (corrected 2026-09-11). What Phase 5 still owes: dropping `--passWithNoTests`, and the local edit-loop gate. |

**Stack grounding tools (current session):**
- Docs: none — Context7 or an equivalent framework-docs MCP is not available in current session; stack facts above come from local manifests and configs; checked: 2026-09-02
- Search: web search / fetch tools available (no Exa.ai MCP) — not used for this authoring pass; version facts were read from `package.json` rather than the web; checked: 2026-09-02
- Runtime/browser: `claude-in-chrome` MCP available (no Playwright MCP) — possible manual verification surface; not recommended as a test layer, see §3; checked: 2026-09-02
- Provider/platform: no GitHub, Supabase, or Cloudflare MCP; `gh` and `supabase` CLIs are available locally and are the practical path for the Phase 5 CI gate and the Phase 2 local database; checked: 2026-09-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local (husky/lint-staged) + CI | required (wired) | syntactic / type drift |
| build | CI | required (wired) | SSR/adapter build breakage |
| colour-literal + contrast checks | local | required (wired) | theme token drift, contrast regressions |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions, endpoint contract breakage |
| database policy verification | local + CI | required after §3 Phase 2 | per-member attribution and RLS regressions |
| provider contract tests | local + CI | required after §3 Phase 4 | out-of-catalog suggestions, silent AI failures, prompt over-sharing |
| CI test step + edit-loop gate | CI on PR + local agent loop | CI step wired; non-empty-suite enforcement + edit-loop gate required after §3 Phase 5 | regressions reaching a PR, or landing mid-edit |
| pre-prod smoke | between merge and prod | optional | environment-specific failures, notably the migration-push gap in `lessons.md` |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section names the
phase that will write it.

### 6.1 Adding a unit test for a service

- **Location**: next to the unit under test in `src/lib/services/`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/services/gameFilters.test.ts` (100 lines) or
  `src/lib/services/recommendations.test.ts` (206 lines) — the two largest
  existing examples.
- **Run locally**: `npm test`.

### 6.2 Adding an integration test at an API boundary

- TBD — see §3 Phase 1 for the endpoint denial/rejection pattern (an
  unauthenticated call, a non-owning call, and an invalid-input call each
  asserted for status *and* absence of side effect).

### 6.3 Adding a test for per-member state

- TBD — see §3 Phase 2 for the member-attribution pattern (Member A's state
  never readable or writable as Member B's, asserted at the policy layer and
  not only through an application query).

### 6.4 Adding a test for a catalog read path

- TBD — see §3 Phase 3 for the soft-delete boundary pattern (a deleted game
  absent from every filter combination yet still present in storage; a live
  game never dropped by filter composition).

### 6.5 Adding a test at the LLM provider boundary

- TBD — see §3 Phase 4 for the adversarial-provider pattern (hallucinated
  title, ineligible game, malformed-JSON-with-200, timeout, and the minimal
  prompt-payload assertion).

### 6.6 Per-rollout-phase notes

(Filled in after each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Theme and visual regression** — `lint:colors` and `lint:contrast`
  already gate the theme surface deterministically; screenshot diffs on top
  would cost more and add no signal. Re-evaluate if a theme regression ships
  that neither script catches. (Source: Phase 2 interview Q5.)
- **Preference statistics accuracy** — the only nice-to-have FR (FR-006),
  low blast radius if a count is off by one. Re-evaluate if statistics
  become an input to recommendations rather than a read-only view. (Source:
  Phase 2 interview Q5.)
- **Browser/e2e layer** — every risk in §2 has a cheaper deterministic layer
  that catches it. Re-evaluate if a risk surfaces that only the full
  deployed shape can expose. (Source: §1 principle 1, cost × signal.)
- **Runtime accessibility assertions** — `eslint-plugin-jsx-a11y` covers the
  static surface; no §2 risk points at a11y today. Re-evaluate if the
  product takes on users outside the two-person household. (Source: §2 risk
  map — no supporting risk.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-02
- Stack versions last verified: 2026-09-02
- AI-native tool references last verified: 2026-09-02
- Correction 2026-09-11: §4 CI row and §5 gate row claimed no CI test step;
  `.github/workflows/ci.yml` has run `npm test` since `1b3980b`. §3 Phase 5
  narrowed accordingly.

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
