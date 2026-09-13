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

/**
 * Already-validated catalog filter values, spoken by both the list query and the
 * filter form. Every field is optional; an absent field means "no constraint on
 * this dimension". `players` matches a game whose min–max range includes N;
 * `maxMinutes` matches games with `avg_play_minutes ≤ maxMinutes`; `genre` and
 * `loanStatus` are exact equality. Reuses the existing `LoanStatus` union.
 */
export interface GameFilters {
  genre?: string;
  players?: number;
  maxMinutes?: number;
  loanStatus?: LoanStatus;
  /** Per-member: match games the calling member has (true) / has not (false) played. */
  played?: boolean;
  /** Per-member: match games the calling member liked/disliked. */
  preference?: "liked" | "disliked";
}

/**
 * A catalog row enriched with the CALLING member's per-member state, as the
 * catalog page renders it. `played` is whether this member has a `game_played`
 * row; `preference` is their like/dislike (or `null` when unset — a played game
 * with no recorded preference, or a game they have not played). Loan status stays
 * the shared `loan_status` column inherited from `GameRow`.
 */
export type CatalogGame = GameRow & {
  played: boolean;
  preference: "liked" | "disliked" | null;
};

/**
 * Preference statistics for one household member (slice S-06). Produced by
 * `computeMemberStats` and rendered as one column of the `/stats` comparison
 * table. `label` is the display name — "You" for the calling member
 * (`isCurrent`), "Other member" for anyone else (the anon client cannot resolve
 * other members' emails). Counts are over that member's own per-member rows:
 * `playedCount` = `game_played` rows, `liked`/`dislikedCount` = `game_preference`
 * rows split by value (and `liked + disliked ≤ played` always holds).
 */
export interface MemberStat {
  memberId: string;
  isCurrent: boolean;
  label: string;
  playedCount: number;
  likedCount: number;
  dislikedCount: number;
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
 * Map a stored catalog row into the downstream `CandidateGame` contract. When
 * `state` is supplied (the calling member's played flag and optional
 * like/dislike), `played`/`preference` are populated so S-05 inherits live
 * per-member data; omitting `state` preserves the pre-S-04 behavior of leaving
 * both fields undefined.
 */
export function mapRowToCandidateGame(
  row: GameRow,
  state?: { played: boolean; preference?: "liked" | "disliked" },
): CandidateGame {
  const candidate: CandidateGame = {
    id: row.id,
    title: row.title,
    genre: row.genre,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    averagePlayMinutes: row.avg_play_minutes,
  };

  if (state) {
    candidate.played = state.played;
    if (state.preference !== undefined) {
      candidate.preference = state.preference;
    }
  }

  return candidate;
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
 * - `out_of_catalog` — the model answered, but nothing it named was usable:
 *   either no id survived the catalog allow-list, or every named game failed the
 *   player-count criterion while a fitting game was on offer. A provider failure,
 *   not a no-match: the household's criteria were never the problem, so it must
 *   not borrow `no_match`'s "try adjusting your criteria" copy (`prd.md:93`
 *   requires a clear failure state rather than a silent one).
 */
export type RecommendationResult =
  | { ok: true; recommendations: RankedRecommendation[] }
  | {
      ok: false;
      reason: "not_configured" | "timeout" | "provider_error" | "invalid_response" | "no_match" | "out_of_catalog";
    };
