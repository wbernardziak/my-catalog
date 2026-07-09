# LLM Recommendation Service Integration — Plan Brief

> Full plan: `context/changes/llm-recommendation-service/plan.md`

## What & Why

Build a thin, well-guarded server-side OpenRouter recommendation service (Foundation F-01).
Given play criteria and a caller-supplied list of eligible catalog games, it returns a ranked
subset with reasoning — or a single typed failure state. It exists to retire the AI-integration
risk before the user-facing recommendation slice (S-05), and to carry the PRD guardrails
(catalog-only, minimum data in prompt, 5s latency, no fabricated results) in one place.

## Starting Point

The codebase has Supabase auth, a Cloudflare Workers runtime, and a typed env-secret pattern
(`astro:env/server` + `envField` in `astro.config.mjs`), plus a graceful "not configured"
degradation pattern (`supabase.ts` returns `null`; `config-status.ts` surfaces it). There is no
LLM key, no `src/types.ts`, no `src/lib/services/`, no `zod`, and no test framework. OpenRouter
is already the settled provider per `infrastructure.md`.

## Desired End State

A `recommend(criteria, candidateGames)` service returning a discriminated union
(`ok:true` with ranked recommendations, or `ok:false` with a machine-readable reason), fully
unit-tested against a mocked `fetch` with no network or API key, and green in CI. S-05 can then
build the "What should we play?" UI on top of a proven contract.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider | OpenRouter | Already settled in the infrastructure research. | Infra |
| Structured output | JSON `response_format` + Zod validation | Hard contract that rejects hallucinated / out-of-catalog output. | Plan |
| Timeout / failures | `AbortController` (~8s cap) → one typed failure state, no retry | Predictable latency/cost; S-05 renders one clear state. | Plan |
| Verification | Add Vitest; unit-test with mocked `fetch` | Repeatable proof without an API key; future slices inherit the runner. | Plan |
| Input contract | `recommend(criteria, candidateGames)` — caller supplies games | Decouples F-01 from the not-yet-built S-01 schema; enforces catalog-only. | Plan |
| Model | Fast/cheap model via `OPENROUTER_MODEL` env, sensible default | Fits low-complexity goal, 2 users, and the 5s budget; swap without a code deploy. | Plan |

## Scope

**In scope:** OpenRouter secret + model in the typed env schema; `config-status` degradation
entry; `zod` + Vitest install and `test` script; `src/types.ts` contract; guarded
`recommendations.ts` service; unit tests + CI wiring.

**Out of scope:** any UI / API route / "What should we play?" flow (S-05); DB access, schema, or
migrations (S-01); played/preference sourcing (S-04); retry/backoff, caching, streaming,
multi-provider abstraction; reasoning-quality tuning.

## Architecture / Approach

Three foundation-up phases. Config & deps first (env, secrets files, `zod` + Vitest), then the
contract types and the guarded service (one `fetch` to OpenRouter chat-completions with
`response_format`, Zod-validated, `AbortSignal.timeout`, catalog-only filter applied in code
after parsing, discriminated-union return — never throws), then unit tests covering every
failure mode plus CI. Web-standard APIs only (Cloudflare Workers).

## Phases at a Glance

| Phase | Delivers | Key Risk |
| --- | --- | --- |
| 1. Config & dependencies | Env key/model, `.env.example`, config-status entry, `zod` + Vitest, `test` script | `@/*` alias must be mapped in `vitest.config.ts` |
| 2. Contract types & service | `src/types.ts` + guarded `recommendations.ts` | Enforcing catalog-only in code, not just the prompt |
| 3. Unit tests & verification | Vitest failure-mode suite + CI `npm test` | Mocking `astro:env/server` to toggle the key per test |

**Prerequisites:** none in-repo; a real OpenRouter key is needed only for the optional live
smoke and for S-05 (add to `.dev.vars` locally, Cloudflare + GitHub secrets for prod).
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- The chosen default model must support OpenRouter's `response_format` structured output; if a
  swapped model does not, output falls back to `invalid_response` — confirm model capability
  when tuning in S-05.
- Cloudflare Workers vs. local Astro dev can differ; the 5s target depends on OpenRouter latency,
  verified only via the optional live smoke, not the mocked unit tests.
- The `CandidateGame` shape is provisional; S-01's schema and S-04's preference model may refine
  the fields the caller maps into it.

## Success Criteria (summary)

- `npm run lint`, `npm run build`, and `npm test` all pass; CI runs the test step.
- The service never returns a `gameId` absent from its input; every error path yields a distinct,
  typed failure `reason` — no exceptions leak, no fabricated recommendations.
- Missing OpenRouter key degrades gracefully (surfaced in `missingConfigs`), it does not break the build.
