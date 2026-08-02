import { z } from "zod";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import type { CandidateGame, RecommendationCriteria, RecommendationResult } from "@/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Fast, inexpensive default that supports JSON responses. Overridable via
 * OPENROUTER_MODEL so S-05 can tune model choice without a code change.
 */
const DEFAULT_MODEL = "openai/gpt-4o-mini";

/**
 * Hard abort cap. The NFR target is 5s; 8s lets a genuinely slow round-trip
 * still resolve while guaranteeing a hung request fails as a typed `timeout`
 * rather than hanging to the platform limit.
 */
const TIMEOUT_MS = 8000;

/**
 * Shape we require back from the model. Zod is the guard: anything that does not
 * match becomes an `invalid_response`, never a partial success.
 */
const responseSchema = z.object({
  recommendations: z.array(
    z.object({
      gameId: z.string(),
      reason: z.string(),
      rank: z.number(),
    }),
  ),
});

interface OpenRouterBody {
  choices?: { message?: { content?: unknown } }[];
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

const SYSTEM_PROMPT = [
  "You are a board-game recommender for a household game night.",
  "You may ONLY recommend games from the provided candidate list — never invent, rename, or suggest a game that is not in the list.",
  "Reference each recommended game by its exact `id`.",
  "Rank games by, in order of importance: player-count fit, genre match, available time fit, then household preference.",
  "Respond with a JSON object of the form:",
  '{ "recommendations": [ { "gameId": string, "reason": string, "rank": number } ] }',
  "`reason` is a short human-readable justification. `rank` starts at 1 (best). Include only games that genuinely fit; return an empty array if none fit.",
].join(" ");

/**
 * Rank caller-supplied catalog games against household criteria via OpenRouter.
 *
 * Returns a discriminated union rather than throwing. The catalog-only invariant
 * (a recommendation may only reference a game in `candidateGames`) is enforced in
 * code after parsing — the prompt instruction alone is not trusted.
 */
export async function recommend(
  criteria: RecommendationCriteria,
  candidateGames: CandidateGame[],
): Promise<RecommendationResult> {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  if (candidateGames.length === 0) {
    return { ok: false, reason: "no_match" };
  }

  const userPayload = {
    criteria,
    candidateGames: candidateGames.map((g) => ({
      id: g.id,
      title: g.title,
      genre: g.genre,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      averagePlayMinutes: g.averagePlayMinutes,
      played: g.played,
      preference: g.preference,
    })),
  };

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
        response_format: { type: "json_object" },
        // Load-bearing for the latency NFR, not an optimisation. Every free-tier
        // model on OpenRouter that supports `response_format` is reasoning-capable,
        // and with reasoning left on they spend seconds and hundreds of tokens
        // thinking before answering — measured 8 runs of the configured model at
        // 5 timeouts and 1688 reasoning tokens, versus 12/12 clean at 0.3–0.5s with
        // this flag. Ranking a handful of games needs no chain of thought.
        reasoning: { enabled: false },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: isAbortError(err) ? "timeout" : "provider_error" };
  }

  if (!response.ok) {
    return { ok: false, reason: "provider_error" };
  }

  let content: unknown;
  try {
    const body = (await response.json()) as OpenRouterBody;
    content = body.choices?.[0]?.message?.content;
  } catch (err) {
    return { ok: false, reason: isAbortError(err) ? "timeout" : "provider_error" };
  }

  // `invalid_response` is one user-facing message for three different provider
  // faults; without naming which one fired, the log leaves nothing to act on
  // (same reasoning as the page-level catches in `catalog.astro`/`stats.astro`).
  if (typeof content !== "string") {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[recommendations] provider returned no string content", { content });
    return { ok: false, reason: "invalid_response" };
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[recommendations] provider content is not JSON", content.slice(0, 500));
    return { ok: false, reason: "invalid_response" };
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[recommendations] provider JSON failed the schema", parsed.error.issues, content.slice(0, 500));
    return { ok: false, reason: "invalid_response" };
  }

  // Catalog-only invariant, enforced in code: drop anything the model returned
  // that was not in the caller's candidate list.
  const validIds = new Set(candidateGames.map((g) => g.id));
  const recommendations = parsed.data.recommendations
    .filter((r) => validIds.has(r.gameId))
    .sort((a, b) => a.rank - b.rank);

  if (recommendations.length === 0) {
    return { ok: false, reason: "no_match" };
  }

  return { ok: true, recommendations };
}
