import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createGame, createTwoMembers, deleteGames, requireLocalStack, type TestMember } from "./harness";

/**
 * Proves the harness before anything is built on it: two distinct members exist,
 * each is really authenticated, and each can write its own row. If this file is
 * red, no conclusion drawn by the other db suites means anything.
 */

let memberA: TestMember;
let memberB: TestMember;
const createdGames: string[] = [];

beforeAll(async () => {
  await requireLocalStack();
  ({ memberA, memberB } = await createTwoMembers());
});

afterAll(async () => {
  await deleteGames(memberA, createdGames);
});

describe("the two-member harness", () => {
  it("creates two distinct authenticated members", () => {
    expect(memberA.id).toBeTruthy();
    expect(memberB.id).toBeTruthy();
    expect(memberA.id).not.toBe(memberB.id);
  });

  it("gives each member a session the database recognises as their own", async () => {
    // auth.uid() is what every write-own policy compares against; if the client
    // were anonymous this would be null and every later denial test would pass
    // for the wrong reason.
    const [a, b] = await Promise.all([memberA.client.auth.getUser(), memberB.client.auth.getUser()]);
    expect(a.data.user?.id).toBe(memberA.id);
    expect(b.data.user?.id).toBe(memberB.id);
  });

  it("lets each member write their own played row against the real database", async () => {
    const gameId = await createGame(memberA, `harness probe ${Date.now()}`);
    createdGames.push(gameId);

    const writes = await Promise.all([
      memberA.client.from("game_played").insert({ game_id: gameId, member_id: memberA.id }),
      memberB.client.from("game_played").insert({ game_id: gameId, member_id: memberB.id }),
    ]);
    expect(writes.map((w) => w.error)).toEqual([null, null]);

    const { data } = await memberA.client.from("game_played").select("member_id").eq("game_id", gameId);
    const owners = (data as { member_id: string }[]).map((row) => row.member_id).sort();
    expect(owners).toEqual([memberA.id, memberB.id].sort());
  });
});
