import type { createClient } from "@/lib/supabase";

/**
 * Per-member played + preference persistence for slice S-04. Mirrors the
 * `games.ts` conventions: callers pass in a non-null Supabase client (the
 * null-client check stays at the call site) and every function throws on a real
 * DB error. RLS ("write-own") is the security boundary — these functions pass
 * `member_id` explicitly so the calling member can only ever mutate their own
 * rows.
 */
type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/** Postgres FK-violation SQLSTATE — raised when a preference is inserted for a
 * game the member has not marked played (composite FK to `game_played`). */
const FK_VIOLATION = "23503";

/**
 * Set the calling member's played state for one game.
 *
 * `played=true` upserts a `game_played` row (idempotent on the `(game_id,
 * member_id)` unique key). `played=false` deletes the member's row; the matching
 * `game_preference` row (if any) is removed automatically by the composite FK's
 * `on delete cascade` — FR-005 is enforced in the DB, so there is no app-layer
 * cascade-clear. Throws on DB error.
 */
export async function setPlayed(
  supabase: SupabaseClient,
  gameId: string,
  memberId: string,
  played: boolean,
): Promise<void> {
  if (played) {
    const result = await supabase
      .from("game_played")
      .upsert({ game_id: gameId, member_id: memberId }, { onConflict: "game_id,member_id" });
    if (result.error) {
      throw new Error(`Failed to mark game played: ${result.error.message}`);
    }
    return;
  }

  const result = await supabase.from("game_played").delete().eq("game_id", gameId).eq("member_id", memberId);
  if (result.error) {
    throw new Error(`Failed to unmark game played: ${result.error.message}`);
  }
}

/**
 * Set or clear the calling member's like/dislike for one game.
 *
 * `preference` of `"liked"`/`"disliked"` upserts the `game_preference` row;
 * `null` deletes it. A preference is only valid for a played title: when no
 * `game_played` row exists for `(gameId, memberId)`, the insert violates the
 * composite FK (SQLSTATE 23503) — that specific error is caught and reported as
 * `{ ok: false }` so the caller can show "mark as played first" instead of a
 * 500. Any other DB error throws. Clearing a non-existent preference is a no-op
 * (`{ ok: true }`). Throws on unexpected DB error.
 */
export async function setPreference(
  supabase: SupabaseClient,
  gameId: string,
  memberId: string,
  preference: "liked" | "disliked" | null,
): Promise<{ ok: boolean }> {
  if (preference === null) {
    const result = await supabase.from("game_preference").delete().eq("game_id", gameId).eq("member_id", memberId);
    if (result.error) {
      throw new Error(`Failed to clear preference: ${result.error.message}`);
    }
    return { ok: true };
  }

  const result = await supabase
    .from("game_preference")
    .upsert({ game_id: gameId, member_id: memberId, preference }, { onConflict: "game_id,member_id" });

  if (result.error) {
    if (result.error.code === FK_VIOLATION) {
      return { ok: false };
    }
    throw new Error(`Failed to set preference: ${result.error.message}`);
  }

  return { ok: true };
}

/**
 * Read the calling member's per-member state for merging onto the catalog list:
 * the set of game-ids they have played and a map of game-id -> preference. RLS
 * would permit reading every member's rows (read-all), but the caller scopes to
 * one `memberId` here so the returned state is exactly the merge/filter input for
 * that member. Throws on DB error.
 */
export async function listMemberState(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ played: Set<string>; preference: Map<string, "liked" | "disliked"> }> {
  const [playedResult, preferenceResult] = await Promise.all([
    supabase.from("game_played").select("game_id").eq("member_id", memberId),
    supabase.from("game_preference").select("game_id, preference").eq("member_id", memberId),
  ]);

  if (playedResult.error) {
    throw new Error(`Failed to list played state: ${playedResult.error.message}`);
  }
  if (preferenceResult.error) {
    throw new Error(`Failed to list preference state: ${preferenceResult.error.message}`);
  }

  const played = new Set((playedResult.data as { game_id: string }[]).map((row) => row.game_id));
  const preference = new Map<string, "liked" | "disliked">(
    (preferenceResult.data as { game_id: string; preference: "liked" | "disliked" }[]).map((row) => [
      row.game_id,
      row.preference,
    ]),
  );

  return { played, preference };
}
