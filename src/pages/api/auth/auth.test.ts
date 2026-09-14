import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, locationOf, queryParamOf } from "@/test/apiContext";

/**
 * Request-level contract for the three auth endpoints.
 *
 * These cannot use `src/test/supabaseDouble.ts`: that double models `.from()`
 * only, and says so explicitly (`supabaseDouble.ts:96`) — these handlers reach
 * for `.auth`, which it deliberately does not implement. So the client is
 * stubbed here instead, shaped to just the three auth methods in play.
 *
 * What these assert is observability, not the auth flow itself: every refusal
 * names its branch in the log, no refusal escapes as a framework 500, and no
 * credential ever reaches the log. Whether Supabase authenticates correctly is
 * Supabase's contract, not this boundary's.
 */

const holder = vi.hoisted((): { client: unknown } => ({ client: null }));

vi.mock("@/lib/supabase", () => ({
  createClient: () => holder.client,
}));

const { POST: signin } = await import("./signin");
const { POST: signup } = await import("./signup");
const { POST: signout } = await import("./signout");

const CREDENTIALS = { email: "member@example.test", password: "hunter2-not-a-real-secret" };

/** As much of a Supabase auth error as these handlers read. */
type AuthError = { message: string } | null;

/**
 * A client whose auth calls all succeed. The return type is annotated rather
 * than inferred so a case can swap in a refusal — inference from `error: null`
 * would narrow the property to `null` and reject one.
 */
function workingClient(): {
  auth: Record<"signInWithPassword" | "signUp" | "signOut", () => Promise<{ error: AuthError }>>;
} {
  return {
    auth: {
      signInWithPassword: vi.fn((): Promise<{ error: AuthError }> => Promise.resolve({ error: null })),
      signUp: vi.fn((): Promise<{ error: AuthError }> => Promise.resolve({ error: null })),
      signOut: vi.fn((): Promise<{ error: AuthError }> => Promise.resolve({ error: null })),
    },
  };
}

/** A body that cannot be parsed as form data (the idiom from `boundary.test.ts`). */
const MALFORMED = {
  body: "%%%not-multipart%%%",
  headers: { "content-type": "multipart/form-data; boundary=----nonsense" },
};

/** Named so `errorSpy` infers the concrete spy type rather than `any`. */
function spyOnConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

let errorSpy: ReturnType<typeof spyOnConsoleError>;

beforeEach(() => {
  holder.client = workingClient();
  // `vi.spyOn` hands back the SAME spy when console.error is already spied, and
  // its recorded calls carry over between cases — so clear it, or the last test
  // here sees every line the earlier ones logged.
  errorSpy = spyOnConsoleError();
  errorSpy.mockClear();
});

/** Every console.error argument flattened to one string per call. */
function loggedLines(): string[] {
  return errorSpy.mock.calls.map((args: unknown[]) => args.map((arg) => String(arg)).join(" "));
}

/**
 * `formData()` was called outside any try/catch in all three of these — the same
 * defect research open question #3 settled for the game handlers, which never
 * covered the auth routes. An unparseable body escaped as an unhandled
 * TypeError, i.e. a framework 500 on the sign-in page.
 */
describe("a body that cannot be parsed as form data", () => {
  it.each<{ name: string; handler: APIRoute; back: string; tag: string }>([
    { name: "signin", handler: signin, back: "/auth/signin", tag: "[auth/signin]" },
    { name: "signup", handler: signup, back: "/auth/signup", tag: "[auth/signup]" },
  ])("$name refuses it with a redirect, not an unhandled exception", async ({ handler, back, tag }) => {
    const response = await handler(createApiContext({ ...MALFORMED }));

    expect(response).toBeInstanceOf(Response);
    expect(locationOf(response)?.startsWith(back)).toBe(true);
    expect(queryParamOf(response, "error")).toBe("Could not read the submitted form. Please try again.");
    expect(loggedLines().some((line) => line.includes(`${tag} could not parse the submitted form`))).toBe(true);
  });
});

describe("a provider refusal is logged without the credentials", () => {
  it.each<{ name: string; handler: APIRoute; method: "signInWithPassword" | "signUp"; tag: string }>([
    { name: "signin", handler: signin, method: "signInWithPassword", tag: "[auth/signin] the provider refused" },
    { name: "signup", handler: signup, method: "signUp", tag: "[auth/signup] the provider refused" },
  ])("$name names its branch and the provider message only", async ({ handler, method, tag }) => {
    const client = workingClient();
    client.auth[method] = vi.fn(() => Promise.resolve({ error: { message: "Invalid login credentials" } }));
    holder.client = client;

    const response = await handler(createApiContext({ form: CREDENTIALS }));

    expect(queryParamOf(response, "error")).toBe("Invalid login credentials");

    const lines = loggedLines();
    expect(lines.some((line) => line.includes(tag) && line.includes("Invalid login credentials"))).toBe(true);
    // The whole point of passing `error.message` rather than the error or the
    // form: a log that carries an email or a password is a worse problem than
    // the one this logging exists to solve.
    for (const line of lines) {
      expect(line).not.toContain(CREDENTIALS.email);
      expect(line).not.toContain(CREDENTIALS.password);
    }
  });
});

describe("POST /api/auth/signout", () => {
  it("still redirects when the provider call throws, and logs why", async () => {
    const client = workingClient();
    client.auth.signOut = vi.fn(() => Promise.reject(new Error("boom")));
    holder.client = client;

    const response = await signout(createApiContext({}));

    expect(locationOf(response)).toBe("/");
    expect(loggedLines().some((line) => line.includes("[auth/signout] the provider call failed"))).toBe(true);
  });

  it("logs nothing when the provider call succeeds", async () => {
    const response = await signout(createApiContext({}));

    expect(locationOf(response)).toBe("/");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
