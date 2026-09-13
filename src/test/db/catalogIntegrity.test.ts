import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { listGames, listGenres, softDeleteGame } from "@/lib/services/games";
import { createGame, createMember, deleteGames, markDeleted, requireLocalStack, type TestMember } from "./harness";

/**
 * Risk #6: catalog integrity under soft-delete.
 *
 * The whole FR-002 guarantee rests on two lines of application code —
 * `.is("deleted_at", null)` in `listGames` (`src/lib/services/games.ts:31`) and
 * in `listGenres` (`:65`). Below them there is nothing: the `games` SELECT
 * policy is `using (true)`
 * (`supabase/migrations/20260710120000_create_games.sql:32-36`) and no policy,
 * view or trigger mentions `deleted_at`. Delete either line and the database
 * will hand deleted games straight back to the catalog; these tests are the
 * only thing that notices.
 *
 * Three properties, and the third is the one people forget:
 *
 *  1. A soft-deleted game is ABSENT from every read path.
 *  2. A live game is PRESENT in the same call — without this control, "absent"
 *     also passes when the query returns nothing at all.
 *  3. The deleted row is STILL IN STORAGE. This is what makes the delete soft.
 *     A suite that only checks (1) passes just as happily against a hard delete,
 *     which would destroy the catalog history FR-002 exists to protect.
 *
 * Fixtures are built with `markDeleted` (a direct `deleted_at` stamp) rather
 * than the real service, so a read assertion can never fail because
 * `softDeleteGame` regressed. The one test whose subject IS the deletion calls
 * the real service.
 */

let member: TestMember;
const createdGames: string[] = [];

/** Stays live. The positive control for every absence assertion. */
let liveGame: string;
/** Soft-deleted. Must vanish from reads and survive in storage. */
let deletedGame: string;

/**
 * Genres are per-fixture unique: `listGenres` reads the whole table, so a run
 * overlapping with another test's rows (or a developer's own data) would see
 * foreign genres. Only these two values are ever asserted on.
 */
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const LIVE_GENRE = `live-genre-${stamp}`;
const DELETED_GENRE = `deleted-genre-${stamp}`;

beforeAll(async () => {
  await requireLocalStack();
  member = await createMember("catalog");

  liveGame = await createGame(member, `live ${stamp}`, { genre: LIVE_GENRE });
  deletedGame = await createGame(member, `deleted ${stamp}`, { genre: DELETED_GENRE });
  createdGames.push(liveGame, deletedGame);

  await markDeleted(member, deletedGame);
}, 30_000);

afterAll(async () => {
  await deleteGames(member, createdGames);
});

describe("a soft-deleted game leaves every read path", () => {
  it("is absent from an unfiltered catalog read", async () => {
    const rows = await listGames(member.client, {});

    expect(rows.map((row) => row.id)).not.toContain(deletedGame);
  });

  it("still returns the live game in the same call", async () => {
    const rows = await listGames(member.client, {});

    // The control. "Absent" proves nothing if the query returned an empty list.
    expect(rows.map((row) => row.id)).toContain(liveGame);
  });

  it("does not offer a genre only a deleted game carries", async () => {
    const genres = await listGenres(member.client);

    expect(genres).not.toContain(DELETED_GENRE);
    expect(genres).toContain(LIVE_GENRE);
  });
});

describe("a soft-deleted game stays in storage", () => {
  it("is still selectable by id, with a non-null deleted_at", async () => {
    // Deliberately bypasses `listGames`: this asks the database what it holds,
    // not what the app chooses to show. A hard delete would fail here while
    // passing every absence test above.
    const result = await member.client.from("games").select("*").eq("id", deletedGame).maybeSingle();

    expect(result.error).toBeNull();

    // Narrowed rather than destructured: the client is schema-less, so the row
    // comes back untyped and the lint rules reject an unsafe `any` binding.
    const row = result.data as { id?: unknown; deleted_at?: unknown } | null;
    expect(row).not.toBeNull();
    expect(row?.id).toBe(deletedGame);
    expect(row?.deleted_at).toEqual(expect.any(String));
  });
});

describe("the soft-delete service guards an already-deleted row", () => {
  it("marks a live game once and refuses the second time", async () => {
    const target = await createGame(member, `double-delete ${stamp}`);
    createdGames.push(target);

    // The real service here, not `markDeleted` — this test's subject is the
    // deletion itself, so the fixture must not stand in for it.
    await expect(softDeleteGame(member.client, target)).resolves.toBe(true);

    // `.is("deleted_at", null)` at `games.ts:172` makes the second call match
    // zero rows, which the handler turns into the shared not-found copy rather
    // than re-stamping a row that was deleted days ago.
    await expect(softDeleteGame(member.client, target)).resolves.toBe(false);
  });
});
