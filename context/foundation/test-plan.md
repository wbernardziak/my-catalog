# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
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
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                                                                                                                                                                                            | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A household member's played state or like/dislike is attributed to the wrong household member — a member's own view shows the other member's played state or like/dislike, or a write lands under the wrong member                                                                                                                                                                                 | High   | High       | PRD §Success Criteria (Guardrails); PRD FR-005; interview Q1, Q3; hot-spot dirs `src/lib/services` (29/90d), `supabase/migrations` (5/90d); research 2026-09-12 (`context/changes/testing-per-member-state-attribution/research.md`)                                                                                                                                                                                                                                                                                                        |
| 2   | An unauthenticated request reaches a catalog or per-member-state endpoint because a handler's own session guard is missing or was dropped — the middleware does not gate `/api/*` — or a per-member write is attributed to a member id taken from the request instead of the session                                                                                                               | High   | High       | interview Q4; PRD §Access Control; CLAUDE.md (`PROTECTED_ROUTES` middleware, RLS-per-table rule); research 2026-09-11 (`src/middleware.ts:5` covers four page prefixes only; seven hand-copied guards, no shared helper); hot-spot dirs `src/pages/api/games` (6/90d), `src/pages/api/games/[id]` (7/90d)                                                                                                                                                                                                                                   |
| 3   | A recommendation names a board game the household does not own, presented as a confident suggestion                                                                                                                                                                                                                                                                                                | High   | Medium     | PRD US-01 acceptance criteria (`prd.md:59`, "the LLM must not suggest games outside the household catalog"); PRD §Business Logic (`prd.md:102`); interview Q1; hot-spot dir `src/lib/services` (29/90d)                                                                                                                                                                                                                                                                                                                                     |
| 4   | Malformed, wrong-typed, or out-of-range input is accepted at an API boundary — persisting invalid state or crashing into an unhandled 5xx                                                                                                                                                                                                                                                          | Medium | High       | interview Q4; CLAUDE.md (validate input with zod); hot-spot dir `src/pages/api` (6/90d)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | The AI service is unavailable or returns an invalid response, and the user sees an empty or fabricated recommendation instead of a clear failure state                                                                                                                                                                                                                                             | High   | Medium     | PRD §Non-Functional Requirements (explicit); roadmap F-01 guardrails; archive `2026-07-09-llm-recommendation-service/plan.md`                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | Soft-delete composes wrongly with catalog reads — deleted games leak back into the catalog, or live games vanish from a filtered view                                                                                                                                                                                                                                                              | High   | Medium     | PRD FR-002; PRD §NFR ("catalog changes are not silently lost"); interview Q1; archive `2026-07-10-edit-and-archive-games/plan.md`, `2026-07-11-filter-catalog/plan.md`                                                                                                                                                                                                                                                                                                                                                                      |
| 7   | The recommendation prompt, an error body, or the client bundle carries more household data — or a provider secret — than the request needs                                                                                                                                                                                                                                                         | High   | Low        | PRD §NFR ("prompts must only include the minimum household catalog and preference data needed"); archive `2026-07-09-llm-recommendation-service/plan.md`                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | An external provider refuses or changes — a model retired, a request flag rejected, a daily quota exhausted, a credential revoked, the response envelope moved — and the failure cannot be told apart from an outage: the member is told something untrue ("try again shortly"), or a provider success that sent nothing is presented as "we sent you an email", and no server log names the cause | High   | Medium     | refresh interview Q1, Q2 (`context/archive/2026-09-14-test-plan-refresh-2026-09-14/change.md`); archive `2026-08-01-visual-identity-themes/plan.md` (a live 429 quota exhaustion, a `:free` model rejecting a request flag); archive `2026-09-13-testing-llm-recommendation-guardrails/research.md` (unlogged non-2xx left open); `lessons.md` "Log every non-2xx branch"; hot-spot dirs `src/pages/api` (35/30d), `src/lib/services` (12/30d); research 2026-09-14 (`context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md`) |
| 9   | A configuration value differs between where it is documented and where production actually reads it — a setting documented as runtime-tunable frozen at build time, a wrong-but-present credential failing silently, test and example config drifting from the schema — so production behaves differently from what local and CI verified                                                          | High   | Medium     | refresh interview Q3; `lessons.md` "Push migrations to production as the final step"; `infrastructure.md` pre-mortem (secrets drifting between `.dev.vars`, GitHub Actions and Cloudflare); archive `2026-09-12-testing-per-member-state-attribution/change.md` (local `project_id` collision); hot-spot dir `.github/workflows` (4/30d); research 2026-09-14                                                                                                                                                                               |
| 10  | A quality gate or guard reports green while checking nothing, or while missing a real violation — a scan that matched zero files, a hardcoded list that fell behind the installed tooling, a gate step removed from CI — so the regression it exists to catch ships                                                                                                                                | Medium | High       | archive `2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md` (F3, decision pending); the same archive's pre-commit hook that never ran in a fresh clone; hot-spot dirs `scripts` (2/30d), `.github/workflows` (4/30d); research 2026-09-14 (stale colour palette proven by fixture)                                                                                                                                                                                                                                              |
| 11  | A signed-in session breaks between layers that are each tested only in isolation — the session cookie set at sign-in is not read back by the middleware, the page gate admits an anonymous request or bounces a signed-in one, an island's request no longer matches its route — so the household cannot sign in or use a feature while every unit and route test is green                         | High   | Low        | refresh interview Q4; no automated test exercises the sign-in → session → next request path (research 2026-09-14 §Risk D); PRD §Access Control; hot-spot dir `src/pages/api` (35/30d)                                                                                                                                                                                                                                                                                                                                                       |

Risk #7 is High impact × Low likelihood, the shape that usually belongs to
observability rather than a test. It earns a row here only because a
payload assertion at the provider boundary is cheap and deterministic — not
because that area is churning.

Risk #2 is the abuse/security row required by the auth + user-input surface
(authorization/IDOR and server-side validation parity). Risk #7 covers the
secret/PII-leak class. Resource abuse is deliberately not a separate row —
see the challenger note below.

**Amended 2026-09-11** (`context/changes/testing-api-boundary-contract/research.md`).
Risk #2 originally read "an authenticated request for a resource the caller does
not own." Research showed that is a guarantee this codebase deliberately does not
offer: `games` is one shared catalog, every policy `using (true)` for role
`authenticated`, and `created_by` is attribution-only, explicitly "NOT used to
gate access" (`supabase/migrations/20260710120000_create_games.sql:6-7,30-55`).
A test asserting "member B cannot edit member A's game" would fail by design.
Research also found no IDOR surface today — the only member-id write sites
(`played.ts:45`, `preference.ts:48`) both read `context.locals.user.id`. What
remains genuinely at risk is the _unguarded invariant_: because the middleware
skips `/api/*`, each handler's own session guard is the only gate, hand-copied
seven times with no shared helper, and nothing structurally prevents one copy
from being dropped. Risk #2 now names that. The policy-layer half of member
attribution stays with Risk #1.

**Amended 2026-09-12** (`context/changes/testing-per-member-state-attribution/research.md`).
Risk #1 originally read "one member's personal state is readable or writable as the
other's." Research showed the read half of that is a guarantee this project
deliberately does not offer. The PRD asks that state stay _attributable_ to the right
member (`prd.md:45`) and puts the confidentiality boundary at "logged-in household
members" (`prd.md:94`) — signed-in vs. anonymous, not member vs. member. FR-006
(`prd.md:82`, per-member preference statistics) _requires_ cross-member reads, and
`/stats` is built on them. A test asserting "member B cannot read member A's
preference" would fail by design, the same way the ownership test would have under
the original Risk #2.

A live probe against the local stack (two real authenticated members) also settled
the authority question the guidance told research to verify, and split it in two:

- **Writes: the database is an authority.** `with check (member_id = auth.uid())` on
  INSERT and `using` + `with check` on UPDATE/DELETE. Probed: an insert carrying the
  other member's id is rejected `403`; update and delete against their rows affect
  zero rows. A policy test here passes today — write it as a regression guard, not
  expecting it to expose a gap.
- **Reads: the database is not an authority.** SELECT is `using (true)` on both
  per-member tables, so the application query's member filter is the only thing
  scoping a read. Every scoped read path in the app funnels through one function, and
  no existing test would fail if that filter were dropped.

Risk #1 now names attribution rather than isolation, and its response guidance
carries the split. Read-all is a feature dependency, not an oversight: it was chosen
in S-04 (`context/archive/2026-07-21-played-loan-and-preference/plan-brief.md:22`) and
re-affirmed when impl-review F7 raised the same concern and resolved it by documenting
the household-as-tenant assumption rather than changing the policy.

**Amended 2026-09-13** (`context/archive/2026-09-13-testing-llm-recommendation-guardrails/research.md`).
Risk #3 originally read "...does not own, **or one currently loaned out**", and its response
cell asked for loaned titles to be excluded. No requirement asks for that. Loan is absent
from US-01's acceptance criteria (`prd.md:57-60`) and from §Business Logic (`prd.md:102`),
loan state is deliberately kept out of the ranker contract
(`src/lib/services/recommendationView.ts:71-76`; `src/pages/api/recommendations.ts:55-57`),
and when the question was raised directly in 2026-08 it was answered with a badge rather
than an exclusion (`context/archive/2026-08-01-visual-identity-themes/plan.md:371-373,385-387`):
"`CandidateGame` was deliberately left alone: it is the ranker contract, loan state is not a
ranking input". A test asserting exclusion would fail by design, the same shape as the
ownership clause dropped from Risk #2 and the read-isolation clause dropped from Risk #1.
Excluding loaned games remains a legitimate product idea — it is simply a change, not a
regression guard.

Research also found the catalog-only half of Risk #3 **already enforced and already
covered** (`recommendations.ts:153-156` plus 12 passing tests), so phase 4 spent its budget
on what was untested: the outbound payload (Risk #7), the uncovered provider branches, and
two defects — `no_match` standing for a hallucinated answer, and a recommendation nobody at
the table could play. The response cell now names the player-count guarantee that phase
added.

**Added 2026-09-14** (`context/archive/2026-09-14-test-plan-refresh-2026-09-14/research.md`).
Risks #8–#11 come from the refresh opened once the first five phases were archived.
The refresh interview surfaced five risks, all where the app meets something outside it;
they map as A+B → #8, C → #9, E → #10, D → #11. Rows #1–#7 are unchanged. The 30-day
hot-spot window at refresh was `src/pages/api` 35, `src/test/db` 19, `src/lib/services`
12, `.github/workflows` 4, `scripts` 2 — §1's "window empty" line reflects authoring time.
These count file-change entries (one per file per commit) over the 30 days to `c1f9a83`,
not distinct files. The refresh widened §1's hot-spot scope to add `.github/workflows`,
because CI configuration is where the gate and configuration risks (#9, #10) live.

- **#8 vs #5.** #5 guards that the member sees a clear failure rather than an invented
  recommendation, and it is covered. #8 guards that the failure's _cause_ is attributable
  and its copy is _true_. The unlogged non-2xx branch (`recommendations.ts:118-120`) is
  where a retired model, an exhausted quota and a bad key all land today.
- **#11 rating.** #11 is High × Low, the shape that usually belongs to observability. It
  earns a row because an in-process integration test is cheap and deterministic, not
  because regressions have shipped: research found no cookie or hydration defect ever
  reached production, and the manual Chrome checks in the phase 4 archive (rows 3.7, 4.9)
  were panel rendering and a provider hiccup.
- **Decisions recorded as oracles (2026-09-14).** `OPENROUTER_MODEL` becomes runtime-read
  (it is `access: "public"` today, so its value is baked in at build, contradicting the
  code comment that promises a swap without a code change); a daily-quota 429 gets its own `quota_exhausted` reason and
  copy; the confirm-email page uses copy that is true whether or not the address was new;
  live production parity lives in a pre-deploy checklist.

**Challenger findings (refresh, 2026-09-14).** Research overturned four proposed premises
and dropped one candidate; none became a row as first worded:

- "Provider shape drift passes a green suite silently" — structural envelope drift already
  fails loudly as `invalid_response` and is logged. What is silent is `provider_error`,
  which is #8.
- "Signup silently stops at the email cap" — the rate-limit error is logged and shown. The
  real defects are raw provider copy and the unconditional "Check your email", both in #8.
- "A missing key must fail a gate before deploy" — every key is optional by design and a
  missing one already degrades visibly (banner, redirect, 503). #9 targets values that are
  present but wrong or frozen instead.
- "`.js`/`.mjs` are outside every lint glob" — CI's `eslint .` lints them. #10 targets
  guards that pass vacuously instead.
- Cloudflare Workers platform limits were raised and dropped: no evidence in the repo or
  history. See §7.

**Challenger notes (authoring, 2026-09-02).**

- Dropped a candidate "the recommendation endpoint has no rate limit" risk:
  breaking it would require adding the guard first, so it described missing
  implementation rather than a defect. The cost-abuse concern is folded
  into Risk #2's response guidance (an unauthenticated caller reaching an
  endpoint that spends LLM budget).
- Reframed interview Q1's "a soft-deleted game disappears with no way back"
  into Risk #6's two-sided assertion. As stated, disappearing from the
  catalog _is_ the intended soft-delete behaviour; the defect is losing it
  from storage or dropping live rows.
- Excluded theme/visual regression and preference-statistics accuracy from
  the map entirely per interview Q5, despite `src/components/catalog` being
  a 90-day churn leader (20/90d). See §7.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                                                                                                                                                                                                   | Must challenge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Context `/10x-research` must ground                                                                                                                                                                                                                        | Likely cheapest layer                                                                                                         | Anti-pattern to avoid                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Member A's own view of the catalog shows A's played state and A's like/dislike, never a merge of both members' rows, and every write lands under the member who made it. Cross-member _visibility_ is intended (PRD FR-006, the `/stats` page) and must not be asserted against                                                                                                                                                                               | That the database is the authority for both halves. For writes it is — `with check (member_id = auth.uid())` already denies a mismatched member id, so a policy test there is a regression guard rather than a gap. For reads it is not — SELECT is `using (true)`, so the application query's member filter is the sole authority, and that is where the untested gap lives. Also challenge that a denied write raises an error: RLS denies UPDATE/DELETE by matching zero rows, so a test must assert state unchanged, not an error status | Grounded 2026-09-12: where household-member identity enters the request, how it reaches the persisted row, and which layer is the authority for each of reads and writes                                                                                   | Two halves, two layers: DB-level policy verification for write-own; a real-database read test for attribution                 | Asserting against a mocked Supabase client that returns whatever the query asked for — such a test cannot fail. And asserting member-vs-member read isolation, which the PRD does not offer (`prd.md:94` draws the line at signed-in vs. anonymous) and FR-006 contradicts |
| #2   | Each endpoint denies an unauthenticated caller on its own, with the middleware assumed absent; and every per-member write carries the session's member id, never a request-supplied one                                                                                                                                                                                                                                                                       | That middleware `PROTECTED_ROUTES` covers API routes; that a shared-catalog "any member may edit any game" design also licenses "any caller"; that a 302 to `/auth/signin` is self-evidently a denial rather than a redirect that still ran the write                                                                                                                                                                                                                                                                                        | Which surfaces the middleware actually gates, how each handler resolves the caller, and where the member id for a write comes from                                                                                                                         | Integration at the route handler                                                                                              | Testing only the happy path with a stubbed session; asserting an ownership check on `games` that the design deliberately does not have                                                                                                                                     |
| #3   | A recommendation response contains only games present in the eligible catalog set the app supplied, even when the provider returns a plausible hallucinated title, and every recommended game satisfies the player count the household asked for                                                                                                                                                                                                              | That a well-formed provider response is a valid one; that prompt instructions constitute enforcement                                                                                                                                                                                                                                                                                                                                                                                                                                         | The eligible-set boundary, where provider output is parsed, and what the app does with an unmatched title                                                                                                                                                  | Contract test with adversarial stubbed provider responses                                                                     | Calling the real LLM from tests; taking the expected output from the current implementation instead of from the requirement (oracle problem)                                                                                                                               |
| #4   | A request with a missing, wrong-typed, or out-of-range field is rejected with a validated error response and leaves no persisted side effect                                                                                                                                                                                                                                                                                                                  | That zod is applied everywhere because CLAUDE.md says so; that an unhandled 500 is an acceptable rejection                                                                                                                                                                                                                                                                                                                                                                                                                                   | Every mutating endpoint's real input boundary and its error-translation path                                                                                                                                                                               | Integration at the route handler                                                                                              | Asserting a zod schema's shape back at itself instead of driving a request through the boundary                                                                                                                                                                            |
| #5   | Provider timeout, provider non-2xx, and malformed-JSON-with-200 each surface a distinct clear failure state, and never a rendered empty or invented recommendation                                                                                                                                                                                                                                                                                            | That a 200 from the provider means a usable response; that "no suitable game found" and "the AI failed" may look the same to the user; that an empty result means the catalog had nothing — it can equally mean the model named only games that do not exist                                                                                                                                                                                                                                                                                 | The failure and error-translation path from the provider boundary to the response the UI consumes                                                                                                                                                          | Contract test with stubbed failure responses                                                                                  | Covering only the unavailable case and skipping malformed-but-200                                                                                                                                                                                                          |
| #6   | A soft-deleted game is absent from every catalog read path, including each filter combination, yet still retrievable from storage; a live game is never dropped by filter composition                                                                                                                                                                                                                                                                         | That excluding deleted rows in one query proves it everywhere; that "it disappeared from the list" is the same as "it was deleted"                                                                                                                                                                                                                                                                                                                                                                                                           | Every read path that composes the deleted-row condition with filters, and the layer at which that condition is applied                                                                                                                                     | Integration over the query layer plus one endpoint-level check                                                                | Happy-path filter tests that never assert the deleted/live boundary; snapshotting a result list                                                                                                                                                                            |
| #7   | The outbound prompt payload carries only the fields the request needs, and no provider secret or unrelated household data appears in an error body                                                                                                                                                                                                                                                                                                            | That "we only send the catalog" is still true after later edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The prompt-assembly boundary and what actually crosses it                                                                                                                                                                                                  | Payload assertion at the provider boundary                                                                                    | Asserting the prompt string verbatim (brittle); reading the expected payload off the assembly code                                                                                                                                                                         |
| #8   | Every provider refusal — transport error, timeout, each non-2xx status, a 200 carrying an error body — leaves a server log line naming its status or cause. A daily-quota 429 surfaces as its own `quota_exhausted` reason whose copy tells the member to try again tomorrow (decided 2026-09-14). The confirm-email page never claims an email was sent: its copy is true whether or not the address was new, with no account detection (decided 2026-09-14) | That provider drift is silent — structural envelope drift already fails loudly as `invalid_response`. That `provider_error` means an outage — it equally means a retired model, a rejected request flag, a bad key or an exhausted quota. That a redirect to the confirm-email page means an email left                                                                                                                                                                                                                                      | The provider failure branches and what each logs; the provider's real limit signal (429 body, rate-limit headers, the 402 shape), confirmed against a captured response or provider docs; Supabase's obfuscated response for an already-registered address | Unit contract tests with a real `Response` built from one committed, captured provider fixture; a stubbed `signUp`            | A stub envelope derived from the service's own parser interface (oracle problem); any test that spends real provider quota; detecting existing accounts, which defeats Supabase's anti-enumeration                                                                         |
| #9   | A setting documented as runtime-tunable is read per request — `OPENROUTER_MODEL` becomes runtime-read (decided 2026-09-14); a wrong-but-present provider credential is observable in the log (shared with #8); the key names in the env schema, the test stub and `.env.example` cannot drift apart without failing `npm test`; live production parity is checked by a pre-deploy checklist before every deploy (decided 2026-09-14)                          | That a missing key must fail a gate — keys are optional by design and already degrade visibly, so do not make them required. That a green build means production config is complete — the build reads no secrets                                                                                                                                                                                                                                                                                                                             | The env schema as the source of truth and each key's access type; whether the Cloudflare Git integration still builds or deploys; the hosted Supabase Site URL and redirect allow-list; whether the OpenRouter secrets are set in production               | An offline unit parity test that reads the schema, plus a pre-deploy checklist for the half that needs credentials            | A guard that hand-lists today's keys and compares a source to itself; a CI gate that needs production credentials                                                                                                                                                          |
| #10  | Each guard exits non-zero on a known-bad fixture and on an empty or zero-match scan; the colour guard's palette tracks the installed Tailwind; removing a gate step from the CI workflow or a guard script from `package.json` fails `npm test`; the Stop-hook script at least parses (`bash -n`)                                                                                                                                                             | That the gate exists, therefore it runs. That exit 0 means clean. That `.mjs` is unlinted — CI lints it; the real gaps are guard logic and wiring                                                                                                                                                                                                                                                                                                                                                                                            | Each guard's scan root, file floor and hardcoded lists, and how a fixture root can be injected; which gate steps the workflow and `package.json` must carry                                                                                                | Unit self-tests that execute each guard against a temporary fixture tree, plus a text assertion over the workflow and scripts | Widening lint globs or adding shellcheck and calling it done without a deliberate-break check; a fixture that fails for the wrong reason                                                                                                                                   |
| #11  | A real sign-in against the local stack produces cookies that, replayed on the next request, resolve through the middleware to the same member; a protected page without a session redirects to sign-in; an invalid cookie resolves to no user; an unresolvable auth backend is marked unresolved, not anonymous                                                                                                                                               | That only a browser can see cookie bugs — the round trip is testable in-process. That manual Chrome checks imply a regression class — none reached production                                                                                                                                                                                                                                                                                                                                                                                | How the middleware can be invoked outside Astro's runtime (an `astro:middleware` alias, as `astro:env/server` already has); how cookie writes can be captured and replayed; reuse of the db harness's member seeding                                       | Integration in the `db` project against the local stack, plus middleware unit tests in `unit`                                 | A browser E2E suite before the in-process test exists; visual assertions (interview Q5); repeating the API-boundary suite's denial cases                                                                                                                                   |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                          | Goal (one line)                                                                                                                                                                   | Risks covered | Test types                                                                        | Status      | Change folder                                                       |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| 1   | API boundary contract               | Prove every endpoint denies unauthenticated callers on its own, binds per-member writes to the session, and rejects invalid input without side effects                            | #2, #4        | integration (route handlers)                                                      | complete    | `context/archive/2026-09-11-testing-api-boundary-contract/`         |
| 2   | Per-member state attribution        | Prove played state and preference stay bound to the correct household member at both the query and the policy layer                                                               | #1            | integration + DB-level RLS verification                                           | complete    | `context/archive/2026-09-12-testing-per-member-state-attribution/`  |
| 3   | Catalog integrity under soft-delete | Prove deleted games leave every read path but stay in storage, and filter composition never drops live games                                                                      | #6            | integration (query layer) + shape gate + source ratchet                           | complete    | `context/archive/2026-09-13-testing-catalog-integrity-soft-delete/` |
| 4   | LLM recommendation guardrails       | Prove recommendations stay inside the eligible catalog, fail visibly, and send only minimal data under adversarial provider responses                                             | #3, #5, #7    | contract tests with stubbed provider                                              | complete    | `context/archive/2026-09-13-testing-llm-recommendation-guardrails/` |
| 5   | Quality-gate wiring                 | Lock the floor: keep the suite non-optional in CI (the step already runs) and gate the agent's edit loop                                                                          | cross-cutting | gates                                                                             | complete    | `context/archive/2026-09-14-testing-quality-gate-wiring/`           |
| 6   | Guard self-verification             | Prove every guard and gate fails on a known-bad input and on an empty scan, tracks the installed tooling, and cannot be dropped from CI unnoticed                                 | #10           | unit self-tests over fixture trees + workflow/script wiring assertion + `bash -n` | not started | —                                                                   |
| 7   | Configuration parity                | Prove runtime-tunable settings are read at runtime, schema/stub/example config cannot drift silently, and live production parity is checked before every deploy                   | #9            | unit (schema parity) + pre-deploy checklist                                       | not started | —                                                                   |
| 8   | Provider failure attribution        | Prove every provider refusal or change is logged with its cause and shown to the member truthfully — a daily quota as its own reason, and signup never claiming an email was sent | #8            | contract tests with captured-fixture `Response` stubs                             | not started | —                                                                   |
| 9   | Session round-trip integration      | Prove a real sign-in cookie is read back by the middleware as the same member, and the page gate admits and refuses correctly, without a browser                                  | #11           | integration (`db` project, local stack) + middleware unit tests                   | not started | —                                                                   |

**Order rationale.** Phase 1 is the interview's own stated gap (Q4), sits at
the cheapest layer, covers the abuse surface, and establishes the
request-level harness later phases reuse. Phase 2 carries the highest-fear
risk (Q1, Q3) but needs a real local Supabase harness — the expensive infra
step — so it lands second rather than first. Phase 3 reuses that harness and
has partial existing coverage, so its marginal signal is lower. Phase 4 is
deterministic and independent of the database harness, sequenced after the
data-layer risks so it exercises a catalog layer already trusted. Phase 5 is
last on purpose: gating a suite that barely exists is noise.

**Order rationale, Phases 6–9 (refresh 2026-09-14).** Phase 6 goes first: it is
offline and cheap, it fixes a defect already proven by fixture, and it protects every
gate the later phases add — a later phase's new check is only as trustworthy as the
guards around it. Phase 7 is next: also offline, it fixes the build-time
`OPENROUTER_MODEL` defect and writes the pre-deploy checklist. Phase 8 fixes the one
branch that hides three failure causes, and follows Phase 7 because the runtime-model
change touches the same service. Phase 9 is last: it needs the `db` harness and an
`astro:middleware` alias, and the history shows no production incident behind it.

**Behavioural browser testing is deferred, not ruled out.** The original authoring
concluded no risk needed a browser. Risk #11 is the deployed-shape risk that paragraph
asked to revisit for, and research split it: the cookie and middleware half is testable
in-process, which is Phase 9. What remains browser-only — an island that fails to
hydrate, and an island's real request to its route — is recorded in §7 ("Behavioural
browser E2E slice") with the trigger for pulling it into a phase. Visual testing stays
excluded (interview Q5).

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                       | Tool                                         | Version                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration          | Vitest                                       | 4.1.x                                  | Plain `vitest.config.ts`, not `getViteConfig` — the Astro Cloudflare adapter's Vite plugin rejects a Vitest config at startup. Resolves the `@/*` alias and stubs `astro:env/server`. `environment: "node"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| test runner script          | `npm test`                                   | —                                      | `vitest run --project unit` — two projects since 2026-09-12 (§3 Phase 2): `unit` is hermetic and is what `npm test` / `npm run test:watch` run; `db` needs Docker and runs via `npm run test:db`. The `--passWithNoTests` flag was dropped on 2026-09-11 (§3 Phase 1), so an empty or uncollectable suite fails CI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| existing suite              | —                                            | —                                      | 20 files: 15 in the `unit` project (7 in `src/lib/services/`, 5 API-route, plus theme, types, and one component test — `GameForm.test.ts`, which exercises `fromRow`, not rendering) and 5 in `db`. 188 unit tests + 35 db tests as of 2026-09-14 (refresh).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| API / HTTP mocking          | `vi.stubGlobal("fetch", …)`                  | n/a                                    | **No library, by decision (2026-09-13, §3 Phase 4).** `fetch` is called bare on the global (`recommendations.ts:91`) — no SDK, no injected client — so the global stub is the seam, and it captures the outbound request as well as controlling the response. MSW would add a dependency and buy nothing. The stub now lives in one helper, `stubFetch` in `src/test/providerStub.ts`, used by 26 service tests and 9 route tests. Its response envelope mirrors the service's own parser interface rather than a captured provider response — §3 Phase 8 replaces it with a captured fixture.                                                                                                                                                                                          |
| DB / RLS verification       | Supabase CLI (local stack)                   | 2.98.2 devDependency (range `^2.23.4`) | `npx supabase start` requires Docker. **Used by `npm run test:db`** (the `db` vitest project under `src/test/db/`) since 2026-09-12 — the only suite that can observe RLS. `project_id` was `10x-astro-starter` (the starter default) until 2026-09-12, which collided with another local repo's stack: `supabase start` reused that project's containers, so this repo's migrations were never applied and every query hit a foreign schema. Now `my-catalog` on ports 54330-54339, with `SUPABASE_URL` in `.dev.vars` pointing at 54331. CI's stack uses the images bundled with the CLI, not the linked production project's pinned versions (those live in gitignored `supabase/.temp/`).                                                                                           |
| e2e                         | none — deferred                              | —                                      | See the §3 browser paragraph and §7 "Behavioural browser E2E slice". §3 Phase 9 covers the cookie and middleware half in-process first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| accessibility               | none yet                                     | —                                      | `eslint-plugin-jsx-a11y` 6.10.2 lints statically; no runtime a11y assertions. Not covered by any rollout phase — out of scope until a risk demands it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| bespoke deterministic gates | `lint:colors`, `lint:contrast`, `lint:reads` | n/a                                    | `scripts/check-color-literals.mjs`, `scripts/check-contrast.mjs`, `scripts/check-games-read-guard.mjs`. The first two cover the theme surface interview Q5 excluded from further testing. `lint:reads` (added 2026-09-13, §3 Phase 3) fails any `games` read reaching `.select(` without `.is("deleted_at", null)` — the one class of soft-delete regression no behavioural test can catch, because a new read path is new code no test calls. None of the three has a self-test or a zero-file floor today, and the colour guard's hardcoded palette already lags the installed Tailwind (refresh research 2026-09-14) — §3 Phase 6.                                                                                                                                                   |
| CI                          | GitHub Actions                               | n/a                                    | `.github/workflows/ci.yml` has two jobs: `ci` runs `typecheck`, lint, `lint:colors`, `lint:contrast`, `lint:reads` (added 2026-09-13), build **and `npm test`**; `db-tests` (added 2026-09-12) boots a local stack and runs `npm run test:db`. The test step was already wired in commit `04f826a` (2026-07-09), two months before this plan was authored (corrected 2026-09-11; the SHA was wrong until 2026-09-14 — `1b3980b` added `lint:contrast`, not the test step), and `--passWithNoTests` was dropped in `d3a297b` on 2026-09-11, so an empty or uncollectable suite already fails CI. §3 Phase 5 added the local edit-loop gate on 2026-09-14 and is complete. The `SUPABASE_*` secrets passed to the build step are not consumed by the build (refresh research 2026-09-14). |

**Stack grounding tools (current session):**

- Docs: none — Context7 or an equivalent framework-docs MCP is not available in current session; stack facts above come from local manifests, configs and the installed `node_modules`; checked: 2026-09-14
- Search: web search / fetch tools available (no Exa.ai MCP) — not used for the refresh; version facts were read from `package-lock.json` rather than the web; checked: 2026-09-14
- Runtime/browser: `claude-in-chrome` MCP available (no Playwright MCP) — manual verification surface; a behavioural browser slice is deferred, see §3 and §7; checked: 2026-09-14
- Provider/platform: no GitHub, Supabase, or Cloudflare MCP; `gh`, `supabase` and `wrangler` CLIs are available locally — `wrangler` is the practical path for §3 Phase 7's pre-deploy checklist; checked: 2026-09-14

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate                             | Where                                           | Required?                                                                                                 | Catches                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint                             | local (husky/lint-staged) + CI                  | required (wired)                                                                                          | syntactic drift. Since 2026-09-14 the local hook is no longer lint-only: the `*.{ts,tsx,astro}` lint-staged entry also runs `typecheck` and `npm test` — see the edit-loop gate row below and §6.6.                                                                                                                                                 |
| typecheck                        | CI (`npm run typecheck` → `tsc --noEmit`)       | required (wired 2026-09-11)                                                                               | type drift. Nothing type-checked this repo before that date: until 2026-09-14 husky ran `eslint --fix` only, and `astro build` transpiles without checking. ESLint's type-aware rules do not surface raw compiler diagnostics — phase 1's own harness shipped four `tsc` errors through a green lint and build.                                     |
| build                            | CI                                              | required (wired)                                                                                          | SSR/adapter build breakage                                                                                                                                                                                                                                                                                                                          |
| colour-literal + contrast checks | local + CI                                      | required (wired)                                                                                          | theme token drift, contrast regressions                                                                                                                                                                                                                                                                                                             |
| unguarded `games` read check     | CI (`npm run lint:reads`)                       | required (wired 2026-09-13)                                                                               | a new catalog read path that omits `.is("deleted_at", null)`, which would return soft-deleted games to the catalog. RLS is no backstop: the `games` SELECT policy is `using (true)`.                                                                                                                                                                |
| unit + integration               | local + CI                                      | required (wired 2026-09-11)                                                                               | logic regressions, endpoint contract breakage                                                                                                                                                                                                                                                                                                       |
| database policy verification     | local (`npm run test:db`) + CI (`db-tests` job) | required (wired 2026-09-12)                                                                               | per-member attribution and RLS regressions. Writes are DB-enforced and reads are not, so the suite covers both layers; needs Docker, which is why it is a separate job rather than part of `npm test`.                                                                                                                                              |
| provider contract tests          | local + CI                                      | required (wired 2026-09-13)                                                                               | out-of-catalog suggestions, silent AI failures, prompt over-sharing, household data leaking into the prompt, and a recommendation the requested party cannot play                                                                                                                                                                                   |
| CI test step + edit-loop gate    | CI on PR + local commit hook + local agent loop | required (CI step + non-empty-suite enforcement wired 2026-09-11; both edit-loop layers wired 2026-09-14) | regressions reaching a PR, or landing mid-edit. Two local layers running the same two commands: `lint-staged` at commit time grades the staged index rather than the working tree, and a `Stop` hook gates the agent turn on a dirty tree. Both escapable on purpose (`--no-verify`, `disableAllHooks`); CI stays the enforcing boundary. See §6.6. |
| guard self-tests                 | local + CI (`npm test`)                         | required for §3 Phase 6 (planned)                                                                         | a guard passing on an empty scan, a hardcoded list that fell behind the installed tooling, or a gate step removed from the CI workflow or `package.json`                                                                                                                                                                                            |
| config parity                    | local + CI (`npm test`)                         | required for §3 Phase 7 (planned)                                                                         | env schema, test stub and `.env.example` drifting apart; a runtime-tunable key frozen at build time                                                                                                                                                                                                                                                 |
| provider failure attribution     | local + CI (`npm test`)                         | required for §3 Phase 8 (planned)                                                                         | a provider refusal that leaves no log line naming its cause, untrue quota copy, and a signup page claiming an email was sent                                                                                                                                                                                                                        |
| session round trip               | local (`npm run test:db`) + CI (`db-tests` job) | required for §3 Phase 9 (planned)                                                                         | a sign-in cookie the middleware does not read back as the same member; a page gate admitting an anonymous request or bouncing a signed-in one                                                                                                                                                                                                       |
| pre-deploy checklist             | human, before `wrangler deploy`                 | required for §3 Phase 7 (planned)                                                                         | production secret names missing against the env schema, a wrong hosted Supabase Site URL or redirect list, and migrations not pushed (`lessons.md`). Deploy is manual and these checks need credentials, so they cannot be a CI gate.                                                                                                               |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section names the
phase that will write it.

### 6.1 Adding a unit test for a service

- **Location**: next to the unit under test in `src/lib/services/`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/services/recommendations.test.ts` (362 lines) or
  `src/lib/services/recommendationView.test.ts` (149 lines) — the two largest
  service examples as of 2026-09-14; `gameFilters.test.ts` (100 lines) is a
  compact pure-function example.
- **Run locally**: `npm test`.

### 6.2 Adding an integration test at an API boundary

- **Location**: `src/pages/api/games/boundary.test.ts` — one suite for the whole
  boundary, not one file per endpoint.
- **Harness**: `src/test/apiContext.ts` builds the `APIContext`
  (`createApiContext({ user, params, form | json | body })`, plus `locationOf`
  and `queryParamOf` for reading a redirect); `src/test/supabaseDouble.ts`
  stands in for the client via `vi.mock("@/lib/supabase")`, reached through a
  `vi.hoisted` holder because `vi.mock` is hoisted above imports.
- **Adding an endpoint**: add a row to the `ENDPOINTS` table. That row alone
  proves the endpoint denies an unauthenticated caller and writes nothing, and
  it joins the missing-client suite for free. The table's doc comment names the
  four routes deliberately excluded, so it stays checkable against the tree.
- **The positive case**: a denial row is only meaningful next to a case that
  writes. Build the signed-in context by passing `user: testUser()` to
  `createApiContext` (`testUser("member-a")` sets the member id), and seed
  anything the handler reads before writing through the double's constructor:
  `createSupabaseDouble({ results: { games: { data: { id: "game-1" } } } })`.
- **Asserting a write**: `double.writeSummary()` gives `["games.insert"]`-shaped
  strings for the coarse check; `double.writeLog[0]` carries `{ table, op,
payload }` when the payload matters (e.g. the member id came from the session,
  not the form). For a write that must be row-scoped, assert
  `double.filterSummary()` — a dropped `.eq("id", id)` is how one soft-delete
  becomes a mass delete, and only that assertion catches it.
- **Assertion shape**: every refusal asserts _two_ things — the response
  (`queryParamOf(response, "error")`, or `response.status` for the one JSON
  endpoint) **and** `double.writeSummary()` being `[]`. A redirect alone does
  not prove the write did not happen. Read the error through `queryParamOf`,
  never as an encoded substring: the two redirect builders encode a space
  differently (`%20` vs `+`).
- **The double's limits**: it records writes and models no rows, so it proves
  "nothing was persisted" and _nothing whatsoever_ about authorization or row
  visibility. Anything RLS-shaped belongs to §3 Phase 2.
- **Prove the test can fail**: break the behaviour (delete a handler's
  `if (!context.locals.user)` guard), watch the case go red, restore.

### 6.3 Adding a test for per-member state

- **Location and naming**: `src/test/db/`, named `<subject>.test.ts` — the `db`
  vitest project collects exactly `src/test/db/**/*.test.ts`, so a file placed or
  named otherwise is silently never run. `writeOwn.test.ts` holds policy-layer
  assertions, `readAttribution.test.ts` holds application-layer ones.
  `src/test/db/README.md` states what the harness proves, what it costs, and — the
  part worth reading before trusting a green run — what it does **not** prove.
- **Run locally**: `npx supabase start` once, then `npm run test:db`. CI runs it as
  its own `db-tests` job; it needs no repository secrets, because the CLI's stock
  local anon key is the default.
- **Harness**: `src/test/db/harness.ts` — `requireLocalStack()` in `beforeAll` (it
  throws with instructions; these tests never skip), `createTwoMembers()` for two
  signed-in members created fresh per run, `createGame` / `seedMemberState` for
  fixtures, `deleteGames` for teardown.
- **Which layer owns which half**: writes are enforced by RLS
  (`with check (member_id = auth.uid())`); reads are enforced only by the
  application's `.eq("member_id", …)`, because SELECT is `using (true)`. Test the
  first through a member's client, the second through the real service functions.
- **Denial is silent**: RLS refuses UPDATE and DELETE by matching zero rows, not by
  raising — only INSERT raises `42501`. Assert the row **reads back unchanged**.
  Never assert on an empty result alone: that is also what you get when the row
  never existed.
- **Always pair a denial with a positive control** in the same file — the owner
  performing the same operation must succeed. Otherwise "B cannot" also passes when
  nobody can.
- **Fixture order is constrained**: `game_preference` has a composite FK to
  `game_played (game_id, member_id)`, so seed played before preference.
- **Make the fixture adversarial**: give the two members _differing_ state on the
  same game, and at least one pair of _opposing_ preferences. The preference map is
  built unordered with last-write-wins, so identical state lets a dropped member
  filter pass unnoticed.
- **Database-only guarantees live in `policyBackstops.test.ts`**: the `anon` role
  (which the app-boundary suite cannot speak to — that proves the _app_ turns a
  sessionless caller away, not that the _database_ would) and the composite FK
  enforcing FR-005. Break-check these by adding an `anon` policy or dropping the FK.
  Dropping the FK lets orphan rows in, so clean them out before restoring it.
- **Do not assert member-vs-member read isolation.** Cross-member reads are
  intended (FR-006, `/stats`); such a test fails by design. The deliberate read-all
  test in `writeOwn.test.ts` records that decision.
- **Prove the test can fail**: for the app half, delete an `.eq("member_id", …)`
  from `listMemberState`; for the policy half, `alter policy … with check (true)` on
  the live stack. Watch it go red, then restore.

### 6.4 Adding a test for a catalog read path

- **Where each half lives**: behaviour in `src/test/db/catalogIntegrity.test.ts`
  (real Postgres, run by `npm run test:db`); query _shape_ in
  `src/lib/services/games.test.ts` (hermetic, runs in `npm test`). The split is
  forced, not stylistic: `supabaseDouble` honours no filters and resolves to
  canned data regardless of the chain (`supabaseDouble.ts:126`), so a
  double-based "deleted game is excluded" test passes with the `.is()` deleted.
  Anything about row visibility belongs in the db project.
- **Pass the double to a service** through `double.serviceClient`, never
  `double.client` — the services take the client as a parameter and `tsc`
  rejects the raw double. The cast lives in the double, once, with its reasoning.
- **Assert both directions in every case.** The deleted row absent AND the
  matching live row present. Absence alone also passes when the query returned
  nothing at all, which is the most common way one of these tests quietly stops
  testing.
- **Make the deleted row a genuine twin.** It must be identical to the live row
  on every filterable column, so it is excluded because it is deleted and not
  because it failed the filter on its own merits. A twin that fails the filter
  makes the case decorative — and the break-check will not tell you, because the
  case reddens for the wrong reason.
- **Range fixtures must sit exactly on the boundary.** `players` matches
  `min_players <= N <= max_players` and `maxMinutes` matches
  `avg_play_minutes <= X`, all inclusive. A fixture in the middle of the range
  keeps matching after `.gte` becomes `.gt`, so the deliberate break stays green.
  Set `min_players === max_players === players` and
  `avg_play_minutes === maxMinutes`.
- **Cover both filtering layers.** `genre`, `players`, `maxMinutes` and
  `loanStatus` become PostgREST predicates (`games.ts:34-44`); `played` and
  `preference` are per-member facts applied in memory afterwards
  (`catalogGames.ts:35-40`). Drive them through `listCatalogGames`, which is the
  only level where both exist, and seed per-member state on the deleted twin as
  well — that is what proves the in-memory merge cannot reintroduce it. Played
  before preference, per the composite FK (§6.3).
- **Fixtures: `markDeleted` for reads, the real service for the delete.**
  `markDeleted(member, id)` stamps `deleted_at` directly, so a read assertion
  never fails because `softDeleteGame` regressed. The one test whose subject is
  the deletion calls the real service. Neither is `deleteGames`, which
  hard-deletes for teardown and is the opposite of what the app ever does.
- **Assert the row is still in storage**, by querying it by id without the
  predicate. This is the half that distinguishes soft from hard delete; a suite
  that only checks absence passes just as happily against a hard delete, which
  would destroy the catalog history FR-002 exists to protect.
- **A new read path is not covered by any of this** — it is new code no existing
  test calls. `npm run lint:reads`
  (`scripts/check-games-read-guard.mjs`) is the ratchet that catches it. When it
  fires on a read that genuinely must see deleted rows, add the path to
  `EXEMPT_PREFIXES` with a comment; do not loosen the rule. Note the write-verb
  check runs before the `.select(` check, because `createGame` (`games.ts:82`)
  is `insert().select()` and a naive rule flags it.
- **Prove the test can fail**: drop `.is("deleted_at", null)` from
  `games.ts:31` — **every** filtered case must redden, not just the unfiltered
  one; if one stays green its twin is not a real twin. Then drop it from `:65`
  for the `listGenres` case, and change `.gte("max_players", …)` to `.gt(…)` for
  the live-row-dropped direction. Restore each time.
- **Do not add a `deleted_at` RLS backstop** without changing `softDeleteGame`
  first. Verified on the local stack 2026-09-13: a SELECT policy of
  `using (deleted_at is null)` makes the service throw
  `new row violates row-level security policy for table "games"`, because its
  `.select().maybeSingle()` needs the stamped row visible for `RETURNING`.

### 6.5 Adding a test at the LLM provider boundary

- **Two homes, and the choice is forced.** `src/lib/services/recommendations.test.ts`
  owns everything that takes candidates as input — failure shapes, the catalog
  allow-list, the reason union, the player-count guard.
  `src/pages/api/recommendations.test.ts` owns anything about _what leaves the
  process_, because `recommend()` receives candidates already sanitised — a payload
  assertion written at the service layer proves half the chain and reads as if it
  proved all of it.
- **What the route payload test does and does not guard.** It asserts what crosses
  the wire, which is exactly what the NFR asks. It does **not** guard the first of
  the chain's two allow-lists: spreading `...row` into `mapRowToCandidateGame`
  (`src/types.ts`) leaves it green, because the prompt pick narrows to eight fields
  again downstream — correctly, since nothing extra reached the provider. The first
  allow-list is guarded by `src/types.test.ts`'s exact-key-set assertion instead.
  Verified by break-check 2026-09-13; the earlier claim that one test exercised
  both was wrong.
- **The seam is `vi.stubGlobal("fetch", …)`** (`src/test/providerStub.ts:36-40`).
  No mocking library is installed and none is wanted — see §4. The stub controls
  the response _and_ captures the request, which is where every outbound
  assertion is made.
- **Env binds at import time.** `src/test/astro-env-server.stub.ts` reads
  `process.env` when the module is first evaluated, so every case sets the env,
  calls `vi.resetModules()`, and then dynamically imports the unit
  (`loadRecommend` / `loadRoute`). A statically imported route binds whatever was
  set when the file loaded and returns `not_configured` before any request — a
  green test that proved nothing. Asserting the `Authorization` header in the
  route suite is the guard against exactly that false green; do not delete it as
  a duplicate of the service suite's.
- **Seeding the route test**: all three tables `listCatalogGames` fans out to —
  `games`, `game_played`, `game_preference` — and `games` must be an **array**
  (`mergeAndFilterCatalog` maps over it). The nearest file to copy from,
  `boundary.test.ts:45`, seeds a bare object and will crash the merge. State rows
  must carry the game's own `game_id`, or `played`/`preference` never appear in
  the payload and the assertion that they are the _only_ optional fields is
  vacuous. Make the seeded row **fat** — `created_by`, `authors`, `loan_status`,
  timestamps — because those columns are what a leak test asserts the absence of.
- **Take the expected payload from the requirement**, not from the assembly code:
  the eight `CandidateGame` fields (`prd.md:92`;
  `context/archive/2026-07-09-llm-recommendation-service/plan.md:201-206`). Assert
  the exact key set **and** the absence of forbidden strings in the serialized
  body; never assert the prompt text verbatim.
- **What this boundary guarantees is identity plus player count.** The catalog
  allow-list (`recommendations.ts:155-159`) and the player-count guard are
  enforced in code. Everything else the model asserts is prompt-only: the time
  budget, the genre, the truth of each `reason`, and that ranks start at 1.
- **Known-unguarded, deliberately**: unbounded list length, `rank` sanity
  (zero/negative/fractional pass `z.number()`), empty `reason` strings, and time
  and genre fit. No risk row names them; revisit when one does.
- **`AbortSignal.timeout` is out of reach of fake timers** — sinon does not patch
  it — so the 8s cap cannot be driven. Assert that a `signal` was passed.
- **Prove the test can fail**: add `...g` to the prompt pick
  (`recommendations.ts:77-86`) — both route payload cases must redden; add `...row`
  to `mapRowToCandidateGame` — the same two plus `src/types.test.ts:26`; drop
  `signal` from the `fetch` init — only the request-shape case; make the
  `out_of_catalog` branch return `no_match` — the hallucination case only; change
  the guard's `<=` to `<` — the boundary case (and any other fixture that sits on
  a boundary, which is a feature of those fixtures, not a leak).

### 6.6 The local gates: what runs when, and how to escape

Two layers, both running the same two commands — `npm run typecheck` and
`npm test` — so "green" has one local definition.

**Activation first.** husky only runs hooks once `core.hooksPath` points at
`.husky/_`, which the `prepare` script sets during `npm install`. That script was
missing until 2026-09-14, so `.husky/pre-commit` had never executed in a fresh
clone — a commit with a staged type error sailed through in 30ms. If commits look
suspiciously fast, check `git config core.hooksPath` before trusting the gate.

**At commit time** (`.husky/pre-commit` → `npx lint-staged --hide-unstaged`).
Configured in `lint-staged.config.js`, not `package.json`. Fires only when a
`*.{ts,tsx,astro}` file is staged, so a docs-only commit never pays for it. The
commands live inside lint-staged deliberately: lint-staged hides unstaged
changes around its tasks, so the gate grades the **staged snapshot** rather than
the working tree. A working-tree gate admits a commit whose staged content is
broken — verified 2026-09-14 by staging a type error, fixing the working copy,
and watching `tsc` pass. `--hide-unstaged` widens that hiding from partially
staged files to all tracked files.

The `*.{ts,tsx,astro}` entry must stay a **function**. lint-staged appends
matched filenames to string commands, and `tsc --noEmit <file>` silently drops
`tsconfig.json`, so every `@/*` alias fails to resolve. A function returns
complete commands and appends filenames only to `eslint`.

**At turn end** (`.claude/settings.json` → `.claude/hooks/quality-gate.sh`). A
`Stop` hook, which takes no matcher and fires on every turn. Exit 2 there does
not halt the agent — it _prevents it from stopping_ and hands stderr back as the
reason, so the agent keeps working with the failure in front of it. Two guards,
and their order matters: `stop_hook_active` first (Claude Code overrides a Stop
hook after eight consecutive blocks; checked second, a broken tree would burn
eight turns first), then a working-tree check scoped by pathspec to
`*.ts`/`*.tsx`/`*.astro` — the same set the commit gate's lint-staged key
matches, so both layers trigger on the same files. Both guards fail **closed**:
if the project directory cannot be entered or `git status` errors, the hook
exits 2 with a reason rather than waving the turn through. The script talks only through
exit codes and stderr — stdout is parsed as JSON only when it starts with `{`,
so a chatty shell profile would silently void a decision.

**What the pair does not cover.** The layers partition rather than overlap: a
turn ending in a commit leaves a clean tree, so the Stop hook sits out — the
commit hook already graded that content. The consequence is that
`git commit --no-verify` skips husky _and_ leaves a clean tree, so it skips the
Stop hook too. Both miss the same commit and CI is all that remains.

**The escapes are deliberate.** `git commit --no-verify` and
`"disableAllHooks": true` both stay available; neither gate is enforceable and
neither tries to be. CI is the enforcing boundary — these layers move the signal
earlier, they do not replace it. If a bypass becomes routine the honest response
is to make the gate cheaper, not to close the escape.

**Costs, measured 2026-09-14** so a reader can judge rather than re-measure:
`typecheck` 3.6–3.7s, `npm test` 1.6–1.7s. The pre-commit hook already cost
~4.7s before this change, because ESLint here is type-aware and pays full
project analysis even for one file; a code commit goes from roughly 5s to
roughly 10s, and a docs-only commit is unchanged. The Stop hook measured ~8s
end to end on a dirty tree (two `npm` startups on top of the commands), and
137ms when `stop_hook_active` short-circuits it.

**Known residual.** Untracked files count for both layers, deliberately: `tsc`
reads them, so a broken untracked `.ts` genuinely breaks the build. The cost is
that one can fail the commit gate even though it is not part of the commit, and
can block the turn gate until it is fixed, staged, removed or gitignored.

An earlier version of the turn gate used an unfiltered `git status --porcelain`,
which also counted untracked files of _any_ type — one stray `.log` or editor
backup made every turn pay the full run (measured 150ms clean vs 8340ms with a
single untracked `.txt` present). The pathspec above fixed that; scratch files
that `tsc` never reads no longer trigger anything.

**The db suite is deliberately absent from both.** It needs Docker, and a gate
that fails because a daemon is not running teaches people to bypass it.

### 6.7 Per-rollout-phase notes

**Phase 1 (2026-09-11).** One production defect was found and fixed by the
tests rather than by inspection: `context.request.formData()` was called
outside any try/catch in five handlers, and an unparseable multipart body
escaped as an unhandled `TypeError` — a framework 500 instead of the house
`?error=` redirect. The parse is now wrapped in `index.ts`, `[id].ts`,
`loan.ts`, `played.ts` and `preference.ts`.

The five manual verification rows were closed on 2026-09-12 against a real
local database. Closing 3.4 is what surfaced the colliding `project_id` in §4:
a valid post came back as the friendly "Could not save the game" redirect
because `public.games` did not exist in the stack the app was talking to. Once
this repo had its own stack, a valid post persisted and rendered on `/catalog`,
and all four invalid posts (empty title, inverted player range, out-of-range
minutes, unparseable multipart body) redirected with their `?error=` copy and
left the `games` table empty — the no-side-effect claim now holds at the
database, not only against the double. Rows 2.4 and 4.4 each needed a doc fix
first: the `ENDPOINTS` comment now names the four excluded routes, and §6.2
gained the positive-case and write-assertion bullets it was missing.

`src/pages/api/games/id-endpoints.test.ts` was deleted: it `readFileSync`'d
each handler and asserted the source text contained `GAME_NOT_FOUND_MESSAGE`,
which passes even if the constant is never used. The not-found copy is now
asserted through the handlers themselves.

Phase 1 deliberately asserts no ownership on `games` (shared catalog by design)
and proves nothing about RLS — see the Risk #2 amendment note in §2.

### 6.8 Proving a guard can fail

TBD — written by §3 Phase 6: a known-bad fixture per guard, an empty-scan floor, and the
assertion that the CI workflow and `package.json` still carry every gate step.

### 6.9 Adding a configuration key

TBD — written by §3 Phase 7: choosing the key's access type (runtime-read vs build-time),
the schema parity test, and the pre-deploy checklist entry.

### 6.10 Attributing a provider failure

TBD — written by §3 Phase 8: a captured-fixture `Response`, the log assertion that names
the cause, and mapping a limit to its own reason and copy.

### 6.11 Testing the session round trip

TBD — written by §3 Phase 9: a real sign-in against the local stack, replaying the
captured cookies, and invoking the middleware outside Astro's runtime.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Theme and visual regression** — `lint:colors` and `lint:contrast`
  already gate the theme surface deterministically; screenshot diffs on top
  would cost more and add no signal. Re-evaluate if a theme regression ships
  that neither script catches. Issue #43 (porting the runtime contrast audit into
  E2E) is deliberately outside the 2026-09-14 refresh, pending a separate
  decision. (Source: Phase 2 interview Q5; refresh interview Q5.)
- **Preference statistics accuracy** — the only nice-to-have FR (FR-006),
  low blast radius if a count is off by one. Re-evaluate if statistics
  become an input to recommendations rather than a read-only view. (Source:
  Phase 2 interview Q5.)
- **Behavioural browser E2E slice** — at most three flows: sign in → open
  `/catalog` → sign out → `/catalog` redirects; `/play` with no provider key,
  where client validation blocks an empty submit and a valid one reaches the
  `not_configured` panel; optionally Edit on a seeded catalog card, proving the
  island hydrated. Run against `astro build` plus `astro preview` and the local
  Supabase stack, never `astro dev` (its Vite cache produced dev-only hydration
  failures on 2026-08-01). Behavioural only (interview Q5). Excluded for now
  because §3 Phase 9 covers the cookie and middleware half in-process for far
  less, and no browser-only regression has reached production. Re-evaluate once
  Phase 9 has landed **and** either a hydration or island-request regression
  ships, or manual Chrome verification rows keep recurring in plans. (Source:
  research 2026-09-14 §Risk D; supersedes the 2026-09-02 "Browser/e2e layer"
  entry.)
- **Real-provider smoke test** — a scheduled call to the real LLM provider to
  catch response drift that stubs cannot see. Excluded because each run spends
  one of the free tier's 50 daily requests the household itself depends on, and
  it needs an `OPENROUTER_API_KEY` repository secret CI does not have. §3 Phase 8's
  captured-fixture contract tests carry the drift signal instead. Re-evaluate if
  a provider drift reaches production that the captured fixture did not
  represent; if adopted, run it nightly or on manual dispatch, never per push.
  (Source: research 2026-09-14 §Risk A.)
- **Cloudflare Workers platform limits** — CPU time and subrequest caps. No
  evidence in the repo or its history that a request has come near either; the
  only mention is an unknown-unknowns note in `infrastructure.md`. Re-evaluate
  if `wrangler tail` shows a request failing on a platform limit. (Source:
  research 2026-09-14 §Risk B.)
- **Runtime accessibility assertions** — `eslint-plugin-jsx-a11y` covers the
  static surface; no §2 risk points at a11y today. Re-evaluate if the
  product takes on users outside the two-person household. (Source: §2 risk
  map — no supporting risk.)
- **The island's generic-error collapse** — every `{ error }` body (401, both
  400s, 500, 503) renders one "Something went wrong" panel
  (`RecommendationFlow.tsx:83-96`), so an expired session is indistinguishable
  from a database outage. A real Risk #5 gap, but closing it is UI work and
  testing it would open a React-render layer §4 does not plan. Re-evaluate if a
  support question traces back to that panel. (Source: §3 Phase 4 research,
  2026-09-13.)
- **Response properties beyond identity and player count** — list length, `rank`
  sanity, empty `reason` strings, and fit against time or genre. All are
  unguarded in code and untested by choice: no §2 risk names them, and time and
  genre are soft in the PRD ("can account for", "close matches"), so a hard
  filter would kill sensible near-misses. Re-evaluate when a household complaint
  points at one. (Source: §3 Phase 4, 2026-09-13.)

## 8. Freshness Ledger

- Strategy §1 last reviewed: 2026-09-02
- Strategy §2–§5 last reviewed: 2026-09-14 (refresh)
- Stack versions last verified: 2026-09-14
- AI-native tool references last verified: 2026-09-14
- Refresh 2026-09-14 (`context/archive/2026-09-14-test-plan-refresh-2026-09-14/`): §2 gained
  #8–#11 (refresh risks A+B, C, E, D) with response guidance and a dated note, #1–#7
  unchanged; §3 gained Phases 6–9 and the browser paragraph became "deferred, not ruled
  out"; §4/§5 facts corrected at `c1f9a83` and four planned gates added; §6.4/§6.5 line
  references corrected and §6.8–6.11 placeholders added; §7 gained two exclusions and
  the browser entry was narrowed; §5's optional pre-prod smoke became the required
  pre-deploy checklist. §1 was not reviewed and stays as authored.
- Correction 2026-09-11: §4 CI row and §5 gate row claimed no CI test step;
  `.github/workflows/ci.yml` has run `npm test` since `04f826a`. §3 Phase 5
  narrowed accordingly. (SHA corrected 2026-09-14 by §3 Phase 5 research: the
  commit was `04f826a`, 2026-07-09, not `1b3980b`, which added `lint:contrast`
  on 2026-08-01. The claim's substance was right and the true date is earlier.)
- Amendment 2026-09-13: Risk #3's "or one currently loaned out" clause removed
  after phase 4 research — no requirement offers it and a 2026-08 decision
  declined it. Risk #3's source attribution corrected (the catalog-only quote is
  US-01's acceptance criterion at `prd.md:59`, not FR-007), its response cell now
  names the player-count guarantee, Risk #5's challenge cell gained the
  empty-result conflation, §4's mocking row now records the global-`fetch` stub
  as the layer, §5's provider-gate row is wired, §6.5 written, and §7 gained two
  entries.
- Amendment 2026-09-11: Risk #2 rewritten after phase 1 research — the
  "non-owning caller" clause described a guarantee the shared-catalog design
  does not offer. §2 risk row, §2 response guidance, §3 Phase 1 goal and §6.2
  updated together.

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
