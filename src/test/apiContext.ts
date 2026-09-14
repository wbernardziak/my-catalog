import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";
import { vi } from "vitest";
import { DEFAULT_THEME } from "@/lib/theme";

/**
 * Context factory for handler-level API tests. The API routes are not
 * middleware-gated (`src/middleware.ts:5` lists page prefixes only), so every
 * test drives the exported handler directly with a hand-built context — the
 * same trick as `src/pages/api/theme.test.ts`, generalised so seven endpoints
 * can share one factory.
 *
 * `redirect` returns a real `Response` with a `Location` header rather than a
 * bare spy, so assertions read the response the handler actually produced.
 */

/** Minimal stand-in for a Supabase user: the handlers only ever read `id`. */
export function testUser(id = "member-a"): User {
  return { id, email: `${id}@example.test` } as User;
}

export interface ApiContextOptions {
  /** `null` (the default) is an unauthenticated caller. */
  user?: User | null;
  /** Mirrors `locals.sessionUnresolved`: `true` is a caller whose session could
   * not be resolved at all (Supabase erroring), as opposed to one with no
   * session. Both carry `user: null`; only this separates them. */
  sessionUnresolved?: boolean;
  /** Route params, e.g. `{ id: "game-1" }` for `/api/games/[id]`. */
  params?: Record<string, string | undefined>;
  /** Form fields; sent as a `FormData` body. */
  form?: Record<string, string>;
  /** JSON body; sent with a JSON content-type. */
  json?: unknown;
  /** Raw body, for bodies that cannot be parsed (see the malformed-body case). */
  body?: BodyInit;
  headers?: Record<string, string>;
  method?: string;
  url?: string;
}

function buildBody(options: ApiContextOptions): { body?: BodyInit; headers: Record<string, string> } {
  const headers = { ...options.headers };

  if (options.body !== undefined) {
    return { body: options.body, headers };
  }
  if (options.json !== undefined) {
    return { body: JSON.stringify(options.json), headers: { "content-type": "application/json", ...headers } };
  }
  if (options.form !== undefined) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.form)) {
      form.set(key, value);
    }
    return { body: form, headers };
  }
  return { headers };
}

export function createApiContext(options: ApiContextOptions = {}): APIContext {
  const method = options.method ?? "POST";
  const url = options.url ?? "https://example.test/api/games";
  const { body, headers } = buildBody(options);

  const context = {
    request: new Request(url, { method, body, headers }),
    url: new URL(url),
    params: options.params ?? {},
    locals: {
      user: options.user ?? null,
      sessionUnresolved: options.sessionUnresolved ?? false,
      theme: DEFAULT_THEME,
    },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(() => false),
      delete: vi.fn(),
    },
    redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
  };

  return context as unknown as APIContext;
}

/** The `Location` of a redirect response, for readable assertions. */
export function locationOf(response: Response): string | null {
  return response.headers.get("Location");
}

/**
 * A query parameter from a redirect's `Location`. The two redirect builders in
 * the app encode differently — `encodeURIComponent` yields `%20`, while
 * `catalogRedirectTarget`'s `URLSearchParams` yields `+` — so assertions read
 * the decoded value instead of matching an encoded substring.
 */
export function queryParamOf(response: Response, name: string): string | null {
  const location = locationOf(response);
  if (location === null) return null;
  return new URL(location, "https://example.test").searchParams.get(name);
}
