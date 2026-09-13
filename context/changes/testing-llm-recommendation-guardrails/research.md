---
date: 2026-09-13T19:10:01+02:00
researcher: Wojciech Bernardziak
git_commit: edb59dabaf70d8bcd085773f59f591f62f73a0f8
branch: main
repository: my-catalog
topic: "LLM recommendation guardrails: the eligible-set boundary, where provider output is parsed, what the app does with an unmatched title, and what the existing suite already proves"
tags: [research, codebase, recommendations, llm, openrouter, provider-boundary, prompt-payload, failure-states, test-coverage]
status: complete
last_updated: 2026-09-13
last_updated_by: Wojciech Bernardziak
---

# Research: LLM recommendation guardrails

**Date**: 2026-09-13T19:10:01+02:00
**Researcher**: Wojciech Bernardziak
**Git Commit**: `edb59dabaf70d8bcd085773f59f591f62f73a0f8`
**Branch**: `main`
**Repository**: `my-catalog`

## Research Question

Phase 4 of the test rollout (`context/foundation/test-plan.md` §3, Risks #3, #5, #7)
needs grounding before a plan can be written. Per the §2 Risk Response Guidance the
questions are:

> **#3** The eligible-set boundary, where provider output is parsed, and what the app
> does with an unmatched title.
>
> **#5** The failure and error-translation path from the provider boundary to the
> response the UI consumes.
>
> **#7** The prompt-assembly boundary and what actually crosses it.

Plus the change's own framing question, opened because §4 records "API / HTTP mocking:
none yet": what seam can a contract test use, and does this phase need a mocking
library?

## Summary

Seven findings drive the plan. Two of them invalidate premises the phase was opened on.

1. **The catalog-only invariant is already enforced in code _and_ already tested.**
   `recommend()` filters the model's answer against an id allow-list
   (`src/lib/services/recommendations.ts:153-156`), and
   `src/lib/services/recommendations.test.ts` holds **12 passing tests (11 blocks, one `it.each`) driving the real provider
   path** through a stubbed global `fetch` — including out-of-catalog id dropped
   (`:102-117`), all ids dropped → `no_match` (`:119-133`), timeout (`:147-156`),
   non-2xx (`:158-165`), transport failure (`:167-174`), non-JSON content (`:176-183`),
   schema violation (`:185-194`), missing key (`:196-205`) and empty catalog with no
   fetch (`:135-143`). Risk #3's headline assertion and most of Risk #5 are **not a
   gap**. The plan's marginal signal is elsewhere, and it must say so rather than
   re-litigating covered ground.

2. **§4's "no HTTP-mocking layer" is true but misleading, and no dependency is needed.**
   `vi.stubGlobal("fetch", …)` (`recommendations.test.ts:45`) already captures the
   outbound request and controls every response shape. `fetch` is called bare on the
   global (`recommendations.ts:87`), there is no SDK and no injected client, so this is
   the only seam — and it is sufficient. MSW would buy nothing and add a dependency.
   `msw` appears in `package-lock.json:3557` solely as `@vitest/mocker`'s optional peer;
   it is not installed.

3. **"Excludes loaned titles" (Risk #3) has no PRD backing and contradicts a recorded
   decision.** Loan status is deliberately not sent to the model
   (`src/pages/api/recommendations.ts:55-57`, `src/lib/services/recommendationView.ts:71-76`)
   and the remedy chosen for a loaned recommendation was a *badge*, not an exclusion
   (`context/archive/2026-08-01-visual-identity-themes/plan.md:371-373,385-387`).
   Neither US-01's criteria (`prd.md:57-60`) nor §Business Logic (`prd.md:102`) mentions
   loan. A test asserting exclusion would fail by design — the same shape as the Risk #2
   ownership clause (2026-09-11) and the Risk #1 read-isolation clause (2026-09-12).
   See the backport section.

4. **The genuinely untested guardrail is the prompt payload (Risk #7) — and only a
   route-level test can prove it.** The outbound payload is an explicit 8-field
   allow-list (`recommendations.ts:73-82`), but the suite asserts the request body
   exactly once, for the `reasoning` flag (`recommendations.test.ts:89-100`). Nothing
   asserts what is _absent_. Crucially, `recommend()` takes candidates as a parameter,
   so a service-level test proves nothing about what the **route** feeds it: the chain
   `listCatalogGames → mapRowToCandidateGame → prompt pick` has two independent
   allow-lists (`src/types.ts:136-157` and `recommendations.ts:73-82`), and only a test
   that starts from real `GameRow` shapes — carrying `created_by`, `deleted_at`,
   `authors`, `loan_status` — proves none of them reach the wire.

5. **A model failure is reported to the user as a legitimate no-match.** When every
   returned `gameId` is fabricated, the allow-list empties the list and the result is
   `{ ok: false, reason: "no_match" }` (`recommendations.ts:158-160`) — the same value
   an empty catalog produces (`:67-69`) — rendered as the neutral "No suitable game
   found for those criteria. Try adjusting the player count, time, or genre."
   (`recommendationView.ts:153-157`). The user is told to change their criteria when the
   provider hallucinated, and **this is the one failure path with no `console.error`**,
   while all three `invalid_response` branches log. Against `prd.md:93` ("a clear
   failure state instead of a silent or fabricated recommendation") this is the
   strongest defect candidate in the phase.

6. **Criteria fit is prompt-only and unenforced.** The route passes `{}` as filters
   (`src/pages/api/recommendations.ts:60`), ships the whole live catalog, and nothing
   afterwards checks `minPlayers ≤ playerCount ≤ maxPlayers` or
   `averagePlayMinutes ≤ availableMinutes` — even though `listGames` already implements
   both predicates in SQL (`src/lib/services/games.ts:33-44`) and `prd.md:102` names
   that exact order as the rule. A well-formed 200 recommending a 5-player-minimum game
   for a 2-player request is accepted, ranked and rendered. Whether that is a defect or
   the intended division of labour is a requirement question, not a code question — see
   Open Question 2.

7. **Above the service, distinct failures collapse.** The island discards every
   `{ error }` body: 401, 400 (unparseable), 400 (validation), 500 and 503 all render
   "Something went wrong. Please try again."
   (`src/components/play/RecommendationFlow.tsx:83-86`;
   `recommendationView.ts:143`). The five typed `reason`s, by contrast, each have their
   own copy (`recommendationView.ts:151-179`) — so Risk #5's "distinct clear failure
   state" holds for provider failures and fails for transport/auth/config failures.

## Detailed Findings

### The provider boundary: one seam, no library needed

- **Transport**: bare global `fetch` (`src/lib/services/recommendations.ts:87`) to
  `https://openrouter.ai/api/v1/chat/completions` (`:5`), model
  `OPENROUTER_MODEL ?? "openai/gpt-4o-mini"` (`:11,94`), `reasoning: { enabled: false }`
  (`:102`), `signal: AbortSignal.timeout(8000)` (`:18,108`). No SDK dependency, no
  retry, no backoff, no cap on candidate count.
- **Seams available to a test**, in descending usefulness:
  1. `globalThis.fetch` — already in use (`recommendations.test.ts:43-47`), controls both
     directions.
  2. `astro:env/server`, aliased at `vitest.config.ts:46` to
     `src/test/astro-env-server.stub.ts:5-8`, which reads `process.env` **at import
     time** — hence the `vi.resetModules()` + dynamic-import dance
     (`recommendations.test.ts:50-60`). Any new file toggling `OPENROUTER_API_KEY` must
     repeat it.
  3. `vi.mock("@/lib/services/recommendations")` for route-level tests that do not care
     about the provider.
  4. **Not a seam**: the function signature. `recommend(criteria, candidateGames)`
     (`:59-62`) takes data only — no transport parameter, no options bag. Substituting
     the client through the signature is impossible today.
- Module-private constants (`OPENROUTER_URL`, `TIMEOUT_MS`, `SYSTEM_PROMPT`,
  `responseSchema`) are not exported, so they can only be asserted through captured
  `fetch` arguments — which is the right direction anyway (assert what crosses the wire,
  not what the module believes).

### What actually crosses the wire

`recommendations.ts:71-83` builds the user payload by explicit pick, not spread:

```
criteria, plus per game: id, title, genre, minPlayers, maxPlayers,
averagePlayMinutes, played, preference
```

- **Excluded by construction**: `authors`, `loan_status`, `created_by`, `created_at`,
  `updated_at`, `deleted_at` — all present on `GameRow` (`src/types.ts:55-68`), dropped
  first by `mapRowToCandidateGame` (`src/types.ts:136-157`) and again by the prompt pick.
- **No member ids, emails or timestamps.** `user.id` is used only as a DB scope
  (`src/pages/api/recommendations.ts:60`). The game `id` is a Supabase UUID and does
  cross to the third party — necessarily, since it is the handle the allow-list matches
  on.
- **Uncapped**: the entire live catalog is sent, unbatched and untruncated, by explicit
  decision (`context/archive/2026-07-24-ai-play-recommendation/plan.md:83-85`).
- **`criteria` passes through whole** (`:72`), and `genre` is free user text validated
  only as a non-empty trimmed string (`recommendationView.ts:46`). It lands verbatim in
  the user message. Ids are constrained by the allow-list; the model-authored `reason`
  string is not, and is rendered to the user (`RecommendationFlow.tsx:238`, escaped by
  React — no `dangerouslySetInnerHTML` anywhere in `src/`).
- **The secret is clean.** `OPENROUTER_API_KEY` is `context: "server", access: "secret"`
  (`astro.config.mjs:21`), read at `recommendations.ts:2,63,90` and as a boolean at
  `src/lib/config-status.ts:1,21`. It never enters a response body, an error string, or
  the client bundle (verified against `dist/client`: only the copy string appears). Two
  observations, neither a test target: `OPENROUTER_MODEL` is `access: "public"` and is
  therefore **inlined into the server bundle at build time**, contradicting the "swap
  without a code deploy" rationale at `recommendations.ts:8-9`; and the Cloudflare
  adapter copies `.dev.vars` (with the live key) into `dist/server/`, which is
  gitignored and untracked.

### The eligible set, and the two things it does not exclude

Computed at `src/pages/api/recommendations.ts:60` via `listCatalogGames` →
`listGames` + `listMemberState` → `mergeAndFilterCatalog`.

| Candidate exclusion | Applied? | Evidence |
| --- | --- | --- |
| Soft-deleted | **Yes**, in SQL before the prompt | `src/lib/services/games.ts:31` |
| Loaned out | **No** — display-only badge | `src/pages/api/recommendations.ts:62`, `recommendationView.ts:71-76,85-87` |
| Already played | **No** — sent as a ranking input | `recommendations.ts:80`; not in the `SYSTEM_PROMPT` ranking order (`:46`) |
| Criteria (players / minutes / genre) | **No** — `{}` filters, delegated to the model | `src/pages/api/recommendations.ts:60` vs. the unused predicates at `games.ts:33-44` |

Post-response, the **only** set-membership enforcement is the id allow-list
(`recommendations.ts:153-156`), with a redundant second join in
`recommendationView.ts:113-118`. Neither re-checks loan, played state, or criteria fit.

The catalog-only guarantee is also structurally sound in one way worth a regression
test: the candidate list is re-derived server-side on every request and never accepted
from the client — a guarantee S-05 set deliberately
(`context/archive/2026-07-24-ai-play-recommendation/research.md:145`) and which nothing
currently asserts.

### Parsing and the failure union: handled, and what is not

Handled, each with a line: fetch rejection → `timeout` if `AbortError`/`TimeoutError`
else `provider_error` (`:38-40,110-112`); non-2xx → `provider_error` (`:114-116`);
envelope `response.json()` rejection → `provider_error` (`:118-124`); non-string content
→ `invalid_response` (`:129-133`); `JSON.parse` failure → `invalid_response`
(`:135-142`); zod failure → `invalid_response` (`:144-149`); out-of-set id → silently
dropped (`:155`); empty result → `no_match` (`:158-160`); missing key →
`not_configured`, no fetch (`:63-65`).

`recommend()` **never throws and never returns null** — six observable outcomes
(`src/types.ts:180-185`). What is unguarded:

1. **Duplicate `gameId`s** — no dedup at `:154-156` or `recommendationView.ts:114-133`;
   three identical cards, and three React children sharing `key={item.gameId}`
   (`RecommendationFlow.tsx:226`).
2. **Unbounded list length** — nothing caps `recommendations.length`.
3. **`rank` is `z.number()` only** (`:29`) — zero, negative, fractional and duplicate
   ranks all pass and are rendered raw into the badge (`RecommendationFlow.tsx:229`).
   "Starts at 1" is prompt-only (`:49`).
4. **Empty-string `reason`** passes `z.string()` and renders as a blank line.
5. **Non-2xx bodies are never read** (`:114-116`), so 429 vs 401 vs bad-model-id are
   indistinguishable in production logs.
6. **The fetch rejection is never logged** (`:110-112`) — the only branch with no
   diagnostic, while the three `invalid_response` branches each `console.error`.
7. **Criteria violations in a well-formed response** — see Summary 6.

### The error-translation path, end to end

Endpoint (`src/pages/api/recommendations.ts`): `POST` only (`:29`), `prerender = false`
(`:12`), own session guard reading `context.locals.user` (`:38`) — necessary, because
`PROTECTED_ROUTES` does not cover `/api/*` (`src/middleware.ts:5`). Responses: 503 no
client (`:35-37`), 401 (`:38-40`), 400 unparseable body (`:44-48`), 400 first zod issue
(`:51-53`), 500 catalog load failed (`:64-66`), 200 `{ ok: true, recommendations }`
(`:69-71`), 200 `{ ok: false, reason }` (`:72`).

Two observations the plan may want to act on:

- The 500 catch is bare (`:64-66`) — `games.ts:49`'s message is discarded with **no
  logging at all**, inconsistent with the deliberate logging in the provider path.
- `createClient`, `parseCriteria`, `recommend` and `enrichRecommendations` all sit
  **outside** any try (`:30,50,68,70`). `recommend()` is documented not to throw and
  nothing enforces it; if it ever did, the response would be Astro's HTML 500 rather
  than the JSON `{ error }` the contract at `:25-27` promises.

Client (`src/components/play/RecommendationFlow.tsx`): `view` discriminates
idle/loading/results/panel (`:28-32,37-41`). Each typed `reason` gets its own copy
(`recommendationView.ts:151-179`), rendered as a destructive panel except `no_match`,
which is neutral (`:216-219`). Every `!response.ok` case, every thrown fetch and every
body missing `ok` collapses to `GENERIC_ERROR_MESSAGE` (`:83-96`) — the `{ error: string }`
arm of `RouteBody` (`:25`) is declared and never read.

Two latent render hazards: `{ ok: true, recommendations: [] }` renders a **blank
region** — `Results` has no empty-array guard (`:223-250`), and the only thing
preventing it is the length check at `recommendations.ts:158-160`; and there is no
`aria-live` on the results region (only `aria-busy`, `:187`), so a screen reader is not
told when loading becomes an error.

### What the existing suite proves — and the six things it does not

`recommendations.test.ts` is a genuine contract suite: every case re-imports the real
module and stubs `fetch`. Absent from it:

1. **Any assertion on the outbound payload beyond the `reasoning` flag** (`:89-100`) —
   no field-set assertion, no absence assertion, no `Authorization` header, no URL, no
   model, no `response_format`, no `signal`.
2. **`response.json()` rejection** (`recommendations.ts:118-124`) — the fake `json()`
   always resolves (`:30-35`).
3. **Non-string `content`** (`recommendations.ts:129-133`) — a 200 with `choices: []`
   or a missing `message`.
4. **Non-2xx granularity** — the fake `Response` carries no `status` and no body, and
   the service reads only `.ok`.
5. **The real `AbortSignal.timeout`** — the timeout cases reject with a hand-named error
   (`:147-156`). Note for the plan: sinon fake timers do **not** patch
   `AbortSignal.timeout`, so driving the real 8s cap is not possible with the current
   stack; asserting that a `signal` is passed is the reachable substitute.
6. **The route itself, past its guards.** `src/pages/api/games/boundary.test.ts` covers
   `/api/recommendations` only for 401 (`:128-146`), 503 (`:152-168`) and two 400s
   (`:306-327`). Nothing asserts the 200 envelope, the 500 catalog path, or the
   server-assembled candidate list.

### Harness: what a route-level contract test would plug into

- **Collection is by path only.** `unit` has no `include` (Vitest default glob) and
  excludes `src/test/db/**` (`vitest.config.ts:19-25`); `db` takes exactly
  `src/test/db/**/*.test.ts` (`:32`). So any new `*.test.ts` outside `src/test/db/` runs
  under `npm test` and is gated by CI at `.github/workflows/ci.yml:29` with no config
  change — plus `typecheck` (`:20`) and `lint` (`:21`).
- **`src/test/apiContext.ts`**: `testUser(id = "member-a")` (`:18`),
  `createApiContext(options)` (`:57`, default method `POST`, `locals` carries
  `{ user, theme }` at `:66-69`) — exactly the shape already used against this route at
  `boundary.test.ts:130,320-327`.
- **`src/test/supabaseDouble.ts`**: `createSupabaseDouble({ results })` (`:114`),
  reached through the hoisted `vi.mock("@/lib/supabase")` holder idiom
  (`boundary.test.ts:18-22,44-47`), since the handler calls `createClient` itself
  (`src/pages/api/recommendations.ts:30`). Seeding the candidate list needs **three**
  tables — `games`, `game_played`, `game_preference` — because `listCatalogGames` fans
  out (`games.ts:31`, `memberGameState.ts:114-115`).
- **The double's limits cut the right way here.** It honours no filters and returns the
  configured rows verbatim (`supabaseDouble.ts:124-141`), so it can prove **nothing**
  about soft-delete exclusion — but this phase does not need that (Phase 3 owns it in
  the `db` project). What it does perfectly is hand the route a row carrying every
  field a leak test wants to see absent. Pass it to services as `double.serviceClient`
  (`:101,167`), never `.client`, because `tsc --noEmit` is a CI gate.
- **No `OPENROUTER_*` secret is provided to the CI `ci` job**, so any provider test must
  set its own env exactly as `recommendations.test.ts:58-59` does.

## Code References

- `src/lib/services/recommendations.ts:5,11,18` — provider URL, default model, 8s cap
- `src/lib/services/recommendations.ts:42-50` — `SYSTEM_PROMPT`, incl. the catalog-only instruction and ranking order
- `src/lib/services/recommendations.ts:63-69` — `not_configured`, and empty-catalog `no_match` before any call
- `src/lib/services/recommendations.ts:71-83` — the outbound payload allow-list (Risk #7's subject)
- `src/lib/services/recommendations.ts:87-108` — the `fetch` call, headers, body, `AbortSignal.timeout`
- `src/lib/services/recommendations.ts:110-149` — every failure branch and its `reason`
- `src/lib/services/recommendations.ts:153-160` — the id allow-list and the `no_match` collapse
- `src/lib/services/recommendations.test.ts:43-47,50-60` — the `fetch` stub and the module-reset idiom
- `src/lib/services/recommendations.test.ts:89-100` — the only outbound-request assertion today
- `src/pages/api/recommendations.ts:55-63` — candidates re-derived server-side; loan attached for display only
- `src/pages/api/recommendations.ts:64-72` — the bare 500 catch and the 200 union envelope
- `src/lib/services/recommendationView.ts:70-76,113-133` — the display/ranker split and the second id join
- `src/lib/services/recommendationView.ts:151-179` — `describeFailure`, the user-visible failure copy
- `src/components/play/RecommendationFlow.tsx:83-96` — where every `{ error }` body is discarded
- `src/components/play/RecommendationFlow.tsx:223-250` — results list with no empty-array guard
- `src/lib/services/games.ts:31-44` — soft-delete exclusion, and the criteria predicates the route does not use
- `src/types.ts:136-157` — `mapRowToCandidateGame`, the first allow-list
- `src/test/apiContext.ts:18,57` / `src/test/supabaseDouble.ts:114` — harness entry points
- `vitest.config.ts:19-32,46` — project split, and the `astro:env/server` alias
- `.github/workflows/ci.yml:20-29` — the gates a new unit test inherits

## Architecture Insights

- **The catalog-only guarantee is identity-only.** Code enforces *which games* may be
  named; everything else the model asserts — that the game fits the player count, the
  time budget, the genre, that the `reason` is true, that ranks start at 1 — is
  prompt-only. This is the single most useful sentence for the next reader, and it
  should land in the §6.5 cookbook entry.
- **Two allow-lists, one wire.** Row → `CandidateGame` (`types.ts:136-157`) and
  `CandidateGame` → prompt payload (`recommendations.ts:73-82`). Both are explicit picks
  rather than spreads, which is why no leak exists today; a single `...g` in either
  place would create one silently. The assertion that cannot be fooled is made at the
  wire, on the captured `fetch` body.
- **A test at the service layer cannot see the route's mistakes.** `recommend()` receives
  candidates already sanitized. Risk #7's real question — "does household data from the
  database reach the provider?" — is only answerable one layer up.
- **`no_match` is two events wearing one name**, and the UI gives both the softest
  possible reading. Any reason value that maps to "adjust your criteria" must be reached
  only when the criteria are genuinely the problem.
- **Failure copy is typed on the provider side and untyped on the transport side.** The
  service went to some trouble to return a closed union; the island throws away the
  parallel effort the route made with `{ error }`.
- **`AbortSignal.timeout` is outside the reach of fake timers.** Any "the request is
  bounded" assertion must check that a signal is passed, not that 8s elapsed.

## Historical Context (from prior changes)

- `context/archive/2026-07-09-llm-recommendation-service/plan.md:84-87,238-239` — the
  catalog-only-in-code decision, stated as insufficiency of the prompt instruction. The
  guardrail this phase is asked to test was designed deliberately, not discovered.
- `.../plan.md:208-212` — the `RecommendationResult` union, with `no_match` explicitly
  defined as "a successful call that yields zero eligible games". The hallucination case
  was folded into that name at design time; nothing recorded weighing the two apart.
- `.../plan.md:227-230,201-206` — the minimal-prompt specification and the
  "no member PII, no internal DB ids beyond the local `id`" constraint. Shipped exactly.
- `.../plan.md:60-69` — explicitly deferred: retry/backoff, caching, multi-provider,
  prompt tuning. `plan.md:423` leaves the live smoke test permanently open.
- `.../reviews/impl-review.md:29-42` — F1: the timeout test simulated `AbortError` while
  production raises `TimeoutError`; fixed by `it.each`. Precedent that this boundary's
  tests have already been wrong in a way only a careful reading caught. No review ever
  audited the prompt payload.
- `context/archive/2026-07-24-ai-play-recommendation/plan.md:83-85` — whole live catalog
  by decision, no deterministic pre-filter; `research.md:145` — candidates must be
  re-derived server-side, never client-supplied.
- `.../reviews/impl-review.md:41-47` — F2 "whole catalog sent to the model with no cap"
  was raised and SKIPPED as already-deferred. `plan.md:388-392` — four manual rows were
  "marked done at author's direction; not exercised", so the happy path here has never
  been observed end to end.
- `context/archive/2026-08-01-visual-identity-themes/plan.md:371-373,385-387` — the
  loaned-game question was raised and answered with a badge, keeping `CandidateGame`
  byte-identical. This is the decision Risk #3's "excludes loaned titles" clause
  contradicts.
- `context/archive/2026-07-21-played-loan-and-preference/plan.md:29-30` — loan is a
  shared attribute of the physical copy, not per-member state.

## Related Research

- `context/archive/2026-09-11-testing-api-boundary-contract/research.md` — the route-test
  idiom, the `ENDPOINTS` table, and the precedent for amending a risk row after research
  contradicts it.
- `context/archive/2026-09-12-testing-per-member-state-attribution/research.md` — the
  second such amendment, and the discipline of verifying the guidance's own claims.
- `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/research.md` — the
  double's "honours no filters" limit, and the layer-by-what-it-can-prove split.
- `context/foundation/test-plan.md` §6.2 (route harness), §6.4 (twin fixtures,
  break-check discipline) — the two cookbook entries §6.5 will sit beside.

## Corrections to context/foundation/test-plan.md (for backport)

1. **Risk #3, the loaned clause.** `test-plan.md:50` ("or one currently loaned out") and
   `:132` ("excludes ineligible ones such as loaned titles") describe a guarantee the
   product does not offer and a prior change explicitly declined to add
   (`2026-08-01-visual-identity-themes/plan.md:371-373`). Proposed: Risk #3 keeps the
   out-of-catalog clause only; the loan question moves to §7 or to a product decision.
2. **Risk #3's source citation.** `test-plan.md:50` attributes "the LLM must not suggest
   games outside the household catalog" to FR-007; it is literally a US-01 acceptance
   criterion at `prd.md:59`. FR-007 (`prd.md:84`) says something weaker.
3. **§4 "API / HTTP mocking: none yet … the provider boundary is currently exercised
   without a dedicated mocking layer"** (`test-plan.md:179`) reads as if the boundary
   were unexercised. It is exercised by 12 tests through `vi.stubGlobal("fetch")`.
   Proposed: state that the global-`fetch` stub **is** the layer, and that no library is
   planned.
4. **Risk #5's "must challenge" cell** should gain the conflation this research found:
   that `no_match` is not always a no-match. The current cell challenges "a 200 means a
   usable response" but not "an empty result means the catalog had nothing".

## Open Questions

1. **Does "excludes loaned titles" leave the phase entirely?** Evidence says yes (see
   backport 1). Recommendation: drop it from the assertion set and record the reasoning
   in the plan, exactly as phases 1 and 2 did with their contradicted clauses. If the
   household actually wants loaned games excluded or de-ranked, that is a product change
   with its own `/10x-new`, and a test written before it would be asserting a wish.
2. **Is criteria fit a guarantee, and does this phase add a post-hoc check?** `prd.md:102`
   says "The rule uses player count first, then genre, then available time" and "the LLM
   may help rank close matches"; US-01 says recommendations "can account for" those
   values. That is weaker than "must satisfy", and the code delegates entirely. Options:
   (a) test only identity, note the gap; (b) add a deterministic post-hoc check on the
   one unambiguous numeric criterion — `minPlayers ≤ playerCount ≤ maxPlayers` — and
   test it; (c) treat a criteria-violating recommendation as acceptable ranking output.
   Recommendation: (b), scoped to player count only, because it is the criterion the PRD
   ranks first, the predicate already exists in SQL, and it is the one case where a test
   has a requirement-derived oracle rather than an implementation-derived one. This is a
   production change and needs the human's call before the plan commits.
3. **Is the `no_match` conflation fixed in this phase or only documented?** Finding 5
   argues it violates `prd.md:93`. A fix means a new union member (e.g.
   `invalid_response` for an all-hallucinated answer, or a distinct reason) plus copy in
   `describeFailure` plus a `console.error`. Recommendation: fix it — the phase-1
   precedent (`2026-09-11`, the unwrapped `formData()` defect) is that a defect a test
   exposes is repaired in the same phase, justified by the failing test. But the union is
   a shipped contract, so name it in the plan rather than sliding it in.
4. **Which layer owns the Risk #7 payload assertion?** Recommendation: the route
   (`src/pages/api/recommendations.test.ts`, new file), seeded through `supabaseDouble`
   with rows carrying `created_by`, `deleted_at`, `authors` and `loan_status`, with
   `fetch` stubbed to capture the body. Assert the **exact key set** per game and the
   absence of the forbidden keys — never the prompt string verbatim
   (`test-plan.md:136` names that anti-pattern). A service-level version of the same
   assertion is cheaper but strictly weaker; the plan should not write both.
5. **How much of the unguarded list in "Parsing and the failure union" is in scope?**
   Duplicate ids, unbounded length, `rank` sanity and empty `reason` are all real but
   none is named by a risk row. Recommendation: cover duplicates only (it produces
   duplicate React keys, a visible bug), and record the rest in §6.5 as known-unguarded
   rather than growing the phase.
6. **Does the phase touch the client's generic-error collapse (Finding 7)?** It is a real
   Risk #5 gap — an expired session is indistinguishable from a DB outage — but it is UI
   work with no test layer this project has agreed to (no e2e; `RecommendationFlow` has
   no test file today). Recommendation: out of scope, recorded in §7 or as a follow-up
   change; the phase's deliverable is the provider boundary.
