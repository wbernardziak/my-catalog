import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { GAME_NOT_FOUND_MESSAGE, softDeleteGame } from "@/lib/services/games";

export const prerender = false;

/**
 * Mark one game deleted (soft) and PRG back to the catalog. Same null-client /
 * auth / `?error=` conventions as the update endpoint; no body validation beyond
 * the id param. A row that matched nothing (unknown or already-deleted id)
 * becomes a friendly not-found redirect.
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

  let deleted;
  try {
    deleted = await softDeleteGame(supabase, id);
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[games/[id]/delete] could not soft-delete the game", err);
    return context.redirect(`/catalog?error=${encodeURIComponent("Could not delete the game. Please try again.")}`);
  }

  if (!deleted) {
    return context.redirect(`/catalog?error=${encodeURIComponent(GAME_NOT_FOUND_MESSAGE)}`);
  }

  return context.redirect("/catalog");
};
