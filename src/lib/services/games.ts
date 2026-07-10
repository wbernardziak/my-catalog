import type { createClient } from "@/lib/supabase";
import type { GameRow, NewGameInput } from "@/types";

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
 * List every live game in the shared catalog, newest first. Soft-deleted rows
 * (`deleted_at` set) are excluded. Throws on DB error.
 */
export async function listGames(supabase: SupabaseClient): Promise<GameRow[]> {
  const result = await supabase
    .from("games")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(`Failed to list games: ${result.error.message}`);
  }

  return result.data as GameRow[];
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
