import type { createClient } from "@/lib/supabase";
import type { CatalogGame, GameFilters, GameRow } from "@/types";
import { listGames } from "./games";
import { listMemberState } from "./memberGameState";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/** The calling member's per-member state, as `listMemberState` returns it. */
export interface MemberState {
  played: Set<string>;
  preference: Map<string, "liked" | "disliked">;
}

/**
 * Pure core of the catalog view-model: merge each catalog row with the calling
 * member's played/preference state and narrow by the per-member `played` /
 * `preference` filters. No Supabase — extracted so the decision logic is
 * unit-testable as a pure function (like `gameFilters`), keeping the project's
 * "no DB handler mock" convention.
 *
 * Merge: `played` is row-id ∈ `state.played`; `preference` is the member's
 * recorded like/dislike or `null` (unset, or not played). Filter (small data
 * volume, in memory): `filters.played === true/false` keeps played / not-played
 * rows (the "not played" case included); `filters.preference` keeps only rows
 * whose merged preference matches exactly (a not-played row has `null`
 * preference and never matches). Absent filters add no constraint.
 */
export function mergeAndFilterCatalog(games: GameRow[], state: MemberState, filters: GameFilters): CatalogGame[] {
  return games
    .map((game): CatalogGame => {
      const played = state.played.has(game.id);
      const preference = state.preference.get(game.id) ?? null;
      return { ...game, played, preference };
    })
    .filter((game) => {
      if (filters.played !== undefined && game.played !== filters.played) {
        return false;
      }
      if (filters.preference !== undefined && game.preference !== filters.preference) {
        return false;
      }
      return true;
    });
}

/**
 * Produce the catalog list the page renders: live games (catalog-level filters
 * applied by `listGames`) enriched with the calling member's played/preference
 * and narrowed by the per-member filters. A thin DB-fetch wrapper — the
 * enrichment/narrowing is delegated to the pure `mergeAndFilterCatalog`. Throws
 * on DB error (propagated from `listGames`/`listMemberState`).
 */
export async function listCatalogGames(
  supabase: SupabaseClient,
  memberId: string,
  filters: GameFilters,
): Promise<CatalogGame[]> {
  const [games, state] = await Promise.all([listGames(supabase, filters), listMemberState(supabase, memberId)]);
  return mergeAndFilterCatalog(games, state, filters);
}
