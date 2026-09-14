import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("quality-gate wiring", () => {
  it("keeps required CI and package scripts wired", () => {
    const ci = read(".github/workflows/ci.yml");
    for (const command of [
      "npm ci",
      "npx astro sync",
      "npm run typecheck",
      "npm run lint",
      "npm run lint:colors",
      "npm run lint:contrast",
      "npm run lint:reads",
      "npm run build",
      "npm test",
    ])
      expect(ci).toContain(`- run: ${command}`);
    const scripts = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(scripts.scripts.prepare).toBe("husky");
    expect(scripts.scripts.test).toContain("--project unit");
    expect(scripts.scripts.test).not.toContain("passWithNoTests");
    for (const script of ["typecheck", "lint", "lint:colors", "lint:contrast", "lint:reads", "test:db"])
      expect(scripts.scripts[script]).toBeTruthy();
  });

  it("keeps commit and Stop hooks healthy", () => {
    expect(read(".husky/pre-commit")).toContain("lint-staged");
    expect(read(".claude/settings.json")).toContain(".claude/hooks/quality-gate.sh");
    expect(statSync(".claude/hooks/quality-gate.sh").mode & 0o111).not.toBe(0);
    expect(() => execFileSync("bash", ["-n", ".claude/hooks/quality-gate.sh"])).not.toThrow();
    const result = spawnSync("bash", [".claude/hooks/quality-gate.sh"], {
      input: '{"stop_hook_active":true}',
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: "/tmp", GIT_DIR: "/tmp/no-git" },
    });
    expect(result.status).toBe(0);
  });
});
