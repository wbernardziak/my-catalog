import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "guard-fixture-"));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export function runGuard(script: string, root?: string) {
  const args = [script];
  if (root) args.push(`--root=${root}`);
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
