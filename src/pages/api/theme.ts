import type { APIRoute } from "astro";
import { z } from "zod";
import { safeNext, THEME_COOKIE, THEMES } from "@/lib/theme";

export const prerender = false;

/** One year — the choice should outlive a session, not a browsing session. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const themeSchema = z.enum(THEMES);

/**
 * Persist the member's theme and PRG back to the page they switched from.
 *
 * Same form-post/redirect shape as the catalog toggles (`played`, `loan`,
 * `preference`). Deliberately unauthenticated: the landing and auth pages are
 * themed too, so a signed-out visitor must be able to switch. That is also why
 * `next` goes through `safeNext` — an unchecked redirect target on an open
 * endpoint is an open redirect.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const target = safeNext(form.get("next"));
  const parsed = themeSchema.safeParse(form.get("theme"));

  if (!parsed.success) {
    // Unknown theme: send them back untouched rather than writing a cookie the
    // middleware would only discard.
    return context.redirect(target);
  }

  context.cookies.set(THEME_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: import.meta.env.PROD,
  });

  return context.redirect(target);
};
