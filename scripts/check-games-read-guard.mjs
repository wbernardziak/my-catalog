#!/usr/bin/env node
/**
 * Fails when a `games` read is issued without the live-row predicate.
 *
 * Soft-delete is enforced in exactly one place: `.is("deleted_at", null)` in
 * `listGames` and `listGenres` (src/lib/services/games.ts:31 and :65). Below
 * them there is nothing — the `games` SELECT policy is `using (true)`
 * (supabase/migrations/20260710120000_create_games.sql:32-36) and no policy,
 * view or trigger mentions `deleted_at`. A new read path that forgets the
 * predicate returns deleted games to the catalog, and RLS will not stop it.
 *
 * The behavioural suites (src/test/db/catalogIntegrity.test.ts,
 * src/lib/services/games.test.ts) cannot catch that: a NEW read path is new code
 * that no existing test calls. Only a scan over the source can, which is why
 * this is a ratchet rather than a test — the same shape as check-color-literals.
 *
 * The rule: for every `.from("games")`, look at the chain that follows. If it
 * reaches `.select(` it is a read and must carry `.is("deleted_at", null)`.
 *
 * ORDER MATTERS. The write-verb check runs FIRST, because `createGame`
 * (src/lib/services/games.ts:83) is `.from("games").insert({...}).select()` — a
 * chain that reaches `.select(` and carries no predicate, correctly, because it
 * is a write returning its own row. Check `.select(` first and this script
 * fails on correct production code.
 *
 * Exempt: `src/test/`, which reads storage directly on purpose — proving a
 * soft-deleted row is STILL THERE is the assertion that distinguishes a soft
 * delete from a hard one, and it can only be made by querying without the
 * predicate.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = "src";
const EXTENSIONS = [".astro", ".tsx", ".ts", ".jsx", ".js"];

/**
 * Paths whose `games` reads are deliberately unguarded. Add an entry only with a
 * comment saying why the read is allowed to see deleted rows.
 */
const EXEMPT_PREFIXES = [
  // The database test harness and its suites query storage directly to prove a
  // soft-deleted row still exists. That is the point of those tests.
  "src/test/",
];

const TABLE = '.from("games")';
const PREDICATE = '.is("deleted_at", null)';
const WRITE_VERBS = [".insert(", ".update(", ".upsert(", ".delete("];

/** How far past `.from("games")` a chain can run. Chains here span ~16 lines. */
const CHAIN_WINDOW = 1200;

/**
 * The chain starting at `.from("games")`: everything up to the statement's end.
 * Terminated by `;` because every call site in this codebase ends its chain with
 * one, and reading to the next semicolon keeps multi-line builders (listGames
 * spans lines 31-46) intact.
 */
function chainAfter(source, index) {
  const tail = source.slice(index, index + CHAIN_WINDOW);
  const end = tail.indexOf(";");
  return end === -1 ? tail : tail.slice(0, end);
}

const files = readdirSync(join(ROOT, SRC), { recursive: true, encoding: "utf8" })
  .map((entry) => `${SRC}/${entry.split("\\").join("/")}`)
  .filter((file) => EXTENSIONS.some((ext) => file.endsWith(ext)))
  .filter((file) => !EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix)));

const hits = [];
let reads = 0;

for (const file of files) {
  const source = readFileSync(join(ROOT, file), "utf8");

  let index = source.indexOf(TABLE);
  while (index !== -1) {
    const chain = chainAfter(source, index);

    // Write first — see the ORDER MATTERS note above.
    const isWrite = WRITE_VERBS.some((verb) => chain.includes(verb));

    if (!isWrite && chain.includes(".select(")) {
      reads += 1;
      if (!chain.includes(PREDICATE)) {
        const line = source.slice(0, index).split("\n").length;
        hits.push({ file, line });
      }
    }

    index = source.indexOf(TABLE, index + TABLE.length);
  }
}

if (hits.length > 0) {
  console.error(`Unguarded \`games\` reads found (${hits.length}). Soft-deleted rows would leak into the catalog.\n`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  .from("games") … .select(…) without ${PREDICATE}`);
  }
  console.error(`\nAdd ${PREDICATE} to the query chain. RLS will not do it for you:`);
  console.error("  the `games` SELECT policy is `using (true)` and names no deleted_at condition.");
  console.error("If the read genuinely must see deleted rows, add its path to EXEMPT_PREFIXES");
  console.error(`in ${"scripts/check-games-read-guard.mjs"} with a comment explaining why.`);
  process.exit(1);
}

console.log(`All ${reads} \`games\` read(s) across ${files.length} files carry ${PREDICATE}.`);
