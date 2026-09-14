import { afterAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot } from "./guardHarness";

// Every path resolves against the repo root, so the test does not depend on the runner's cwd.
const at = (path: string) => join(repoRoot, path);
const read = (file: string) => readFileSync(at(file), "utf8");
const HOOK = ".claude/hooks/quality-gate.sh";
const PRE_COMMIT = ".husky/pre-commit";

/** Lines that carry content, with comment lines dropped so they count neither as keys nor steps. */
const contentLines = (source: string) => source.split("\n").filter((line) => !/^\s*#/.test(line));

/**
 * Job blocks of a workflow, keyed by job name. A job key is a two-space-indented key after `jobs:`;
 * its block runs to the next job key. Only `run:` commands are kept, so a match elsewhere in the
 * file (a comment, an `on:` key, another job) cannot satisfy an assertion.
 */
function workflowJobs(source: string): Map<string, string[]> {
  const lines = contentLines(source);
  const jobs = new Map<string, string[]>();
  let current: string[] | undefined;
  if (!lines.includes("jobs:")) return jobs;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    const key = /^ {2}([a-z][\w-]*):\s*$/.exec(line);
    if (key) {
      current = [];
      jobs.set(key[1], current);
      continue;
    }
    const run = /^\s*(?:- )?run:\s*(.+?)\s*$/.exec(line);
    if (run && current) current.push(run[1]);
  }
  return jobs;
}

/** Index modes from one `git ls-files -s`, which reflect what CI checks out. */
const gitModes = new Map(
  execFileSync("git", ["ls-files", "-s", PRE_COMMIT, HOOK], { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => {
      const [mode, , , path] = line.split(/\s+/);
      return [path, mode] as const;
    }),
);

const scratch = mkdtempSync(join(tmpdir(), "gate-wiring-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("gate wiring", () => {
  const ci = read(".github/workflows/ci.yml");
  const jobs = workflowJobs(ci);

  it("runs every hermetic gate inside the ci job", () => {
    const onBlock = contentLines(ci.slice(0, ci.indexOf("\njobs:")));
    expect(onBlock).toContain("  pull_request:");
    expect(jobs.has("ci")).toBe(true);
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
      expect(jobs.get("ci"), command).toContain(command);
  });

  it("runs the database suite against a real stack in the db-tests job", () => {
    const runs = jobs.get("db-tests") ?? [];
    expect(runs.some((command) => command.startsWith("npx supabase start"))).toBe(true);
    expect(runs).toContain("npm run test:db");
  });

  it("keeps the gate scripts in package.json", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

    expect(scripts.prepare).toBe("husky");
    expect(scripts.typecheck).toBe("tsc --noEmit");
    expect(scripts.lint).toMatch(/^eslint\b/);
    for (const [name, file] of [
      ["lint:colors", "scripts/check-color-literals.mjs"],
      ["lint:contrast", "scripts/check-contrast.mjs"],
      ["lint:reads", "scripts/check-games-read-guard.mjs"],
    ]) {
      expect(scripts[name], name).toBe(`node ${file}`);
      expect(existsSync(at(file)), file).toBe(true);
    }
    expect(scripts.test).toContain("--project unit");
    expect(scripts.test).not.toContain("passWithNoTests");
    expect(scripts["test:db"]).toContain("--project db");
  });

  it("grades staged code with eslint, typecheck and the unit suite", async () => {
    const config = (await import(pathToFileURL(at("lint-staged.config.js")).href)) as {
      default: Record<string, unknown>;
    };
    const task = config.default["*.{ts,tsx,astro}"];
    expect(typeof task).toBe("function");

    const commands = (task as (files: string[]) => string[])(["a.ts"]);
    expect(commands.some((command) => command.startsWith("eslint --fix") && command.includes("a.ts"))).toBe(true);
    expect(commands).toContain("npm run typecheck");
    expect(commands).toContain("npm test");
  });

  it("runs lint-staged from an executable husky hook", () => {
    expect(read(PRE_COMMIT)).toContain("lint-staged");
    expect(gitModes.get(PRE_COMMIT)).toBe("100755");
  });

  it("registers the quality gate on the Stop event", () => {
    const settings = JSON.parse(read(".claude/settings.json")) as {
      hooks?: { Stop?: { hooks?: { command?: string }[] }[] };
    };
    const commands = (settings.hooks?.Stop ?? []).flatMap((entry) => entry.hooks ?? []).map((hook) => hook.command);

    expect(commands.some((command) => command?.endsWith(HOOK))).toBe(true);
    expect(existsSync(at(HOOK))).toBe(true);
  });

  it("keeps the Stop hook executable, parseable and loop-guarded", () => {
    expect(gitModes.get(HOOK)).toBe("100755");
    expect(spawnSync("bash", ["-n", HOOK], { cwd: repoRoot }).status).toBe(0);

    // A fresh project dir with an unreachable git dir: the gate cannot pass on its own, so an
    // exit 0 can only come from the loop guard — which the `{}` case proves by exiting 2.
    const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch, GIT_DIR: join(scratch, "missing-git") };
    // The timeout bounds the damage if the guards ever fail to stop the hook reaching `npm test`.
    const hook = (input: string) =>
      spawnSync("bash", [HOOK], { cwd: repoRoot, input, env, encoding: "utf8", timeout: 10_000 }).status;

    expect(hook('{"stop_hook_active":true}')).toBe(0);
    expect(hook("{}")).toBe(2);
  });
});
