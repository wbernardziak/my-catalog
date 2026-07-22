import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { GAME_NOT_FOUND_MESSAGE } from "@/lib/services/games";
import { setPreference } from "@/lib/services/memberGameState";

export const prerender = false;

/** Desired preference; `"clear"` removes any recorded like/dislike. */
const preferenceSchema = z.enum(["liked", "disliked", "clear"]);

/**
 * Set or clear the current member's like/dislike for a played game and PRG back
 * to the catalog. Same null-client / auth / `?error=` conventions as the delete
 * endpoint. A preference is only valid for a played title: when `setPreference`
 * reports `{ ok: false }` (no `game_played` row), the member is redirected with a
 * friendly "mark as played first" message rather than a 500.
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
  const parsed = preferenceSchema.safeParse(form.get("preference"));
  if (!parsed.success) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Invalid preference.")}`);
  }

  const preference = parsed.data === "clear" ? null : parsed.data;

  let result;
  try {
    result = await setPreference(supabase, id, context.locals.user.id, preference);
  } catch {
    return context.redirect(
      `/catalog?error=${encodeURIComponent("Could not save your preference. Please try again.")}`,
    );
  }

  if (!result.ok) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Mark the game as played first.")}`);
  }

  return context.redirect("/catalog");
};
