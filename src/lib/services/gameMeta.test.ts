import { describe, expect, it } from "vitest";
import { duration, MAX_PIPS, playerPips } from "./gameMeta";

/**
 * The badges are the one place a catalog row can lie: a game saved without a
 * player count must not render as "1 player", and a reversed range must not draw
 * an empty row that reads as "nobody can play this".
 */

const filled = (p: ReturnType<typeof playerPips>) => p.pips.filter((s) => s === "supported").length;

describe("playerPips", () => {
  it("fills the supported seats and leaves the rest hollow", () => {
    const result = playerPips(2, 4);
    expect(result.pips).toHaveLength(MAX_PIPS);
    expect(result.pips.slice(0, 4)).toEqual(["unsupported", "supported", "supported", "supported"]);
    expect(filled(result)).toBe(3);
    expect(result.label).toBe("2–4 players");
    expect(result.overflow).toBe(false);
  });

  it("handles a single-count game", () => {
    const result = playerPips(2, 2);
    expect(filled(result)).toBe(1);
    expect(result.label).toBe("2 players");
  });

  it("marks overflow when the range runs past the pip row", () => {
    const result = playerPips(2, 8);
    expect(result.pips).toHaveLength(MAX_PIPS);
    expect(result.overflow).toBe(true);
    expect(result.label).toBe("2–8+ players");
  });

  it("falls back to unknown for missing values", () => {
    for (const result of [playerPips(null, null), playerPips(undefined, undefined)]) {
      expect(result.pips).toEqual([]);
      expect(result.label).toBe("Players unknown");
    }
  });

  it("treats zero and negative counts as unusable", () => {
    expect(playerPips(0, 0).label).toBe("Players unknown");
    expect(playerPips(-2, -1).label).toBe("Players unknown");
  });

  it("infers the missing end of a half-filled range", () => {
    expect(playerPips(2, null).label).toBe("2 players");
    expect(playerPips(null, 4).label).toBe("4 players");
  });

  it("degrades a reversed range instead of drawing an empty row", () => {
    const result = playerPips(5, 2);
    expect(result.pips).toEqual([]);
    expect(result.label).toBe("Players unknown");
  });

  it("ignores non-numeric input", () => {
    expect(playerPips("2", "4").label).toBe("Players unknown");
    expect(playerPips(Number.NaN, Number.NaN).label).toBe("Players unknown");
  });
});

describe("duration", () => {
  it("buckets at the boundaries, inclusive of the lower bucket", () => {
    expect(duration(30).bucket).toBe("quick");
    expect(duration(31).bucket).toBe("short");
    expect(duration(60).bucket).toBe("short");
    expect(duration(61).bucket).toBe("medium");
    expect(duration(120).bucket).toBe("medium");
    expect(duration(121).bucket).toBe("long");
  });

  it("labels with the real minute count", () => {
    expect(duration(45).label).toBe("~45 min");
    expect(duration(45).pips).toBe(2);
  });

  it("returns the unknown state for missing, zero, and invalid play time", () => {
    for (const value of [null, undefined, 0, -15, Number.NaN, "30"]) {
      const result = duration(value);
      expect(result.bucket).toBe("unknown");
      expect(result.pips).toBeNull();
      expect(result.label).toBe("Play time unknown");
    }
  });
});
