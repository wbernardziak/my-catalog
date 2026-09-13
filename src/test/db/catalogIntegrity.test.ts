import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { listCatalogGames } from "@/lib/services/catalogGames";
import { listGames, listGenres, softDeleteGame } from "@/lib/services/games";
import type { GameFilters } from "@/types";
import {
  createGame,
  createMember,
  deleteGames,
  markDeleted,
  requireLocalStack,
  seedMemberState,
  type TestMember,
} from "./harness";

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

/**
 * The filter values every composition case below uses.
 *
 * PLAYERS and MAX_MINUTES are load-bearing, not arbitrary. `listGames` filters a
 * party of N with `min_players <= N <= max_players` (`games.ts:37`) and a
 * duration with `avg_play_minutes <= X` (`:40`) — all three boundaries
 * inclusive. A fixture sitting in the middle of those ranges would keep matching
 * after `.gte` became `.gt`, so the deliberate break would stay green and prove
 * nothing. `matchAll` therefore sits EXACTLY on every boundary: min_players and
 * max_players both equal PLAYERS, avg_play_minutes equals MAX_MINUTES.
 */
const MATCH_GENRE = `match-genre-${stamp}`;
const DECOY_GENRE = `decoy-genre-${stamp}`;
const PLAYERS = 4;
const MAX_MINUTES = 90;
const LOAN = "loaned" as const;

/** Live, and matches all six filter dimensions simultaneously. */
let matchAll: string;
/** The same six attributes, soft-deleted. Must never come back under any filter. */
let deletedTwin: string;
/** Live, and matches none of them. Proves the filters actually narrow. */
let decoy: string;

beforeAll(async () => {
  await requireLocalStack();
  member = await createMember("catalog");

  liveGame = await createGame(member, `live ${stamp}`, { genre: LIVE_GENRE });
  deletedGame = await createGame(member, `deleted ${stamp}`, { genre: DELETED_GENRE });

  const matchingColumns = {
    genre: MATCH_GENRE,
    min_players: PLAYERS,
    max_players: PLAYERS,
    avg_play_minutes: MAX_MINUTES,
    loan_status: LOAN,
  };
  matchAll = await createGame(member, `match-all ${stamp}`, matchingColumns);

  // Identical on every filterable column — the twin must be excluded because it
  // is deleted, never because it failed a filter on its own merits.
  deletedTwin = await createGame(member, `deleted-twin ${stamp}`, matchingColumns);

  decoy = await createGame(member, `decoy ${stamp}`, {
    genre: DECOY_GENRE,
    min_players: 2,
    max_players: 2,
    avg_play_minutes: 180,
    loan_status: "available",
  });

  createdGames.push(liveGame, deletedGame, matchAll, deletedTwin, decoy);

  // Per-member state for the two JS-layer filters. Seeded on the twin as well:
  // that is what proves the in-memory merge stage cannot reintroduce a deleted
  // game through its played/preference rows. Played before preference — the
  // composite FK requires it.
  await seedMemberState(member, matchAll, "liked");
  await seedMemberState(member, deletedTwin, "liked");

  await markDeleted(member, deletedGame);
  await markDeleted(member, deletedTwin);
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

/**
 * The challenge §2 raises for this risk: that excluding deleted rows in ONE
 * query proves it everywhere. It does not, and the reason is structural —
 * filtering happens at two layers. `genre`, `players`, `maxMinutes` and
 * `loanStatus` are columns on `games` and become PostgREST predicates
 * (`games.ts:34-44`); `played` and `preference` are per-member facts in other
 * tables and are applied in memory afterwards (`catalogGames.ts:35-40`). A case
 * per layer is the minimum that can tell the two apart.
 *
 * Every case asserts BOTH directions at once: the deleted twin is absent, and
 * the live game that matches the same filter is present. One without the other
 * is half a test — absence alone also passes when the query returns nothing.
 */
describe("filter composition never resurrects a deleted game, nor drops a live one", () => {
  const dimensions: { name: string; filters: GameFilters }[] = [
    { name: "genre", filters: { genre: MATCH_GENRE } },
    { name: "players", filters: { players: PLAYERS } },
    { name: "maxMinutes", filters: { maxMinutes: MAX_MINUTES } },
    { name: "loanStatus", filters: { loanStatus: LOAN } },
    { name: "played", filters: { played: true } },
    { name: "preference", filters: { preference: "liked" } },
  ];

  it.each(dimensions)("holds under the $name filter", async ({ filters }) => {
    // Via listCatalogGames, not listGames: it is the composite both /catalog and
    // /api/recommendations call, and the only level where the JS-layer filters
    // exist at all.
    const rows = await listCatalogGames(member.client, member.id, filters);
    const ids = rows.map((row) => row.id);

    expect(ids).not.toContain(deletedTwin);
    expect(ids).toContain(matchAll);
  });

  it("holds with all six filters applied at once", async () => {
    const rows = await listCatalogGames(member.client, member.id, {
      genre: MATCH_GENRE,
      players: PLAYERS,
      maxMinutes: MAX_MINUTES,
      loanStatus: LOAN,
      played: true,
      preference: "liked",
    });
    const ids = rows.map((row) => row.id);

    // The genre is unique to this run, so the result set is exactly this
    // fixture's rows and an equality assertion is safe here.
    expect(ids).toEqual([matchAll]);
    expect(ids).not.toContain(deletedTwin);
    expect(ids).not.toContain(decoy);
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
