import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAME_NOT_FOUND_MESSAGE } from "@/lib/services/games";

/**
 * Guardrail for the per-id endpoints' shared not-found copy. No Astro context or
 * handler mock (none exists in this project): we assert the exported constant is
 * the exact user-facing string and that both `[id].ts` and `[id]/delete.ts`
 * reference the same constant, so a future edit can't let the two messages drift.
 * The handler's null/false → redirect branch itself is covered by manual checks.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe("GAME_NOT_FOUND_MESSAGE", () => {
  it("is the exact user-facing not-found string", () => {
    expect(GAME_NOT_FOUND_MESSAGE).toBe("That game no longer exists.");
  });

  it("is referenced by both per-id endpoints (no divergent copy)", () => {
    const updateSrc = readFileSync(join(here, "[id].ts"), "utf8");
    const deleteSrc = readFileSync(join(here, "[id]", "delete.ts"), "utf8");
    expect(updateSrc).toContain("GAME_NOT_FOUND_MESSAGE");
    expect(deleteSrc).toContain("GAME_NOT_FOUND_MESSAGE");
  });
});
