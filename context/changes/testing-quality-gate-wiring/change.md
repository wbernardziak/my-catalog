---
change_id: testing-quality-gate-wiring
title: "Test rollout phase 5: Quality-gate wiring"
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Phase 5 — the last row — of the phased test rollout in
`context/foundation/test-plan.md` (§3). Risks covered: cross-cutting; no single
§2 risk row owns it.

Goal: prove the suite cannot silently become optional, and that a regression
cannot land mid-edit.

**The CI half is already done.** `.github/workflows/ci.yml` runs `typecheck`,
`lint`, `lint:colors`, `lint:contrast`, `lint:reads`, `build` and `npm test` in
the `ci` job, plus `npm run test:db` in `db-tests`. The test step has run since
`1b3980b` — before this plan was authored — and `--passWithNoTests` was dropped
on 2026-09-11, so an empty or uncollectable suite already fails CI. §4 states it
plainly: "What Phase 5 still owes: the local edit-loop gate alone."

So the open scope is the **local edit-loop gate**. Today husky's `pre-commit`
runs `npx lint-staged`, which is `eslint --fix` on `*.{ts,tsx,astro}` and
`prettier --write` on `*.{json,css,md}` — nothing type-checks and nothing runs a
test before a commit lands. §7 records the consequence: phase 1's own harness
shipped four `tsc` errors through a green lint and build.

Open question for planning, not settled here: a pre-commit gate trades edit-loop
latency for earlier signal, and the suite is currently ~1.1s (unit) vs ~3s (db,
needs Docker). Cost × signal applies to the gate itself — a gate slow enough to
be bypassed with `--no-verify` is worse than no gate.
