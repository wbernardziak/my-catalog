import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, testUser } from "@/test/apiContext";
import { createSupabaseDouble, type SupabaseDouble } from "@/test/supabaseDouble";
import type { GameRow } from "@/types";
import { initOf, recsResponse, stubFetch, type FetchMock } from "@/test/providerStub";

/**
 * Contract for the recommendation route (test-plan phase 4, risks #3/#5/#7).
 *
 * This suite exists one layer above `recommendations.test.ts` for one reason:
 * `recommend()` receives candidates as a PARAMETER, already sanitised, so a
 * service test can never prove what the ROUTE feeds it. The row → prompt chain
 * has two independent allow-lists — `mapRowToCandidateGame` (`src/types.ts`) and
 * the prompt pick (`recommendations.ts`) — and only a test that starts from a
 * stored row exercises both at once. That is what makes the minimal-prompt NFR
 * (`prd.md:92`) assertable.
 *
 * The expected field set is taken from the requirement and the `CandidateGame`
 * contract, never read off the assembly code, and the prompt string is never
 * asserted verbatim (test-plan §2, risk #7 anti-pattern).
 */

// `vi.mock` is hoisted above imports, so the double is reached through a holder
// (the idiom from `src/pages/api/games/boundary.test.ts`).
const holder = vi.hoisted((): { client: unknown } => ({ client: null }));

vi.mock("@/lib/supabase", () => ({
  createClient: () => holder.client,
}));

const ROUTE_URL = "https://example.test/api/recommendations";

const CRITERIA = { playerCount: 4, availableMinutes: 30, genre: "party" };

/**
 * A stored row carrying every column the catalog has, not just the ones the
 * ranker needs. The extra columns are the whole point: they are what a leak test
 * asserts the absence of. `min_players`/`max_players` bracket `CRITERIA.playerCount`
 * so this fixture stays valid once the player-count guard lands.
 */
const FAT_ROW: GameRow = {
  id: "game-1",
  title: "Azul",
  authors: ["Michael Kiesling"],
  genre: "abstract",
  min_players: 2,
  max_players: 4,
  avg_play_minutes: 30,
  loan_status: "loaned",
  created_by: "member-b",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-02T00:00:00.000Z",
  deleted_at: null,
};

/** The eight fields the prompt contract allows, per `CandidateGame`. */
const ALLOWED_GAME_FIELDS = [
  "averagePlayMinutes",
  "genre",
  "id",
  "maxPlayers",
  "minPlayers",
  "played",
  "preference",
  "title",
];

/**
 * Household data that must never cross to the provider: stored columns the
 * ranker has no use for, the session member's id, and the API key.
 */
const FORBIDDEN_IN_PAYLOAD = [
  "authors",
  "Michael Kiesling",
  "loan_status",
  "loanStatus",
  "loaned",
  "created_by",
  "member-b",
  "member-a",
  "created_at",
  "updated_at",
  "deleted_at",
  "test-key",
];

let double: SupabaseDouble;

/**
 * Seed all three tables `listCatalogGames` fans out to. `games` must be an
 * ARRAY — `mergeAndFilterCatalog` maps over it — and the state rows must carry
 * the game's own id, or the merge yields `played: false` / `preference: null`
 * and neither optional prompt field is observable.
 */
function seedCatalog(): SupabaseDouble {
  return createSupabaseDouble({
    results: {
      games: { data: [FAT_ROW] },
      game_played: { data: [{ game_id: FAT_ROW.id }] },
      game_preference: { data: [{ game_id: FAT_ROW.id, preference: "liked" }] },
    },
  });
}

/** A well-formed provider answer naming the seeded game. */
function defaultAnswer(): Promise<Response> {
  return Promise.resolve(recsResponse([{ gameId: FAT_ROW.id, reason: "fits the table", rank: 1 }]));
}

/**
 * Fresh import of the handler after env and module state are set. The service
 * binds `OPENROUTER_API_KEY` at import time through the `astro:env/server` stub,
 * so a statically imported route would bind whatever was set when this file
 * loaded — and return `not_configured` before any request, passing for the wrong
 * reason.
 */
async function loadRoute() {
  const mod = await import("./recommendations");
  return mod.POST;
}

function requestFor(body: unknown = CRITERIA) {
  return createApiContext({ user: testUser(), json: body, url: ROUTE_URL });
}

/** The parsed user payload the route sent to the provider. */
function sentPayload(mock: FetchMock): { criteria: unknown; candidateGames: Record<string, unknown>[] } {
  const body = JSON.parse(initOf(mock).body as string) as { messages: { role: string; content: string }[] };
  const userMessage = body.messages.find((message) => message.role === "user");
  if (!userMessage) {
    throw new Error("the outbound body carried no user message");
  }
  return JSON.parse(userMessage.content) as { criteria: unknown; candidateGames: Record<string, unknown>[] };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test-model";
  double = seedCatalog();
  holder.client = double.client;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("POST /api/recommendations — outbound prompt payload", () => {
  it("sends each candidate game as exactly the minimal prompt contract", async () => {
    const fetchMock = stubFetch(defaultAnswer);
    const POST = await loadRoute();

    await POST(requestFor());

    const { candidateGames } = sentPayload(fetchMock);
    expect(candidateGames).toHaveLength(1);
    expect(Object.keys(candidateGames[0]).sort()).toEqual(ALLOWED_GAME_FIELDS);
  });

  it("sends no household column, member id or secret beyond that contract", async () => {
    const fetchMock = stubFetch(defaultAnswer);
    const POST = await loadRoute();

    await POST(requestFor());

    const raw = initOf(fetchMock).body as string;
    for (const forbidden of FORBIDDEN_IN_PAYLOAD) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("sends only the validated criteria at the top level", async () => {
    const fetchMock = stubFetch(defaultAnswer);
    const POST = await loadRoute();

    await POST(requestFor());

    const payload = sentPayload(fetchMock);
    expect(Object.keys(payload).sort()).toEqual(["candidateGames", "criteria"]);
    expect(payload.criteria).toEqual(CRITERIA);
  });

  // Not a duplicate of the service suite's header assertion: here it proves the
  // ROUTE's own import bound the key, so a green run cannot mean the handler
  // short-circuited on `not_configured` without ever calling the provider.
  it("authenticates with the configured key, proving the route bound the env", async () => {
    const fetchMock = stubFetch(defaultAnswer);
    const POST = await loadRoute();

    await POST(requestFor());

    expect((initOf(fetchMock).headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });
});

describe("POST /api/recommendations — response contract", () => {
  it("returns the enriched envelope carrying display fields the model never saw", async () => {
    stubFetch(defaultAnswer);
    const POST = await loadRoute();

    const response = await POST(requestFor());
    const text = await response.text();
    const body = JSON.parse(text) as { ok: boolean; recommendations: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.recommendations[0]).toMatchObject({
      gameId: FAT_ROW.id,
      title: "Azul",
      loanStatus: "loaned",
      played: true,
    });
    expect(text).not.toContain("test-key");
  });

  it("returns 500 and issues no provider call when the catalog read fails", async () => {
    const fetchMock = stubFetch(defaultAnswer);
    double = createSupabaseDouble({ results: { games: { error: { message: "boom" } } } });
    holder.client = double.client;
    const POST = await loadRoute();

    const response = await POST(requestFor());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not load your catalog. Please try again." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
