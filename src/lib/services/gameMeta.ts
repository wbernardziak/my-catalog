/**
 * Display logic for the shape-based game metadata (pips, duration, meeples).
 *
 * Kept pure and out of the components so the edge cases — a game saved without a
 * player count, a play time of zero, a range wider than the pip row can show —
 * are settled once and testable, rather than re-derived in each of the three
 * consumers.
 */

/** Player counts above this render as "N+" rather than a longer pip row. */
export const MAX_PIPS = 6;

export type PipState = "supported" | "unsupported";

export interface PlayerPips {
  /** One entry per pip, left to right. Empty when the range is unusable. */
  pips: PipState[];
  /** Screen-reader and tooltip text; the pips are decorative next to it. */
  label: string;
  /** True when the real range extends past what the pips can show. */
  overflow: boolean;
}

/** Duration buckets, coarse enough to scan at a glance when picking a game. */
export type DurationBucket = "quick" | "short" | "medium" | "long" | "unknown";

export interface Duration {
  bucket: DurationBucket;
  label: string;
  /** Die face 1–6, or null when the play time is missing or nonsensical. */
  pips: number | null;
}

function isUsableCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * A pip row for a player range: filled pips inside the supported range, hollow
 * ones up to `MAX_PIPS`. A missing, zero, or inverted range yields no pips and a
 * plain "Players unknown" label rather than a misleading row.
 */
export function playerPips(min: unknown, max: unknown): PlayerPips {
  const unknownRange: PlayerPips = { pips: [], label: "Players unknown", overflow: false };

  const usableMin = isUsableCount(min) ? min : null;
  const usableMax = isUsableCount(max) ? max : null;

  // Either end alone is enough to draw a row; neither is not.
  const low = usableMin ?? usableMax;
  const high = usableMax ?? usableMin;
  if (low === null || high === null) return unknownRange;

  // A range saved the wrong way round (max < min) is data we cannot draw
  // honestly, so it degrades to the unknown state instead of an empty row.
  if (high < low) return unknownRange;

  const shown = Math.min(high, MAX_PIPS);
  const pips: PipState[] = [];
  for (let seat = 1; seat <= MAX_PIPS; seat += 1) {
    pips.push(seat >= low && seat <= shown ? "supported" : "unsupported");
  }

  const overflow = high > MAX_PIPS;
  const range = low === high ? `${low}` : `${low}–${high}`;
  const label = `${range}${overflow ? "+" : ""} player${high === 1 ? "" : "s"}`;

  return { pips, label, overflow };
}

/**
 * Bucket a play time. Boundaries are inclusive of the lower bucket: 30 minutes
 * is "quick", 31 is "short".
 */
export function duration(minutes: unknown): Duration {
  if (!isUsableCount(minutes)) {
    return { bucket: "unknown", label: "Play time unknown", pips: null };
  }

  const label = `~${minutes} min`;

  if (minutes <= 30) return { bucket: "quick", label, pips: 1 };
  if (minutes <= 60) return { bucket: "short", label, pips: 2 };
  if (minutes <= 120) return { bucket: "medium", label, pips: 4 };
  return { bucket: "long", label, pips: 6 };
}
