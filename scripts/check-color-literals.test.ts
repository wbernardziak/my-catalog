import { afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { spawnSync } from "node:child_process";

import { makeTree, removeTree, runGuard } from "./guardHarness";

const trees: string[] = [];
const tree = (files: Record<string, string>) => {
  const root = makeTree(files);
  trees.push(root);
  return root;
};
const output = (result: ReturnType<typeof runGuard>) => `${result.stdout}${result.stderr}`;
const require = createRequire(import.meta.url);
const themeCss = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
// Tailwind marks this API unstable. If it changes, fail loudly and replace this
// oracle with hand-written fixtures rather than deleting the coverage.
const designSystem = await __unstable__loadDesignSystem(themeCss);
const classNames = designSystem.getClassList().map(([name]) => name);
const families = [...new Set(classNames.flatMap((name) => /^bg-(.+)-500$/.exec(name)?.[1] ?? []))];
const roots = [...new Set(classNames.flatMap((name) => /^(.+)-red-500$/.exec(name)?.[1] ?? []))];

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

  it("reports every Tailwind colour family without mirroring the guard parser", () => {
    expect(families.length).toBeGreaterThanOrEqual(20);
    const lines = [
      ...families.map((family) => `bg-${family}-500`),
      "bg-white",
      "bg-black",
      "hover:bg-mauve-500",
      "text-olive-700/70",
    ];
    const result = runGuard("scripts/check-color-literals.mjs", tree({ "src/lib/families.ts": lines.join("\n") }));

    expect(result.status).toBe(1);
    lines.forEach((_, index) => {
      expect(output(result)).toContain(`src/lib/families.ts:${index + 1}`);
    });
  });

  it("reports every Tailwind colour utility root", () => {
    expect(roots.length).toBeGreaterThanOrEqual(30);
    const result = runGuard(
      "scripts/check-color-literals.mjs",
      tree({ "src/lib/roots.ts": roots.map((root) => `${root}-red-500`).join("\n") }),
    );

    expect(result.status).toBe(1);
    roots.forEach((_, index) => {
      expect(output(result)).toContain(`src/lib/roots.ts:${index + 1}`);
    });
  });

  it("keeps sentinels for known Tailwind holes", () => {
    const result = runGuard(
      "scripts/check-color-literals.mjs",
      tree({
        "src/lib/sentinels.ts": "bg-mauve-500\ntext-olive-700\nborder-s-red-500\nborder-e-red-500",
      }),
    );

    expect(result.status).toBe(1);
    expect(output(result)).toContain("src/lib/sentinels.ts:1");
    expect(output(result)).toContain("src/lib/sentinels.ts:2");
    expect(output(result)).toContain("src/lib/sentinels.ts:3");
    expect(output(result)).toContain("src/lib/sentinels.ts:4");
  });

  it("rejects unknown command-line arguments", () => {
    const result = spawnSync(process.execPath, ["scripts/check-color-literals.mjs", "typo"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
