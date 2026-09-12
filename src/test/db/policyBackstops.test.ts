import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { setPreference } from "@/lib/services/memberGameState";
import {
  anonClient,
  createGame,
  createTwoMembers,
  deleteGames,
  requireLocalStack,
  seedMemberState,
  type TestMember,
} from "./harness";

/**
 * Two guarantees the application leans on that only the DATABASE provides, and
 * that nothing else in this repo can check.
 *
 * Both are asserted in migration comments and were, until now, taken on trust.
 * They are not Risk #1 — they are the backstops underneath it.
 */

let memberA: TestMember;
let memberB: TestMember;
const createdGames: string[] = [];

async function freshGame(name: string): Promise<string> {
  const id = await createGame(memberA, `backstop ${name} ${Date.now()}`);
  createdGames.push(id);
  return id;
}

beforeAll(async () => {
  await requireLocalStack();
  ({ memberA, memberB } = await createTwoMembers());
});

afterAll(async () => {
  await deleteGames(memberA, createdGames);
});

/**
 * `supabase/migrations/20260710120000_create_games.sql:29-31` and
 * `…_create_member_game_state.sql:47` both claim: "No `anon` policy exists, so
 * unauthenticated requests see nothing."
 *
 * `src/pages/api/games/boundary.test.ts` proves the APPLICATION turns a
 * sessionless request away. That is a different claim: it would still hold if
 * every policy were `using (true)`. This proves the DATABASE refuses the `anon`
 * role, which is what makes the app guard defence-in-depth rather than the only
 * thing standing there.
 */
describe("the anon role is refused by the database, not only by the app", () => {
  let gameId: string;

  beforeAll(async () => {
    // Real rows must exist, or "anon sees nothing" is trivially true.
    gameId = await freshGame("anon");
    await seedMemberState(memberA, gameId, "liked");
  });

  it("sees no rows in any table, though rows exist", async () => {
    const anon = anonClient();
    const [games, played, preference] = await Promise.all([
      anon.from("games").select("id").eq("id", gameId),
      anon.from("game_played").select("game_id").eq("game_id", gameId),
      anon.from("game_preference").select("game_id").eq("game_id", gameId),
    ]);

    // Control: the same rows are visible to an authenticated member.
    const visible = await memberA.client.from("games").select("id").eq("id", gameId);
    expect(visible.data).toHaveLength(1);

    expect(games.data).toEqual([]);
    expect(played.data).toEqual([]);
    expect(preference.data).toEqual([]);
  });

  it("cannot write to any table", async () => {
    const anon = anonClient();

    const game = await anon.from("games").insert({
      title: "anon should not be able to add this",
      authors: ["nobody"],
      genre: "Strategy",
      min_players: 2,
      max_players: 4,
      avg_play_minutes: 60,
      loan_status: "available",
    });
    expect(game.error?.code).toBe("42501");

    const played = await anon.from("game_played").insert({ game_id: gameId, member_id: memberB.id });
    expect(played.error?.code).toBe("42501");

    const preference = await anon
      .from("game_preference")
      .insert({ game_id: gameId, member_id: memberB.id, preference: "liked" });
    expect(preference.error?.code).toBe("42501");
  });
});

/**
 * FR-005: a preference is only meaningful for a title you have played. That rule
 * is enforced by a composite FK from `game_preference (game_id, member_id)` to
 * `game_played` (`…20260722143000_member_game_state_pk_and_indexes.sql:37-41`),
 * and the application depends on it being enforced THERE:
 * `src/lib/services/memberGameState.ts:88-95` catches SQLSTATE 23503 plus that
 * exact constraint name and turns it into a friendly "mark as played first".
 *
 * Drop the FK and that user-facing path goes dead silently — the insert would
 * simply succeed. So this asserts both halves: the database raises, and the
 * service translates.
 */
describe("the composite FK enforces FR-005 (played before preference)", () => {
  it("refuses a preference for a game the member has not played", async () => {
    const gameId = await freshGame("fk unplayed");

    const result = await memberA.client
      .from("game_preference")
      .insert({ game_id: gameId, member_id: memberA.id, preference: "liked" });

    expect(result.error?.code).toBe("23503");
    // The service matches on the constraint name, so a rename would break it.
    expect(`${result.error?.details} ${result.error?.message}`).toContain("game_preference_game_id_member_id_fkey");
  });

  it("accepts the same preference once the game is played", async () => {
    const gameId = await freshGame("fk played");
    await seedMemberState(memberA, gameId);

    const result = await memberA.client
      .from("game_preference")
      .insert({ game_id: gameId, member_id: memberA.id, preference: "liked" });

    expect(result.error).toBeNull();
  });

  it("surfaces the violation to the app as { ok: false }, not as a throw", async () => {
    const gameId = await freshGame("fk service");

    // The real service, so a change to its error matching is caught here too.
    await expect(setPreference(memberA.client, gameId, memberA.id, "liked")).resolves.toEqual({ ok: false });

    await seedMemberState(memberA, gameId);
    await expect(setPreference(memberA.client, gameId, memberA.id, "liked")).resolves.toEqual({ ok: true });
  });
});
