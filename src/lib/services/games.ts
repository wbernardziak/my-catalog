import type { createClient } from "@/lib/supabase";
import type { GameRow, NewGameInput } from "@/types";

/**
 * Catalog persistence for slice S-01. Callers construct the Supabase client
 * themselves (as API routes and pages already do) and pass the non-null client
 * in — the null-client check stays at the call site, mirroring the auth routes.
 */
type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/** List every game in the shared catalog, newest first. Throws on DB error. */
export async function listGames(supabase: SupabaseClient): Promise<GameRow[]> {
  const result = await supabase.from("games").select("*").order("created_at", { ascending: false });

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
