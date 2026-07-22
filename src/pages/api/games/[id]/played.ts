import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { GAME_NOT_FOUND_MESSAGE } from "@/lib/services/games";
import { setPlayed } from "@/lib/services/memberGameState";

export const prerender = false;

/** The desired played state, posted by the card toggle (opposite of current). */
const playedSchema = z.enum(["true", "false"]);

/**
 * Set the current member's played state for one game and PRG back to the
 * catalog. Same null-client / auth / `?error=` conventions as the delete
 * endpoint. Desired-state: the form posts the target value (`true`/`false`), so
 * the toggle is idempotent. Member attribution is `context.locals.user.id`;
 * write-own RLS is the security boundary.
 */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Defense in depth: /api/games/... is not middleware-gated.
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id;
  if (!id) {
    return context.redirect(`/catalog?error=${encodeURIComponent(GAME_NOT_FOUND_MESSAGE)}`);
  }

  const form = await context.request.formData();
  const parsed = playedSchema.safeParse(form.get("played"));
  if (!parsed.success) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Invalid played state.")}`);
  }

  try {
    await setPlayed(supabase, id, context.locals.user.id, parsed.data === "true");
  } catch {
    return context.redirect(
      `/catalog?error=${encodeURIComponent("Could not update played status. Please try again.")}`,
    );
  }

  return context.redirect("/catalog");
};
