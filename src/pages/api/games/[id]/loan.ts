import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { GAME_NOT_FOUND_MESSAGE, setLoan } from "@/lib/services/games";
import { catalogRedirectTarget } from "@/lib/services/gameFilters";

export const prerender = false;

/** The desired loan status, posted by the card toggle (opposite of current). */
const loanSchema = z.enum(["available", "loaned"]);

/**
 * Flip a game's shared loan status and PRG back to the catalog. Same null-client
 * / auth / `?error=` conventions as the delete endpoint. Desired-state: the form
 * posts the target value, mirroring the `played` endpoint, so the toggle is
 * idempotent. Loan is a SHARED column on `games` (one physical copy), not
 * per-member. An unknown or already-deleted id becomes a friendly not-found
 * redirect.
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
  // The filters the card was rendered under, so the PRG lands on the same view.
  const filters = form.get("filters");
  const parsed = loanSchema.safeParse(form.get("loanStatus"));
  if (!parsed.success) {
    return context.redirect(catalogRedirectTarget(filters, "Invalid loan status."));
  }

  let updated;
  try {
    updated = await setLoan(supabase, id, parsed.data);
  } catch {
    return context.redirect(catalogRedirectTarget(filters, "Could not update loan status. Please try again."));
  }

  if (!updated) {
    return context.redirect(catalogRedirectTarget(filters, GAME_NOT_FOUND_MESSAGE));
  }

  return context.redirect(catalogRedirectTarget(filters));
};
