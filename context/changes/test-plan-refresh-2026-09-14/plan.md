# Test Plan Refresh (2026-09-14) Implementation Plan

## Overview

Refresh `context/foundation/test-plan.md` after its first five-phase rollout completed.
The research (`research.md`) grounded five proposed external-seam risks (A–E). None
survived exactly as worded; each has a real, narrower defect underneath. This plan writes
those corrected risks into the guide as #8–#11, queues four new rollout phases, records
optional work as dated exclusions, and corrects every stale fact.

It is a **documentation change to one file**. The production and gate defects research
found are **not** fixed here. They become the goals of §3 Phases 6–9, each opened later with
`/10x-new` and run through research → plan → implement.

## Current State Analysis

- §3 lists five phases, all `complete` and archived. `/10x-test-plan` picks the first
  non-`complete` row as current, so today it reports "rollout complete" and has nothing to
  route to.
- §2 holds risks #1–#7. All are still valid, all are covered, and archived plans, §3 rows
  and §6 cookbook text cite them by number. Past §2 changes were dated amendments, never
  rewrites (`test-plan.md:66-130`).
- §3's closing paragraph (`test-plan.md:183-188`) and §7's "Browser/e2e layer" entry
  (`:564-566`) exclude browser testing, conditional on "a risk that only the full deployed
  shape can expose". Research found such a risk class exists, but most of it has a cheaper
  in-process layer (`research.md` §Risk D).
- §4/§5 carry stale facts, all enumerated in `research.md` §"Stale §4 / §5 facts":
  - file and test counts
  - Supabase CLI version
  - the mocking-row counts and line reference
  - "What Phase 5 still owes"
  - colour checks as "local"
  - the typecheck row's husky wording
  - grounding tools `checked: 2026-09-02`
- §1 still says the 30-day hot-spot window was empty. §1 stays frozen: this plan has no
  authority to rewrite it. The current hot-spot figures go in the §2 addition note instead.

## Desired End State

- §2 has #1–#7 unchanged, plus #8–#11 with evidence-only Source cells, four
  Risk Response Guidance rows, a dated addition note mapping A–E to #8–#11, and challenger
  findings for the dropped premises.
- §3 has rows 6–9 at `not started`, an order rationale for them, and a replacement for the
  "no browser/e2e" paragraph.
- §4, §5 and §8 are factually current as of commit `c1f9a83`. §5 names the planned gates for
  Phases 6–9. §6 has placeholders 6.8–6.11 named after the failure mode each pattern will
  cover.
- §7 records the Playwright slice, a real-provider smoke test and Workers platform limits as
  deliberate exclusions, each with a revisit trigger. Visual testing stays excluded.
- `/10x-test-plan --status` reports Phase 6 as current, with next action
  `/10x-new testing-guard-self-verification`.

### Key Discoveries:

- A single unlogged branch hides risks A, B and C at once: `src/lib/services/recommendations.ts:114-128`
  (`research.md` §Architecture Insights). This is why A and B merge into one risk and one phase.
- `OPENROUTER_MODEL` is `access: "public"` and therefore baked in at build time
  (`astro.config.mjs:22`; `node_modules/astro/dist/env/vite-plugin-env.js:74-80,133-148`).
  That contradicts `recommendations.ts:8-9` and README:138.
- The colour-literal guard already passes `bg-mauve-500` and `border-s-red-500`
  (`scripts/check-color-literals.mjs:29-57`), proven with fixtures. Neither scanner has a
  zero-file floor.
- No test imports `src/middleware.ts`, and no test covers the `Set-Cookie` → next request →
  `locals.user` round trip (`research.md` §Risk D).
- Status vocabulary is parsed literally by `/10x-test-plan`: `not started` → `change opened`
  → `researched` → `planned` → `implementing` → `complete`. A "deferred" or "optional" row
  would block the queue.

## What We're NOT Doing

- **No application, script, config or CI changes.** The logging, the `OPENROUTER_MODEL`
  access change, `quota_exhausted`, the confirm-email copy, guard floors, the palette
  derivation and the middleware test all belong to Phases 6–9.
- No renumbering or rewording of risks #1–#7, their response guidance, or §3 rows 1–5.
- No edits to §1 Strategy (not authorised by the user).
- No §6.1–6.7 rewrites beyond the line-reference corrections listed in Phase 3.
- No Playwright or real-provider smoke row in §3. Both go to §7 with triggers.
- Nothing about issue #43 (contrast audit in E2E); it stays open outside this scope.
- No archiving of the stray `context/changes/bootstrap-verification/` or
  `context/changes/deployment/` folders.

## Implementation Approach

Edit sections in reading order, with one phase per coherent block, so each phase leaves the
guide internally consistent:

1. **§2:** the risks everything else cites.
2. **§3 and §7:** the queue, and what was deliberately left off it.
3. **§4/§5/§6/§8:** the facts and scaffolding.

Every new cell carries the research's corrected wording and the user's six planning
decisions. Each decision is written into §2's response guidance as an oracle, so the
downstream phase inherits it without re-asking.

**Decisions this plan encodes** (taken during planning, 2026-09-14):

1. §2: append #8–#11 and keep #1–#7 verbatim.
2. §3 queue: Phase 6 guard self-verification (#10) → Phase 7 config parity (#9) → Phase 8
   provider failure attribution (#8) → Phase 9 session round-trip integration (#11). The
   Playwright slice and the real-provider smoke test go to §7.
3. `OPENROUTER_MODEL` becomes runtime-read (`access: "secret"`), which restores the documented
   contract.
4. A provider daily-quota 429 gets its own `quota_exhausted` reason and honest copy ("try
   again tomorrow"), plus logging of status and rate-limit headers.
5. Signup's confirm-email page uses neutral copy that is true whether or not the address was
   new. No account detection, which keeps Supabase's anti-enumeration behaviour.
6. Live production parity (wrangler secret names against the schema, the hosted Supabase Site
   URL and redirects, migrations pushed) lives in a pre-deploy checklist wired into §5's
   "pre-prod smoke" row. Phase 7 writes it.

## Critical Implementation Details

- **Principle #3 applies to the new Source cells.** Source cells cite evidence only: interview
  question numbers, archive or research paths, `lessons.md` entries and hot-spot directories
  with counts. Never `file:line`, function or module names. `file:line` references are allowed
  in the dated addition note, as the 2026-09-11/12/13 amendment notes already do, and in
  response-guidance cells where a prior amendment set that precedent.
- **Run Prettier before judging the diff.** `prettier-plugin` realigns every markdown table on
  `--write`, and lint-staged runs `prettier --write` on staged `*.md`. An unformatted edit
  produces a whole-table diff at commit time. Run `npx prettier --write
context/foundation/test-plan.md` at the end of each phase.

## Phase 1: §2 Risk Map additions

### Overview

Append risks #8–#11 to the risk table and four rows to Risk Response Guidance, then add a
dated addition note and challenger findings. This is the evidence and intent base that
Phases 2–3 cite.

### Changes Required:

#### 1. Risk table rows #8–#11

**File**: `context/foundation/test-plan.md` (§2 table, after row #7)

**Intent**: Record the four research-corrected failure scenarios in user and business terms,
rated with the existing High/Medium/Low rubric.

**Contract**: Four rows, same columns as #1–#7:

| #   | Risk (scenario to carry)                                                                                                                                                                                                                                                                                                                                                                       | Impact | Likelihood | Source (evidence)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | An external provider refuses or changes (model retired, a request flag rejected, a daily quota exhausted, a credential revoked, the response envelope moved) and the failure cannot be told apart from an outage: the member is told something untrue ("try again shortly"), or a provider success that sent nothing is presented as "we sent you an email", and no server log names the cause | High   | Medium     | refresh interview Q1, Q2 (`context/changes/test-plan-refresh-2026-09-14/change.md`); archive `2026-08-01-visual-identity-themes/plan.md` (live 429 quota, a `:free` model rejecting a flag); archive `2026-09-13-testing-llm-recommendation-guardrails/research.md` (unlogged non-2xx left open); `lessons.md` "Log every non-2xx branch"; hot-spot dirs `src/pages/api` (35/30d), `src/lib/services` (12/30d); research 2026-09-14 |
| 9   | A configuration value differs between where it is documented and where production actually reads it (a setting documented as runtime-tunable frozen at build time, a wrong-but-present credential failing silently, or test and example config drifting from the schema), so production behaves differently from what local and CI verified                                                    | High   | Medium     | refresh interview Q3; `lessons.md` "Push migrations to production"; `infrastructure.md` pre-mortem (secret drift); archive `2026-09-12-testing-per-member-state-attribution/change.md` (`project_id` collision); hot-spot dir `.github/workflows` (4/30d); research 2026-09-14                                                                                                                                                      |
| 10  | A quality gate or guard reports green while checking nothing, or while missing a real violation (a scan that matched zero files, a hardcoded list that fell behind the installed tooling, a gate step removed from CI), so the regression it exists to catch ships                                                                                                                             | Medium | High       | archive `2026-09-14-testing-quality-gate-wiring/reviews/impl-review.md` (F3, pending); the same archive's pre-commit hook that never ran; hot-spot dirs `scripts` (2/30d), `.github/workflows` (4/30d); research 2026-09-14 (stale palette proven by fixture)                                                                                                                                                                       |
| 11  | A signed-in session breaks between layers that are each tested only in isolation (the session cookie set at sign-in is not read back by the middleware, the page gate admits an anonymous request or bounces a signed-in one, or an island's request no longer matches its route), so the household cannot sign in or use a feature while every unit and route test is green                   | High   | Low        | refresh interview Q4; no automated test exercises the cookie → middleware → `locals.user` path (research 2026-09-14 §Risk D); PRD §Access Control; hot-spot dir `src/pages/api` (35/30d); research 2026-09-14                                                                                                                                                                                                                       |

Keep the cell text substantively as above; tighten wording only for table fit.

#### 2. Risk Response Guidance rows #8–#11

**File**: `context/foundation/test-plan.md` (§2 "Risk Response Guidance" table, after row #7)

**Intent**: Carry the response intent and the user's decisions as oracles, so each downstream
phase starts from them.

**Contract**: One row per risk, same six columns. Required content:

- **#8**
  - _What would prove protection:_ every provider refusal (transport, timeout, each non-2xx, a 200 carrying an error body) leaves a log line naming its status or cause. A daily-quota 429 surfaces as its own `quota_exhausted` reason with copy telling the member to try again tomorrow. The confirm-email page never claims an email was sent; its copy is true whether or not the address was new.
  - _Must challenge:_ "provider drift is silent" (structural drift already fails loudly as `invalid_response`); "`provider_error` means an outage" (it also means a retired model, a rejected flag, a bad key or a quota); "a redirect to confirm-email means an email left".
  - _Context to ground:_ the provider failure branches and what each logs; the provider's real limit signal (429 body, rate-limit headers, the 402 shape), confirmed against a captured response or docs; Supabase's obfuscated existing-account response.
  - _Cheapest layer:_ unit contract tests with a real `Response` built from one committed captured provider fixture, and a stubbed `signUp`.
  - _Anti-pattern:_ a stub envelope derived from our own parser's interface (oracle problem); any test that spends real provider quota; detecting existing accounts (defeats anti-enumeration).
- **#9**
  - _What would prove protection:_ a setting documented as runtime-tunable is read per request (`OPENROUTER_MODEL` becomes runtime-read); a wrong-but-present provider credential is observable in logs (shared with #8); the key names in the env schema, the test stub and `.env.example` cannot drift apart without failing `npm test`; live production parity is checked before every deploy.
  - _Must challenge:_ "a missing key must fail a gate" (keys are optional by design and already degrade visibly; do not make them required); "a green build means production config is complete" (the build reads no secrets).
  - _Context to ground:_ the env schema as the source of truth and each key's access type; whether the Cloudflare Git integration still builds or deploys; the hosted Supabase Site URL and redirect list; whether the OpenRouter secrets are set in production.
  - _Cheapest layer:_ an offline unit parity test that reads the schema, plus a pre-deploy checklist for the credentialed half.
  - _Anti-pattern:_ a guard that hand-lists today's keys and compares a source to itself; a CI gate that needs production credentials.
- **#10**
  - _What would prove protection:_ each guard exits non-zero on a known-bad fixture and on an empty or zero-match scan; the colour guard's palette tracks the installed Tailwind; removing a gate step from `ci.yml` or a guard script from `package.json` fails `npm test`; the Stop-hook script at least parses (`bash -n`).
  - _Must challenge:_ "the gate exists, therefore it runs"; "exit 0 means clean"; "`.mjs` is unlinted" (CI lints it).
  - _Context to ground:_ each guard's scan root, file floor, hardcoded lists and how a fixture root can be injected.
  - _Cheapest layer:_ unit self-tests that execute each guard against a temporary fixture tree, plus a text assertion over the workflow and scripts.
  - _Anti-pattern:_ widening lint globs or adding shellcheck and calling it done without a deliberate-break check; a fixture that fails for the wrong reason.
- **#11**
  - _What would prove protection:_ a real sign-in against the local stack produces cookies that, replayed on the next request, resolve through the middleware to the same member; a protected page without a session redirects to sign-in; an invalid cookie resolves to no user; an unresolvable auth backend is marked unresolved, not anonymous.
  - _Must challenge:_ "only a browser can see cookie bugs" (the round trip is testable in-process); "manual Chrome checks imply a regression class" (none reached production).
  - _Context to ground:_ how the middleware can be invoked outside Astro's runtime (the `astro:middleware` alias), how cookie writes can be captured and replayed, and reuse of the db harness's member seeding.
  - _Cheapest layer:_ integration in the `db` project, plus middleware unit tests in `unit`.
  - _Anti-pattern:_ a browser E2E suite before the in-process test exists; visual assertions (Q5); repeating the API-boundary suite's denial cases.

#### 3. Dated addition note and challenger findings

**File**: `context/foundation/test-plan.md` (§2, after the "Amended 2026-09-13" block, before the authoring challenger notes)

**Intent**: Record why four rows were added, which proposed premises research overturned, and
how #8 relates to #5, in the same dated-amendment style as prior notes.

**Contract**: A block headed `**Added 2026-09-14** (context/changes/test-plan-refresh-2026-09-14/research.md).`
It covers:

- **Mapping:** refresh risks A+B → #8, C → #9, E → #10, D → #11.
- **Hot-spot figures (30-day window as of 2026-09-14):** `src/pages/api` 35, `src/test/db` 19,
  `src/lib/services` 12, `.github/workflows` 4, `scripts` 2. Note that §1's "window empty"
  line reflects authoring time.
- **#11 rating:** #11 is High × Low, the shape the guide usually leaves to observability.
  It earns a row because an in-process integration test is cheap and deterministic, not
  because regressions have shipped. Research found no cookie or hydration defect ever
  reached production, and the manual Chrome checks in the guardrails archive (rows 3.7,
  4.9) were panel rendering and a provider hiccup. Model the wording on the existing #7
  note.
- **#8 vs #5:** #5 guards that the member sees a clear failure rather than an invented
  recommendation (covered). #8 guards that the failure's _cause_ is attributable and the copy
  is _true_.
- **Challenger findings (dropped premises):**
  - "Provider shape drift passes a green suite silently": structural drift is already loud.
  - "Signup silently stops at the email cap": errors are logged and shown.
  - "A missing key must fail a gate": keys are optional by design and degrade visibly.
  - "`.js`/`.mjs` are outside every lint glob": CI lints them.
  - "Cloudflare Workers platform limits" had no evidence and got no row (see §7).
- **Decisions recorded as oracles:** `OPENROUTER_MODEL` runtime-read, `quota_exhausted`,
  neutral confirm-email copy, and the pre-deploy checklist, each dated 2026-09-14.

### Success Criteria:

#### Automated Verification:

- Prettier formats the file cleanly: `npx prettier --check context/foundation/test-plan.md`
- The §2 risk table has exactly 11 data rows numbered 1–11: `awk '/^## 2\./,/^### Risk Response Guidance/' context/foundation/test-plan.md | grep -cE '^\| *[0-9]+ +\|'` prints `11`
- The Risk Response Guidance table has rows `#1`–`#11`: `awk '/^### Risk Response Guidance/,/^## 3\./' context/foundation/test-plan.md | grep -cE '^\| *#[0-9]+ +\|'` prints `11`
- No code anchor in the new Source cells: `awk '/^## 2\./,/^### Risk Response Guidance/' context/foundation/test-plan.md | grep -E '^\| *(8|9|10|11) +\|' | grep -E '\.(ts|tsx|mjs|js|astro|sh):[0-9]'` prints nothing
- Rows #1–#7 of both tables are unchanged apart from Prettier re-padding: `git diff -w -U0 context/foundation/test-plan.md | grep -E '^-\| *#?[1-7] +\|'` prints nothing

#### Manual Verification:

- Each #8–#11 row reads as a user or business failure scenario, not a test name or code location
- Each response-guidance row states the planning decision it carries (runtime model, `quota_exhausted`, neutral copy, pre-deploy checklist) clearly enough that the downstream phase needs no re-asking
- The addition note's challenger findings match `research.md` §Summary

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: §3 queue and §7 negative space

### Overview

Queue Phases 6–9 so `/10x-test-plan` routes to Phase 6. Replace the browser paragraph, and
record optional and unevidenced work as dated exclusions with revisit triggers.

### Changes Required:

#### 1. §3 rows 6–9

**File**: `context/foundation/test-plan.md` (§3 table, after row 5)

**Intent**: Add the four phases in the user-approved order, each goal stated as the protection
it proves.

**Contract**: Four rows. Status is the literal `not started` and the Change folder is `—`.

| #   | Phase name                     | Goal (one line)                                                                                                                                                                  | Risks covered | Test types                                                                        |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| 6   | Guard self-verification        | Prove every guard and gate fails on a known-bad input and on an empty scan, tracks the installed tooling, and cannot be dropped from CI unnoticed                                | #10           | unit self-tests over fixture trees + workflow/script wiring assertion + `bash -n` |
| 7   | Configuration parity           | Prove runtime-tunable settings are read at runtime, schema/stub/example config cannot drift silently, and live production parity is checked before every deploy                  | #9            | unit (schema parity) + pre-deploy checklist                                       |
| 8   | Provider failure attribution   | Prove every provider refusal or change is logged with its cause and shown to the member truthfully: a daily quota as its own reason, and signup never claiming an email was sent | #8            | contract tests with captured-fixture `Response` stubs                             |
| 9   | Session round-trip integration | Prove a real sign-in cookie is read back by the middleware as the same member, and the page gate admits and refuses correctly, without a browser                                 | #11           | integration (`db` project, local stack) + middleware unit tests                   |

#### 2. §3 order rationale and browser paragraph

**File**: `context/foundation/test-plan.md` (§3, after the existing "Order rationale" paragraph; replaces "No browser/e2e phase is proposed.")

**Intent**: Explain the Phase 6–9 order, and say exactly where browser testing now stands.

**Contract**: Two paragraphs.

1. **Order rationale (Phases 6–9, 2026-09-14):**
   - Phase 6 first: it is offline and cheap, fixes a proven defect, and protects every gate
     the later phases add.
   - Phase 7 next: offline, a proven build-time defect, and it writes the pre-deploy
     checklist.
   - Phase 8 fixes the branch that hides three failure causes. It follows Phase 7 because the
     runtime-model change touches the same service.
   - Phase 9 last: it needs the `db` harness and an `astro:middleware` alias, and the history
     shows no production incident.
2. **Browser testing:** now "Behavioural browser testing is deferred, not ruled out". Phase 9
   covers the cookie and middleware half in-process. Island hydration and an island's real
   request are the remaining browser-only class, recorded in §7 with the trigger to pull them
   into a phase. Visual testing stays excluded (Q5).

#### 3. §7 entries

**File**: `context/foundation/test-plan.md` (§7)

**Intent**: Turn optional and unevidenced work into deliberate, revisitable exclusions.

**Contract**:

- **Replace** the "Browser/e2e layer" entry with **"Behavioural browser E2E slice"**.
  - Scope: at most sign-in → gate → sign-out; `/play` with no provider key reaching the
    `not_configured` panel; optionally catalog Edit hydration. Run against `astro build`
    plus `astro preview` and the local stack, never `astro dev`.
  - Revisit when Phase 9 has landed **and** either a hydration or island-request regression
    ships, or manual Chrome verification rows keep recurring.
  - Behavioural only (Q5). Source: research 2026-09-14 §Risk D.
- **Add "Real-provider smoke test".**
  - Why excluded: each run costs 1 of 50 daily free requests and needs an
    `OPENROUTER_API_KEY` repository secret.
  - Revisit when Phase 8's captured fixture misses an observed drift.
  - If adopted: nightly or manual dispatch only, never per push. Source: research 2026-09-14 §Risk A.
- **Add "Cloudflare Workers platform limits"** (CPU time, subrequests).
  - No evidence in the repo or history.
  - Revisit if a request fails with a platform limit in `wrangler tail`. Source: research 2026-09-14 §Risk B.
- **Add a line under "Theme and visual regression":** issue #43 (contrast audit in E2E) is
  deliberately outside the 2026-09-14 refresh, pending a separate decision.

### Success Criteria:

#### Automated Verification:

- Prettier formats the file cleanly: `npx prettier --check context/foundation/test-plan.md`
- §3 has 9 rows and exactly 4 are `not started`: `awk '/^## 3\./,/^## 4\./' context/foundation/test-plan.md | grep -cE '^\| *[0-9]+ +\|'` prints `9`, and `awk '/^## 3\./,/^## 4\./' context/foundation/test-plan.md | grep -c '| not started |'` prints `4`
- Every §3 status is a parser literal: `awk '/^## 3\./,/^## 4\./' context/foundation/test-plan.md | grep -E '^\| *[0-9]+ +\|' | grep -vcE '\| (not started|change opened|researched|planned|implementing|complete) +\|'` prints `0`
- The old paragraph is gone: `grep -c 'No browser/e2e phase is proposed' context/foundation/test-plan.md` prints `0`

#### Manual Verification:

- `/10x-test-plan --status` (in a fresh session) reports Phase 6 "Guard self-verification" as current, with next action `/10x-new testing-guard-self-verification`
- Each §7 entry names a concrete revisit trigger, not "if needed"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: §4 / §5 / §6 / §8 facts and scaffolding

### Overview

Bring every factual row up to date as of `c1f9a83`, name the planned gates, add cookbook
placeholders for Phases 6–9, and write the freshness ledger entry.

### Changes Required:

#### 1. Header and §4 Stack

**File**: `context/foundation/test-plan.md` (header line "Last updated", §4 table, §4 grounding tools)

**Intent**: Correct stale facts from `research.md` §"Stale §4 / §5 facts". No new tooling
claims.

**Contract**:

- **Header:** `Last updated: 2026-09-14`.
- **existing suite:**
  - 20 files: 15 `unit` (7 in `src/lib/services/`, 5 API-route, plus theme, types and one
    component test that exercises `fromRow`, not rendering) and 5 `db`.
  - 188 unit + 35 db tests as of 2026-09-14.
- **API / HTTP mocking:**
  - The global stub now lives in one helper, `stubFetch` in `src/test/providerStub.ts`.
  - It is used by 26 service tests and 9 route tests.
  - The `fetch` call site reference is now `recommendations.ts:91`.
  - Add: the stub's response envelope mirrors the service's own interface, which §3 Phase 8
    replaces with a captured fixture.
- **DB / RLS verification:**
  - Supabase CLI 2.98.2 installed (range `^2.23.4`).
  - Add: the CI stack uses the CLI's bundled images, not the linked production pins.
- **e2e:** "none — deferred; see §3 browser paragraph and §7 'Behavioural browser E2E slice'".
- **bespoke deterministic gates:** add that none has a self-test or a zero-file floor today,
  which §3 Phase 6 addresses.
- **CI:** drop "What Phase 5 still owes: the local edit-loop gate alone"; state that Phase 5
  is complete.
- **Grounding tools:** re-date all four lines to `checked: 2026-09-14`. Substance unchanged:
  no docs MCP; web search/fetch available, not used; `claude-in-chrome` available, no
  Playwright MCP; `gh`/`supabase` CLIs local.

#### 2. §5 Quality Gates

**File**: `context/foundation/test-plan.md` (§5 table)

**Intent**: Correct two stale rows and add planned gates for Phases 6–9, using the table's
existing "Required for §3 Phase N" convention.

**Contract**:

- **typecheck row:** replace "husky runs `eslint --fix` only" with a past-tense statement
  ("until 2026-09-14 husky ran `eslint --fix` only").
- **colour-literal + contrast row:** Where becomes "local + CI".
- **Add "guard self-tests"** (local + CI via `npm test`, Required for §3 Phase 6). Catches:
  a guard passing on an empty scan, a stale hardcoded list, or a gate step removed from CI.
- **Add "config parity"** (local + CI via `npm test`, Required for §3 Phase 7). Catches:
  schema, stub and example drift, and a runtime-tunable key frozen at build.
- **Add "provider failure attribution"** (local + CI, Required for §3 Phase 8). Catches:
  unlogged provider refusals, untrue quota copy, and a signup page claiming an email was sent.
- **Add "session round trip"** (local `npm run test:db` + CI `db-tests`, Required for §3
  Phase 9). Catches: a cookie that is not read back, and a page gate admitting or bouncing
  wrongly.
- **pre-prod smoke row:** rename to "pre-deploy checklist", Required for §3 Phase 7, Where
  "human, before `wrangler deploy`". Catches: production secret names missing against the
  schema, a wrong hosted Supabase Site URL or redirects, and migrations not pushed
  (`lessons.md`).

#### 3. §6 placeholders

**File**: `context/foundation/test-plan.md` (§6, after 6.7)

**Intent**: Name the future cookbook sections by failure mode, so readers know where each
pattern will land.

**Contract**: Four headed stubs, each one line naming the phase that writes it:

- `### 6.8 Proving a guard can fail` — TBD, §3 Phase 6 (known-bad fixture, empty-scan floor, wiring assertion).
- `### 6.9 Adding a configuration key` — TBD, §3 Phase 7 (access type, parity test, pre-deploy checklist).
- `### 6.10 Attributing a provider failure` — TBD, §3 Phase 8 (captured-fixture `Response`, log assertion, reason and copy).
- `### 6.11 Testing the session round trip` — TBD, §3 Phase 9 (real sign-in, cookie replay, middleware invocation).

#### 4. §8 Freshness Ledger

**File**: `context/foundation/test-plan.md` (§8)

**Intent**: Record the refresh.

**Contract**:

- **Refresh line:** "Refresh 2026-09-14 (`context/changes/test-plan-refresh-2026-09-14/`)".
  It covers:
  - §2 gained #8–#11 (A+B, C, E, D) and #1–#7 unchanged
  - §3 gained Phases 6–9
  - §4/§5 facts corrected at `c1f9a83`
  - §6.8–6.11 placeholders
  - §7 gained three exclusions and the browser entry was narrowed
  - §1 not reviewed (frozen)
- **"Stack versions last verified":** 2026-09-14.
- **"AI-native tool references last verified":** 2026-09-14.

#### 5. §6 line-reference corrections

**File**: `context/foundation/test-plan.md` (§6.4, §6.5)

**Intent**: Point the cookbook's "where it lives" and "prove the test can fail" steps at the
current code. Phase 8 builds directly on §6.5.

**Contract**: Replace the reference only; leave the surrounding prose unchanged. Verified
against HEAD `c1f9a83` during plan review:

- §6.4 (`test-plan.md:376`): `games.ts:83` → `games.ts:82` (start of the `createGame` statement).
- §6.5 (`test-plan.md:406`): `recommendations.test.ts:43-47` → `src/test/providerStub.ts:36-40` (`stubFetch`, with `vi.stubGlobal` at :38).
- §6.5 (`test-plan.md:432`): `recommendations.ts:153-156` → `recommendations.ts:155-159` (catalog allow-list).
- §6.5 (`test-plan.md:441`): `recommendations.ts:73` → `recommendations.ts:77-86` (prompt pick).

Other §6/§7 references were checked and are current: `supabaseDouble.ts:126`,
`games.ts:31,34-44,65`, `catalogGames.ts:35-40`, `boundary.test.ts:45`,
`src/types.test.ts:26`, `RecommendationFlow.tsx:83-96`.

### Success Criteria:

#### Automated Verification:

- Prettier formats the file cleanly: `npx prettier --check context/foundation/test-plan.md`
- Stale phrases are gone: `grep -cE 'What Phase 5 still owes|2\.23\.x|checked: 2026-09-02|24 service tests and 6 route tests' context/foundation/test-plan.md` prints `0`
- The new headings exist: `grep -cE '^### 6\.(8|9|10|11) ' context/foundation/test-plan.md` prints `4`
- The current counts are stated: `grep -c '188 unit' context/foundation/test-plan.md` prints at least `1`
- The unit suite still reports the documented count: `npm test 2>&1 | grep -E 'Tests +188 passed'` matches
- The stale §6 line references are gone: `awk '/^## 6\./,/^## 7\./' context/foundation/test-plan.md | grep -cE 'recommendations\.test\.ts:43-47|recommendations\.ts:153-156|recommendations\.ts:73\b|games\.ts:83\b'` prints `0`. The 2026-09-13 amendment note in §2 keeps its `recommendations.ts:153-156` citation: it is a dated historical record and stays verbatim.

#### Manual Verification:

- Every §4/§5 fact changed here matches `research.md` §"Stale §4 / §5 facts"; spot-check three against the repo
- A fresh reader of §5 can tell which gates are wired today and which are planned, by phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. This is a documentation change. `npm test` runs only to confirm the documented count
  of 188.

### Integration Tests:

- The orchestrator is the integration check: `/10x-test-plan --status` must parse §3 and route
  to Phase 6.

### Manual Testing Steps:

1. Read §2 #8–#11 and their guidance rows cold; each must be actionable without `research.md`.
2. Run `/10x-test-plan --status` in a fresh session and confirm Phase 6 is current.
3. Run `/10x-test-plan` and confirm Handoff A proposes `testing-guard-self-verification` for Phase 6.

## Performance Considerations

None.

## Migration Notes

None. The docs-only commit skips the code gate (lint-staged runs only `prettier --write` on `*.md`).

## References

- Related research: `context/changes/test-plan-refresh-2026-09-14/research.md`
- Refresh brief and interview: `context/changes/test-plan-refresh-2026-09-14/change.md`
- Amendment style to follow: `context/foundation/test-plan.md:66-130`
- Guide schema: `/home/vanos/.claude/skills/10x-test-plan/references/test-plan-schema.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: §2 Risk Map additions

#### Automated

- [x] 1.1 Prettier formats the file cleanly — 0b9de1c
- [x] 1.2 §2 risk table has exactly 11 data rows numbered 1–11 — 0b9de1c
- [x] 1.3 Risk Response Guidance table has rows #1–#11 — 0b9de1c
- [x] 1.4 No code anchor in the new Source cells — 0b9de1c
- [x] 1.5 Rows #1–#7 of both tables unchanged apart from Prettier re-padding — 0b9de1c

#### Manual

- [ ] 1.6 Each #8–#11 row reads as a user/business failure scenario
- [ ] 1.7 Each guidance row states its planning decision clearly enough to need no re-asking
- [ ] 1.8 Addition note's challenger findings match research.md §Summary

### Phase 2: §3 queue and §7 negative space

#### Automated

- [x] 2.1 Prettier formats the file cleanly — 5cb4364
- [x] 2.2 §3 has 9 rows and exactly 4 are not started — 5cb4364
- [x] 2.3 Every §3 status is a parser literal — 5cb4364
- [x] 2.4 "No browser/e2e phase is proposed" paragraph removed — 5cb4364

#### Manual

- [ ] 2.5 /10x-test-plan --status reports Phase 6 as current with /10x-new testing-guard-self-verification
- [ ] 2.6 Each §7 entry names a concrete revisit trigger

### Phase 3: §4 / §5 / §6 / §8 facts and scaffolding

#### Automated

- [x] 3.1 Prettier formats the file cleanly
- [x] 3.2 Stale phrases are gone
- [x] 3.3 §6.8–6.11 headings exist
- [x] 3.4 Current counts stated
- [x] 3.5 npm test reports 188 passed
- [x] 3.6 Stale §6 line references are gone

#### Manual

- [ ] 3.7 §4/§5 facts match research.md; three spot-checked against the repo
- [ ] 3.8 §5 distinguishes wired gates from planned gates by phase
