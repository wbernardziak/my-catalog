import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { makeTree, removeTree, runGuard } from "./guardHarness";

const trees: string[] = [];
const output = (result: ReturnType<typeof runGuard>) => `${result.stdout}${result.stderr}`;
afterAll(() => {
  trees.forEach(removeTree);
});

// The real design is the known-good baseline; each test applies one mutation to a copy of it.
const css = readFileSync("src/styles/global.css", "utf8");
const themes = readFileSync("src/lib/theme.ts", "utf8");
const heading = '<h1 class="bg-clip-text" />';

const guard = (overrides: Record<string, string> = {}) => {
  const root = makeTree({
    "src/styles/global.css": css,
    "src/lib/theme.ts": themes,
    "src/components/title.astro": heading,
    ...overrides,
  });
  trees.push(root);
  return runGuard("scripts/check-contrast.mjs", root);
};

/** The body of the `.theme-shelf` rule, located by its opening line. */
const shelfBlock = () => {
  const start = css.indexOf(".theme-shelf {");
  return css.slice(start, css.indexOf("\n}", start) + 2);
};

describe("check-contrast", () => {
  it("accepts the real stylesheet baseline", () => {
    const result = guard();

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Contrast OK: [1-9]\d* assertions across 3 themes/);
  });

  it("reports a registered theme with no entry and an entry that is no longer registered", () => {
    expect(themes).toContain('"shelf", ');
    const result = guard({
      "src/lib/theme.ts": themes.replace('"shelf", ', "").replace('"punchboard"', '"punchboard", "neon"'),
      "src/styles/global.css": `${css}\n${shelfBlock().replace(".theme-shelf", ".theme-neon")}`,
    });

    expect(result.status).toBe(1);
    expect(output(result)).toContain("theme `neon` is registered in src/lib/theme.ts but has no contrast entry");
    expect(output(result)).toContain("theme `shelf` has a contrast entry but is not registered");
  });

  it("reports a gradient heading missing from the checked list", () => {
    const result = guard({ "src/components/extra.astro": '<h2 class="bg-clip-text" />' });

    expect(result.status).toBe(1);
    expect(output(result)).toContain("bg-clip-text count 2 differs from GRADIENT_TEXT entries 1");
  });

  it("reports ink identical to its ground as a 1:1 failure", () => {
    // WCAG is the oracle: identical colours are 1:1. `--background`, not `--card`, because the
    // card context rule re-points `--foreground` on the card surface.
    const block = shelfBlock();
    const background = /\n\s*--background:\s*([^;]+);/.exec(block)?.[1];
    expect(background).toBeDefined();
    const mutated = block.replace(/(\n\s*--foreground:\s*)[^;]+;/, `$1${background};`);
    expect(mutated).not.toBe(block);

    const result = guard({ "src/styles/global.css": css.replace(block, mutated) });

    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/Bright Shelf · ground: --foreground \S+ on --background \S+ = 1\.00:1/);
  });

  it("refuses a theme module without a parseable registry", () => {
    const result = guard({ "src/lib/theme.ts": "export const OTHER = 1;\n" });

    expect(result.status).toBe(1);
    expect(output(result)).toContain("Could not parse theme registry");
    expect(output(result)).toContain("src/lib/theme.ts");
  });
});
