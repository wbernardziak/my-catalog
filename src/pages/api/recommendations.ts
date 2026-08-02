import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listCatalogGames } from "@/lib/services/catalogGames";
import { recommend } from "@/lib/services/recommendations";
import {
  enrichRecommendations,
  parseCriteria,
  type RecommendationDisplayGame,
} from "@/lib/services/recommendationView";
import { mapRowToCandidateGame } from "@/types";

export const prerender = false;

/** JSON helper — this is the app's single JSON route (a documented departure from
 * the PRG convention, scoped to the recommendation flow). */
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The single server entry point for "what should we play?". Authenticates,
 * assembles the candidate list server-side from the DB (never trusting the
 * client, preserving the catalog-only guarantee), calls the guarded `recommend()`
 * service, and returns the enriched discriminated union as JSON.
 *
 * Contract: the modeled union (`{ ok }`) is returned only at 200. Transport/gate
 * failures return `{ error }` at 4xx/5xx so the client can tell a modeled failure
 * apart from an unexpected one.
 */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  // Defensive only: /play is behind PROTECTED_ROUTES and the middleware needs
  // Supabase to resolve a user, so a missing client redirects to signin before
  // this route runs. Do NOT reuse reason: "not_configured" (that means "no
  // OpenRouter key" and would show the wrong copy).
  if (!supabase) {
    return json({ error: "The server is not configured." }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Your session has expired. Please sign in again." }, 401);
  }
  const user = context.locals.user;

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const criteria = parseCriteria(rawBody);
  if (!criteria.success) {
    return json({ error: criteria.error }, 400);
  }

  // One list serves both callers: `recommend()` reads the `CandidateGame` fields
  // it picks for the prompt (loan state is not one of them and never reaches the
  // model), while the view join reads `loanStatus` for the result card's badge.
  let candidates: RecommendationDisplayGame[];
  try {
    candidates = (await listCatalogGames(supabase, user.id, {})).map((g) => ({
      ...mapRowToCandidateGame(g, { played: g.played, preference: g.preference ?? undefined }),
      loanStatus: g.loan_status,
    }));
  } catch {
    return json({ error: "Could not load your catalog. Please try again." }, 500);
  }

  const result = await recommend(criteria.data, candidates);
  if (result.ok) {
    return json({ ok: true, recommendations: enrichRecommendations(result.recommendations, candidates) });
  }
  return json({ ok: false, reason: result.reason });
};
