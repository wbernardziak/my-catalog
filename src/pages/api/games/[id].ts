import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { GAME_NOT_FOUND_MESSAGE, updateGame } from "@/lib/services/games";
import { newGameSchema, parseAuthors } from "./index";

export const prerender = false;

/**
 * Accept the inline edit-game form submission for one game, validate it with the
 * shared `newGameSchema`, persist it, and PRG back to the catalog. Mirrors the
 * create endpoint's null-client / auth / `?error=` conventions; a not-found row
 * (unknown or already-deleted id) becomes a friendly redirect, not a 500/404.
 */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Defense in depth: the middleware gates /catalog, but /api/games/... is not
  // middleware-gated, so the endpoint self-checks auth before persisting.
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id;
  if (!id) {
    return context.redirect(`/catalog?error=${encodeURIComponent(GAME_NOT_FOUND_MESSAGE)}`);
  }

  const form = await context.request.formData();
  const parsed = newGameSchema.safeParse({
    title: form.get("title") ?? "",
    authors: parseAuthors(form.get("authors")),
    genre: form.get("genre") ?? "",
    minPlayers: form.get("minPlayers") ?? "",
    maxPlayers: form.get("maxPlayers") ?? "",
    avgPlayMinutes: form.get("avgPlayMinutes") ?? "",
    loanStatus: form.get("loanStatus") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid game details";
    return context.redirect(`/catalog?error=${encodeURIComponent(message)}`);
  }

  let updated;
  try {
    updated = await updateGame(supabase, id, parsed.data);
  } catch {
    return context.redirect(`/catalog?error=${encodeURIComponent("Could not save changes. Please try again.")}`);
  }

  if (!updated) {
    return context.redirect(`/catalog?error=${encodeURIComponent(GAME_NOT_FOUND_MESSAGE)}`);
  }

  return context.redirect("/catalog");
};
