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
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[theme] could not parse the submitted form", err);
    // An unparseable body must not escape as a framework 500. The posted `next`
    // is unreadable here, so the redirect falls back to the site root.
    return context.redirect("/");
  }
  const target = safeNext(form.get("next"));
  const parsed = themeSchema.safeParse(form.get("theme"));

  if (!parsed.success) {
    // Unknown theme: send them back untouched rather than writing a cookie the
    // middleware would only discard. Logged because this endpoint is open and
    // unauthenticated, so a spike of rejections is worth being able to see.
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[theme] rejected an unknown theme", form.get("theme"));
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
