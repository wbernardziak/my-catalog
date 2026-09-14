import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, locationOf, queryParamOf, testUser, type ApiContextOptions } from "@/test/apiContext";
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
 *
 * These seven are every route under `src/pages/api` that touches Supabase. The
 * four deliberately absent: `auth/signin`, `auth/signup` and `auth/signout` are
 * the sign-in surface itself, and `theme.ts` is unauthenticated by design (a
 * signed-out visitor must be able to switch themes) and writes only a cookie —
 * it is covered by `src/pages/api/theme.test.ts`.
 */
interface EndpointCase {
  name: string;
  handler: APIRoute;
  context: ApiContextOptions;
  /** Exactly one of these: the games endpoints redirect, /api/recommendations answers with a status. */
  deniedLocation?: string;
  deniedStatus?: number;
}

const ENDPOINTS: EndpointCase[] = [
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
];

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
 * The first branch of every handler's three-step block: no Supabase client at
 * all (missing env). It fires before the auth guard, so it needs its own row.
 */
describe("a missing Supabase client is refused before anything else", () => {
  beforeEach(() => {
    holder.client = null;
  });

  it.each(ENDPOINTS)("$name refuses and writes nothing", async ({ handler, context, deniedStatus }) => {
    const response = await handler(createApiContext({ ...context, user: testUser() }));

    if (deniedStatus === undefined) {
      expect(queryParamOf(response, "error")).toBe("Supabase is not configured");
    } else {
      // The JSON endpoint reports a missing client as unavailable, not unauthorised.
      expect(response.status).toBe(503);
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

/**
 * A write that names no row is a mass write. The double records filter calls,
 * so these assert the id-scoped endpoints actually narrowed to the row they
 * were given — a dropped `.eq("id", id)` in the service layer would turn one
 * soft-delete into a delete of the whole live catalog.
 */
describe("id-scoped writes name the row they touch", () => {
  const AUTHED = testUser();

  it.each<IdCase>([
    { name: "update", handler: updateGame, form: VALID_GAME },
    { name: "delete", handler: deleteGame, form: undefined },
    { name: "loan", handler: setLoan, form: { loanStatus: "loaned" } },
  ])("$name scopes its write to the id", async ({ handler, form }) => {
    await handler(createApiContext({ user: AUTHED, params: { id: "game-1" }, form }));

    expect(double.writeSummary()).toEqual(["games.update"]);
    expect(double.filterSummary()).toContain("eq(id, game-1)");
  });

  it("played scopes its delete to both the game and the member", async () => {
    await setPlayed(
      createApiContext({ user: testUser("member-a"), params: { id: "game-1" }, form: { played: "false" } }),
    );

    expect(double.writeSummary()).toEqual(["game_played.delete"]);
    expect(double.filterSummary()).toEqual(["eq(game_id, game-1)", "eq(member_id, member-a)"]);
  });
});

/**
 * Risk #4: invalid input is rejected AND persists nothing. Each case asserts
 * both — a rejection that still wrote would pass on the response alone.
 */
describe("invalid input is rejected without a write", () => {
  const AUTHED = testUser();

  it("rejects a game whose max players is below its min", async () => {
    const response = await createGame(
      createApiContext({ user: AUTHED, form: { ...VALID_GAME, minPlayers: "4", maxPlayers: "2" } }),
    );

    expect(locationOf(response)).toContain("/catalog?error=");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a game with no title", async () => {
    const response = await createGame(createApiContext({ user: AUTHED, form: { ...VALID_GAME, title: "" } }));

    expect(locationOf(response)).toContain("/catalog?error=");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects an update whose max players is below its min", async () => {
    const response = await updateGame(
      createApiContext({
        user: AUTHED,
        params: { id: "game-1" },
        form: { ...VALID_GAME, minPlayers: "4", maxPlayers: "2" },
      }),
    );

    expect(locationOf(response)).toContain("/catalog?error=");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a loan status outside the enum", async () => {
    const response = await setLoan(
      createApiContext({ user: AUTHED, params: { id: "game-1" }, form: { loanStatus: "borrowed" } }),
    );

    expect(queryParamOf(response, "error")).toBe("Invalid loan status.");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a non-boolean played state", async () => {
    const response = await setPlayed(
      createApiContext({ user: AUTHED, params: { id: "game-1" }, form: { played: "maybe" } }),
    );

    expect(queryParamOf(response, "error")).toBe("Invalid played state.");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a preference outside the enum", async () => {
    const response = await setPreference(
      createApiContext({ user: AUTHED, params: { id: "game-1" }, form: { preference: "loved" } }),
    );

    expect(queryParamOf(response, "error")).toBe("Invalid preference.");
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a recommendation request whose body is not JSON", async () => {
    const response = await recommend(
      createApiContext({
        user: AUTHED,
        body: "not json at all",
        headers: { "content-type": "application/json" },
        url: "https://example.test/api/recommendations",
      }),
    );

    expect(response.status).toBe(400);
    expect(double.writeSummary()).toEqual([]);
  });

  it("rejects a recommendation request with no player count", async () => {
    const response = await recommend(
      createApiContext({ user: AUTHED, json: { genre: "Strategy" }, url: "https://example.test/api/recommendations" }),
    );

    expect(response.status).toBe(400);
    expect(double.writeSummary()).toEqual([]);
  });
});

/**
 * The `[id]` route param is not validated anywhere: the four id-scoped handlers
 * check it for truthiness only and hand it straight to `.eq("id", id)`. These
 * cases record what that actually does today.
 */
interface IdCase {
  name: string;
  handler: APIRoute;
  form?: Record<string, string>;
}

describe("the [id] route param", () => {
  const AUTHED = testUser();

  it.each<IdCase>([
    { name: "update", handler: updateGame, form: VALID_GAME },
    { name: "delete", handler: deleteGame, form: undefined },
    { name: "loan", handler: setLoan, form: { loanStatus: "loaned" } },
    { name: "played", handler: setPlayed, form: { played: "true" } },
    { name: "preference", handler: setPreference, form: { preference: "liked" } },
  ])("$name treats a missing id as not-found and writes nothing", async ({ handler, form }) => {
    const response = await handler(createApiContext({ user: AUTHED, params: {}, form }));

    expect(queryParamOf(response, "error")).toBe("That game no longer exists.");
    expect(double.writeSummary()).toEqual([]);
  });

  // The shared not-found copy, asserted through the handlers rather than by
  // grepping their source: an id that matches no live row comes back as a null
  // row from `maybeSingle()`, which each endpoint turns into the same message.
  it.each<IdCase>([
    { name: "update", handler: updateGame, form: VALID_GAME },
    { name: "delete", handler: deleteGame, form: undefined },
    { name: "loan", handler: setLoan, form: { loanStatus: "loaned" } },
  ])("$name reports an unknown id with the shared not-found copy", async ({ handler, form }) => {
    // `maybeSingle()` on a row that does not exist (or is already soft-deleted)
    // resolves to a null row — that is what "unknown id" looks like to the handler.
    double = createSupabaseDouble({ results: { games: { data: null } } });
    holder.client = double.client;

    const response = await handler(createApiContext({ user: AUTHED, params: { id: "game-gone" }, form }));

    expect(queryParamOf(response, "error")).toBe("That game no longer exists.");
  });

  // A non-UUID id is parameterised by the Supabase client, so it is not an
  // injection risk — it reaches Postgres and comes back as a type-cast error,
  // which the handler translates into its generic "please try again" copy. The
  // cost is that a bad id is indistinguishable from a database outage.
  it("cannot distinguish a malformed id from a database failure", async () => {
    double = createSupabaseDouble({
      results: { games: { error: { code: "22P02", message: "invalid input syntax for type uuid" } } },
    });
    holder.client = double.client;

    const response = await deleteGame(createApiContext({ user: AUTHED, params: { id: "not-a-uuid" } }));

    expect(queryParamOf(response, "error")).toBe("Could not delete the game. Please try again.");
  });
});

/**
 * Research open question #3, now settled: `formData()` was called outside any
 * try/catch in five handlers, and an unparseable body DID escape as an
 * unhandled TypeError (a framework 500). The parse is now wrapped, so the
 * boundary answers with the house `?error=` redirect like every other refusal.
 */
describe("a body that cannot be parsed as form data", () => {
  const MALFORMED = {
    body: "%%%not-multipart%%%",
    headers: { "content-type": "multipart/form-data; boundary=----nonsense" },
  };

  it.each<{ name: string; handler: APIRoute; params: Record<string, string> }>([
    { name: "create", handler: createGame, params: {} },
    { name: "update", handler: updateGame, params: { id: "game-1" } },
    { name: "loan", handler: setLoan, params: { id: "game-1" } },
    { name: "played", handler: setPlayed, params: { id: "game-1" } },
    { name: "preference", handler: setPreference, params: { id: "game-1" } },
  ])("$name refuses it without an unhandled exception", async ({ handler, params }) => {
    const response = await handler(createApiContext({ user: testUser(), params, ...MALFORMED }));

    expect(queryParamOf(response, "error")).toBe("Could not read the submitted form. Please try again.");
    expect(double.writeSummary()).toEqual([]);
  });
});

/**
 * Every one of these handlers turns a persistence failure into the house
 * `?error=` redirect, which tells the caller what to do but tells whoever has to
 * diagnose it nothing at all. Until 2026-09-14 each `catch` discarded the
 * exception outright, so a real failure left no trace anywhere — the finding
 * recorded in `context/foundation/lessons.md` ("Log every non-2xx branch a route
 * returns"). These cases assert the trace, not the redirect: the branch that
 * fired, and the underlying cause travelling with it.
 */
describe("a persistence failure is logged, not swallowed", () => {
  it.each<{ name: string; handler: APIRoute; expected: string; options: ApiContextOptions }>([
    { name: "create", handler: createGame, expected: "[games] could not save the game", options: { form: VALID_GAME } },
    {
      name: "update",
      handler: updateGame,
      expected: "[games/[id]] could not save the changes",
      options: { form: VALID_GAME, params: { id: "game-1" } },
    },
    {
      name: "delete",
      handler: deleteGame,
      expected: "[games/[id]/delete] could not soft-delete the game",
      options: { params: { id: "game-1" } },
    },
    {
      name: "loan",
      handler: setLoan,
      expected: "[games/[id]/loan] could not update the loan status",
      options: { form: { loanStatus: "loaned" }, params: { id: "game-1" } },
    },
    {
      name: "played",
      handler: setPlayed,
      expected: "[games/[id]/played] could not update the played state",
      options: { form: { played: "true" }, params: { id: "game-1" } },
    },
    {
      name: "preference",
      handler: setPreference,
      expected: "[games/[id]/preference] could not save the preference",
      options: { form: { preference: "liked" }, params: { id: "game-1" } },
    },
  ])("$name names its branch and carries the cause", async ({ handler, expected, options }) => {
    double = createSupabaseDouble({ fallback: { error: { message: "boom" } } });
    holder.client = double.client;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handler(createApiContext({ user: testUser(), ...options }));

    // Flattened to strings: the second argument is the caught error itself, and
    // what matters is that the branch AND its cause both reach the log.
    const logged = errorSpy.mock.calls.map((args: unknown[]) => args.map((arg) => String(arg)).join(" "));
    expect(logged.some((line) => line.includes(expected) && line.includes("boom"))).toBe(true);

    errorSpy.mockRestore();
  });
});
