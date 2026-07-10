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
 * S-01 owns the catalog→contract mapping via `mapRowToCandidateGame` below;
 * `played`/`preference` stay undefined until S-04 lands the per-member tables.
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
 * Catalog domain (slice S-01).
 *
 * `GameRow` is the stored shape (snake_case, matching the `games` table),
 * `NewGameInput` is the validated create payload (camelCase), and
 * `mapRowToCandidateGame` is the single place a stored row becomes the
 * downstream `CandidateGame` contract the recommendation service (S-05) consumes.
 */

/** A game's loan state; settable at add time, no toggling flow until S-04. */
export type LoanStatus = "available" | "loaned";

/** A row of `public.games` exactly as stored (snake_case). */
export interface GameRow {
  id: string;
  title: string;
  authors: string[];
  genre: string;
  min_players: number;
  max_players: number;
  avg_play_minutes: number;
  loan_status: LoanStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Validated create payload for a new game (camelCase). */
export interface NewGameInput {
  title: string;
  authors: string[];
  genre: string;
  minPlayers: number;
  maxPlayers: number;
  avgPlayMinutes: number;
  loanStatus: LoanStatus;
}

/**
 * Map a stored catalog row into the downstream `CandidateGame` contract.
 * `played`/`preference` are intentionally left undefined — those are owned by
 * S-04 and have no source column yet.
 */
export function mapRowToCandidateGame(row: GameRow): CandidateGame {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    averagePlayMinutes: row.avg_play_minutes,
  };
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
