import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  createGame,
  createTwoMembers,
  deleteGames,
  requireLocalStack,
  seedMemberState,
  type TestMember,
} from "./harness";

/**
 * Risk #1, the half the DATABASE enforces (test-plan §2, amended 2026-09-12).
 *
 * `game_played` and `game_preference` carry `with check (member_id = auth.uid())`
 * on INSERT and `using` + `with check` on UPDATE/DELETE
 * (`supabase/migrations/20260722092117_create_member_game_state.sql:59-109`).
 * These assertions pass on the day they are written — their job is to go red if
 * someone loosens a predicate, which is why every one of them was watched fail
 * against a deliberately weakened policy before being committed.
 *
 * Two rules make the difference between a real assertion and a vacuous one:
 *
 *  1. RLS refuses UPDATE and DELETE by matching ZERO ROWS, not by raising. Only
 *     INSERT raises (42501). So a denial is proven by reading the row back and
 *     finding it unchanged — never by an error, and never by an empty result,
 *     which is also what you get when the row never existed.
 *  2. Every denial is paired with a POSITIVE CONTROL: the row's owner doing the
 *     same operation must succeed. Without it, a test proving "B cannot" would
 *     also pass if nobody could.
 */

let memberA: TestMember;
let memberB: TestMember;
const createdGames: string[] = [];

async function freshGame(title: string): Promise<string> {
  const id = await createGame(memberA, `${title} ${Date.now()}`);
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

describe("game_played is write-own at the policy layer", () => {
  it("refuses an insert carrying another member's id, and lets the owner insert their own", async () => {
    const gameId = await freshGame("played insert");

    const impersonation = await memberB.client.from("game_played").insert({ game_id: gameId, member_id: memberA.id });
    expect(impersonation.error?.code).toBe("42501");

    // The error is not the whole proof: assert no row landed either.
    const afterDenied = await memberA.client
      .from("game_played")
      .select("member_id")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterDenied.data).toHaveLength(0);

    // Positive control: the same insert, by its rightful owner.
    const owned = await memberA.client.from("game_played").insert({ game_id: gameId, member_id: memberA.id });
    expect(owned.error).toBeNull();
  });

  it("leaves another member's row untouched on delete, while the owner can delete it", async () => {
    const gameId = await freshGame("played delete");
    await seedMemberState(memberA, gameId);

    await memberB.client.from("game_played").delete().eq("game_id", gameId).eq("member_id", memberA.id);

    // The row must still be there — an empty delete result alone would prove nothing.
    const afterDenied = await memberA.client
      .from("game_played")
      .select("member_id")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterDenied.data).toHaveLength(1);

    // Positive control: the owner really can delete it.
    await memberA.client.from("game_played").delete().eq("game_id", gameId).eq("member_id", memberA.id);
    const afterOwned = await memberA.client
      .from("game_played")
      .select("member_id")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterOwned.data).toHaveLength(0);
  });
});

describe("game_preference is write-own at the policy layer", () => {
  it("refuses an insert carrying another member's id, and lets the owner insert their own", async () => {
    const gameId = await freshGame("preference insert");
    await seedMemberState(memberA, gameId);
    await seedMemberState(memberB, gameId);

    const impersonation = await memberB.client
      .from("game_preference")
      .insert({ game_id: gameId, member_id: memberA.id, preference: "disliked" });
    expect(impersonation.error?.code).toBe("42501");

    const afterDenied = await memberA.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterDenied.data).toHaveLength(0);

    const owned = await memberA.client
      .from("game_preference")
      .insert({ game_id: gameId, member_id: memberA.id, preference: "liked" });
    expect(owned.error).toBeNull();
  });

  it("leaves another member's preference unchanged on update, while the owner can change it", async () => {
    const gameId = await freshGame("preference update");
    await seedMemberState(memberA, gameId, "liked");

    await memberB.client
      .from("game_preference")
      .update({ preference: "disliked" })
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);

    // The value, not the row count, is what proves the denial.
    const afterDenied = await memberA.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id)
      .single();
    expect(afterDenied.data?.preference).toBe("liked");

    // Positive control: A can change their own.
    await memberA.client
      .from("game_preference")
      .update({ preference: "disliked" })
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    const afterOwned = await memberA.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id)
      .single();
    expect(afterOwned.data?.preference).toBe("disliked");
  });

  it("leaves another member's preference in place on delete, while the owner can remove it", async () => {
    const gameId = await freshGame("preference delete");
    await seedMemberState(memberA, gameId, "liked");

    await memberB.client.from("game_preference").delete().eq("game_id", gameId).eq("member_id", memberA.id);

    const afterDenied = await memberA.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterDenied.data).toHaveLength(1);

    await memberA.client.from("game_preference").delete().eq("game_id", gameId).eq("member_id", memberA.id);
    const afterOwned = await memberA.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(afterOwned.data).toHaveLength(0);
  });
});

/**
 * NEGATIVE SPACE — this asserts something that looks like a weakness, on purpose.
 *
 * SELECT on both per-member tables is `using (true)`
 * (`…20260722092117_create_member_game_state.sql:63,90`): every authenticated
 * member can read every member's rows. That is INTENDED. FR-006
 * (`context/foundation/prd.md:82`) is "view preference statistics per household
 * member", and `/stats` is built on exactly this — `listPreferenceStats`
 * (`src/lib/services/preferenceStats.ts:111-112`) queries both tables with no
 * member filter at all.
 *
 * The PRD draws its confidentiality line at signed-in vs. anonymous
 * (`prd.md:94`), not member vs. member. A previous review raised this and the
 * recorded decision was to document the household-as-tenant assumption rather
 * than change the policy
 * (`context/archive/2026-07-21-played-loan-and-preference/reviews/impl-review.md:113-121`).
 *
 * This test exists so that "hardening" the SELECT policy breaks a test instead
 * of breaking the stats page silently. If this app ever serves more than one
 * household, the policy must gain a membership predicate and THIS TEST SHOULD BE
 * DELETED along with the assumption it records.
 */
describe("cross-member reads are permitted by design (FR-006 depends on it)", () => {
  it("lets one member read another member's played and preference rows", async () => {
    const gameId = await freshGame("cross-member read");
    await seedMemberState(memberA, gameId, "liked");

    const played = await memberB.client
      .from("game_played")
      .select("member_id")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(played.data).toHaveLength(1);

    const preference = await memberB.client
      .from("game_preference")
      .select("preference")
      .eq("game_id", gameId)
      .eq("member_id", memberA.id);
    expect(preference.data).toHaveLength(1);
  });
});
