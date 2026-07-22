import { z } from "zod";
import type { GameFilters } from "@/types";

/**
 * Forgiving URL-param → `GameFilters` parser. Turns `Astro.url.searchParams`
 * into a validated filter set, silently dropping any param that is missing,
 * malformed, or out of range — so a stale bookmark or hand-edited URL never
 * errors the page. Mirrors the create endpoint's zod approach (`newGameSchema`),
 * but every field is `.catch(undefined)` so a bad value yields "field omitted"
 * instead of a thrown error.
 *
 * The query-param key names below (`genre`, `players`, `maxMinutes`, `loan`,
 * `played`, `preference`) are the canonical contract the filter form's input
 * `name`s must match. `played` is a tri-state control: absent = no constraint,
 * `"true"`/`"false"` = played / not-played for the calling member.
 */
const filterSchema = z.object({
  genre: z.string().trim().min(1).optional().catch(undefined),
  players: z.coerce.number().int().min(1).max(99).optional().catch(undefined),
  maxMinutes: z.coerce.number().int().min(1).max(6000).optional().catch(undefined),
  loan: z.enum(["available", "loaned"]).optional().catch(undefined),
  played: z.enum(["true", "false"]).optional().catch(undefined),
  preference: z.enum(["liked", "disliked"]).optional().catch(undefined),
});

/**
 * Parse the active filters from a `URLSearchParams`. Only valid values survive;
 * absent or invalid params are dropped. An empty/all-invalid query yields `{}`.
 */
export function parseGameFilters(params: URLSearchParams): GameFilters {
  // Absent keys must stay absent (not empty string) so `.optional()` — not the
  // min(1)/coerce rules — governs them; an empty string genre still drops via min(1).
  const raw = {
    genre: params.has("genre") ? params.get("genre") : undefined,
    players: params.has("players") ? params.get("players") : undefined,
    maxMinutes: params.has("maxMinutes") ? params.get("maxMinutes") : undefined,
    loan: params.has("loan") ? params.get("loan") : undefined,
    played: params.has("played") ? params.get("played") : undefined,
    preference: params.has("preference") ? params.get("preference") : undefined,
  };

  const parsed = filterSchema.parse(raw);

  const filters: GameFilters = {};
  if (parsed.genre !== undefined) filters.genre = parsed.genre;
  if (parsed.players !== undefined) filters.players = parsed.players;
  if (parsed.maxMinutes !== undefined) filters.maxMinutes = parsed.maxMinutes;
  if (parsed.loan !== undefined) filters.loanStatus = parsed.loan;
  if (parsed.played !== undefined) filters.played = parsed.played === "true";
  if (parsed.preference !== undefined) filters.preference = parsed.preference;

  return filters;
}
