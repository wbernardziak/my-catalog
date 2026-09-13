# Test rollout phase 4: LLM recommendation guardrails — Implementation Plan

## Overview

Phase 4 of the phased test rollout (`context/foundation/test-plan.md` §3) covers Risks
#3, #5 and #7: recommendations must stay inside the eligible catalog, fail visibly, and
carry only minimal household data to the provider.

Research (`research.md`) found the headline assertion of Risk #3 already enforced **and**
already tested. So this phase is not "write the provider tests" — it is four narrower
jobs: prove the guarantee nobody has ever asserted (the outbound payload, and only a
route-level test can prove it), close the branches the existing suite misses, repair two
defects the research exposed, and write down what is guarded and what is not.

## Current State Analysis

- `recommend()` (`src/lib/services/recommendations.ts:59-163`) calls OpenRouter through
  the bare global `fetch` (`:87`), parses with zod (`:24-32,144`), and enforces the
  catalog-only invariant in code by filtering the model's `gameId`s against the caller's
  candidate list (`:153-156`). It never throws; it returns a closed union
  (`src/types.ts:180-185`).
- `src/lib/services/recommendations.test.ts` already holds 12 passing tests driving that
  real path through `vi.stubGlobal("fetch", …)` (`:43-47`), including the out-of-catalog
  id, timeout, non-2xx, transport failure, non-JSON content, schema violation, missing
  key and empty-catalog cases.
- **Nothing asserts what leaves the process.** The suite inspects the request body once,
  for the `reasoning` flag (`:89-100`). The 8-field allow-list at `:73-82` and the row →
  `CandidateGame` allow-list at `src/types.ts:136-157` are both unguarded by any test.
- **`recommend()` cannot see the route's mistakes**: it receives candidates as a
  parameter, and the route (`src/pages/api/recommendations.ts:60-63`) is what turns
  database rows — carrying `created_by`, `deleted_at`, `authors`, `loan_status` — into
  them.
- **Two defects.** (1) When the model answers with only fabricated ids, the filter empties
  the list and the result is `no_match` (`:158-160`) — the same value an empty catalog
  produces (`:67-69`) — rendered as the neutral "No suitable game found … Try adjusting
  the player count, time, or genre." (`recommendationView.ts:153-157`), with no log. The
  user is told to change their criteria when the provider failed. (2) Nothing checks that
  a recommended game fits the requested player count: the route passes `{}` as filters
  (`:60`), and no post-hoc check exists, although `prd.md:102` ranks player count first
  and `games.ts:36-41` already implements the predicate in SQL.
- The route is tested only for its guards: 401, 503 and two 400s in
  `src/pages/api/games/boundary.test.ts:128-168,306-327`. No test drives its 200 envelope,
  its 500 catalog path, or the candidate list it assembles.

## Desired End State

A regression in any of the following turns `npm test` red, locally and in CI:

1. A household field that is not part of the minimal prompt contract reaches the provider —
   including one introduced by a future `...g` spread in either allow-list.
2. A provider answer whose ids are all fabricated is reported to the user as a no-match.
3. A recommended game does not fit the requested player count, or appears twice.
4. Any of the provider-boundary branches the current suite misses
   (`response.json()` rejection, non-string content, a request sent without a timeout
   signal) silently changes behaviour.

And `context/foundation/test-plan.md` tells the truth about this boundary: the loaned-title
clause is gone, §6.5 exists, and the "provider contract tests" gate is marked wired.

### Key Discoveries:

- `vi.stubGlobal("fetch", …)` is the only seam and it is sufficient — `fetch` is called
  bare on the global (`recommendations.ts:87`), there is no SDK and no DI parameter
  (`:59-62`). **No mocking library is needed or wanted.**
- `src/test/astro-env-server.stub.ts:5-8` reads `process.env` **at import time**, so any
  test that needs `OPENROUTER_API_KEY` set must follow the `vi.resetModules()` +
  dynamic-import idiom at `recommendations.test.ts:50-60`. This now applies to the route
  module too, because it imports `recommend` statically.
- `supabaseDouble` honours no filters and returns configured rows verbatim
  (`src/test/supabaseDouble.ts:124-141`). That disqualifies it for visibility claims — and
  makes it perfect here: it hands the route a row carrying exactly the fields a leak test
  wants to see absent. `listCatalogGames` fans out to three tables (`games.ts:31`,
  `memberGameState.ts:114-115`), so all three must be seeded.
- `FailureReason` is derived from the union (`recommendationView.ts:138`) and
  `describeFailure` (`:151`) is an exhaustive switch with a declared return type — adding
  a union member makes `npm run typecheck` fail until the copy exists. The island needs no
  change: it routes every reason through `describeFailure` (`RecommendationFlow.tsx:103`).
- The existing test "returns no_match when every recommendation is out-of-catalog"
  (`recommendations.test.ts:119-133`) asserts the very behaviour Phase 3 changes. It is
  rewritten there, not deleted.
- Risk #3's "excludes loaned titles" describes a guarantee the product does not offer:
  loan state never reaches the model by decision
  (`src/pages/api/recommendations.ts:55-57`, `recommendationView.ts:71-76`), and a prior
  change answered exactly this question with a badge rather than an exclusion
  (`context/archive/2026-08-01-visual-identity-themes/plan.md:371-373,385-387`).

## What We Are NOT Doing

- **Not excluding loaned or already-played games from candidates.** No PRD line asks for
  it and a recorded decision declined it. If the household wants it, that is a product
  change with its own `/10x-new`. Risk #3's clause is corrected in Phase 5 instead.
- **Not enforcing the time or genre criteria post-hoc.** Both are soft in the PRD
  ("can account for", "close matches"); only player count has a requirement-derived
  numeric oracle. A hard filter on the other two would kill sensible near-misses.
- **Not fixing the island's generic-error collapse.** 401/400/500/503 all rendering
  "Something went wrong" (`RecommendationFlow.tsx:83-86`) is a real Risk #5 gap, but it is
  UI work that would open a React-render test layer §4 does not plan. Recorded in §7 as a
  follow-up.
- **Not guarding unbounded list length, `rank` sanity, or empty `reason` strings.** No risk
  row names them; they are recorded in §6.5 as known-unguarded. Duplicate ids are the one
  exception (Phase 4) because they produce duplicate React keys.
- **Not adding MSW, nock, or any HTTP-mocking dependency**, and not adding a structural
  ratchet in the style of `lint:reads` — a new prompt field must pass through the explicit
  pick at `recommendations.ts:73-82`, which the payload test already covers.
- **Not calling the real provider from any test**, and not touching the prompt text,
  the model choice, retry/caching behaviour, or the whole-catalog decision.

## Implementation Approach

Five phases, ordered by what each layer alone can prove and by what must exist before the
next thing is safe to change.

1. **The route harness comes first** because it is the new capability and it carries the
   one guarantee nothing has ever asserted (Risk #7). It must exist before the production
   changes land, so those changes are made against a suite that can see the whole chain.
2. **The service-suite gaps are pure test additions** — no production edit — so they are
   cheap to land next and they widen the net before behaviour moves.
3. **Then the two production changes**, in dependency order: the union gains
   `out_of_catalog` first (Phase 3), so Phase 4's guard can be written knowing exactly
   which reason it must *not* use.
4. **Documentation last**, per the house pattern: the cookbook entry and the `test-plan.md`
   backports record what was learned, including the risk-row correction.

Every assertion ships only after being watched to fail. The break-check for each phase is
a named, reversible edit in that phase's Manual Verification rows.

## Critical Implementation Details

- **Import-time env binding.** `OPENROUTER_API_KEY` is captured when
  `src/lib/services/recommendations.ts` is first imported, via the aliased stub
  (`vitest.config.ts:46` → `src/test/astro-env-server.stub.ts:5-8`). A route test that
  imports `src/pages/api/recommendations.ts` at the top of the file will bind whatever
  `process.env` held then. Set the env in `beforeEach`, call `vi.resetModules()`, and load
  the route handler by dynamic import inside each test — the idiom at
  `recommendations.test.ts:50-60`, now applied one layer up. Getting this wrong produces a
  test that passes for the wrong reason (`not_configured` returned before any fetch).
- **Order inside the post-parse block** (`recommendations.ts:153-163`) is load-bearing
  after Phases 3 and 4: catalog allow-list → `out_of_catalog` decision → dedupe → player
  guard → `no_match`. Deciding `out_of_catalog` *after* the player guard would report a
  criteria mismatch as a hallucination.

---

## Phase 1: Route-level contract harness and payload minimality

### Overview

Prove that only the minimal prompt contract crosses the wire, starting from database rows
rather than from already-sanitized candidates — the only place where both allow-lists are
under test at once. This is Risk #7's whole assertion.

### Changes Required:

#### 1. Route contract suite

**File**: `src/pages/api/recommendations.test.ts` (new)

**Purpose**: Drive the real `POST` handler with a doubled Supabase client and a stubbed
`fetch`, capturing the outbound request so the prompt payload can be asserted against the
requirement rather than against the assembly code.

**Contract**: Follows the established route-test idiom —
`vi.mock("@/lib/supabase")` through a `vi.hoisted` holder
(`src/pages/api/games/boundary.test.ts:18-22,44-47`), `createApiContext({ user: testUser(),
json: {…}, url })` (`src/test/apiContext.ts:57`), and `createSupabaseDouble({ results })`
(`src/test/supabaseDouble.ts:114`) seeding all three tables `listCatalogGames` reads:
`games`, `game_played`, `game_preference`. `fetch` is stubbed per test and its
`init.body` parsed. The handler is loaded by dynamic import after `vi.resetModules()`
(see Critical Implementation Details).

**Seed shapes are load-bearing.** `results` is keyed per table, so all three are seeded
separately: `games` as `{ data: GameRow[] }` — an **array**, because `mergeAndFilterCatalog`
maps over it (`catalogGames.ts:29`) — `game_played` as `{ data: { game_id }[] }` and
`game_preference` as `{ data: { game_id, preference }[] }` (`memberGameState.ts:125-130`),
with `game_id` equal to the seeded game's `id`, or the merge yields `played: false` /
`preference: null`. Note the trap in the nearest model to copy: `boundary.test.ts:45` seeds
`games` as a bare **object**, which crashes the merge.

The seeded `games` row is deliberately **fat**: it carries `created_by`, `deleted_at`,
`created_at`, `updated_at`, `authors` and `loan_status` in addition to the catalog fields,
and the seeded member state gives the game both a `played` value and a `preference`, so
neither optional field is dropped by `JSON.stringify` and both are observable in the
payload.

#### 2. The payload assertions

**File**: `src/pages/api/recommendations.test.ts`

**Purpose**: Assert the minimal-prompt NFR (`prd.md:92`) as two complementary claims, so
neither a new field nor a renamed one slips through.

**Contract**: Per candidate game in the parsed body — the key set equals exactly
`{id, title, genre, minPlayers, maxPlayers, averagePlayMinutes, played, preference}`, the
contract fixed at `context/archive/2026-07-09-llm-recommendation-service/plan.md:201-206`.
Separately, the **serialized body as a whole** contains none of: `created_by`,
`deleted_at`, `created_at`, `updated_at`, `authors`, `loan_status`, `loanStatus`, the
session member id, or the API key. The top level carries only `criteria` and
`candidateGames`, and `criteria` only the three validated fields. Never assert the prompt
string verbatim (`test-plan.md:136` names that anti-pattern); assert structure and absence.

#### 3. Envelope and transport assertions

**File**: `src/pages/api/recommendations.test.ts`

**Purpose**: Cover the route paths no test reaches today, so the payload cases sit next to
proof that the route works at all.

**Contract**: A successful call returns `200 { ok: true, recommendations: [...] }` with the
view join applied — `title` and `loanStatus` present on the item although neither was sent
to the model (`recommendationView.ts:119-132`). A throwing catalog read returns
`500 { error: "Could not load your catalog. Please try again." }` and issues no `fetch`.
The `Authorization` header carries the configured key, and no response body in any case
contains it. That header assertion is **not** a duplicate of Phase 2's: here it is the
guard against a false green, proving the route's own import bound the key rather than
returning `not_configured` before any request. Do not delete it as redundant.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with the new file collected by the `unit` project
- `npm run typecheck` passes (a route test hands the double's `client` to the `vi.mock`
  holder; `serviceClient` is for service tests that take the client as a parameter —
  `src/test/supabaseDouble.ts:79-83`)
- `npm run lint` passes

#### Manual Verification:

- Break-check the payload allow-list: add `...g` to the candidate map at
  `src/lib/services/recommendations.ts:73`, run `npm test`, confirm **both** the key-set
  case and the forbidden-key case go red, restore
- Break-check the row allow-list: add `...row` to `mapRowToCandidateGame`
  (`src/types.ts:136`), confirm both payload cases **plus** `src/types.test.ts:26` (which
  asserts that mapper's exact key set) go red — three expected casualties, nothing else —
  restore
- Confirm the success case would fail for the right reason: temporarily drop the view join
  so `title` is absent from the response, confirm only the envelope case reddens, restore
- A reader can tell from the test names which assertion defends the minimal-prompt NFR and
  which defends the route contract

**Implementation note**: After this phase and all automated verifications pass, stop for
human confirmation that the break-checks behaved as described before continuing.

---

## Phase 2: Close the provider-suite gaps

### Overview

Three provider-boundary branches exist in production and are never executed by a test, and
the request itself is almost entirely unasserted. Pure test additions — no production edit.

### Changes Required:

#### 1. Unexercised failure branches

**File**: `src/lib/services/recommendations.test.ts`

**Purpose**: Cover the two 200-with-a-broken-envelope shapes and the envelope-parse
rejection, so "malformed JSON with 200" is covered at every level it can occur.

**Contract**: Three cases — `response.json()` rejects (`recommendations.ts:118-124`) →
`provider_error`; `choices: []` and a `message` without string `content`
(`:129-133`) → `invalid_response`. The existing fake `Response` helper
(`recommendations.test.ts:30-35`) gains the ability to reject from `json()`.

#### 2. Request-shape assertions

**File**: `src/lib/services/recommendations.test.ts`

**Purpose**: Pin the parts of the outbound request that are invisible from the body: where
it goes, who it authenticates as, which model, and that it is bounded in time.

**Contract**: URL equals the OpenRouter chat-completions endpoint; `Authorization` is
`Bearer <key>`; `model` follows `OPENROUTER_MODEL ?? "openai/gpt-4o-mini"`
(`recommendations.ts:11,94`) — assert both the configured and the default branch; `signal`
is an `AbortSignal`. The 8-second value itself is **not** assertable: sinon fake timers do
not patch `AbortSignal.timeout`, so the reachable claim is "a signal was passed". Record
that limitation in the test file, not only in the plan.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run lint` passes

#### Manual Verification:

- Break-check the envelope branch: make the non-2xx check unconditional at
  `src/lib/services/recommendations.ts:114`, confirm the non-2xx case reddens, restore
- Break-check the signal assertion: remove `signal` from the `fetch` init at
  `recommendations.ts:108`, confirm only that case reddens, restore
- The comment explaining why the 8s cap is not asserted is present and states the fake-timer
  reason

**Implementation note**: Stop for human confirmation after the break-checks before
continuing.

---

## Phase 3: Separate a hallucinated answer from a genuine no-match

### Overview

Repair defect (1): a provider answer whose ids are all fabricated is currently reported to
the user as "no suitable game found for those criteria", which `prd.md:93` forbids — the
user must see a clear failure state, not a silent one. This is a production change to a
shipped contract, made deliberately and named here.

### Changes Required:

#### 1. The union gains a reason

**File**: `src/types.ts`

**Purpose**: Model "the provider answered, but nothing it named exists in the catalog" as
its own outcome.

**Contract**: `RecommendationResult`'s failure arm (`src/types.ts:180-185`) gains
`"out_of_catalog"`, with a doc-comment line in the same style as its siblings stating that
it means the model returned at least one recommendation and none survived the catalog
allow-list.

#### 2. The decision point

**File**: `src/lib/services/recommendations.ts`

**Purpose**: Distinguish the two ways the filtered list can end up empty.

**Contract**: At `:158-160`, an empty filtered list resolves to `out_of_catalog` when the
model returned at least one recommendation, and to `no_match` when the model itself
returned an empty array. The empty-candidate short-circuit (`:67-69`) stays `no_match` —
no provider call happened. The `out_of_catalog` branch gains a `console.error` naming the
dropped ids, matching the existing eslint-disabled logging convention at `:131,140,147`;
it is currently the only failure path with no diagnostic.

#### 3. User-facing copy

**File**: `src/lib/services/recommendationView.ts`

**Purpose**: Give the new reason a distinct, honest error panel.

**Contract**: `describeFailure` (`:151`) gains a `case "out_of_catalog"` returning
`kind: "error"` and copy that says the AI suggested games that are not in the catalog and
invites a retry — an error panel, not the neutral empty state. No island change is needed:
`RecommendationFlow.tsx:103` routes every reason through this function. Because
`FailureReason` is derived (`:138`) and the switch is exhaustive, `npm run typecheck` fails
until this case exists — that is the intended forcing function.

#### 4. Suite updates

**File**: `src/lib/services/recommendations.test.ts`, `src/lib/services/recommendationView.test.ts`

**Purpose**: Move the existing assertion to the new truth and cover the boundary between
the two reasons.

**Contract**: The case at `recommendations.test.ts:119-133` now expects `out_of_catalog`
and is retitled accordingly. New cases: a model-returned empty array yields `no_match`; a
partially fabricated answer still yields `ok: true` with only the surviving ids (guards
against over-correcting into an all-or-nothing rejection). `recommendationView.test.ts`
gains a `describeFailure("out_of_catalog")` case asserting `kind: "error"`, **and** the new
reason is added to the hand-maintained `reasons` array at `:131` — otherwise the new copy
escapes the distinctness assertion at `:138`, which is the only thing stopping two reasons
sharing one message. If the Phase 1 route suite asserts a `{ ok: false, reason }` envelope,
its expectation moves here too.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` passes
- The hallucination path's `console.error` is asserted with `vi.spyOn(console, "error")`,
  including that it names the dropped ids

#### Manual Verification:

- Break-check the split: make the `out_of_catalog` branch return `no_match`, confirm the
  hallucination case reddens while the empty-array case stays green, restore
- Provoke the state deterministically in the running app: with `.dev.vars` configured, run
  `npm run dev`, temporarily make the catalog allow-list drop every id
  (`recommendations.ts:155`), request a recommendation on `/play`, and confirm the **red**
  panel with the new copy renders rather than the neutral one; restore

**Implementation note**: Stop for human confirmation before continuing.

---

## Phase 4: Player-count guard and duplicate collapse

### Overview

Repair defect (2): nothing verifies that a recommended game fits the requested player
count, although `prd.md:102` ranks it first and the predicate already exists in SQL.
Duplicate `gameId`s are collapsed in the same pass — they render two identical cards and
two React children with the same key (`RecommendationFlow.tsx:226`).

### Changes Required:

#### 1. Post-hoc criteria guard

**File**: `src/lib/services/recommendations.ts`

**Purpose**: Make the first-ranked criterion deterministic rather than prompt-only.

**Contract**: After the catalog allow-list and the `out_of_catalog` decision, drop any
recommendation whose candidate does not satisfy
`minPlayers <= criteria.playerCount <= maxPlayers` — inclusive on both ends, matching the
SQL predicate at `src/lib/services/games.ts:36-38`. Time and genre are **not** filtered.

`criteria.playerCount` is **optional** on the service contract (`src/types.ts:16`) even
though the route's zod schema always supplies it (`recommendationView.ts:31-37`), so the
guard applies only when it is defined; an absent player count filters nothing, because
there is no criterion to violate. Written without that check it fails `npm run typecheck`
with TS18048. The allow-list's `Set` (`recommendations.ts:153`) becomes a
`Map<string, CandidateGame>` so the candidate's range is reachable at the filter.
If the guard empties the list, the result is `no_match` (the criteria genuinely are the
problem), never `out_of_catalog`, with a `console.error` naming the dropped ids. Order
inside the block is fixed: allow-list → `out_of_catalog` → dedupe → guard → `no_match`.

#### 2. Duplicate collapse

**File**: `src/lib/services/recommendations.ts`

**Purpose**: One card per game, whatever the model returns.

**Contract**: Deduplicate by `gameId`, keeping the occurrence with the lowest `rank`; the
existing ascending sort by `rank` (`:156`) still decides display order.

#### 3. Cases

**File**: `src/lib/services/recommendations.test.ts`

**Purpose**: Drive the guard from the requirement, with fixtures that sit exactly on the
boundary so an off-by-one break cannot stay green.

**Contract**: A recommended game whose range excludes the requested count is dropped while
a boundary-matching twin survives — set the twin's `minPlayers === maxPlayers ===
playerCount` so `<=` becoming `<` reddens the case (the fixture discipline from
`test-plan.md` §6.4). All recommendations violating the count yields `no_match`. A
duplicated `gameId` yields one item. A game whose `averagePlayMinutes` exceeds
`availableMinutes` is **kept** — the deliberate negative that records time as unenforced.
If the Phase 1 route suite's fixture game no longer fits the criteria it sends, its
expectation moves with this change.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run typecheck` passes
- `npm run lint` passes
- The exhausted-guard path's `console.error` is asserted with `vi.spyOn(console, "error")`,
  including that it names the dropped ids

#### Manual Verification:

- Break-check the guard: change `<=` to `<` on either side of the range check, confirm the
  boundary case reddens, restore
- Break-check the dedupe: remove it, confirm the duplicate case reddens, restore
- Break-check the reason choice: make the exhausted-guard path return `out_of_catalog`,
  confirm the all-violating case reddens, restore
- The "time is not enforced" case is named so a reader sees it is deliberate, not an
  oversight
- With `.dev.vars` configured, request a recommendation on `/play` and confirm a normal
  answer still renders after the guard lands — the guard changes what users see, and the
  `console.error` is the only signal of how often it fires

**Implementation note**: Stop for human confirmation before continuing.

---

## Phase 5: Cookbook entry, test-plan backports, and the gate

### Overview

Write down what this boundary guarantees and what it does not, and correct the two places
where `test-plan.md` describes this area wrongly. Last phase by the house pattern.

### Changes Required:

#### 1. Cookbook §6.5

**File**: `context/foundation/test-plan.md`

**Purpose**: Replace the TBD stub with an entry a contributor can follow without rereading
this plan.

**Contract**: §6.5 "Adding a test at the LLM provider boundary" covers: the two homes
(`src/lib/services/recommendations.test.ts` for the service, `src/pages/api/recommendations.test.ts`
for the chain) and why the payload assertion must live in the second; `vi.stubGlobal("fetch")`
as the seam and the explicit note that no mocking library is installed or wanted; the
import-time env binding and the `vi.resetModules()` + dynamic-import idiom; the
"guarantee is identity-only" sentence — the catalog allow-list plus the player-count guard
are enforced in code, everything else the model asserts is prompt-only; seeding all three
tables through `supabaseDouble` and making the seeded row fat on purpose; the
known-unguarded list (list length, `rank` sanity, empty `reason`, time and genre fit); and
the break-checks used in Phases 1-4.

#### 2. Risk-map corrections

**File**: `context/foundation/test-plan.md`

**Purpose**: Stop the plan asserting a guarantee the product does not offer, in the same
form as the 2026-09-11 and 2026-09-12 amendments.

**Contract**: Four edits plus an amendment note. (a) Risk #3 (`:50`) drops "or one
currently loaned out", and its response cell (`:132`) drops "and excludes ineligible ones
such as loaned titles"; an **Amended 2026-09-13** paragraph in §2 records why, citing the
badge decision. (b) The same row's source attributes the catalog-only quote to FR-007; it
is a US-01 acceptance criterion at `prd.md:59`. (c) §4's "API / HTTP mocking" row (`:179`)
states that the global-`fetch` stub **is** the layer and that no library is planned.
(d) Risk #5's "must challenge" cell gains "that an empty result means the catalog had
nothing".

#### 3. Status and gate

**File**: `context/foundation/test-plan.md`

**Purpose**: Reflect what is now wired.

**Contract**: §3 Phase 4 status becomes complete with this change folder; §5's "provider
contract tests" row becomes required (wired 2026-09-13); §7 gains two entries — the
island's generic-error collapse and the unguarded response properties — each with the
condition that would reopen it; §8 gets the amendment line.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all pass
- `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads` pass (full local
  gate set, matching `.github/workflows/ci.yml:20-29`)

#### Manual Verification:

- §6.5 alone is enough for a contributor to add a new case at this boundary without
  reading this plan
- §2, §3, §4, §5 and §7 match what is actually wired after Phases 1-4
- The Risk #3 amendment states the evidence, not just the conclusion, so a future reader
  does not re-add the loaned clause

**Implementation note**: This phase closes the change; confirm with the human before
archiving.

---

## Testing Strategy

### Unit and contract tests:

- Service level (`src/lib/services/recommendations.test.ts`): every provider failure shape,
  the catalog allow-list, the new `out_of_catalog` boundary, the player-count guard and the
  dedupe. Fixtures sit exactly on the range boundary so an off-by-one break reddens.
- Route level (`src/pages/api/recommendations.test.ts`): the outbound payload asserted
  from database rows, the 200 envelope with the view join, the 500 catalog path, and the
  `Authorization` header.
- Both run in the `unit` project, so `npm test` and the CI `ci` job gate them with no
  config change.

### The oracle, stated once:

Expected payload fields come from `prd.md:92` plus the `CandidateGame` contract at
`context/archive/2026-07-09-llm-recommendation-service/plan.md:201-206` — never read off
`recommendations.ts:73-82`. The player-count rule comes from `prd.md:102` plus the
inclusive SQL predicate at `games.ts:36-41`. The failure-state requirement comes from
`prd.md:93`.

### Break-check discipline:

Every assertion ships only after being watched to fail; each phase's Manual Verification
names the specific edit. The load-bearing one is Phase 1's: if adding `...g` to either
allow-list does not redden both payload cases, the assertion is structural theatre and the
fixture is not fat enough.

### Manual testing steps:

1. `npm test` — full unit suite green, new files collected.
2. Run each break-check in order, confirming the *named* cases redden and nothing else does.
3. `npm run dev` and exercise `/play` once end to end: a normal recommendation renders, and
   a hallucinated answer (stub or misconfigured model) renders the red panel rather than the
   neutral one.

## References

- Research: `context/changes/testing-llm-recommendation-guardrails/research.md`
- Risk rows and response guidance: `context/foundation/test-plan.md` §2, §3 Phase 4
- Route-test idiom: `src/pages/api/games/boundary.test.ts:18-22,44-47`
- Fetch-stub idiom and env reset: `src/lib/services/recommendations.test.ts:43-60`
- Fixture discipline on boundaries: `context/foundation/test-plan.md` §6.4
- Original service design: `context/archive/2026-07-09-llm-recommendation-service/plan.md:84-87,201-212,227-230`
- Loan decision: `context/archive/2026-08-01-visual-identity-themes/plan.md:371-373,385-387`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles.

### Phase 1: Route-level contract harness and payload minimality

#### Automated

- [x] 1.1 `npm test` passes with the new file collected by the `unit` project — d885dd9
- [x] 1.2 `npm run typecheck` passes — d885dd9
- [x] 1.3 `npm run lint` passes — d885dd9

#### Manual

- [ ] 1.4 Break-check the payload allow-list (`...g` at `recommendations.ts:73`) — both payload cases red
- [ ] 1.5 Break-check the row allow-list (`...row` in `mapRowToCandidateGame`) — both payload cases plus `types.test.ts:26` red
- [ ] 1.6 Break-check the envelope case by dropping the view join — only that case red
- [ ] 1.7 Test names make clear which assertion defends the NFR and which the route contract

### Phase 2: Close the provider-suite gaps

#### Automated

- [x] 2.1 `npm test` passes — 4821fce
- [x] 2.2 `npm run lint` passes — 4821fce

#### Manual

- [ ] 2.3 Break-check the non-2xx branch — that case red
- [ ] 2.4 Break-check the signal assertion (remove `signal` from the init) — only that case red
- [ ] 2.5 The comment explaining why the 8s cap is unassertable is present and states the fake-timer reason

### Phase 3: Separate a hallucinated answer from a genuine no-match

#### Automated

- [x] 3.1 `npm test` passes — 5ae5786
- [x] 3.2 `npm run typecheck` passes — 5ae5786
- [x] 3.3 `npm run lint` passes — 5ae5786
- [x] 3.4 `npm run build` passes — 5ae5786
- [x] 3.5 `console.error` on the hallucination path asserted with `vi.spyOn`, incl. the dropped ids — 5ae5786

#### Manual

- [ ] 3.6 Break-check the split (return `no_match` from the new branch) — hallucination case red, empty-array case green
- [ ] 3.7 Deterministic provocation on `/play` renders the red panel with the new copy

### Phase 4: Player-count guard and duplicate collapse

#### Automated

- [x] 4.1 `npm test` passes
- [x] 4.2 `npm run typecheck` passes
- [x] 4.3 `npm run lint` passes
- [x] 4.4 `console.error` on the exhausted-guard path asserted with `vi.spyOn`, incl. the dropped ids

#### Manual

- [ ] 4.5 Break-check the guard (`<=` → `<`) — boundary case red
- [ ] 4.6 Break-check the dedupe — duplicate case red
- [ ] 4.7 Break-check the reason choice (guard path returns `out_of_catalog`) — all-violating case red
- [ ] 4.8 The "time is not enforced" case is named as deliberate
- [ ] 4.9 A normal recommendation on `/play` still renders after the guard lands

### Phase 5: Cookbook entry, test-plan backports, and the gate

#### Automated

- [ ] 5.1 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass
- [ ] 5.2 `npm run lint:colors`, `npm run lint:contrast`, `npm run lint:reads` pass

#### Manual

- [ ] 5.3 §6.5 alone is enough to add a new case at this boundary
- [ ] 5.4 §2, §3, §4, §5 and §7 match what is actually wired
- [ ] 5.5 The Risk #3 amendment states the evidence, not just the conclusion
