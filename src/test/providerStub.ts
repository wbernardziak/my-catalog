import { vi } from "vitest";

/**
 * Shared scaffolding for tests at the LLM provider boundary (test-plan §6.5).
 *
 * `fetch` is called bare on the global (`recommendations.ts`), so stubbing the
 * global is the only seam — and it is enough: it controls the response AND
 * captures the outbound request. No HTTP-mocking library is installed, by
 * decision. Both the service suite and the route suite stub the same way, so the
 * helpers live here rather than being copied into each.
 */

/** A single recommendation as the model returns it, before any guard runs. */
export interface ModelRec {
  gameId: string;
  reason: string;
  rank: number;
}

export type FetchMock = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

/** A fake OpenRouter `Response` whose message content is `content`. */
export function providerResponse(content: string, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

/** A successful provider response carrying the given recommendations. */
export function recsResponse(recs: ModelRec[]): Response {
  return providerResponse(JSON.stringify({ recommendations: recs }));
}

/** Stub the global `fetch` and return the mock for request assertions. */
export function stubFetch(impl: () => Promise<Response>): FetchMock {
  const mock: FetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** The `RequestInit` the unit handed to `fetch`, or a failure if it never called it. */
export function initOf(mock: FetchMock): RequestInit {
  const init = mock.mock.calls[0]?.[1];
  if (init === undefined) {
    throw new Error("nothing called fetch with an init object");
  }
  return init;
}
