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

describe("check-color-literals", () => {
  it("reports every known colour-literal rule and fixture file", () => {
    const result = runGuard(
      "scripts/check-color-literals.mjs",
      tree({
        "src/components/tailwind.astro": '<div class="bg-red-500" />',
        "src/lib/raw.ts": 'const colour = "#1d3b32";',
        "src/styles/inline.css": "a { color: red; }",
      }),
    );

    expect(result.status).toBe(1);
    expect(output(result)).toContain("src/components/tailwind.astro");
    expect(output(result)).toContain("src/lib/raw.ts");
    expect(output(result)).toContain("src/styles/inline.css");
    expect(output(result)).toContain("[tailwind-colour-utility]");
    expect(output(result)).toContain("[raw-colour-literal]");
    expect(output(result)).toContain("[inline-style-colour]");
  });

  it("accepts token roles and exempt token files", () => {
    const result = runGuard(
      "scripts/check-color-literals.mjs",
      tree({
        "src/components/card.astro": '<div class="bg-card text-foreground" />',
        "src/styles/global.css": ":root { --card: #123456; }",
        "src/components/BrandMark.astro": '<svg fill="#123456" />',
      }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/No colour literals in [1-9]/);
  });

  it("refuses empty and missing source trees for distinct reasons", () => {
    const empty = runGuard("scripts/check-color-literals.mjs", tree({ "src/.keep": "" }));
    const missing = runGuard("scripts/check-color-literals.mjs", tree({ "README.md": "fixture" }));

    expect(empty.status).toBe(1);
    expect(output(empty)).toContain("refusing an empty colour scan");
    expect(output(empty)).not.toContain("No colour literals");
    expect(missing.status).toBe(1);
    expect(output(missing)).toContain("No src/ under");
    expect(output(missing)).not.toContain("No colour literals");
  });
});
