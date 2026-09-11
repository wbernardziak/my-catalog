import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, locationOf, testUser } from "@/test/apiContext";
import { createSupabaseDouble, type SupabaseDouble } from "@/test/supabaseDouble";

/**
 * Request-level contract for the API boundary (test-plan phase 1, risks #2/#4).
 *
 * `/api/*` is NOT middleware-gated — `src/middleware.ts:5` lists page prefixes
 * only — so each handler's own `if (!context.locals.user)` block is the only
 * auth gate, hand-copied into seven files. These tests drive the real handlers
 * and assert both halves of a denial: the response the caller gets, AND that no
 * write reached Supabase. A redirect alone would not prove the second.
 */

// `vi.mock` is hoisted above imports, so the double is reached through a holder
// rather than captured at module scope.
const holder = vi.hoisted((): { client: unknown } => ({ client: null }));

vi.mock("@/lib/supabase", () => ({
  createClient: () => holder.client,
}));

const { POST: createGame } = await import("./index");

const VALID_GAME = {
  title: "Brass Birmingham",
  authors: "Martin Wallace",
  genre: "Strategy",
  minPlayers: "2",
  maxPlayers: "4",
  avgPlayMinutes: "120",
  loanStatus: "available",
};

let double: SupabaseDouble;

beforeEach(() => {
  double = createSupabaseDouble({ results: { games: { data: { id: "game-1" } } } });
  holder.client = double.client;
});

describe("POST /api/games", () => {
  it("denies an unauthenticated caller and writes nothing", async () => {
    const response = await createGame(createApiContext({ user: null, form: VALID_GAME }));

    expect(locationOf(response)).toBe("/auth/signin");
    expect(double.writeSummary()).toEqual([]);
  });

  // The positive case is what makes the assertion above meaningful: without it,
  // an unfired write spy could simply mean the double was wired up wrong.
  it("persists a valid game for a signed-in member", async () => {
    const response = await createGame(createApiContext({ user: testUser(), form: VALID_GAME }));

    expect(locationOf(response)).toBe("/catalog");
    expect(double.writeSummary()).toEqual(["games.insert"]);
  });
});
