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
const { POST: updateGame } = await import("./[id]");
const { POST: deleteGame } = await import("./[id]/delete");
const { POST: setLoan } = await import("./[id]/loan");
const { POST: setPlayed } = await import("./[id]/played");
const { POST: setPreference } = await import("./[id]/preference");
const { POST: recommend } = await import("../recommendations");

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

/**
 * The boundary inventory. Every endpoint that reads or mutates household data
 * belongs here — a new route is untested until it is added to this table.
 *
 * `/api/games/*` answers every failure with a 302 and an `?error=` query string
 * (the house PRG convention, decided 2026-07-09), so the expectation is a
 * redirect target. `/api/recommendations` is the one JSON endpoint.
 */
const ENDPOINTS = [
  {
    name: "POST /api/games",
    handler: createGame,
    context: { form: VALID_GAME },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/games/[id]",
    handler: updateGame,
    context: { params: { id: "game-1" }, form: VALID_GAME },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/games/[id]/delete",
    handler: deleteGame,
    context: { params: { id: "game-1" } },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/games/[id]/loan",
    handler: setLoan,
    context: { params: { id: "game-1" }, form: { loanStatus: "loaned" } },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/games/[id]/played",
    handler: setPlayed,
    context: { params: { id: "game-1" }, form: { played: "true" } },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/games/[id]/preference",
    handler: setPreference,
    context: { params: { id: "game-1" }, form: { preference: "liked" } },
    deniedLocation: "/auth/signin",
  },
  {
    name: "POST /api/recommendations",
    handler: recommend,
    context: { json: { playerCount: 3 }, url: "https://example.test/api/recommendations" },
    deniedStatus: 401,
  },
] as const;

describe("the endpoint self-gates against an unauthenticated caller", () => {
  it.each(ENDPOINTS)("$name denies and writes nothing", async ({ handler, context, deniedLocation, deniedStatus }) => {
    const response = await handler(createApiContext({ ...context, user: null }));

    if (deniedLocation !== undefined) {
      expect(locationOf(response)).toBe(deniedLocation);
    } else {
      expect(response.status).toBe(deniedStatus);
    }
    expect(double.writeSummary()).toEqual([]);
  });
});

/**
 * The app-layer half of member attribution: the member id written is the
 * session's, never a request field. The policy-layer half (RLS write-own) needs
 * the real database and belongs to rollout phase 2.
 */
describe("per-member writes are bound to the session", () => {
  const IMPERSONATION = { memberId: "member-b", member_id: "member-b" };

  it("played ignores a member id supplied in the request", async () => {
    await setPlayed(
      createApiContext({
        user: testUser("member-a"),
        params: { id: "game-1" },
        form: { played: "true", ...IMPERSONATION },
      }),
    );

    expect(double.writeLog).toHaveLength(1);
    expect(double.writeLog[0]).toMatchObject({
      table: "game_played",
      op: "upsert",
      payload: { member_id: "member-a", game_id: "game-1" },
    });
  });

  it("preference ignores a member id supplied in the request", async () => {
    await setPreference(
      createApiContext({
        user: testUser("member-a"),
        params: { id: "game-1" },
        form: { preference: "liked", ...IMPERSONATION },
      }),
    );

    expect(double.writeLog).toHaveLength(1);
    expect(double.writeLog[0]).toMatchObject({
      table: "game_preference",
      op: "upsert",
      payload: { member_id: "member-a", game_id: "game-1", preference: "liked" },
    });
  });
});
