import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Signing out must not fail the caller: the redirect happens either way, so
      // the log is the only trace that the provider call did not go through.
      // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
      console.error("[auth/signout] the provider call failed", err);
    }
  }
  return context.redirect("/");
};
