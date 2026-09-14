import { afterAll, describe, expect, it } from "vitest";

import { makeTree, removeTree, runGuard } from "./guardHarness";

const trees: string[] = [];
const tree = (files: Record<string, string>) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
const output = (result: ReturnType<typeof runGuard>) => `${result.stdout}${result.stderr}`;

afterAll(() => {
  trees.forEach(removeTree);
});

describe("check-games-read-guard", () => {
  it("reports unguarded and unrecognised read chains while ignoring writes", () => {
    const result = runGuard(
      "scripts/check-games-read-guard.mjs",
      tree({
        "src/lib/unguarded.ts": 'client.from("games").select("*");',
        "src/lib/split.ts": 'const query = client.from("games");\nquery.select("*");',
        "src/lib/write.ts": 'client.from("games").insert({ title: "x" }).select("*");',
      }),
    );

    expect(result.status).toBe(1);
    expect(output(result)).toContain("src/lib/unguarded.ts");
    expect(output(result)).toContain("src/lib/split.ts");
    expect(output(result)).toContain("Unguarded `games` reads found");
    expect(output(result)).toContain("query chains this check could not read");
    expect(output(result)).not.toContain("src/lib/write.ts");
  });

  it("accepts guarded reads and writes", () => {
    const result = runGuard(
      "scripts/check-games-read-guard.mjs",
      tree({
        "src/lib/query.ts":
          'client.from("games").select("*").is("deleted_at", null);\nclient.from("games").insert({ title: "x" }).select("*");',
      }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("All 1 `games` read(s)");
  });

  it("refuses empty and write-only source trees", () => {
    const empty = runGuard("scripts/check-games-read-guard.mjs", tree({ "src/.keep": "" }));
    const writes = runGuard(
      "scripts/check-games-read-guard.mjs",
      tree({ "src/lib/write.ts": 'client.from("games").insert({ title: "x" }).select("*");' }),
    );

    expect(empty.status).toBe(1);
    expect(output(empty)).toContain("refusing an empty games-read scan");
    expect(writes.status).toBe(1);
    expect(output(writes)).toContain("refusing a zero-read scan");
  });

  it("does not let comments, as const, or indirect table names bypass the guard", () => {
    const result = runGuard(
      "scripts/check-games-read-guard.mjs",
      tree({
        "src/lib/comment.ts": 'client.from("games").select("*") /* .is("deleted_at", null) */;',
        "src/lib/as-const.ts": 'client.from("games" as const).select("*");',
        "src/lib/indirect.ts": 'const table = "games"; client.from(table).select("*"); Array.from([]);',
        "src/lib/url.ts": 'client.from("games").select("*").eq("url", "https://x//y").is("deleted_at", null);',
      }),
    );

    expect(result.status).toBe(1);
    expect(output(result)).toContain("src/lib/comment.ts");
    expect(output(result)).toContain("src/lib/as-const.ts");
    expect(output(result)).toContain("src/lib/indirect.ts");
    expect(output(result)).toContain("Indirect `games` table names found");
  });
});
