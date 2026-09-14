import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { makeTree, removeTree, runGuard } from "./guardHarness";

const trees: string[] = [];
const tree = (files: Record<string, string>) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
const css = readFileSync("src/styles/global.css", "utf8");
const themes = readFileSync("src/lib/theme.ts", "utf8");
afterAll(() => {
  trees.forEach(removeTree);
});

describe("check-contrast", () => {
  it("accepts the real stylesheet baseline", () => {
    const result = runGuard(
      "scripts/check-contrast.mjs",
      tree({
        "src/styles/global.css": css,
        "src/lib/theme.ts": themes,
        "src/components/title.astro": '<h1 class="bg-clip-text" />',
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Contrast OK: 87 assertions");
  });

  it("reports registry and gradient drift", () => {
    const result = runGuard(
      "scripts/check-contrast.mjs",
      tree({
        "src/styles/global.css": css,
        "src/lib/theme.ts": themes.replace('"punchboard"', '"punchboard", "neon"'),
        "src/components/title.astro": '<h1 class="bg-clip-text" />',
        "src/components/extra.astro": '<h2 class="bg-clip-text" />',
      }),
    );
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("theme `neon`");
    expect(`${result.stdout}${result.stderr}`).toContain("bg-clip-text count 2");
  });
});
