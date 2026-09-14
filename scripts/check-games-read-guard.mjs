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
 * The rule: for every `.from("games")`, look at the chain that follows, and sort
 * it into one of three outcomes. The chain ends at the statement's `;` or at
 * the next `.from(`, whichever comes first.
 *
 *   write        — reaches `.insert(`/`.update(`/`.upsert(`/`.delete(`. Not this
 *                  guard's business; a write returning its own row is fine.
 *   read         — reaches `.select(`. Must carry `.is("deleted_at", null)`;
 *                  reported as `unguarded` otherwise.
 *   unrecognised — neither. The chain was cut short, almost always because
 *                  `.from(…)` and `.select(…)` sit in separate statements. This
 *                  is REPORTED, not ignored: a scanner that silently passes what
 *                  it cannot read is worse than no scanner, because it looks
 *                  like coverage.
 *
 * Two file-level outcomes are reported the same way:
 *
 *   indirect       — a file naming the `games` literal also calls `.from(x)` with
 *                    a non-literal argument on a lowercase receiver. The scanner
 *                    cannot tell which table `x` is. `Array.from` and other whole
 *                    capitalised receivers are excluded.
 *   desynchronised — the comment blanker lost track of strings (see below), so
 *                    no chain in the file can be trusted.
 *
 * ORDER MATTERS. The write-verb check runs FIRST, because `createGame`
 * (src/lib/services/games.ts:83) is `.from("games").insert({...}).select()` — a
 * chain that reaches `.select(` and carries no predicate, correctly, because it
 * is a write returning its own row. Check `.select(` first and this script
 * fails on correct production code.
 *
 * Comments are blanked before classification. The blanker has no regex or JSX
 * awareness, so it fails closed when it sees evidence of losing sync: ending
 * inside a string, a newline inside a `'`/`"` string (two paired apostrophes),
 * or `\//` outside a string (a regex such as /\//). Known limit: two apostrophes
 * on one line with a same-line comment between them still pair silently.
 *
 * Exempt: `src/test/`, which reads storage directly on purpose — proving a
 * soft-deleted row is STILL THERE is the assertion that distinguishes a soft
 * delete from a hard one, and it can only be made by querying without the
 * predicate.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = "src";
const EXTENSIONS = [".astro", ".tsx", ".ts", ".jsx", ".js"];

function rootFromArgs() {
  const args = process.argv.slice(2);
  const [argument] = args;
  if (!argument) return DEFAULT_ROOT;
  if (args.length !== 1 || !argument.startsWith("--root=") || !isAbsolute(argument.slice("--root=".length))) {
    console.error("Usage: node scripts/check-games-read-guard.mjs [--root=<absolute dir>]");
    process.exit(1);
  }
  return argument.slice("--root=".length);
}

const ROOT = rootFromArgs();
if (ROOT !== DEFAULT_ROOT) console.log(`Scanned root: ${ROOT}`);

/**
 * Paths whose `games` reads are deliberately unguarded. Add an entry only with a
 * comment saying why the read is allowed to see deleted rows.
 */
const EXEMPT_PREFIXES = [
  // The database test harness and its suites query storage directly to prove a
  // soft-deleted row still exists. That is the point of those tests.
  "src/test/",
];

/**
 * Matches `.from("games")`, `.from('games')` and `` .from(`games`) ``. Prettier
 * rewrites single quotes to double in this repo and `lint` runs before this
 * check in CI, but backticks survive both — so the quote style is matched
 * rather than assumed.
 */
const TABLE_RE = /\.from\(\s*(["'`])games\1(?:\s+as\s+const)?\s*\)/g;
const PREDICATE = '.is("deleted_at", null)';
const WRITE_VERBS = [".insert(", ".update(", ".upsert(", ".delete("];

/** How far past `.from("games")` a chain can run. Chains here span ~16 lines. */
const CHAIN_WINDOW = 1200;

/**
 * The chain starting at `.from("games")`: everything up to the statement's end.
 * Terminated by `;` because every call site in this codebase ends its chain with
 * one, and reading to the next semicolon keeps multi-line builders (listGames
 * spans lines 31-46) intact. It also stops at the next `.from(`, so a sibling
 * query in the same statement (`Promise.all([...])`) cannot lend this chain its
 * predicate or a write verb.
 */
function chainAfter(source, index) {
  const tail = source.slice(index, index + CHAIN_WINDOW);
  const ends = [tail.indexOf(";"), tail.indexOf(".from(", 1)].filter((end) => end !== -1);
  return ends.length === 0 ? tail : tail.slice(0, Math.min(...ends));
}

function blankComments(source) {
  const out = [...source];
  let state = "normal";
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "line") {
      if (char === "\n") state = "normal";
      else out[index] = " ";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        out[index] = out[index + 1] = " ";
        index++;
        state = "normal";
      } else if (char !== "\n") out[index] = " ";
      continue;
    }
    if (state !== "normal") {
      // A quote or apostrophe string cannot span a line, so reaching one means two unrelated
      // apostrophes (JSX text, a regex) were paired and every comment after them is suspect.
      if (char === "\n" && state !== "`") return null;
      if (char === "\\") index++;
      else if (char === state) state = "normal";
      continue;
    }
    // `\//` outside a string is a regex such as /\//, not a comment; blanking from here would hide code.
    if (char === "/" && next === "/" && source[index - 1] === "\\") return null;
    if (char === "/" && next === "/") {
      out[index] = out[index + 1] = " ";
      index++;
      state = "line";
    } else if (char === "/" && next === "*") {
      out[index] = out[index + 1] = " ";
      index++;
      state = "block";
    } else if (char === '"' || char === "'" || char === "`") state = char;
  }
  return state === "normal" ? out.join("") : null;
}

const srcPath = join(ROOT, SRC);
if (!existsSync(srcPath)) {
  console.error(`No src/ under ${ROOT}. Check the --root argument.`);
  process.exit(1);
}

const files = readdirSync(srcPath, { recursive: true, encoding: "utf8" })
  .map((entry) => `${SRC}/${entry.split("\\").join("/")}`)
  .filter((file) => EXTENSIONS.some((ext) => file.endsWith(ext)))
  .filter((file) => !EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix)));

const hits = [];
let reads = 0;

if (files.length === 0) {
  console.error(`No source files matched under ${ROOT}; refusing an empty games-read scan.`);
  process.exit(1);
}

for (const file of files) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const blanked = blankComments(source);
  if (!blanked) {
    if (/["'`]games["'`]/.test(source)) hits.push({ file, line: 1, kind: "desynchronised" });
    continue;
  }

  TABLE_RE.lastIndex = 0;
  let match;
  while ((match = TABLE_RE.exec(blanked)) !== null) {
    const index = match.index;
    const chain = chainAfter(blanked, index);

    const line = source.slice(0, index).split("\n").length;

    // Write first — see the ORDER MATTERS note above.
    const isWrite = WRITE_VERBS.some((verb) => chain.includes(verb));

    if (isWrite) {
      // A write returning its own row. Not this guard's business.
    } else if (chain.includes(".select(")) {
      reads += 1;
      if (!chain.includes(PREDICATE)) {
        hits.push({ file, line, kind: "unguarded" });
      }
    } else {
      // Neither a write nor a recognisable read: the chain was cut short, most
      // likely because `.from("games")` and `.select(...)` sit in separate
      // statements (`let q = supabase.from("games"); q = q.select(...)`) — the
      // very idiom listGames already uses for its filters. This scanner cannot
      // follow that, and staying silent here would be the worst outcome: an
      // unguarded read slipping through a check whose whole job is to catch one.
      // So it reports rather than assumes.
      hits.push({ file, line, kind: "unrecognised" });
    }
  }

  if (/["'`]games["'`]/.test(blanked)) {
    for (const indirect of blanked.matchAll(/\.from\(\s*([^\s"'`][^)]*)\)/g)) {
      const before = blanked.slice(Math.max(0, indirect.index - 40), indirect.index);
      // A whole capitalised identifier (Array, Buffer), not any receiver ending in one (supabaseClient).
      if (!/(?:^|[^\w$])[A-Z][\w$]*$/.test(before)) {
        hits.push({ file, line: blanked.slice(0, indirect.index).split("\n").length, kind: "indirect" });
      }
    }
  }
}

if (hits.length > 0) {
  const unguarded = hits.filter((hit) => hit.kind === "unguarded");
  const unrecognised = hits.filter((hit) => hit.kind === "unrecognised");
  const indirect = hits.filter((hit) => hit.kind === "indirect");
  const desynchronised = hits.filter((hit) => hit.kind === "desynchronised");

  if (unguarded.length > 0) {
    console.error(
      `Unguarded \`games\` reads found (${unguarded.length}). Soft-deleted rows would leak into the catalog.\n`,
    );
    for (const hit of unguarded) {
      console.error(`  ${hit.file}:${hit.line}  .from("games") … .select(…) without ${PREDICATE}`);
    }
    console.error(`\nAdd ${PREDICATE} to the query chain. RLS will not do it for you:`);
    console.error("  the `games` SELECT policy is `using (true)` and names no deleted_at condition.\n");
  }

  if (unrecognised.length > 0) {
    console.error(`\`games\` query chains this check could not read (${unrecognised.length}).\n`);
    for (const hit of unrecognised) {
      console.error(`  ${hit.file}:${hit.line}  .from("games") with no .select( or write verb in the same statement`);
    }
    console.error("\nThis scanner reads one statement at a time, so it cannot follow a chain");
    console.error('split across statements (`let q = supabase.from("games"); q = q.select(…)`).');
    console.error("Keep the chain in one statement, or — if the read must see deleted rows —");
    console.error("add its path to EXEMPT_PREFIXES with a comment explaining why.\n");
  }

  if (indirect.length > 0) {
    console.error(`Indirect \`games\` table names found (${indirect.length}).\n`);
    for (const hit of indirect) console.error(`  ${hit.file}:${hit.line}  use a literal "games" table name`);
  }
  if (desynchronised.length > 0) {
    console.error("Comment blanker lost sync (likely an unterminated literal or regex literal containing a quote).\n");
    for (const hit of desynchronised) console.error(`  ${hit.file}:${hit.line}  could not safely scan this file`);
  }

  console.error("Guard: scripts/check-games-read-guard.mjs");
  process.exit(1);
}

if (reads === 0) {
  console.error(`No \`games\` reads were classified under ${ROOT}; refusing a zero-read scan.`);
  process.exit(1);
}

console.log(`All ${reads} \`games\` read(s) across ${files.length} files carry ${PREDICATE}.`);
