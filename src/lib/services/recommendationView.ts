import { z } from "zod";
import type {
  CandidateGame,
  LoanStatus,
  RankedRecommendation,
  RecommendationCriteria,
  RecommendationResult,
} from "@/types";

/**
 * Pure view logic for the "what should we play?" flow (S-05), extracted so the
 * JSON route and the React island stay dumb and the decision logic is
 * unit-testable without Astro/DB/React (the project's "no handler mock"
 * convention). Three responsibilities: parse/validate raw criteria input, enrich
 * ranked recommendations into a display view-model, and map a failure `reason`
 * to user-facing copy.
 */

/** Blank-ish inputs (empty/whitespace string or null) become `undefined` so the
 * optional fields are omitted rather than failing validation. */
const blankToUndefined = (value: unknown): unknown =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

/**
 * Validated criteria payload. `playerCount` is required (a UI/route rule, not a
 * contract change — the service treats every field as optional); the optional
 * fields are omitted when blank. Numeric strings are coerced, mirroring the
 * FormData routes' coercion at `api/games/index.ts:33-47`.
 */
export const criteriaSchema = z.object({
  playerCount: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "Player count is required" })
      .int("Player count must be a whole number")
      .positive("Player count must be at least 1"),
  ),
  availableMinutes: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "Available time must be a number" })
      .int("Available time must be a whole number")
      .positive("Available time must be greater than 0")
      .optional(),
  ),
  genre: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
});

/** Result of parsing raw criteria: either a clean `RecommendationCriteria` or the
 * first validation issue message (mirrors the routes' first-issue pattern). */
export type CriteriaParseResult = { success: true; data: RecommendationCriteria } | { success: false; error: string };

/**
 * Parse+validate raw criteria (JSON body or form values) into a
 * `RecommendationCriteria`. Blank optional fields are dropped so the service
 * never sees empty strings.
 */
export function parseCriteria(input: unknown): CriteriaParseResult {
  const parsed = criteriaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid criteria" };
  }

  const criteria: RecommendationCriteria = { playerCount: parsed.data.playerCount };
  if (parsed.data.availableMinutes !== undefined) criteria.availableMinutes = parsed.data.availableMinutes;
  if (parsed.data.genre !== undefined) criteria.genre = parsed.data.genre;
  return { success: true, data: criteria };
}

/**
 * What the join reads from: the ranker contract plus the loan state the result
 * card shows. `CandidateGame` deliberately stops at what the ranker needs, and
 * loan state is not a ranking input — `recommend()` picks its prompt fields
 * explicitly, so the extra field never reaches the model.
 */
export type RecommendationDisplayGame = CandidateGame & { loanStatus: LoanStatus };

/**
 * A ranked recommendation enriched with the display fields the UI needs. The
 * service returns only `gameId`/`reason`/`rank` (no display fields), so the
 * server joins each id back to the candidate it already holds — the client never
 * receives the full catalog.
 *
 * Carries the same badge set as a catalog card (genre, players, play time,
 * played, loan) so a recommended game reads identically in both places — in
 * particular, a loaned or already-played game says so here too.
 */
export interface RecommendationViewItem {
  gameId: string;
  rank: number;
  reason: string;
  title: string;
  genre: string;
  minPlayers: number;
  maxPlayers: number;
  averagePlayMinutes: number;
  played: boolean;
  loanStatus: LoanStatus;
}

/**
 * Join ranked recommendations to their candidate games by `gameId`, preserving
 * rank order and skipping any id absent from the candidate list (defense in
 * depth; `recommend()` already enforces catalog-only in code).
 *
 * `played` is optional on the ranker contract (undefined until the caller merges
 * per-member state); absent reads as not played, which is what the meeple shows.
 */
export function enrichRecommendations(
  recommendations: RankedRecommendation[],
  candidates: RecommendationDisplayGame[],
): RecommendationViewItem[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return [...recommendations]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((recommendation) => {
      const game = byId.get(recommendation.gameId);
      if (!game) return [];
      return [
        {
          gameId: recommendation.gameId,
          rank: recommendation.rank,
          reason: recommendation.reason,
          title: game.title,
          genre: game.genre,
          minPlayers: game.minPlayers,
          maxPlayers: game.maxPlayers,
          averagePlayMinutes: game.averagePlayMinutes,
          played: game.played === true,
          loanStatus: game.loanStatus,
        },
      ];
    });
}

/** The failure half of the service's discriminated union, kept in sync with the
 * contract in `types.ts`. */
export type FailureReason = Extract<RecommendationResult, { ok: false }>["reason"];

/** Generic copy for transport failures / unexpected non-200 responses that carry
 * no modeled `reason` (used by the island when a `fetch` throws or the route
 * returns a `{ error }` body). */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Map a failure `reason` to user-facing copy plus a panel kind: `no_match` is the
 * neutral "no suitable game found" state (`kind: "empty"`), every other reason is
 * an error panel. Copy is English to match the page shells; the global
 * not-configured banner is separate and automatic.
 */
export function describeFailure(reason: FailureReason): { kind: "error" | "empty"; message: string } {
  switch (reason) {
    case "no_match":
      return {
        kind: "empty",
        message: "No suitable game found for those criteria. Try adjusting the player count, time, or genre.",
      };
    case "not_configured":
      return {
        kind: "error",
        message: "AI recommendations aren't configured yet. Add an OpenRouter API key to enable them.",
      };
    case "timeout":
      return {
        kind: "error",
        message: "The recommendation took too long to come back. Please try again.",
      };
    case "provider_error":
      return {
        kind: "error",
        message: "The recommendation service is unavailable right now. Please try again shortly.",
      };
    case "invalid_response":
      return {
        kind: "error",
        message: "We couldn't read the recommendation response. Please try again.",
      };
    case "out_of_catalog":
      return {
        kind: "error",
        message: "The AI suggested games that don't fit what you asked for. Please try again.",
      };
  }
}
