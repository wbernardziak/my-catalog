/**
 * lint-staged runs its tasks with unstaged changes hidden, so everything here
 * grades the **staged snapshot** rather than the working tree. That is the whole
 * reason typecheck and the unit suite live in this file instead of as extra
 * lines in `.husky/pre-commit`: a working-tree gate happily admits a commit
 * whose staged content is broken (verified 2026-09-14 — stage a type error, fix
 * the working copy, and `tsc` passes).
 *
 * The `*.{ts,tsx,astro}` entry is a **function** because lint-staged appends
 * matched filenames to string commands, and `tsc --noEmit <file>` silently drops
 * `tsconfig.json` — every `@/*` alias then fails to resolve. A function returns
 * complete commands and appends nothing, so `npm run typecheck` and `npm test`
 * run project-wide while `eslint` still gets just the staged files.
 *
 * Gating on the glob is what keeps a docs-only commit instant: with no code file
 * staged this key never matches and neither command runs.
 */
export default {
  /** @param {string[]} stagedFiles */
  "*.{ts,tsx,astro}": (stagedFiles) => [
    `eslint --fix ${stagedFiles.map((f) => JSON.stringify(f)).join(" ")}`,
    "npm run typecheck",
    "npm test",
  ],
  "*.{json,css,md}": ["prettier --write"],
};
