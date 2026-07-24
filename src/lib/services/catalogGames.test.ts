import { describe, expect, it } from "vitest";
import type { GameRow } from "@/types";
import { mergeAndFilterCatalog, type MemberState } from "./catalogGames";

/**
 * Unit tests for the pure catalog view-model core. No Supabase: we feed
 * `mergeAndFilterCatalog` plain rows + a member-state snapshot the way
 * `listCatalogGames` does after its DB fetch. The DB wrapper itself is verified
 * manually (consistent with the codebase not mocking Supabase).
 */

function makeRow(id: string, overrides: Partial<GameRow> = {}): GameRow {
  return {
    id,
    title: `Game ${id}`,
    authors: [],
    genre: "Strategy",
    min_players: 2,
    max_players: 4,
    avg_play_minutes: 30,
    loan_status: "available",
    created_by: "member-x",
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

const rows = [makeRow("a"), makeRow("b"), makeRow("c")];

// Member played a + b; liked a, disliked b. c is unplayed.
const state: MemberState = {
  played: new Set(["a", "b"]),
  preference: new Map([
    ["a", "liked"],
    ["b", "disliked"],
  ]),
};

describe("mergeAndFilterCatalog", () => {
  it("merges played flag and preference (null when unplayed) onto each row", () => {
    const result = mergeAndFilterCatalog(rows, state, {});
    expect(result).toHaveLength(3);
    expect(result.map((g) => [g.id, g.played, g.preference])).toEqual([
      ["a", true, "liked"],
      ["b", true, "disliked"],
      ["c", false, null],
    ]);
  });

  it("gives a played game with no recorded preference a null preference", () => {
    const s: MemberState = { played: new Set(["a"]), preference: new Map() };
    const [game] = mergeAndFilterCatalog([makeRow("a")], s, {});
    expect(game.played).toBe(true);
    expect(game.preference).toBeNull();
  });

  it("filters to played games only", () => {
    const result = mergeAndFilterCatalog(rows, state, { played: true });
    expect(result.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("filters to not-played games only", () => {
    const result = mergeAndFilterCatalog(rows, state, { played: false });
    expect(result.map((g) => g.id)).toEqual(["c"]);
  });

  it("filters by preference exactly (unplayed rows never match)", () => {
    expect(mergeAndFilterCatalog(rows, state, { preference: "liked" }).map((g) => g.id)).toEqual(["a"]);
    expect(mergeAndFilterCatalog(rows, state, { preference: "disliked" }).map((g) => g.id)).toEqual(["b"]);
  });

  it("combines played and preference filters as AND", () => {
    expect(mergeAndFilterCatalog(rows, state, { played: true, preference: "liked" }).map((g) => g.id)).toEqual(["a"]);
    // played=false + a preference can never match (unplayed => null preference)
    expect(mergeAndFilterCatalog(rows, state, { played: false, preference: "liked" })).toEqual([]);
  });

  it("returns every row unchanged when no per-member filter is set", () => {
    expect(mergeAndFilterCatalog(rows, state, { genre: "Strategy" }).map((g) => g.id)).toEqual(["a", "b", "c"]);
  });
});
