import { describe, expect, it } from "vitest";
import { newGameSchema, parseAuthors } from "./index";

/**
 * Guardrail unit tests for the add-game validation layer. No network and no
 * Supabase client: we exercise the exported zod schema and author parser
 * directly, the way the POST handler feeds them.
 */

const validInput = {
  title: "Azul",
  authors: ["Michael Kiesling"],
  genre: "Abstract",
  minPlayers: "2",
  maxPlayers: "4",
  avgPlayMinutes: "30",
  loanStatus: "available",
};

describe("parseAuthors", () => {
  it("splits a comma-separated field into a trimmed array", () => {
    expect(parseAuthors("A, B")).toEqual(["A", "B"]);
  });

  it("splits on newlines and drops empty entries", () => {
    expect(parseAuthors("A\n\nB , ")).toEqual(["A", "B"]);
  });

  it("returns an empty array for null or non-string input", () => {
    expect(parseAuthors(null)).toEqual([]);
  });
});

describe("newGameSchema", () => {
  it("accepts a valid payload and coerces numbers", () => {
    const result = newGameSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.minPlayers).toBe(2);
    expect(result.data.maxPlayers).toBe(4);
    expect(result.data.avgPlayMinutes).toBe(30);
    expect(result.data.loanStatus).toBe("available");
  });

  it("defaults loanStatus to available when omitted", () => {
    const { loanStatus: _omit, ...rest } = validInput;
    const result = newGameSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.loanStatus).toBe("available");
  });

  it("rejects an empty title", () => {
    const result = newGameSchema.safeParse({ ...validInput, title: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects maxPlayers < minPlayers", () => {
    const result = newGameSchema.safeParse({ ...validInput, minPlayers: "4", maxPlayers: "2" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0].message).toMatch(/greater than or equal/i);
  });

  it("rejects non-positive play minutes", () => {
    const result = newGameSchema.safeParse({ ...validInput, avgPlayMinutes: "0" });
    expect(result.success).toBe(false);
  });
});
