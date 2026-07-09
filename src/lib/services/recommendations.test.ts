import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateGame, RecommendationCriteria } from "@/types";

/**
 * Guardrail unit tests for the OpenRouter recommendation service.
 *
 * No network and no real API key: `fetch` is stubbed per test and the
 * `astro:env/server` key is toggled through `process.env`. The service and its
 * env stub both read their values at import time, so each case resets the module
 * registry (`vi.resetModules()`) and dynamically re-imports `recommend` after
 * setting the environment — that re-runs the stub and re-binds the service's
 * `OPENROUTER_API_KEY`.
 */

interface ModelRec {
  gameId: string;
  reason: string;
  rank: number;
}

const criteria: RecommendationCriteria = { playerCount: 4, availableMinutes: 30, genre: "party" };

const candidates: CandidateGame[] = [
  { id: "a", title: "Azul", genre: "abstract", minPlayers: 2, maxPlayers: 4, averagePlayMinutes: 30 },
  { id: "b", title: "Catan", genre: "strategy", minPlayers: 3, maxPlayers: 4, averagePlayMinutes: 90 },
  { id: "c", title: "Codenames", genre: "party", minPlayers: 4, maxPlayers: 8, averagePlayMinutes: 15 },
];

/** Build a fake OpenRouter Response whose message content is `content`. */
function providerResponse(content: string, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

/** Convenience: a successful provider response carrying the given recommendations. */
function recsResponse(recs: ModelRec[]): Response {
  return providerResponse(JSON.stringify({ recommendations: recs }));
}

/** Stub the global `fetch` with a vi mock and return it for assertions. */
function stubFetch(impl: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Fresh import of the service after the current env/module state is set. */
async function loadRecommend() {
  const mod = await import("./recommendations");
  return mod.recommend;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test-model";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("recommend", () => {
  it("happy path: returns ok with recommendations sorted by rank", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        recsResponse([
          { gameId: "b", reason: "great for the group", rank: 2 },
          { gameId: "a", reason: "quick and fits the time", rank: 1 },
        ]),
      ),
    );
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.recommendations.map((r) => r.gameId)).toEqual(["a", "b"]);
    expect(result.recommendations[0].reason).toBeTruthy();
    expect(result.recommendations[1].reason).toBeTruthy();
  });

  it("drops out-of-catalog gameIds but keeps valid ones", async () => {
    stubFetch(() =>
      Promise.resolve(
        recsResponse([
          { gameId: "zzz", reason: "fabricated game", rank: 1 },
          { gameId: "c", reason: "real catalog game", rank: 2 },
        ]),
      ),
    );
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.recommendations.map((r) => r.gameId)).toEqual(["c"]);
  });

  it("returns no_match when every recommendation is out-of-catalog", async () => {
    stubFetch(() =>
      Promise.resolve(
        recsResponse([
          { gameId: "zzz", reason: "fabricated", rank: 1 },
          { gameId: "yyy", reason: "also fabricated", rank: 2 },
        ]),
      ),
    );
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "no_match" });
  });

  it("returns no_match on empty candidates without calling fetch", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(recsResponse([])));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, []);

    expect(result).toEqual({ ok: false, reason: "no_match" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AbortSignal.timeout(8000) throws a DOMException named "TimeoutError" in
  // production; a manual abort throws "AbortError". Both must map to `timeout`.
  it.each(["TimeoutError", "AbortError"])("returns timeout when fetch rejects with %s", async (errName) => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = errName;
    stubFetch(() => Promise.reject(abortErr));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("returns provider_error on a non-OK HTTP response", async () => {
    stubFetch(() => Promise.resolve(providerResponse("{}", false)));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });

  it("returns provider_error on a network/transport failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("network down")));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });

  it("returns invalid_response when the model content is not JSON", async () => {
    stubFetch(() => Promise.resolve(providerResponse("not json at all")));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("returns invalid_response when the JSON violates the schema", async () => {
    stubFetch(() =>
      Promise.resolve(providerResponse(JSON.stringify({ recommendations: [{ gameId: "a", rank: "first" }] }))),
    );
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("returns not_configured when the key is absent, without calling fetch", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = stubFetch(() => Promise.resolve(recsResponse([])));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
