import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAME_NOT_FOUND_MESSAGE } from "@/lib/services/games";

/**
 * Guardrail for the per-id endpoints' shared not-found copy. No Astro context or
 * handler mock (none exists in this project): we assert the exported constant is
 * the exact user-facing string and that every per-id endpoint references the same
 * constant, so a future edit can't let the messages drift.
 * The handler's null/false → redirect branch itself is covered by manual checks.
 */

const here = dirname(fileURLToPath(import.meta.url));

const PER_ID_ENDPOINTS = [
  ["[id].ts"],
  ["[id]", "delete.ts"],
  ["[id]", "played.ts"],
  ["[id]", "preference.ts"],
  ["[id]", "loan.ts"],
];

describe("GAME_NOT_FOUND_MESSAGE", () => {
  it("is the exact user-facing not-found string", () => {
    expect(GAME_NOT_FOUND_MESSAGE).toBe("That game no longer exists.");
  });

  it.each(PER_ID_ENDPOINTS)("is referenced by %s (no divergent copy)", (...segments) => {
    const src = readFileSync(join(here, ...segments), "utf8");
    expect(src).toContain("GAME_NOT_FOUND_MESSAGE");
  });
});
