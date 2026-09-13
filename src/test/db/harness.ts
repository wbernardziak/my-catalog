import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { GameRow } from "@/types";

/**
 * Harness for tests that need a REAL database.
 *
 * Everything here talks to a running local Supabase stack over the same client
 * library and JWT path the app uses (`src/lib/supabase.ts`), so a policy this
 * harness observes is the policy production would apply. See ./README.md for
 * what that buys and what it costs.
 */

/** The local stack this repo runs (`project_id = "my-catalog"`, see supabase/config.toml). */
const DEFAULT_URL = "http://127.0.0.1:54331";

/**
 * The Supabase CLI's stock local anon key — public, identical on every local
 * stack, and worthless outside one (issuer "supabase-demo"). Hardcoding it is
 * what lets both `npm run test:db` and CI run with no secrets configured. Any
 * real key comes from the environment instead.
 */
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const SUPABASE_URL = process.env.SUPABASE_URL ?? DEFAULT_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY ?? DEFAULT_ANON_KEY;

const START_HINT =
  `Cannot reach a Supabase stack at ${SUPABASE_URL}.\n` +
  `  Start it with:  npx supabase start\n` +
  `  This repo's stack is project_id "my-catalog" on ports 54330-54339 (API 54331).\n` +
  `  These tests never skip: a database suite that quietly passes with no database\n` +
  `  is indistinguishable from one that has no assertions.`;

/** Hosts these tests are allowed to touch without an explicit opt-in. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Refuse to run against anything but a local stack.
 *
 * This suite is destructive in ways the application never is: it signs up users
 * it cannot remove (that needs a service_role key), inserts into the shared
 * catalog, and HARD-deletes `games` rows. The app only ever soft-deletes, and a
 * hard delete cascades played + preference state away for every member,
 * irreversibly (`supabase/migrations/20260722092117_create_member_game_state.sql:17-23`).
 *
 * `SUPABASE_URL` is an override for pointing at a DIFFERENT LOCAL STACK. Aiming
 * it at a hosted project would do all of the above to real data, so that needs a
 * deliberate `DB_TESTS_ALLOW_REMOTE=1`.
 */
function requireLocalHost(): void {
  const host = new URL(SUPABASE_URL).hostname;
  if (LOCAL_HOSTS.has(host)) return;
  if (process.env.DB_TESTS_ALLOW_REMOTE === "1") return;
  throw new Error(
    `Refusing to run destructive database tests against non-local host "${host}".\n` +
      `  This suite signs up users it cannot delete and HARD-deletes rows from \`games\`,\n` +
      `  which cascades every member's played and preference state away irreversibly.\n` +
      `  If you genuinely mean to target ${SUPABASE_URL}, set DB_TESTS_ALLOW_REMOTE=1.`,
  );
}

async function probe(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, { headers, signal: AbortSignal.timeout(5000) });
}

/**
 * Fail loudly — never skip — when the stack is missing, unmigrated, or half up.
 *
 * A bare `GET /rest/v1/` answers 200 even with no apikey, so it proves almost
 * nothing. These three checks each have a distinct, actionable failure.
 */
export async function requireLocalStack(): Promise<void> {
  requireLocalHost();

  let rest: Response;
  try {
    rest = await probe("/rest/v1/games?select=id&limit=1", { apikey: SUPABASE_ANON_KEY });
  } catch (err) {
    throw new Error(`${START_HINT}\n  Underlying error: ${String(err)}`);
  }

  // PGRST205: reachable, but `public.games` is not in the schema cache — the
  // stack is up and this repo's migrations were never applied to it.
  if (rest.status === 404) {
    throw new Error(
      `Reached ${SUPABASE_URL} but \`public.games\` does not exist.\n` +
        `  The stack is running someone else's schema, or migrations were never applied.\n` +
        `  Fix with:  npx supabase db reset`,
    );
  }
  if (!rest.ok) {
    throw new Error(`${START_HINT}\n  Reachable but /rest/v1/games answered HTTP ${rest.status}.`);
  }

  // Every member is created through GoTrue; if it is down the failure would
  // otherwise surface as an opaque sign-up error.
  const auth = await probe("/auth/v1/health", { apikey: SUPABASE_ANON_KEY });
  if (!auth.ok) {
    throw new Error(`${START_HINT}\n  REST is up but the auth service answered HTTP ${auth.status}.`);
  }
}

/**
 * The client type these tests hand around. Inferred from `anonClient` rather than
 * annotated: supabase-js's own default generics resolve every table row to `never`,
 * and writing the app's client type here would require an `any` the lint rules
 * reject. Structurally compatible with the services' `SupabaseClient`
 * (`src/lib/services/games.ts:9`), which is why `listMemberState` accepts it.
 */
type TestClient = ReturnType<typeof anonClient>;

/** One authenticated household member: their own client, bound to their own JWT. */
export interface TestMember {
  id: string;
  email: string;
  client: TestClient;
}

/**
 * An unauthenticated client: the anon key and no session. This is what a caller
 * with no cookie looks like to the database, and the role every policy in this
 * schema deliberately omits.
 */
export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Create one signed-in member with a unique email. Fresh per run, so nothing
 * carries between runs and two runs can overlap without colliding.
 */
export async function createMember(label: string): Promise<TestMember> {
  const email = `dbtest-${label}-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const client = anonClient();

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`Could not create test member "${label}": ${error.message}`);

  const id = data.user?.id;
  if (!id) throw new Error(`Sign-up for "${label}" returned no user id (is email confirmation on?)`);
  if (!data.session) throw new Error(`Sign-up for "${label}" returned no session (is email confirmation on?)`);

  return { id, email, client };
}

/** Members A and B: two distinct households members for one test file. */
export async function createTwoMembers(): Promise<{ memberA: TestMember; memberB: TestMember }> {
  const [memberA, memberB] = await Promise.all([createMember("a"), createMember("b")]);
  if (memberA.id === memberB.id) throw new Error("The two test members share an id");
  return { memberA, memberB };
}

/**
 * The columns `createGame` lets a caller vary. Based on `GameRow` — the
 * snake_case stored shape — deliberately, and NOT on `NewGameInput`, which is
 * the camelCase create payload the API layer validates: camelCase keys would be
 * silently ignored by PostgREST and the fixture would quietly keep the defaults.
 *
 * These are exactly the columns `listGames` filters on
 * (`src/lib/services/games.ts:34-44`), which is the point — a catalog-filter
 * test cannot exist until a fixture can place a game inside or outside each
 * dimension.
 */
export type GameOverrides = Partial<
  Pick<GameRow, "genre" | "min_players" | "max_players" | "avg_play_minutes" | "loan_status">
>;

/**
 * Insert a game as `member` and return its id.
 *
 * `games` is a shared catalog — every authenticated member may write every row
 * (`supabase/migrations/20260710120000_create_games.sql:32-55`) — so which member
 * creates it carries no meaning for these tests.
 *
 * `overrides` place the row inside or outside a catalog filter. Omit it and the
 * row keeps the fixed values every existing caller relies on.
 */
export async function createGame(member: TestMember, title: string, overrides: GameOverrides = {}): Promise<string> {
  const { data, error } = await member.client
    .from("games")
    .insert({
      title,
      authors: ["Test Author"],
      genre: "Strategy",
      min_players: 2,
      max_players: 4,
      avg_play_minutes: 60,
      loan_status: "available",
      created_by: member.id,
      ...overrides,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create game "${title}": ${error.message}`);

  // Narrowed at runtime rather than asserted: the client is schema-less, so the
  // row comes back untyped, and a null here would otherwise surface much later
  // as an undefined game id in a fixture.
  const id: unknown = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error(`Game "${title}" was created without a usable id`);
  return id;
}

/**
 * Soft-delete a game the way the app does: stamp `deleted_at`, leave the row.
 *
 * This is NOT `deleteGames`. That one hard-deletes for teardown and is the
 * opposite of what the app ever does; confusing the two is how a suite silently
 * stops testing soft-delete and starts testing nothing.
 *
 * Deliberately a direct `update` rather than a call to `softDeleteGame`: tests
 * whose subject is a *read* must not fail because the delete service regressed.
 * The one test whose subject IS the deletion calls the real service instead.
 */
export async function markDeleted(member: TestMember, gameId: string): Promise<void> {
  const { error } = await member.client.from("games").update({ deleted_at: new Date().toISOString() }).eq("id", gameId);
  if (error) throw new Error(`Could not soft-delete game ${gameId}: ${error.message}`);
}

/**
 * Mark a game played, then optionally set a preference, as `member`.
 *
 * The order is not stylistic: `game_preference` carries a composite FK to
 * `game_played (game_id, member_id)`
 * (`supabase/migrations/20260722143000_member_game_state_pk_and_indexes.sql:37-41`),
 * so a preference row cannot exist before the matching played row.
 */
export async function seedMemberState(
  member: TestMember,
  gameId: string,
  preference?: "liked" | "disliked",
): Promise<void> {
  const played = await member.client
    .from("game_played")
    .upsert({ game_id: gameId, member_id: member.id }, { onConflict: "game_id,member_id" });
  if (played.error) throw new Error(`Could not seed played state: ${played.error.message}`);

  if (preference === undefined) return;

  const pref = await member.client
    .from("game_preference")
    .upsert({ game_id: gameId, member_id: member.id, preference }, { onConflict: "game_id,member_id" });
  if (pref.error) throw new Error(`Could not seed preference: ${pref.error.message}`);
}

/**
 * Delete the games a test created. `on delete cascade` on `game_played.game_id`
 * takes the per-member rows with them, and the composite FK takes the
 * preferences — so one delete per game is the whole teardown.
 *
 * The auth users a run created are deliberately left behind: removing them needs
 * the service_role key, which this codebase does not have anywhere, and stray
 * rows in a local `auth.users` are untidy rather than harmful.
 */
export async function deleteGames(member: TestMember | undefined, gameIds: string[]): Promise<void> {
  // `member` can be undefined when beforeAll threw before creating one.
  if (!member || gameIds.length === 0) return;
  const { error } = await member.client.from("games").delete().in("id", gameIds);
  if (error) throw new Error(`Could not clean up games: ${error.message}`);
}
