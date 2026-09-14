import { afterAll, describe, expect, it } from "vitest";

import { makeTree, removeTree, runGuard } from "./guardHarness";

const GUARD = "scripts/check-games-read-guard.mjs";
const trees: string[] = [];
const tree = (files: Record<string, string>) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
const output = (result: ReturnType<typeof runGuard>) => `${result.stdout}${result.stderr}`;

/** The guard's per-hit remedy lines, which are what distinguish one kind from another. */
const KINDS: [string, string][] = [
  ["without .is(", "unguarded"],
  ["with no .select( or write verb", "unrecognised"],
  ["use a literal", "indirect"],
  ["could not safely scan", "desynchronised"],
];

/** Every reported hit as `file:line kind`, sorted, so a missing or an extra hit both fail. */
const hitsOf = (result: ReturnType<typeof runGuard>) =>
  [...output(result).matchAll(/^ {2}(src\/\S+:\d+) {2}(.+)$/gm)]
    .map(([, at, message]) => `${at} ${KINDS.find(([text]) => message.includes(text))?.[1] ?? message}`)
    .sort();

afterAll(() => {
  trees.forEach(removeTree);
});

describe("check-games-read-guard", () => {
  it("reports every known-bad chain with its kind and line, and ignores writes", () => {
    const result = runGuard(
      GUARD,
      tree({
        "src/lib/unguarded.ts": 'client.from("games").select("*");',
        "src/lib/split.ts": 'const query = client.from("games");\nquery.select("*");',
        "src/lib/write.ts": 'client.from("games").insert({ title: "x" }).select("*");',
        "src/lib/comment-predicate.ts": 'client.from("games").select("*") /* no .is("deleted_at", null) */;',
        "src/lib/comment-write.ts": 'client.from("games").select("*") // .update( later\n;',
        "src/lib/as-const.ts": 'client.from("games" as const).select("*");',
        "src/lib/indirect.ts": 'const T = "games"; s.from(T).select("*"); Array.from(rows);',
        "src/lib/camel.ts": 'const table = "games"; supabaseClient.from(table).select("*");',
        "src/lib/sibling-predicate.ts":
          'await Promise.all([client.from("games").select("*"), client.from("genres").select("*").is("deleted_at", null)]);',
        "src/lib/sibling-write.ts":
          'await Promise.all([client.from("games").select("*"), client.from("plays").insert(row)]);',
        "src/lib/later-line.ts":
          'client.from("games").select("*").eq("url", "https://x//y").is("deleted_at", null);\n\nclient.from("games").select("*");',
        "src/lib/regex.ts": 'const re = /["\']/; s.from("games").select("*").eq("u", "https://x");',
        "src/components/apostrophes.tsx":
          'const a = <p>Don\'t</p>;\nconst r = client\n  .from("games")\n  .select("*")\n  // .is("deleted_at", null)\n  .order("title");\nconst b = <p>It\'s</p>;',
        "src/lib/slash-regex.ts": 'const re = /\\//; const rows = client.from("games").select("*");\n',
      }),
    );

    expect(result.status).toBe(1);
    expect(hitsOf(result)).toEqual(
      [
        "src/lib/unguarded.ts:1 unguarded",
        "src/lib/split.ts:1 unrecognised",
        "src/lib/comment-predicate.ts:1 unguarded",
        "src/lib/comment-write.ts:1 unguarded",
        "src/lib/as-const.ts:1 unguarded",
        "src/lib/indirect.ts:1 indirect",
        "src/lib/camel.ts:1 indirect",
        "src/lib/sibling-predicate.ts:1 unguarded",
        "src/lib/sibling-write.ts:1 unguarded",
        "src/lib/later-line.ts:3 unguarded",
        "src/lib/regex.ts:1 desynchronised",
        "src/components/apostrophes.tsx:1 desynchronised",
        "src/lib/slash-regex.ts:1 desynchronised",
      ].sort(),
    );
  });

  it("accepts guarded reads, writes and the scanner's known-good edge cases", () => {
    const result = runGuard(
      GUARD,
      tree({
        "src/lib/query.ts":
          'client.from("games").select("*").is("deleted_at", null);\nclient.from("games").insert({ title: "x" }).select("*");',
        "src/lib/url.ts": 'client.from("games").select("*").eq("url", "https://x//y").is("deleted_at", null);',
        "src/lib/comment-insert.ts":
          'client\n  .from("games")\n  // .insert( elsewhere\n  .select("*")\n  .is("deleted_at", null);',
        "src/lib/quote-free-regex.ts": 'const re = /\\d+/; client.from("games").select("*").is("deleted_at", null);',
        "src/lib/as-const.ts": 'client.from("games" as const).select("*").is("deleted_at", null);',
        "src/lib/no-literal.ts": 's.from(T).select("*");',
        "src/test/db/fixture.ts": 'client.from("games").select("*");',
      }),
    );

    // Five guarded reads: a `// .insert(` comment must not turn one into a write, and the exempt
    // src/test/ fixture must not count.
    expect(output(result)).not.toMatch(/^ {2}src\//m);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("All 5 `games` read(s)");
  });

  it("refuses empty and write-only source trees", () => {
    const empty = runGuard(GUARD, tree({ "src/.keep": "" }));
    const writes = runGuard(
      GUARD,
      tree({ "src/lib/write.ts": 'client.from("games").insert({ title: "x" }).select("*");' }),
    );

    expect(empty.status).toBe(1);
    expect(output(empty)).toContain("refusing an empty games-read scan");
    expect(writes.status).toBe(1);
    expect(output(writes)).toContain("refusing a zero-read scan");
  });

  it("passes the real repository, including createGame's insert().select()", () => {
    const result = runGuard(GUARD);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/All [1-9]\d* `games` read\(s\)/);
  });
});
