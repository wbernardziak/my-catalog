import type { createClient } from "@/lib/supabase";
import type { MemberStat } from "@/types";

/**
 * Per-member preference statistics for slice S-06. Mirrors the `catalogGames.ts`
 * split: a pure `computeMemberStats` core (unit-tested, no Supabase) fed by a
 * thin `listPreferenceStats` DB wrapper. Read-only — it relies on the S-04
 * "read-all" RLS so the caller sees every member's rows; no schema or RLS change.
 */
type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/** One `game_played` row, reduced to the only column stats care about. */
interface PlayedRow {
  member_id: string;
}

/** One `game_preference` row, reduced to what stats need. */
interface PreferenceRow {
  member_id: string;
  preference: "liked" | "disliked";
}

/** Accumulator while grouping rows by member. */
interface Counts {
  playedCount: number;
  likedCount: number;
  dislikedCount: number;
}

function emptyCounts(): Counts {
  return { playedCount: 0, likedCount: 0, dislikedCount: 0 };
}

/**
 * Group per-member rows into one `MemberStat` per member. Pure — the merge/order
 * logic is extracted so it is unit-testable without a DB (like
 * `mergeAndFilterCatalog`).
 *
 * Ordering/labeling is deterministic so the table columns are stable: the
 * calling member (`currentMemberId`) is ALWAYS first and labeled "You" — emitted
 * even with zero counts, so the caller always has their own column. Every other
 * member seen in either array follows, sorted by `member_id`, labeled
 * "Other member" (suffixed "2", "3", … when more than one exists). Because the
 * "You" row is always present, the result is never empty — use `hasAnyData`
 * (not `.length`) to decide the empty state.
 */
export function computeMemberStats(
  played: PlayedRow[],
  preference: PreferenceRow[],
  currentMemberId: string,
): MemberStat[] {
  const counts = new Map<string, Counts>();
  const ensure = (memberId: string): Counts => {
    let c = counts.get(memberId);
    if (!c) {
      c = emptyCounts();
      counts.set(memberId, c);
    }
    return c;
  };

  // The current member always has a column, even with no rows at all.
  ensure(currentMemberId);

  for (const row of played) {
    ensure(row.member_id).playedCount += 1;
  }
  for (const row of preference) {
    const c = ensure(row.member_id);
    if (row.preference === "liked") {
      c.likedCount += 1;
    } else {
      c.dislikedCount += 1;
    }
  }

  const others = [...counts.keys()].filter((id) => id !== currentMemberId).sort();

  const toStat = (memberId: string, isCurrent: boolean, label: string): MemberStat => ({
    memberId,
    isCurrent,
    label,
    ...(counts.get(memberId) ?? emptyCounts()),
  });

  return [
    toStat(currentMemberId, true, "You"),
    ...others.map((id, index) => toStat(id, false, index === 0 ? "Other member" : `Other member ${index + 1}`)),
  ];
}

/**
 * `true` iff at least one member has any recorded activity
 * (`playedCount + likedCount + dislikedCount > 0`). This is the empty-state
 * predicate the `/stats` page must use — NOT `stats.length === 0`, because
 * `computeMemberStats` always emits the "You" row, so the array is never empty.
 */
export function hasAnyData(stats: MemberStat[]): boolean {
  return stats.some((s) => s.playedCount + s.likedCount + s.dislikedCount > 0);
}

/**
 * Fetch every member's per-member rows and compute their stats. A thin DB
 * wrapper — the grouping is delegated to the pure `computeMemberStats`. The
 * "read-all" RLS on both tables means this returns all members' rows; the
 * caller passes `currentMemberId` only to label/order the result. Throws on DB
 * error.
 */
export async function listPreferenceStats(supabase: SupabaseClient, currentMemberId: string): Promise<MemberStat[]> {
  const [playedResult, preferenceResult] = await Promise.all([
    supabase.from("game_played").select("member_id"),
    supabase.from("game_preference").select("member_id, preference"),
  ]);

  if (playedResult.error) {
    throw new Error(`Failed to list played rows: ${playedResult.error.message}`);
  }
  if (preferenceResult.error) {
    throw new Error(`Failed to list preference rows: ${preferenceResult.error.message}`);
  }

  return computeMemberStats(playedResult.data, preferenceResult.data, currentMemberId);
}
