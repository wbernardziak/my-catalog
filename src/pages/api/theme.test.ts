import type { APIContext } from "astro";
import { describe, expect, it, vi } from "vitest";
import { THEME_COOKIE } from "@/lib/theme";
import { POST } from "./theme";

/**
 * Behavioural guardrails for the theme endpoint. The handler only touches three
 * things on the context — `request.formData()`, `cookies.set`, `redirect` — so a
 * hand-rolled context exercises the real code path without an Astro runtime.
 */

function contextWith(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  const set = vi.fn();
  const redirect = vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } }));

  const context = {
    request: new Request("https://example.test/api/theme", { method: "POST", body }),
    cookies: { set },
    redirect,
  } as unknown as APIContext;

  return { context, set, redirect };
}

/** A context whose body cannot be parsed as form data. */
function contextWithRawBody() {
  const set = vi.fn();
  const redirect = vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } }));

  const context = {
    request: new Request("https://example.test/api/theme", {
      method: "POST",
      body: "%%%not-multipart%%%",
      headers: { "content-type": "multipart/form-data; boundary=----nonsense" },
    }),
    cookies: { set },
    redirect,
  } as unknown as APIContext;

  return { context, set, redirect };
}

describe("POST /api/theme", () => {
  it("stores a valid theme and redirects to the posted path", async () => {
    const { context, set, redirect } = contextWith({ theme: "shelf", next: "/catalog?players=2" });

    await POST(context);

    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(THEME_COOKIE);
    expect(value).toBe("shelf");
    expect(options.path).toBe("/");
    expect(options.sameSite).toBe("lax");
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(60 * 60 * 24 * 365);
    expect(redirect).toHaveBeenCalledWith("/catalog?players=2");
  });

  it("accepts every declared theme", async () => {
    for (const theme of ["felt", "shelf", "punchboard"]) {
      const { context, set } = contextWith({ theme, next: "/" });
      await POST(context);
      expect(set).toHaveBeenCalledWith(THEME_COOKIE, theme, expect.anything());
    }
  });

  it("redirects without setting a cookie when the theme is unknown", async () => {
    const { context, set, redirect } = contextWith({ theme: "cosmic", next: "/stats" });

    await POST(context);

    expect(set).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/stats");
  });

  it("redirects without setting a cookie when the theme field is missing", async () => {
    const { context, set, redirect } = contextWith({ next: "/stats" });

    await POST(context);

    expect(set).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/stats");
  });

  /**
   * This endpoint is open and unauthenticated (see the handler's note), so both
   * of these are reachable by anyone. `formData()` used to be called outside any
   * try/catch here, exactly as it was in the five game handlers before research
   * open question #3 was settled — an unparseable body escaped as a framework
   * 500. It is wrapped now, and both refusals leave a trace.
   */
  it("refuses a body that cannot be parsed as form data, without an unhandled exception", async () => {
    const { context, set, redirect } = contextWithRawBody();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(POST(context)).resolves.toBeInstanceOf(Response);

    expect(set).not.toHaveBeenCalled();
    // The posted `next` is unreadable, so the fallback is the site root.
    expect(redirect).toHaveBeenCalledWith("/");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[theme] could not parse the submitted form"),
      expect.anything(),
    );

    errorSpy.mockRestore();
  });

  it("logs the rejected value when the theme is unknown", async () => {
    const { context } = contextWith({ theme: "cosmic", next: "/stats" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await POST(context);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[theme] rejected an unknown theme"), "cosmic");

    errorSpy.mockRestore();
  });

  it("refuses an off-origin redirect target", async () => {
    const { context, set, redirect } = contextWith({ theme: "felt", next: "//evil.com" });

    await POST(context);

    expect(set).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
