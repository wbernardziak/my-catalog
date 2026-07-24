import type { createClient } from "@/lib/supabase";
import type { GameFilters, GameRow, LoanStatus, NewGameInput } from "@/types";

/**
 * Catalog persistence for slice S-01. Callers construct the Supabase client
 * themselves (as API routes and pages already do) and pass the non-null client
 * in — the null-client check stays at the call site, mirroring the auth routes.
 */
type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * User-facing message for an update/soft-delete that matched no live row (unknown
 * or already-deleted id, including the concurrent-delete race). Shared by both
 * per-id endpoints so the copy never drifts.
 */
export const GAME_NOT_FOUND_MESSAGE = "That game no longer exists.";

/**
 * List live games in the shared catalog, newest first. Soft-deleted rows
 * (`deleted_at` set) are excluded. An optional `filters` narrows the result:
 * each present field adds one constraint, and all present filters combine as AND
 * (chained PostgREST predicates are AND by construction). Absent fields add no
 * constraint, so callers passing nothing keep the original unfiltered listing.
 *
 * Matching semantics: `genre` and `loanStatus` are exact equality; `players`
 * value N matches when `min_players ≤ N ≤ max_players` (a party of N fits the
 * game); `maxMinutes` value X matches when `avg_play_minutes ≤ X`. Throws on DB
 * error.
 */
export async function listGames(supabase: SupabaseClient, filters: GameFilters = {}): Promise<GameRow[]> {
  let query = supabase.from("games").select("*").is("deleted_at", null);

  if (filters.genre !== undefined) {
    query = query.eq("genre", filters.genre);
  }
  if (filters.players !== undefined) {
    query = query.lte("min_players", filters.players).gte("max_players", filters.players);
  }
  if (filters.maxMinutes !== undefined) {
    query = query.lte("avg_play_minutes", filters.maxMinutes);
  }
  if (filters.loanStatus !== undefined) {
    query = query.eq("loan_status", filters.loanStatus);
  }

  const result = await query.order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(`Failed to list games: ${result.error.message}`);
  }

  return result.data as GameRow[];
}

/**
 * Distinct genres present across live catalog rows, for the filter dropdown.
 * Deduped by **exact stored value** (case-sensitive) so every returned option
 * matches the case-sensitive `.eq("genre", …)` in `listGames` — a
 * case-insensitive dedup would collapse "Strategy"/"strategy" into one option
 * that hides the other casing's rows. Sorted case-insensitively for display
 * only. Household-scale data makes the client-side distinct trivial. Throws on
 * DB error, like `listGames`.
 */
export async function listGenres(supabase: SupabaseClient): Promise<string[]> {
  const result = await supabase.from("games").select("genre").is("deleted_at", null);

  if (result.error) {
    throw new Error(`Failed to list genres: ${result.error.message}`);
  }

  const rows = result.data as { genre: string }[];
  const distinct = [...new Set(rows.map((row) => row.genre))];
  return distinct.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Insert one game into the shared catalog and return the stored row. Maps the
 * camelCase input to snake_case columns; `created_by` is filled by the DB
 * default (`auth.uid()`). Throws on DB error.
 */
export async function createGame(supabase: SupabaseClient, input: NewGameInput): Promise<GameRow> {
  const result = await supabase
    .from("games")
    .insert({
      title: input.title,
      authors: input.authors,
      genre: input.genre,
      min_players: input.minPlayers,
      max_players: input.maxPlayers,
      avg_play_minutes: input.avgPlayMinutes,
      loan_status: input.loanStatus,
    })
    .select()
    .single();

  if (result.error) {
    throw new Error(`Failed to create game: ${result.error.message}`);
  }

  return result.data as GameRow;
}

/**
 * Update one live game's editable columns and return the stored row. Maps the
 * camelCase input to snake_case columns and stamps `updated_at` (no DB trigger
 * exists). Scoped to `deleted_at is null` so an unknown or already-soft-deleted
 * id — including the concurrent-delete race — matches zero rows and returns
 * `null` (the caller redirects with a friendly not-found message) rather than a
 * silent no-op. Throws on a real DB error.
 */
export async function updateGame(supabase: SupabaseClient, id: string, input: NewGameInput): Promise<GameRow | null> {
  const result = await supabase
    .from("games")
    .update({
      title: input.title,
      authors: input.authors,
      genre: input.genre,
      min_players: input.minPlayers,
      max_players: input.maxPlayers,
      avg_play_minutes: input.avgPlayMinutes,
      loan_status: input.loanStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to update game: ${result.error.message}`);
  }

  return result.data as GameRow | null;
}

/**
 * Set the shared loan status of one live game to a desired value and return the
 * stored row. Desired-state (not read-modify-write): writes `loan_status =
 * status` directly in a single round-trip, so it is idempotent and race-free —
 * consistent with the `played` endpoint's desired-state contract. Scoped to
 * `deleted_at is null` and stamps `updated_at` (no DB trigger); an unknown or
 * already-deleted id matches zero rows and returns `null` (the caller redirects
 * with a friendly not-found message). Throws on a real DB error.
 */
export async function setLoan(supabase: SupabaseClient, id: string, status: LoanStatus): Promise<GameRow | null> {
  const result = await supabase
    .from("games")
    .update({ loan_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to set loan status: ${result.error.message}`);
  }

  return result.data as GameRow | null;
}

/**
 * Soft-delete one live game by stamping `deleted_at`. Scoped to
 * `deleted_at is null` so an unknown or already-deleted id matches zero rows and
 * returns `false` (the caller redirects with a friendly not-found message);
 * `true` means a row was marked. Throws on a real DB error.
 */
export async function softDeleteGame(supabase: SupabaseClient, id: string): Promise<boolean> {
  const result = await supabase
    .from("games")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to delete game: ${result.error.message}`);
  }

  return result.data !== null;
}
