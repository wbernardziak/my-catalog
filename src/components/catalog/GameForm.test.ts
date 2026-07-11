import { describe, expect, it } from "vitest";
import { fromRow } from "./GameForm";
import type { GameRow } from "@/types";

/**
 * `fromRow` is the single place a stored `GameRow` becomes the string-shaped
 * `GameFormValues` the inline edit form prefills with. It must join authors,
 * stringify every number, and pass loan status through so edit prefill and the
 * server schema never drift.
 */

const row: GameRow = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Wingspan",
  authors: ["Elizabeth Hargrave", "Ana María Martínez"],
  genre: "Strategy",
  min_players: 1,
  max_players: 5,
  avg_play_minutes: 70,
  loan_status: "loaned",
  created_by: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
  deleted_at: null,
};

describe("fromRow", () => {
  it("maps a stored row to string-shaped form values", () => {
    expect(fromRow(row)).toEqual({
      title: "Wingspan",
      authors: "Elizabeth Hargrave, Ana María Martínez",
      genre: "Strategy",
      minPlayers: "1",
      maxPlayers: "5",
      avgPlayMinutes: "70",
      loanStatus: "loaned",
    });
  });

  it("renders empty authors as an empty string", () => {
    expect(fromRow({ ...row, authors: [] }).authors).toBe("");
  });
});
