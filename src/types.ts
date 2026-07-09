/**
 * Shared contract types (entities, DTOs).
 *
 * The recommendation contract below is the authoritative shape for the LLM
 * recommendation service (F-01). It is intentionally decoupled from any database
 * row shape — S-01 (catalog) and S-04 (played/preferences) must map their rows
 * into `CandidateGame` when they land. S-05 (the recommendation UI) imports this
 * contract to call the service.
 */

/**
 * Criteria the household supplies when asking "what should we play?". All fields
 * are optional; the ranker accounts for whichever values exist (US-01).
 */
export interface RecommendationCriteria {
  playerCount?: number;
  availableMinutes?: number;
  genre?: string;
}

/**
 * The minimum game shape the ranker needs. No member PII and no internal DB ids
 * beyond the local `id` used to reference a game in the response.
 *
 * `minPlayers`/`maxPlayers` are a range because the PRD Business Logic matches on
 * player count against a range — do not collapse to a single `playerCount`.
 *
 * This shape is provisional: S-01/S-04 own mapping their rows into it.
 */
export interface CandidateGame {
  id: string;
  title: string;
  genre: string;
  minPlayers: number;
  maxPlayers: number;
  averagePlayMinutes: number;
  played?: boolean;
  preference?: "liked" | "disliked";
}

/**
 * A single ranked recommendation. `gameId` always references a game the caller
 * passed in via `candidateGames` — the service enforces this in code, never just
 * in the prompt.
 */
export interface RankedRecommendation {
  gameId: string;
  reason: string;
  rank: number;
}

/**
 * Discriminated union returned by `recommend`. On failure, `reason` is a
 * machine-readable state S-05 maps to user-facing copy:
 * - `not_configured` — no OpenRouter key; the integration is disabled.
 * - `timeout` — the call exceeded the latency budget (NFR 5s target, 8s hard cap).
 * - `provider_error` — non-OK HTTP or a network/transport failure.
 * - `invalid_response` — the model returned unparseable or schema-violating JSON.
 * - `no_match` — a successful call (or empty input) that yields zero eligible
 *   games; the explicit "no suitable game found" state (US-01 acceptance).
 */
export type RecommendationResult =
  | { ok: true; recommendations: RankedRecommendation[] }
  | {
      ok: false;
      reason: "not_configured" | "timeout" | "provider_error" | "invalid_response" | "no_match";
    };
