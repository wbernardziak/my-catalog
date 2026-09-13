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

  it("disables reasoning on the request, which the latency NFR depends on", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(recsResponse([{ gameId: "a", reason: "fits", rank: 1 }])));
    const recommend = await loadRecommend();

    await recommend(criteria, candidates);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { reasoning?: { enabled?: boolean } };
    // Every free-tier model that supports `response_format` is reasoning-capable;
    // leaving this on costs seconds and blows the 8s cap. See recommendations.ts.
    expect(body.reasoning).toEqual({ enabled: false });
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

  // An answer whose every id was fabricated is a provider failure, not a
  // no-match: the criteria were never the problem, so the user must not be told
  // to adjust them (prd.md:93).
  it("returns out_of_catalog when every recommendation is fabricated, and logs the dropped ids", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
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

    expect(result).toEqual({ ok: false, reason: "out_of_catalog" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("outside the catalog"), ["zzz", "yyy"]);
    errorSpy.mockRestore();
  });

  // The other half of the split: the model answering "nothing suitable" is a
  // genuine no-match, and keeps the neutral copy.
  it("returns no_match when the model itself returns an empty list", async () => {
    stubFetch(() => Promise.resolve(recsResponse([])));
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
  // The three branches below exist in the service and were never executed by a
  // test: a rejecting envelope parse, and two shapes of "HTTP 200 but unusable".
  it("returns provider_error when the response envelope itself fails to parse", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
      } as unknown as Response),
    );
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });

  it.each([
    ["an empty choices array", { choices: [] }],
    ["a choice with no message", { choices: [{}] }],
    ["non-string content", { choices: [{ message: { content: { recommendations: [] } } }] }],
  ])("returns invalid_response on a 200 carrying %s", async (_label, body) => {
    stubFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response));
    const recommend = await loadRecommend();

    const result = await recommend(criteria, candidates);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  // Request shape: the parts of the call that the body cannot show. The 8s cap
  // itself is NOT assertable — sinon fake timers do not patch
  // `AbortSignal.timeout`, which is a platform API — so the reachable claim is
  // that the request is bounded at all.
  it("posts to OpenRouter with the configured key, model and a timeout signal", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(recsResponse([{ gameId: "a", reason: "fits", rank: 1 }])));
    const recommend = await loadRecommend();

    await recommend(criteria, candidates);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((JSON.parse(init.body as string) as { model: string }).model).toBe("test-model");
  });

  it("falls back to the default model when OPENROUTER_MODEL is unset", async () => {
    delete process.env.OPENROUTER_MODEL;
    const fetchMock = stubFetch(() => Promise.resolve(recsResponse([{ gameId: "a", reason: "fits", rank: 1 }])));
    const recommend = await loadRecommend();

    await recommend(criteria, candidates);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((JSON.parse(init.body as string) as { model: string }).model).toBe("openai/gpt-4o-mini");
  });
});
