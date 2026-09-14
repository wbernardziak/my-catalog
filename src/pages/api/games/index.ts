import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { createGame } from "@/lib/services/games";

export const prerender = false;

/**
 * Authors are submitted as ONE text field and split server-side into `text[]`.
 * This is the contract the React form (Phase 3) mirrors: a single
 * comma/newline-separated string in, a trimmed, empty-filtered array out.
 */
const AUTHOR_SEPARATORS = /[\n,]/;

export function parseAuthors(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(AUTHOR_SEPARATORS)
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

/**
 * Validated add-game payload. Text inputs arrive as strings; player counts and
 * minutes are coerced to positive ints, and `maxPlayers >= minPlayers` is
 * enforced with a refine. Output matches `NewGameInput`.
 */
export const newGameSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    authors: z.array(z.string()),
    genre: z.string().trim().min(1, "Genre is required"),
    minPlayers: z.coerce
      .number()
      .int()
      .min(1, "Minimum players must be at least 1")
      .max(99, "Minimum players is unrealistically large"),
    maxPlayers: z.coerce
      .number()
      .int()
      .min(1, "Maximum players must be at least 1")
      .max(99, "Maximum players is unrealistically large"),
    avgPlayMinutes: z.coerce
      .number()
      .int()
      .positive("Average play time must be greater than 0")
      .max(6000, "Average play time is unrealistically large"),
    loanStatus: z.enum(["available", "loaned"]).default("available"),
  })
  .refine((value) => value.maxPlayers >= value.minPlayers, {
    message: "Maximum players must be greater than or equal to minimum players",
    path: ["maxPlayers"],
  });

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/catalog?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Defense in depth: the middleware already gates /catalog, but the endpoint
  // must not persist for an unauthenticated caller either.
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[games] could not parse the submitted form", err);
    // An unparseable body must not escape as a framework 500; the house
    // convention is a friendly `?error=` redirect.
    return context.redirect(
      `/catalog?error=${encodeURIComponent("Could not read the submitted form. Please try again.")}`,
    );
  }
  const parsed = newGameSchema.safeParse({
    title: form.get("title") ?? "",
    authors: parseAuthors(form.get("authors")),
    genre: form.get("genre") ?? "",
    minPlayers: form.get("minPlayers") ?? "",
    maxPlayers: form.get("maxPlayers") ?? "",
    avgPlayMinutes: form.get("avgPlayMinutes") ?? "",
    loanStatus: form.get("loanStatus") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid game details";
    return context.redirect(`/catalog?error=${encodeURIComponent(message)}`);
  }

  try {
    await createGame(supabase, parsed.data);
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[games] could not save the game", err);
    return context.redirect(`/catalog?error=${encodeURIComponent("Could not save the game. Please try again.")}`);
  }

  return context.redirect("/catalog");
};
