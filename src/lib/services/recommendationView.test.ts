import { describe, expect, it } from "vitest";
import {
  describeFailure,
  enrichRecommendations,
  parseCriteria,
  type RecommendationDisplayGame,
} from "./recommendationView";
import type { RankedRecommendation } from "@/types";

/**
 * Pure unit tests for the recommendation view module. No network, no Supabase,
 * no React — the route and island that use these helpers are covered by manual
 * verification (consistent with the rest of the app).
 */

const game = (id: string, overrides: Partial<RecommendationDisplayGame> = {}): RecommendationDisplayGame => ({
  id,
  title: `Game ${id}`,
  genre: "Strategy",
  minPlayers: 2,
  maxPlayers: 4,
  averagePlayMinutes: 60,
  loanStatus: "available",
  ...overrides,
});

describe("parseCriteria", () => {
  it("accepts a valid player count and coerces the numeric string", () => {
    const result = parseCriteria({ playerCount: "3" });
    expect(result).toEqual({ success: true, data: { playerCount: 3 } });
  });

  it("coerces optional numeric-string fields and trims genre", () => {
    const result = parseCriteria({ playerCount: "4", availableMinutes: "45", genre: "  Party  " });
    expect(result).toEqual({ success: true, data: { playerCount: 4, availableMinutes: 45, genre: "Party" } });
  });

  it("omits optional fields when blank or whitespace", () => {
    const result = parseCriteria({ playerCount: 2, availableMinutes: "", genre: "   " });
    expect(result).toEqual({ success: true, data: { playerCount: 2 } });
  });

  it("rejects a missing player count", () => {
    const result = parseCriteria({ availableMinutes: "30" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/player count/i);
  });

  it("rejects a blank player count", () => {
    expect(parseCriteria({ playerCount: "" }).success).toBe(false);
  });

  it("rejects a non-positive or non-integer player count", () => {
    expect(parseCriteria({ playerCount: "0" }).success).toBe(false);
    expect(parseCriteria({ playerCount: "-2" }).success).toBe(false);
    expect(parseCriteria({ playerCount: "2.5" }).success).toBe(false);
  });

  it("rejects a non-numeric player count", () => {
    expect(parseCriteria({ playerCount: "lots" }).success).toBe(false);
  });
});

describe("enrichRecommendations", () => {
  const candidates = [game("a"), game("b", { title: "Catan", genre: "Family" }), game("c")];

  it("joins by gameId and carries display fields from the candidate", () => {
    const recs: RankedRecommendation[] = [{ gameId: "b", reason: "Great for families", rank: 1 }];
    expect(enrichRecommendations(recs, candidates)).toEqual([
      {
        gameId: "b",
        rank: 1,
        reason: "Great for families",
        title: "Catan",
        genre: "Family",
        minPlayers: 2,
        maxPlayers: 4,
        averagePlayMinutes: 60,
        played: false,
        loanStatus: "available",
      },
    ]);
  });

  it("carries played and loan state so the card badges match a catalog card", () => {
    const rows = [game("a", { played: true, loanStatus: "loaned" })];
    const recs: RankedRecommendation[] = [{ gameId: "a", reason: "fits", rank: 1 }];
    expect(enrichRecommendations(recs, rows)[0]).toMatchObject({ played: true, loanStatus: "loaned" });
  });

  it("reads an absent played flag as not played", () => {
    const recs: RankedRecommendation[] = [{ gameId: "a", reason: "fits", rank: 1 }];
    expect(enrichRecommendations(recs, [game("a")])[0]?.played).toBe(false);
  });

  it("preserves rank order regardless of input order", () => {
    const recs: RankedRecommendation[] = [
      { gameId: "a", reason: "third", rank: 3 },
      { gameId: "c", reason: "first", rank: 1 },
      { gameId: "b", reason: "second", rank: 2 },
    ];
    expect(enrichRecommendations(recs, candidates).map((r) => r.gameId)).toEqual(["c", "b", "a"]);
  });

  it("skips a recommendation whose id is absent from the candidate list", () => {
    const recs: RankedRecommendation[] = [
      { gameId: "a", reason: "ok", rank: 1 },
      { gameId: "ghost", reason: "not in catalog", rank: 2 },
    ];
    expect(enrichRecommendations(recs, candidates).map((r) => r.gameId)).toEqual(["a"]);
  });

  it("does not mutate the input array", () => {
    const recs: RankedRecommendation[] = [
      { gameId: "a", reason: "x", rank: 2 },
      { gameId: "c", reason: "y", rank: 1 },
    ];
    enrichRecommendations(recs, candidates);
    expect(recs.map((r) => r.gameId)).toEqual(["a", "c"]);
  });
});

describe("describeFailure", () => {
  it("maps no_match to the neutral empty panel", () => {
    const result = describeFailure("no_match");
    expect(result.kind).toBe("empty");
    expect(result.message).toMatch(/no suitable game/i);
  });

  it("maps every other reason to an error panel with distinct non-empty copy", () => {
    const reasons = ["not_configured", "timeout", "provider_error", "invalid_response", "out_of_catalog"] as const;
    const messages = reasons.map((reason) => {
      const result = describeFailure(reason);
      expect(result.kind).toBe("error");
      expect(result.message.length).toBeGreaterThan(0);
      return result.message;
    });
    expect(new Set(messages).size).toBe(reasons.length);
  });
});
