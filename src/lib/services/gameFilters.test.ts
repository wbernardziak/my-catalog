import { describe, expect, it } from "vitest";
import { catalogRedirectTarget, parseGameFilters } from "./gameFilters";

/**
 * Guardrail unit tests for the forgiving filter parser. No network and no
 * Supabase client: we exercise `parseGameFilters` directly the way `catalog.astro`
 * feeds it `Astro.url.searchParams`. The DB predicate itself is not unit-tested
 * (consistent with the codebase not mocking Supabase).
 */

const params = (init: Record<string, string>) => new URLSearchParams(init);

describe("parseGameFilters", () => {
  it("parses a full set of valid params into GameFilters", () => {
    const result = parseGameFilters(params({ genre: "Strategy", players: "3", maxMinutes: "60", loan: "available" }));
    expect(result).toEqual({ genre: "Strategy", players: 3, maxMinutes: 60, loanStatus: "available" });
  });

  it("returns an empty object for empty params", () => {
    expect(parseGameFilters(params({}))).toEqual({});
  });

  it("trims a genre and drops a whitespace-only genre", () => {
    expect(parseGameFilters(params({ genre: "  Party  " }))).toEqual({ genre: "Party" });
    expect(parseGameFilters(params({ genre: "   " }))).toEqual({});
  });

  it("drops a non-numeric players value while keeping valid siblings", () => {
    expect(parseGameFilters(params({ players: "abc", genre: "Strategy" }))).toEqual({ genre: "Strategy" });
  });

  it("drops an out-of-range players value (below 1 and above 99)", () => {
    expect(parseGameFilters(params({ players: "0" }))).toEqual({});
    expect(parseGameFilters(params({ players: "100" }))).toEqual({});
  });

  it("drops a non-integer players value", () => {
    expect(parseGameFilters(params({ players: "2.5" }))).toEqual({});
  });

  it("drops a negative or out-of-range maxMinutes while keeping valid siblings", () => {
    expect(parseGameFilters(params({ maxMinutes: "-5", loan: "loaned" }))).toEqual({ loanStatus: "loaned" });
    expect(parseGameFilters(params({ maxMinutes: "6001" }))).toEqual({});
  });

  it("drops an unknown loan status", () => {
    expect(parseGameFilters(params({ loan: "foo" }))).toEqual({});
  });

  it("drops every bad param individually and applies only the valid ones", () => {
    const result = parseGameFilters(params({ players: "abc", maxMinutes: "-5", loan: "foo", genre: "Co-op" }));
    expect(result).toEqual({ genre: "Co-op" });
  });

  it("drops empty-string values (empty inputs submitted by the form)", () => {
    expect(
      parseGameFilters(params({ genre: "", players: "", maxMinutes: "", loan: "", played: "", preference: "" })),
    ).toEqual({});
  });

  it("parses the per-member played tri-state into a boolean", () => {
    expect(parseGameFilters(params({ played: "true" }))).toEqual({ played: true });
    expect(parseGameFilters(params({ played: "false" }))).toEqual({ played: false });
  });

  it("drops an unknown played value", () => {
    expect(parseGameFilters(params({ played: "maybe" }))).toEqual({});
  });

  it("parses a valid preference and drops an unknown one", () => {
    expect(parseGameFilters(params({ preference: "liked" }))).toEqual({ preference: "liked" });
    expect(parseGameFilters(params({ preference: "disliked" }))).toEqual({ preference: "disliked" });
    expect(parseGameFilters(params({ preference: "meh" }))).toEqual({});
  });
});

describe("catalogRedirectTarget", () => {
  it("returns the bare catalog path when no filters were posted", () => {
    expect(catalogRedirectTarget(null)).toBe("/catalog");
    expect(catalogRedirectTarget("")).toBe("/catalog");
  });

  it("preserves the posted filters so a toggle stays on the same view", () => {
    const target = catalogRedirectTarget("played=false&genre=Strategy");
    expect(target.startsWith("/catalog?")).toBe(true);
    expect(new URL(target, "https://x.test").searchParams.get("played")).toBe("false");
    expect(new URL(target, "https://x.test").searchParams.get("genre")).toBe("Strategy");
  });

  it("appends the error message alongside the filters", () => {
    const url = new URL(catalogRedirectTarget("genre=Party", "Nope."), "https://x.test");
    expect(url.searchParams.get("genre")).toBe("Party");
    expect(url.searchParams.get("error")).toBe("Nope.");
  });

  it("drops unknown keys and never leaves the catalog path", () => {
    expect(catalogRedirectTarget("evil=1&next=https://evil.test")).toBe("/catalog");
    expect(catalogRedirectTarget("https://evil.test")).toBe("/catalog");
  });
});
