# LLM Recommendation Service Integration — Implementation Plan

## Overview

Wire a thin, well-guarded server-side OpenRouter recommendation service for MyCatalog
(Foundation F-01). The service takes recommendation criteria plus a caller-supplied list
of eligible catalog board games and returns a ranked subset with human-readable reasoning,
or a single typed failure state. It enforces the PRD guardrails: recommendations only ever
reference games the caller passed in (never fabricated), the prompt carries the minimum
household data needed, latency is bounded toward the 5s NFR, and any error surfaces a clear
failure instead of a silent or invented result.

This change delivers no UI (that is S-05, `ai-play-recommendation`) and does not touch the
database — S-01's catalog schema does not exist yet, so candidate games are an input.

## Current State Analysis

- **Secrets are declared via Astro's typed env schema.** `astro.config.mjs` `env.schema`
  currently holds only `SUPABASE_URL` / `SUPABASE_KEY`, both `context: "server"`,
  `access: "secret"`, `optional: true`. Server code imports them from `astro:env/server`
  (`src/lib/supabase.ts:3`). No LLM key is declared anywhere.
- **Graceful-degradation pattern exists.** `src/lib/supabase.ts:5-8` returns `null` when its
  secrets are missing; `src/lib/config-status.ts` centralizes a `configStatuses` list and a
  `missingConfigs` filter that the UI reads to warn about unconfigured integrations.
- **OpenRouter is the settled provider.** `context/foundation/infrastructure.md` names
  OpenRouter throughout (risk register rows: "AI recommendations exceed 5 seconds" →
  "timeout handling, small prompt payloads, and a user-visible failure state").
- **No `src/types.ts` and no `src/lib/services/` yet.** CLAUDE.md places shared DTOs/entities
  in `src/types.ts` and extracted business logic in `src/lib/services/`. Both are created here.
- **`zod` is a documented convention but is not installed** (CLAUDE.md says "validate input
  with zod"; `package.json` has no `zod`).
- **No test framework.** `package.json` has no `test` script, no Vitest, no `*.test.ts`.
  CI (`.github/workflows/ci.yml`) runs lint + build only.
- **Runtime is Cloudflare Workers** (`@astrojs/cloudflare`). Use Web-standard `fetch`,
  `AbortController`, and `AbortSignal.timeout` — no Node-only APIs (infrastructure.md
  risk: "Node-only dependency breaks on Workers").

## Desired End State

A `recommend(criteria, candidateGames)` service in `src/lib/services/recommendations.ts`
that, given criteria and a list of eligible games, returns a discriminated-union result:
either a success carrying ranked recommendations (each referencing an input game by id, with
reasoning) or a failure carrying a machine-readable reason. It is fully unit-tested against a
mocked `fetch` (happy path, out-of-catalog rejection, timeout, invalid JSON, missing key),
runnable via `npm test` with no network or API key, and green in CI.

Verification: `npm run lint`, `npm run build`, and `npm test` all pass; the OpenRouter key is
declared in the env schema and surfaced through `config-status.ts` when absent.

### Key Findings:

- Typed secret pattern to mirror: `astro.config.mjs:17-22` + `astro:env/server` import at
  `src/lib/supabase.ts:3`.
- Null-when-unconfigured + `config-status.ts` degradation pattern: `src/lib/supabase.ts:5-8`,
  `src/lib/config-status.ts:11-21` (Polish user-facing messages).
- OpenRouter chat-completions is an HTTP `fetch` to `https://openrouter.ai/api/v1/chat/completions`
  with a Bearer key and a JSON body; request structured output via `response_format`.
- Cloudflare Workers → Web APIs only (`fetch`, `AbortController`).

## What We Are NOT Doing

- No recommendation UI, API route, or "What should we play?" flow — that is S-05.
- No database access, schema, or migration — candidate games are passed in by the caller.
- No played/preference data modeling — that is S-04; the contract accepts optional
  played/preference fields but this change does not source them.
- No retit/backoff, no response caching, no streaming, no multi-provider abstraction.
- No preference statistics (FR-006 / S-06).
- No deep prompt-engineering tuning of reasoning quality — a correct, guarded baseline only;
  quality tuning happens in S-05 against real data.

## Implementation Approach

Three phases, foundation-up: (1) wire configuration and dev dependencies so the runtime and
test harness exist; (2) define the contract types and the guarded service; (3) prove the
guardrails with unit tests and CI. The service owns its own `fetch` call (no separate client
module needed for one endpoint), returns a discriminated union rather than throwing, and never
emits a game id that was not in `candidateGames`.

## Critical Implementation Details

- **Cloudflare Workers runtime.** Use only Web-standard `fetch` / `AbortController`; do not
  reach for Node `http`, `fs`, or SDKs that assume Node. This is a documented deploy-time
  failure mode (infrastructure.md).
- **Catalog-only invariant is enforced in code, not just the prompt.** After the LLM responds,
  drop any returned recommendation whose `gameId` is not present in the input `candidateGames`.
  The prompt instruction alone is insufficient to satisfy the "must not suggest games outside
  the household catalog" acceptance criterion.
- **Latency budget.** Target 5s (NFR); set the abort timeout to a hard cap (~8s) so a hung
  request fails as a typed error rather than hanging to the platform limit. A timeout is a
  failure result, not an exception.

## Phase 1: Config & Dependencies

### Overview

Declare the OpenRouter secret and model in the typed env schema, provide local/example env
entries, surface a graceful "not configured" status, and install the `zod` + `vitest`
dev-time foundation so later phases have a contract validator and a test runner.

### Changes Required:

#### 1. Astro env schema

**File**: `astro.config.mjs`

**Purpose**: Declare `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` so server code can import them
from `astro:env/server` with the same typing/optionality as the Supabase secrets.

**Contract**: Add two `envField.string({ context: "server", ... })` entries to `env.schema`.
`OPENROUTER_API_KEY` is `access: "secret", optional: true`; `OPENROUTER_MODEL` is
`access: "public"` (non-sensitive) `optional: true` with a sensible default handled in code.
Keep `optional: true` so builds without the key still succeed (mirrors Supabase).

#### 2. Env example + local dev vars

**File**: `.env.example` (and local `.dev.vars` for Cloudflare dev — gitignored, created by hand)

**Purpose**: Document the new variables for contributors and local runs.

**Contract**: Append `OPENROUTER_API_KEY=###` and `OPENROUTER_MODEL=###` to `.env.example`,
matching the existing `###` placeholder style. Note in the plan handoff that the real key goes
into `.dev.vars` locally and Cloudflare Worker secrets in production (per infrastructure.md).

#### 3. Config-status entry

**File**: `src/lib/config-status.ts`

**Purpose**: When the OpenRouter key is missing, degrade gracefully and tell the user AI
recommendations are disabled — same UX as the Supabase entry.

**Contract**: Import `OPENROUTER_API_KEY` from `astro:env/server`; push a second `ConfigStatus`
object (`name: "OpenRouter"`, `configured: Boolean(OPENROUTER_API_KEY)`, Polish `message`
consistent with the existing tone, optional docs link). `missingConfigs` picks it up unchanged.

#### 4. Install dependencies

**File**: `package.json`

**Purpose**: Add the runtime validator and the test runner the next phases depend on.

**Contract**: Add `zod` to `dependencies` and `vitest` to `devDependencies` (via
`npm install zod` / `npm install -D vitest`). Add a `"test": "vitest run --passWithNoTests"`
script (and optionally `"test:watch": "vitest"`). `--passWithNoTests` keeps Phase 1 green
before any test files exist (plain `vitest run` exits non-zero on "No test files found").

**A `vitest.config.ts` is required, not optional.** The service imports `OPENROUTER_API_KEY`
from `astro:env/server` — a virtual module Astro generates (CI runs `astro sync` for exactly
this). A plain `vitest run` does not go through Astro's Vite pipeline, so both `astro:*` imports
and the `@/*` alias fail to resolve and the suite will not run. Build the Vitest config through
Astro's own Vite config so both resolve in one shot:

```ts
// vitest.config.ts
import { getViteConfig } from "astro/config";
export default getViteConfig({ test: { environment: "node" } });
```

Confirm `astro sync` has run (or is a `pretest`/CI step) so the generated `astro:env/server`
types exist before tests execute.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Type/astro check passes: `npm run build`
- Lint passes: `npm run lint`
- `npm test` runs (zero tests is acceptable at this phase, exits 0)

#### Manual Verification:

- With no `OPENROUTER_API_KEY` set, the app still builds and the OpenRouter entry appears in
  `missingConfigs` (verify by importing/logging in a scratch check or on the config banner).
- `.env.example` documents both new variables.

**Implementation note**: After this phase and all automated checks pass, stop for human
confirmation before Phase 2.

---

## Phase 2: Contract Types & Guarded Service

### Overview

Define the shared recommendation contract and implement the guarded OpenRouter service that
ranks caller-supplied games with reasoning, validates the model's JSON with Zod, bounds latency,
enforces the catalog-only invariant, and returns a single typed failure state on any error.

### Changes Required:

#### 1. Shared contract types

**File**: `src/types.ts` (new)

**Purpose**: One authoritative contract for criteria in, ranked results out, that S-05 will
import — decoupled from any DB row shape.

**Contract**: Export:
- `RecommendationCriteria` — `{ playerCount?: number; availableMinutes?: number; genre?: string }`
  (all optional; recommendations account for values "when those values exist" per US-01).
- `CandidateGame` — the minimum game shape the ranker needs: `id`, `title`, `genre`,
  `minPlayers` and `maxPlayers` (a range — PRD Business Logic matches on player count, so the
  range is what the ranker needs; do not use a single `playerCount`), `averagePlayMinutes`,
  optional `played` and optional `preference` (`"liked" | "disliked"`). No member PII, no
  internal DB ids beyond the local `id` used to reference a game. This shape is provisional and
  S-01/S-04 must map their rows into it.
- `RankedRecommendation` — `{ gameId: string; reason: string; rank: number }`.
- `RecommendationResult` — discriminated union:
  `{ ok: true; recommendations: RankedRecommendation[] }`
  | `{ ok: false; reason: "not_configured" | "timeout" | "provider_error" | "invalid_response" | "no_match" }`.
  `no_match` is a successful call that yields zero eligible games; represented as an explicit
  reason so S-05 can show the "no suitable game found" state (US-01 acceptance criterion).

#### 2. Zod response schema + guarded service

**File**: `src/lib/services/recommendations.ts` (new)

**Purpose**: The single entry point that turns criteria + candidate games into a
`RecommendationResult`, enforcing every guardrail.

**Contract**: Export `async function recommend(criteria: RecommendationCriteria,
candidateGames: CandidateGame[]): Promise<RecommendationResult>`. Behavior:
- If `OPENROUTER_API_KEY` is missing → return `{ ok: false, reason: "not_configured" }`
  (no network call).
- If `candidateGames` is empty → return `{ ok: false, reason: "no_match" }` without calling
  the LLM.
- Build a **minimal** prompt: a system instruction stating the model may only choose from the
  supplied games and must return the specified JSON; a user payload containing the criteria and
  a compact list of the candidate games (only the fields in `CandidateGame`). Ranking guidance
  follows the PRD Business Logic order (player count → genre → time → preference).
- Call `fetch("https://openrouter.ai/api/v1/chat/completions", …)` with the Bearer key,
  `model` from `OPENROUTER_MODEL` (fallback to a documented fast/cheap default that supports
  structured output), and `response_format` requesting a JSON object. Pass
  `signal: AbortSignal.timeout(8000)`.
- Validate the model's returned JSON with a Zod schema mirroring
  `{ recommendations: { gameId, reason, rank }[] }`. On `AbortError` → `"timeout"`; on non-OK
  HTTP or network throw → `"provider_error"`; on JSON-parse or Zod failure → `"invalid_response"`.
- **Enforce catalog-only in code**: filter returned recommendations to those whose `gameId`
  exists in `candidateGames`; if that leaves zero, return `{ ok: false, reason: "no_match" }`.
- On success return `{ ok: true, recommendations }` sorted by `rank`.

This is the one place a snippet may help the implementer — the `response_format` shape and the
`AbortError` discrimination are the nonobvious bits; everything else follows the existing
`fetch`/error conventions.

### Success Criteria:

#### Automated Verification:

- Type check / build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Code review confirms the catalog-only filter runs after parsing and that no branch returns a
  `gameId` absent from the input.
- Confirm no Node-only imports were introduced (Workers compatibility).

**Implementation note**: Stop for human confirmation before Phase 3.

---

## Phase 3: Unit Tests & Verification

### Overview

Prove the guardrails with Vitest unit tests using a mocked `fetch` — no network, no API key —
and wire `npm test` into CI so the foundation stays green for later slices.

### Changes Required:

#### 1. Service unit tests

**File**: `src/lib/services/recommendations.test.ts` (new)

**Purpose**: Lock the contract and every failure mode against regression.

**Contract**: Use Vitest with `vi.stubGlobal("fetch", …)` / `vi.fn()` to simulate OpenRouter.
Cover at minimum:
- **Happy path** — valid JSON referencing input games → `{ ok: true }`, sorted by rank,
  reasons present.
- **Out-of-catalog rejection** — model returns a `gameId` not in the candidate list → that
  item is dropped; if all are dropped → `{ ok: false, reason: "no_match" }`.
- **Empty candidates** — `recommend(criteria, [])` → `no_match`, `fetch` not called.
- **Timeout** — mocked `fetch` rejects with an `AbortError` → `{ ok: false, reason: "timeout" }`.
- **Provider error** — non-OK HTTP response → `"provider_error"`.
- **Invalid response** — non-JSON / schema-violating body → `"invalid_response"`.
- **Not configured** — key absent → `"not_configured"`, `fetch` not called.

Toggle the key per test with `vi.mock("astro:env/server", () => ({ OPENROUTER_API_KEY: … }))`
— resolvable because `getViteConfig` (Phase 1) runs the suite through Astro's Vite pipeline.
For the "not configured" case, mock it as `undefined`.

#### 2. CI wiring

**File**: `.github/workflows/ci.yml`

**Purpose**: Run the suite on every push/PR alongside lint + build.

**Contract**: Add an `npm test` step after the existing `npx astro sync` + lint/build steps
(order matters — `astro sync` must generate `astro:env/server` before Vitest resolves it via
`getViteConfig`). No new secrets required — tests mock the provider and run without
`OPENROUTER_API_KEY`. **Also fix the pre-existing trigger mismatch**: `ci.yml` currently keys on
`branches: [master]` but the repo default branch is `main`, so the workflow never runs — update
`push`/`pull_request` triggers to `[main]` (or `[main, master]`), otherwise "green in CI" is
illusory.

### Success Criteria:

#### Automated Verification:

- All unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- CI workflow includes the test step (grep `ci.yml` for `test`)

#### Manual Verification:

- Review confirms tests assert on the discriminated-union `reason` values, not just `ok:false`.
- Optional live smoke: with a real key in `.dev.vars`, a scratch call to `recommend` against a
  small fixture returns ranked results within the 5s target (not automated; needs network).

**Implementation note**: Final phase — after green, F-01 is done and S-05 can be planned.

---

## Testing Strategy

### Unit Tests:

- The full failure-mode matrix above (happy, out-of-catalog, empty, timeout, provider error,
  invalid response, not configured), all with a mocked `fetch`.
- Key edge case: catalog-only enforcement must run *after* parsing, so a model that invents a
  game id cannot leak it.

### Integration Tests:

- None automated in this change (no UI/route/DB yet). The mocked-`fetch` unit tests are the
  integration boundary for the service. Real end-to-end recommendation is exercised in S-05.

### Manual Testing Steps:

1. Build with no key set → app builds; OpenRouter shows in `missingConfigs`.
2. `npm test` → all guard tests green with no network.
3. (Optional) Put a real key in `.dev.vars`, call `recommend` from a scratch script against a
   3-game fixture → ranked result with reasoning inside the 5s target.

## Performance Considerations

The 5s NFR is dominated by the OpenRouter round-trip. Mitigations baked into the contract:
minimum-data prompt (small payload), a fast/cheap default model, and an 8s hard abort so a slow
call fails as a typed `timeout` rather than hanging. No caching in this change (low QPS,
two users).

## Migration Notes

None — no schema or data. New secrets must be added to Cloudflare Worker secrets and
GitHub Actions secrets before S-05 ships a live flow (per infrastructure.md "Getting Started").
No rollback coupling; this is additive.

## References

- Roadmap foundation: `context/foundation/roadmap.md` (F-01)
- Change identity: `context/changes/llm-recommendation-service/change.md`
- Infrastructure / provider decision: `context/foundation/infrastructure.md`
- Typed-secret pattern: `astro.config.mjs:17-22`, `src/lib/supabase.ts:3`
- Graceful-degradation pattern: `src/lib/supabase.ts:5-8`, `src/lib/config-status.ts:11-21`
- PRD guardrails: `context/foundation/prd.md` §Non-Functional Requirements, US-01 acceptance criteria

## Implementation Deviations

- **Phase 1 test harness (`vitest.config.ts`)**: the plan mandated `getViteConfig` from
  `astro/config` plus `vi.mock("astro:env/server", …)` per test. In practice the Astro
  Cloudflare adapter's Vite plugin rejects a Vitest config at startup, so the implementation
  instead uses a plain `defineConfig` that aliases `astro:env/server` to a `process.env`-backed
  stub (`src/test/astro-env-server.stub.ts`); tests toggle the key via `process.env` +
  `vi.resetModules()` and a fresh dynamic import. Same guarantee (per-test key control), adapted
  to the harness that actually works on this stack. Reason is recorded in the config file comment.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step completes.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Config & Dependencies

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` — 11020b3
- [x] 1.2 Type/astro check passes: `npm run build` — 11020b3
- [x] 1.3 Lint passes: `npm run lint` — 11020b3
- [x] 1.4 `npm test` runs and exits 0 — 11020b3

#### Manual

- [x] 1.5 Unconfigured OpenRouter key appears in `missingConfigs`; app still builds — 11020b3
- [x] 1.6 `.env.example` documents `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` — 11020b3

### Phase 2: Contract Types & Guarded Service

#### Automated

- [x] 2.1 Type check / build passes: `npm run build` — aa67e2e
- [x] 2.2 Lint passes: `npm run lint` — aa67e2e

#### Manual

- [x] 2.3 Review confirms catalog-only filter runs after parsing; no out-of-catalog `gameId` returned — aa67e2e
- [x] 2.4 No Node-only imports introduced (Workers compatibility) — aa67e2e

### Phase 3: Unit Tests & Verification

#### Automated

- [x] 3.1 All unit tests pass: `npm test` — 04f826a
- [x] 3.2 Lint passes: `npm run lint` — 04f826a
- [x] 3.3 Build passes: `npm run build` — 04f826a
- [x] 3.4 CI workflow includes the test step — 04f826a

#### Manual

- [x] 3.5 Tests assert on specific `reason` values, not just `ok:false` — 04f826a
- [ ] 3.6 (Optional) Live smoke: real key returns ranked results within 5s target
