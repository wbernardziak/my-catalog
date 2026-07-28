<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Play Recommendation with Reasoning

- **Plan**: context/changes/ai-play-recommendation/plan.md
- **Mode**: Deep
- **Date**: 2026-07-26
- **Verdict**: NEEDS WORK → SOLID (all findings fixed 2026-07-26)
- **Findings**: 0 critical, 2 warnings, 1 observation — all FIXED

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| End-State Alignment | PASS    |
| Frugal Execution    | PASS    |
| Architectural Fit   | PASS    |
| Blind Spots         | WARNING |
| Plan Completeness   | WARNING |

## Grounding

11/11 paths ✓, symbols ✓ (`recommend` never throws — always returns the union;
`mapRowToCandidateGame(row, {played, preference?})`; `PROTECTED_ROUTES` confirmed at
`middleware.ts:4`; `SubmitButton` uses `useFormStatus` at `SubmitButton.tsx:12`),
brief↔plan ✓.

## Findings

### F1 — Island only handles the union; route's error shape + fetch failure unhandled

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real trade-off; stop and think it through
- **Dimension**: Blind Spots
- **Location**: Phase 1 route contract (L158-170) ↔ Phase 2 island contract (L238-243)
- **Detail**: The route returns two response shapes: the discriminated union at 200
  (`ok:true` / `ok:false`+`reason`), but `{ error: … }` at 400 (bad body), 401 (no
  user), and 500 (DB error). The island contract only says "switch on the union:
  ok:true / ok:false" — it has no branch for a non-200 body (no `ok` field → falls
  through to `describeFailure(undefined)`), nor for a `fetch` that rejects on a
  network error. Client validation prevents the common 400, but 500 (DB assembly
  failure) and a dropped connection are reachable and would render nothing or a
  broken panel — violating the "clear failure states" end-state and success
  criteria 2.8/2.9.
- **Fix**: Specify island response handling — treat a thrown `fetch` OR a non-`ok`
  HTTP response OR a body missing `ok` as a generic error panel (reuse the
  `kind:"error"` styling with a fallback message). Only bodies with an explicit `ok`
  field go through the union switch.
- **Decision**: FIXED — applied to island contract (Phase 2)

### F2 — Reusing SubmitButton won't drive the loading state for a fetch submit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Plan Completeness
- **Location**: Phase 2 island contract (L233-238, L244) + success criterion 2.9
- **Detail**: The plan says "reuse SubmitButton" and separately requires a visible
  loading state during the call (2.9). But `SubmitButton` derives `pending` from
  React's `useFormStatus()` (`SubmitButton.tsx:12`), which only reports pending
  inside a native form submission / form `action`. The island submits via `fetch`
  (preventDefault), so `useFormStatus` stays `false` and the spinner never fires —
  the loading indicator silently doesn't work.
- **Fix**: Drive the button's disabled/pending from the island's own
  `status === "loading"` state (a local button, or pass pending as a prop) — do not
  rely on SubmitButton's `useFormStatus`. Note this explicitly so the implementer
  doesn't wire in a dead spinner.
- **Decision**: FIXED — island drives pending from its own status; SubmitButton reuse dropped (Phase 2)

### F3 — no-Supabase-client branch maps to `not_configured` (OpenRouter's reason)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; the fix is obvious and narrow
- **Dimension**: Blind Spots
- **Location**: Phase 1 route contract (L153-157)
- **Detail**: `not_configured` in `RecommendationResult` specifically means "no
  OpenRouter key" (`recommendations.ts:64`). The route reuses it when `createClient`
  returns null (Supabase unconfigured), so the island would show "OpenRouter not
  configured" copy when the real problem is Supabase. It is also nearly unreachable:
  `/play` is behind `PROTECTED_ROUTES`, and middleware needs Supabase to resolve a
  user, so no Supabase means a redirect to signin before the route runs.
- **Fix**: Return a generic 503 `{ error }` for the null-client case instead of
  reusing `not_configured`, or drop the branch and note it's unreachable behind the
  auth gate.
- **Decision**: FIXED — null-client now returns 503 {error} + noted unreachable (Phase 1)
