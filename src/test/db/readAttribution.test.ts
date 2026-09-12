import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { listMemberState } from "@/lib/services/memberGameState";
import { listCatalogGames } from "@/lib/services/catalogGames";
import {
  createGame,
  createTwoMembers,
  deleteGames,
  requireLocalStack,
  seedMemberState,
  type TestMember,
} from "./harness";

/**
 * Risk #1, the half NOTHING enforces but one line of application code.
 *
 * SELECT is `using (true)` on both per-member tables, so the two
 * `.eq("member_id", memberId)` calls in
 * `src/lib/services/memberGameState.ts:114-115` are the sole authority for read
 * attribution — and every scoped read path in the app (`/catalog` and
 * `/api/recommendations`) funnels through them. Delete one and the database
 * will not stop you; these tests will.
 *
 * Two design rules, both from research:
 *
 *  1. Both members hold state on the SAME games, and their state DIFFERS. A
 *     fixture where both members like the same game passes even with the filter
 *     removed, which would make the whole file decorative.
 *  2. At least one game carries OPPOSING preferences. The preference map is
 *     built unordered with last-write-wins
 *     (`memberGameState.ts:125-131`), so a merged read is non-deterministic —
 *     opposing values are what make a dropped filter reliably visible instead of
 *     visible half the time.
 */

let memberA: TestMember;
let memberB: TestMember;
const createdGames: string[] = [];

/** Both played it; A liked it, B disliked it. The dropped-filter tripwire. */
let opposed: string;
/** Only A played it. */
let onlyA: string;
/** Only B played it. */
let onlyB: string;

beforeAll(async () => {
  await requireLocalStack();
  ({ memberA, memberB } = await createTwoMembers());

  const stamp = Date.now();
  // Recorded one at a time: a batch push after the last create would leak the
  // earlier rows if any create threw.
  const fresh = async (name: string) => {
    const id = await createGame(memberA, `attribution ${name} ${stamp}`);
    createdGames.push(id);
    return id;
  };
  opposed = await fresh("opposed");
  onlyA = await fresh("only-a");
  onlyB = await fresh("only-b");

  await seedMemberState(memberA, opposed, "liked");
  await seedMemberState(memberB, opposed, "disliked");
  await seedMemberState(memberA, onlyA, "liked");
  await seedMemberState(memberB, onlyB, "disliked");
});

afterAll(async () => {
  await deleteGames(memberA, createdGames);
});

describe("listMemberState is scoped by the app, not the policy layer — SELECT is using(true)", () => {
  it("gives member A their own played set — B's game is absent, not merely ranked lower", async () => {
    const state = await listMemberState(memberA.client, memberA.id);

    expect(state.played.has(opposed)).toBe(true);
    expect(state.played.has(onlyA)).toBe(true);
    expect(state.played.has(onlyB)).toBe(false);
  });

  it("gives member B their own played set", async () => {
    const state = await listMemberState(memberB.client, memberB.id);

    expect(state.played.has(opposed)).toBe(true);
    expect(state.played.has(onlyB)).toBe(true);
    expect(state.played.has(onlyA)).toBe(false);
  });

  it("returns each member's own preference on the game they disagree about", async () => {
    const [a, b] = await Promise.all([
      listMemberState(memberA.client, memberA.id),
      listMemberState(memberB.client, memberB.id),
    ]);

    expect(a.preference.get(opposed)).toBe("liked");
    expect(b.preference.get(opposed)).toBe("disliked");
    // The two results must actually differ; identical state would let a
    // dropped member filter pass unnoticed.
    expect(a.preference.get(opposed)).not.toBe(b.preference.get(opposed));
  });

  it("does not leak the other member's preference for a game they alone rated", async () => {
    const a = await listMemberState(memberA.client, memberA.id);
    const b = await listMemberState(memberB.client, memberB.id);

    expect(a.preference.has(onlyB)).toBe(false);
    expect(b.preference.has(onlyA)).toBe(false);
  });
});

describe("listCatalogGames merges each member's own state onto the shared catalog (app-enforced)", () => {
  it("shows member A their own played flags and preferences", async () => {
    const games = await listCatalogGames(memberA.client, memberA.id, {});
    const byId = new Map(games.map((g) => [g.id, g]));

    // The catalog itself is shared: all three games are visible to both members.
    expect(byId.has(opposed)).toBe(true);
    expect(byId.has(onlyA)).toBe(true);
    expect(byId.has(onlyB)).toBe(true);

    expect(byId.get(opposed)?.played).toBe(true);
    expect(byId.get(opposed)?.preference).toBe("liked");
    expect(byId.get(onlyA)?.played).toBe(true);
    // B played this one, not A — the meeple must be empty for A.
    expect(byId.get(onlyB)?.played).toBe(false);
    expect(byId.get(onlyB)?.preference).toBeNull();
  });

  it("shows member B the opposite state on the same shared rows", async () => {
    const games = await listCatalogGames(memberB.client, memberB.id, {});
    const byId = new Map(games.map((g) => [g.id, g]));

    expect(byId.get(opposed)?.played).toBe(true);
    expect(byId.get(opposed)?.preference).toBe("disliked");
    expect(byId.get(onlyB)?.played).toBe(true);
    expect(byId.get(onlyA)?.played).toBe(false);
    expect(byId.get(onlyA)?.preference).toBeNull();
  });
});
