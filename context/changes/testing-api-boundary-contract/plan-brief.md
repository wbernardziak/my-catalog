# API boundary contract — plan brief

> Full plan: `context/changes/testing-api-boundary-contract/plan.md`
> Research: `context/changes/testing-api-boundary-contract/research.md`

## What and why

Phase 1 of the test rollout (`context/foundation/test-plan.md`). Two invariants at
the API boundary are currently unguarded by any test: that each endpoint denies an
unauthenticated caller *on its own* — the middleware does not gate `/api/*`, so the
guard hand-copied into seven handlers is the only gate — and that invalid input is
rejected without a write reaching Supabase.

## Starting point

No test in this repo has ever invoked an API handler. `index.test.ts` unit-tests a
zod schema; `id-endpoints.test.ts` `readFileSync`s handlers and greps their source
text. There is no `APIContext` factory and no Supabase double of any kind, and four
service tests state a convention against mocking Supabase. The harness is greenfield.

## Desired end state

`npm test` drives all seven in-scope endpoints for real. An unauthenticated call is
proven denied *and* silent; an invalid body is proven rejected *and* silent; the two
per-member writes are proven to carry the session's member id. Deleting a guard from
any one handler turns the suite red, and CI stops passing on an empty suite.

## Key decisions made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Risk #2 framing | The unguarded invariant, not "non-owning caller" | `games` RLS is `using (true)` by design; an ownership test would assert the opposite of the 2026-07-09 decision | Research |
| Supabase double depth | Spy-only, no row store | Answers "was a write issued?" — enough for risk #4, and cannot masquerade as an authorization oracle | Plan |
| Fix scope | Characterize first, fix what tests prove broken | Every production edit is justified by a failing test | Plan |
| Denial assertion | Redirect target **plus** unfired write spy | A redirect alone does not prove the write did not happen | Plan |
| Suite layout | Table-driven over an endpoint registry | One place to extend; a dropped guard fails immediately | Plan |
| `id-endpoints.test.ts` | Delete in phase 4 | Source-grep assertions pass even if the constant is unused | Plan |
| CI gate | Drop `--passWithNoTests` once tests exist | One line makes the existing CI step real; phase 5 keeps the edit-loop work | Plan |

## Scope

**In scope:** `src/pages/api/games/**` (six endpoints) and `/api/recommendations`;
the harness under `src/test/`; handler fixes a test proves necessary; the `npm test`
script; the test plan's §6.2 cookbook.

**Out of scope:** ownership assertions on `games`; anything claiming to prove RLS;
extracting the seven duplicated guards; converting redirects to status codes;
coverage thresholds, MSW, a local Supabase stack; `/api/auth/*` and `/api/theme`.

## Approach

`vi.mock("@/lib/supabase")` is the single injection point — all seven handlers call
`createClient` from there. The double is chainable over the exact surface the
services use (`select/insert/update/upsert/delete/eq/is/single/maybeSingle`) with
write methods as `vi.fn()` spies. The context factory supplies `locals` matching
`App.Locals`, `params`, `cookies`, and a `redirect` that returns a real `Response`
so assertions read a `Location` header rather than mock call args.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Harness | Context factory, Supabase double, one endpoint driven end-to-end | `vi.mock` hoisting breaks the obvious spy wiring |
| 2. Auth invariant | Table-driven denial across seven endpoints; member-id binding | A test that passes for the wrong reason — mitigated by a positive case |
| 3. Input rejection | Invalid bodies, the unvalidated `[id]`, malformed-form probe | The probe may force a real handler fix mid-phase |
| 4. Cleanup and gate | Source-grep test deleted, `--passWithNoTests` dropped, §6.2 written | Dropping the flag turns a latent CI failure visible |

**Prerequisites:** none — no migration, no new dependency, no Docker.
**Estimated effort:** ~2 sessions across four phases.

## Open risks and assumptions

- The malformed-`formData()` 500 is inference from reading, not observation; phase 3 settles it and may add a handler fix.
- The spy-only double cannot catch a missing `.eq()` filter. That is accepted, stated in its doc comment, and belongs to rollout phase 2.
- A new endpoint added without a table row is silently uncovered; a filesystem sweep was considered and deferred.

## Success criteria

- Deleting any one handler's session guard turns the suite red.
- Every invalid-input case asserts no write was issued, not merely a response.
- A reader can add a test for a new endpoint from §6.2 of the test plan alone.
