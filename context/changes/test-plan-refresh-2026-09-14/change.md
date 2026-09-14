---
change_id: test-plan-refresh-2026-09-14
title: "Refresh the test plan: cover the external seams"
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Refresh of `context/foundation/test-plan.md`, opened by `/10x-test-plan --refresh`
after the five-phase rollout completed and was archived.

**Why the guide is stale.** §2's seven risks are all shipped and covered. §4 still
calls the test base `sparse`; it is now `meaningful` — 20 test files, 188 unit and
35 db tests. §3's "no browser/e2e phase is proposed" carried its own revisit
condition, and that condition has been met.

**What the interview surfaced.** Every new risk sits at an **external seam**, and
the guide has no row for any of them:

- **A.** A provider changes its response shape and the suite stays green. Every
  provider test stubs the provider, so nothing in 188 tests can observe real
  drift. High × Medium; interview Q1.
- **B.** A free-tier quota is reached and the feature silently stops. Supabase's
  auth email cap sits directly in the signup path, and the failure reads as our
  bug. High × Medium; interview Q2.
- **C.** Configuration diverges between local, CI and production. Config lives in
  at least five places and nothing checks they agree. High × Medium; interview Q3,
  and `lessons.md` already carries the same class of scar (migrations not reaching
  prod).
- **D.** A regression only the full deployed shape exposes — auth cookie plus
  handler plus island hydration — reaches production. Medium × High; interview Q4,
  plus browser verification needed twice by hand in a single session.
- **E.** Gate or guard infrastructure breaks unnoticed. `.js`/`.mjs`/`.sh` are
  outside every lint glob and there is no shellcheck. Medium × Medium;
  impl-review F3 in `context/archive/2026-09-14-testing-quality-gate-wiring/`,
  and a pre-commit hook that never ran for the life of the repo.

**Proposed phases:** 1. Provider contract smoke · 2. Quota/limit failure surfaces · 3. Configuration parity guard · 4. Behavioural E2E · 5. Infrastructure lint coverage.

**Hard constraint (interview Q5).** Visual testing stays excluded. Any E2E phase is
behavioural only — does the flow work, not does it look right. Issue #43 (port the
runtime contrast audit into E2E) therefore sits outside this scope and is
deliberately left open pending a separate decision.

**Scope discipline.** Do not rewrite §1/§2 without explicit instruction. The final
plan sub-phase updates §3 status and §6 cookbook patterns, as every prior phase did.

**Known unknown for research.** No browser test runner is installed — there is no
Playwright or equivalent in `package.json`. Phase 4 is not "add some tests"; it is
"introduce a test layer this repo does not have", and its cost should be weighed
against that.
