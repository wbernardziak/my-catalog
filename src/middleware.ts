import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { THEME_COOKIE, themeFromCookie } from "@/lib/theme";

const PROTECTED_ROUTES = ["/dashboard", "/catalog", "/stats", "/play"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Resolved for every route, signed in or not — the theme is not gated on a
  // session, and an absent or corrupted cookie falls back to the default.
  context.locals.theme = themeFromCookie(context.cookies.get(THEME_COOKIE)?.value);

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      context.locals.user = user ?? null;
    } catch {
      // A transient Supabase failure must not 500 every protected route; treat an
      // unresolvable session as unauthenticated (the gate below redirects to signin).
      context.locals.user = null;
    }
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
