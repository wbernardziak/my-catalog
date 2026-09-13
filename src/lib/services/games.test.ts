import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseDouble, type SupabaseDouble } from "@/test/supabaseDouble";
import { listGames, listGenres, setLoan, softDeleteGame, updateGame } from "./games";

/**
 * The cheap half of Risk #6 — and it is only a half, so read this before
 * trusting a green run.
 *
 * These tests assert the SHAPE of the queries `games.ts` issues: that
 * `is(deleted_at, null)` is present in the chain. They prove NOTHING about row
 * visibility. The double honours no filters and resolves to canned data
 * regardless of what was chained (`src/test/supabaseDouble.ts:126`), so a query
 * asking for live rows and one asking for everything come back identical here.
 * The behavioural proof — that the database actually withholds a deleted game
 * under every filter combination — lives in `src/test/db/catalogIntegrity.test.ts`.
 *
 * This file exists because that one cannot run in `npm test`: the db project
 * needs Docker and a local Supabase stack, so it is a separate CI job and never
 * runs in the local edit loop. The commonest regression by far is someone simply
 * deleting the `.is()` call, and that deserves to fail in milliseconds rather
 * than waiting for the `db-tests` job. This is the phase-1 `filterLog` pattern
 * (`context/archive/2026-09-11-testing-api-boundary-contract/reviews/impl-review.md:56-70`)
 * applied to reads instead of writes.
 */

const LIVE_PREDICATE = "is(deleted_at, null)";

let double: SupabaseDouble;

beforeEach(() => {
  // List helpers unwrap `data` as an array; the `maybeSingle` writers read it as
  // a row. One entry per shape, since every query against `games` resolves to
  // the same canned value.
  double = createSupabaseDouble({ results: { games: { data: [] } } });
});

describe("read paths scope themselves to live rows", () => {
  it("listGames issues the live-row predicate", async () => {
    await listGames(double.serviceClient, {});

    expect(double.filterSummary()).toContain(LIVE_PREDICATE);
  });

  it("listGenres issues it too — the second, independently repeated call site", async () => {
    await listGenres(double.serviceClient);

    expect(double.filterSummary()).toContain(LIVE_PREDICATE);
  });

  it("keeps the predicate when every filter is applied at once", async () => {
    await listGames(double.serviceClient, {
      genre: "Strategy",
      players: 4,
      maxMinutes: 90,
      loanStatus: "loaned",
    });

    const filters = double.filterSummary();

    // The predicate survives the densest chain — no branch replaces the builder.
    expect(filters).toContain(LIVE_PREDICATE);
    expect(filters).toContain("eq(genre, Strategy)");
    expect(filters).toContain("lte(min_players, 4)");
    expect(filters).toContain("gte(max_players, 4)");
    expect(filters).toContain("lte(avg_play_minutes, 90)");
    expect(filters).toContain("eq(loan_status, loaned)");
  });
});

/**
 * The write guards are a different guarantee wearing the same predicate: they
 * are what stops a concurrent delete from resurrecting or re-stamping a row.
 * `boundary.test.ts:219-231` already covers the `eq(id, …)` half (the
 * mass-delete guard); this covers the `is(deleted_at, null)` half next to it.
 */
describe("write guards refuse to touch an already-deleted row", () => {
  beforeEach(() => {
    double = createSupabaseDouble({ results: { games: { data: { id: "game-1" } } } });
  });

  it("updateGame scopes to a live row by id", async () => {
    await updateGame(double.serviceClient, "game-1", {
      title: "Brass Birmingham",
      authors: ["Martin Wallace"],
      genre: "Strategy",
      minPlayers: 2,
      maxPlayers: 4,
      avgPlayMinutes: 120,
      loanStatus: "available",
    });

    expect(double.filterSummary()).toEqual(expect.arrayContaining(["eq(id, game-1)", LIVE_PREDICATE]));
  });

  it("setLoan scopes to a live row by id", async () => {
    await setLoan(double.serviceClient, "game-1", "loaned");

    expect(double.filterSummary()).toEqual(expect.arrayContaining(["eq(id, game-1)", LIVE_PREDICATE]));
  });

  it("softDeleteGame scopes to a live row by id", async () => {
    await softDeleteGame(double.serviceClient, "game-1");

    expect(double.filterSummary()).toEqual(expect.arrayContaining(["eq(id, game-1)", LIVE_PREDICATE]));
  });
});
