<!-- IMPL-REVIEW-REPORT -->

# Implementation review: Guard Self-Verification

- **Plan**: `context/changes/testing-guard-self-verification/plan.md`
- **Scope**: Phases 1–6 of 6 (6.3 manual pending)
- **Date**: 2026-09-14
- **Verdict**: REJECTED
- **Findings**: 1 critical, 7 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | WARNING |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria all green at `98b5fa4`: `vitest scripts/` (24 tests), `npm test` (212), typecheck, lint,
`lint:colors` (78 files), `lint:contrast` (87 assertions), `lint:reads` (2 reads), prettier.

Out of scope, not raised: `if: false` / `continue-on-error` on a CI step (plan "NOT doing"); pre-existing
colour-rule misses (`backgroundColor`, `lch`/`hwb`, named SVG colours).

## Findings

### F1 — Indirect-name exclusion lets supabaseClient.from(T) through

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real trade-off; pause to think it through
- **Dimension**: Safety & Quality
- **Location**: scripts/check-games-read-guard.mjs:199
- **Detail**: The plan excludes only a capitalised receiver (`Array.from`, `Buffer.from`); the code tests `/[A-Z][A-Za-z0-9_]*$/`, which matches any receiver ending in a capitalised segment. Reproduced: `const T = "games"; supabaseClient.from(T).select("*")` exits 0. Also open: an imported name (`client.from(GAMES)`, no `"games"` literal in the file) and `Supabase.from(t)`. The only test uses a lowercase receiver.
- **Fix A ⭐ Recommended**: Anchor the exclusion to a whole identifier, `(?:^|[^\w$])[A-Z]\w*$`, and pin `supabaseClient.from(T)`.
  - Strength: One-line change that matches the plan's contract exactly.
  - Trade-off: Imported names and `Supabase.from(t)` still pass.
  - Confidence: HIGH — probe reproduced; `src/` has no `.from(<ident>)`.
  - Blind spot: Imported-name bypass stays open.
- **Fix B**: Flag every non-literal `.from(x)` in any scanned file, with a built-in allowlist (Array, Buffer, Object, Uint8Array…).
  - Strength: Closes all three variants, including imported names.
  - Trade-off: Widens the plan's contract; an unrelated `.from(table)` would need a literal.
  - Confidence: MED — plan says no `.from(<identifier>)` exists in `src/`; not re-probed.
  - Blind spot: Future query builders that take variables.
- **Decision**: FIXED via Fix A — whole-identifier exclusion; `camel.ts` pinned; deliberate break verified red

### F2 — Two queries in one statement share a chain

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: scripts/check-games-read-guard.mjs:96-100
- **Detail**: `chainAfter` reads to the next `;`. `Promise.all([from("games").select("*"), from("genres")….is("deleted_at", null)])` borrows the predicate, and pairing with `from("plays").insert(row)` reclassifies the read as a write. Both exit 0 (reproduced). The plan excluded only chains split across statements.
- **Fix**: End the chain at the next `.from(` as well as `;`, and pin both `Promise.all` cases.
- **Decision**: FIXED — chain ends at the next `.from(`; both sibling cases pinned; deliberate break verified red

### F3 — Comment blanker desyncs silently on paired apostrophes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: scripts/check-games-read-guard.mjs:102-137
- **Detail**: The fail-closed check catches only a file that ends inside a string. Two JSX-text apostrophes (`<p>Don't</p> … // .is("deleted_at", null) … <p>It's</p>`) pair up, so the comment stays and the predicate counts (reproduced, exit 0). A regex `/\//` followed by a newline blanks a real read. The plan documented only quote-containing regexes.
- **Fix A ⭐ Recommended**: Classify each games chain on raw and blanked text; report `unrecognised` if they differ.
  - Strength: Cheap; fails closed on any blanker mistake without a tokenizer.
  - Trade-off: A read beside a stale commented-out predicate reports until the comment is removed.
  - Confidence: MED — logic sound; today's 2 reads unprobed for false positives.
  - Blind spot: A desync that blanks `.from("games")` itself (the `/\//` case) is missed.
- **Fix B**: Tokenize with the TypeScript scanner (`ts.createScanner`).
  - Strength: Correct handling of regexes and strings; `.tsx` needs JSX scan mode, `.astro` its own.
  - Trade-off: ~385 ms per spawn to load `typescript` (research), about a quarter of the 1.5 s budget.
  - Confidence: MED — cost from research, not re-measured.
  - Blind spot: `.astro` frontmatter/template split.
- **Decision**: FIXED differently — Fix A was chosen, then withdrawn: raw and blanked text are identical when the blanker fails to blank, so it could not catch the reproduced case. Applied lexer checks instead: a newline inside a `'`/`"` string, or `\//` outside a string, makes the blanker return null (reported `desynchronised`). Both reproduced cases pinned; each check's deliberate break verified red. Residual: two apostrophes on one line around a same-line comment.

### F4 — Phase 3 games-read test table mostly unpinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real trade-off; pause to think it through
- **Dimension**: Plan Adherence
- **Location**: scripts/check-games-read-guard.test.ts:62-87
- **Detail**: No assertion for: "comment fakes write"; `// .insert(` inside a guarded read passes; `url.ts` "string keeps //" passes (it sits in the bad tree, unasserted); later-violation line number; quote-free `/\d+/`; guarded `as const` passes; `Array.from` and `.from(T)` without a games literal not reported; the real-repo row; Phase 1's `src/test/` exemption edge. The guard behaves correctly on each today, so regressions would go unnoticed.
- **Fix**: Rewrite the games tests to the Phase 1 and 3 tables: a bad tree plus a known-good second spawn, each file asserted with its kind.
- **Decision**: FIXED — 4 tests, 5 spawns. The bad tree asserts the exact sorted `file:line kind` set (13 hits, so missing and extra hits both fail); the known-good tree asserts "All 5 reads" and no hit lines; the real-repo run asserts exit 0. Deliberate breaks verified red: blanker bypassed, `TABLE_RE` reverted, `src/test/` exemption removed, capital-receiver exclusion removed, games-literal condition removed, line number broken, write verbs read from raw source, and each F1–F3 fix reverted.

### F5 — Phase 6 docs partly delivered, yet 6.2 is ticked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:278,283,310,606,643
- **Detail**: Still stale: §4 "existing suite" (188 unit tests), §4 "bespoke gates" ("None of the three has a self-test"), §5 "(planned)". Missing: the §6.7 Phase 6 note and the §7 impl-review F3 deferral. §6.8 omits "never under `src/`", is vague on the wiring-test step, and a leftover TBD line remains at :643.
- **Fix**: Complete §4, §5, §6.7 and §7, and tighten §6.8 per the Phase 6 contract.
- **Decision**: FIXED — §4 suite and gates rows updated; §5 row set to "required (wired 2026-09-14)"; §6.7 Phase 6 note added (including this review's F1–F3); §7 impl-review F3 entry added with its trigger; §6.8 rewritten to the nine contract items, with the leftover line removed. Suite counts re-synced to 212 unit tests after triage.

### F6 — Gradient site count reads comments and test files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: scripts/check-contrast.mjs:183-189
- **Detail**: A raw substring count over all of `src/`. A plain heading plus `<!-- was bg-clip-text -->` keeps the count at 1 with no gradient: "Contrast OK", exit 0 (reproduced). A mention in a test file fails falsely. `GRADIENT_TEXT.where` is never checked against the source.
- **Fix**: Skip `src/test/` and `*.test.*`, and fail when a `GRADIENT_TEXT` `where` file lacks `bg-clip-text`.
- **Decision**: FIXED — the count skips `src/test/` and `*.test.*`, and each `where` line must hold `bg-clip-text` outside a comment. The fixtures now copy the real `PageTitle.astro`. Pins: test-file mentions in the baseline tree, and a new commented-out-class test. Deliberate breaks verified red: test-file skip removed, `where` check removed, comment stripping removed.

### F7 — Timing baseline taken after Phase 1, not before it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-guard-self-verification/plan.md:697,752
- **Detail**: The plan measures before Phase 1 starts; 1.8 was measured at `1e69ade`, which already includes Phase 1's spawns, so 5.4 excludes Phase 1's cost. HEAD medians varied between runs (2.74 s, then 2.36 s).
- **Fix**: Re-measure at `a11937e` (pre-Phase-1) against HEAD, 3 runs each in one sitting, and correct 1.8 and 5.4.
- **Decision**: FIXED — interleaved runs after one warm-up each: `a11937e` 1.70/2.33/2.08 s (median 2.08), current tree 3.02/2.58/2.41 s (median 2.58), so +0.50 s against the 1.5 s budget. Rows 1.8 and 5.4 corrected.

### F8 — Per-phase issues missing for Phases 5 and 6

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Pattern Consistency
- **Location**: N/A (GitHub #67–#71; commits 5cb512f..98b5fa4)
- **Detail**: The lessons.md rule is one issue per phase. #68–#71 cover Phases 1–4; none exists for Phases 5 or 6. Earlier commits cite their phase issue; the p4/p5/p6 commits cite only #67, not #71.
- **Fix**: Create the Phase 5 and Phase 6 issues, and cite #71 and the new issues in the PR body (no history rewrite).
- **Decision**: FIXED — created #74 (Phase 5) and #75 (Phase 6). The review-fix commit and the PR body must cite #71, #74 and #75.

### F9 — New tests depend on cwd; hook spawn has no timeout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Safety & Quality
- **Location**: scripts/gate-wiring.test.ts:40,136; scripts/check-contrast.test.ts:13-14; scripts/check-color-literals.test.ts:121
- **Detail**: Relative paths break outside the repo root (IDE runners); `npm test` and CI are unaffected. The Stop-hook `spawnSync` has no timeout, and `GIT_DIR` is the only thing preventing a recursive `npm test`.
- **Fix**: Resolve paths against `repoRoot` like `guardHarness.ts`, and add `timeout: 10_000` to the hook spawns.
- **Decision**: FIXED — `guardHarness.ts` exports `repoRoot`; the wiring, contrast and colour tests resolve files against it and pass `cwd: repoRoot` to their direct spawns; the hook spawns carry `timeout: 10_000`. Verified: 24/24 script tests pass from the repo root and from `src/` (`vitest --root ..`).

### F10 — Unrecorded deviations from the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrow
- **Dimension**: Scope Discipline
- **Location**: scripts/check-games-read-guard.mjs:162; scripts/check-contrast.test.ts:44; scripts/check-contrast.mjs:294-299
- **Detail**: Blanker desync uses kind `desynchronised`, not the plan's `unrecognised` (still fail-closed). Both registry mutations share one spawn, though the plan wanted each isolated. The header rule list omits `indirect`. The contrast trailer always says "fix the token value". Unplanned but harmless: arg-count hardening and the §2 Risk #10 amendment.
- **Fix**: Add a Deviations note to plan.md, and print a trailer per failure kind.
- **Decision**: FIXED — added a `## Deviations` section to plan.md (arg-count check, `desynchronised` kind, F1–F3 and F6 guard changes, shared registry spawn, §2 amendment, timing baseline). The games-guard header now lists `unguarded`, `indirect` and `desynchronised`, the chain extent, and the blanker's fail-closed signals. The contrast trailer prints per failure kind, pinned both ways; deliberate break (token trailer always printed) verified red.
