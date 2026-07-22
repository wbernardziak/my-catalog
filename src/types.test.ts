import { describe, expect, it } from "vitest";
import { mapRowToCandidateGame, type GameRow } from "@/types";

/**
 * `mapRowToCandidateGame` is the single catalog row -> `CandidateGame` mapping
 * the recommendation service (S-05) depends on. It must translate the snake_case
 * player range and leave `played`/`preference` undefined (owned by S-04).
 */

const row: GameRow = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Codenames",
  authors: ["Vlaada Chvátil"],
  genre: "Party",
  min_players: 4,
  max_players: 8,
  avg_play_minutes: 15,
  loan_status: "available",
  created_by: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
};

describe("mapRowToCandidateGame", () => {
  it("maps snake_case fields into the CandidateGame range shape", () => {
    expect(mapRowToCandidateGame(row)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Codenames",
      genre: "Party",
      minPlayers: 4,
      maxPlayers: 8,
      averagePlayMinutes: 15,
    });
  });

  it("leaves played and preference undefined without state", () => {
    const candidate = mapRowToCandidateGame(row);
    expect(candidate.played).toBeUndefined();
    expect(candidate.preference).toBeUndefined();
  });

  it("populates played and preference from state when provided", () => {
    const candidate = mapRowToCandidateGame(row, { played: true, preference: "liked" });
    expect(candidate.played).toBe(true);
    expect(candidate.preference).toBe("liked");
  });

  it("sets played but leaves preference undefined when state omits it", () => {
    const candidate = mapRowToCandidateGame(row, { played: false });
    expect(candidate.played).toBe(false);
    expect(candidate.preference).toBeUndefined();
  });
});
