import { cn } from "@/lib/utils";
import { duration, playerPips } from "@/lib/services/gameMeta";

/**
 * Shape-based game metadata: pips for player count, a die for duration, meeples
 * for who has played it, a badge for loan state.
 *
 * One implementation, in `.tsx`. Two of the three consumers (`GameCard`,
 * `RecommendationFlow`) are React islands where an `.astro` component cannot be
 * used; a React component renders statically inside `.astro` too, with no client
 * directive. A parallel `.astro` version would be two sets of pips to keep in
 * sync, which is exactly the failure this avoids.
 *
 * Every colour comes from a token role, so all three themes are covered. Marks use
 * `accent-ink` rather than `primary`: these are 6px dots and a 14px die drawn as
 * ink on a surface, not accent fills, and they land on cards as often as on the
 * page ground.
 */

interface PlayerCountProps {
  min: number | null | undefined;
  max: number | null | undefined;
  className?: string;
}

/** Filled pips for supported seats, hollow for the rest. */
export function PlayerCount({ min, max, className }: PlayerCountProps) {
  const { pips, label } = playerPips(min, max);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label}>
      {pips.length > 0 && (
        <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
          {pips.map((state, index) => (
            <span
              key={index}
              className={cn("size-[6px] rounded-full", state === "supported" ? "bg-accent-ink" : "bg-ink-muted/30")}
            />
          ))}
        </span>
      )}
      <span className="text-ink-muted text-sm">{label}</span>
    </span>
  );
}

interface PlayTimeProps {
  minutes: number | null | undefined;
  className?: string;
}

/** A die face whose pip count grows with the play time, plus the real minutes. */
export function PlayTime({ minutes, className }: PlayTimeProps) {
  const { label, pips } = duration(minutes);

  // Pip positions on a 16×16 die face, indexed by face value.
  const FACES: Record<number, [number, number][]> = {
    1: [[8, 8]],
    2: [
      [5, 5],
      [11, 11],
    ],
    4: [
      [5, 5],
      [11, 5],
      [5, 11],
      [11, 11],
    ],
    6: [
      [5, 4],
      [11, 4],
      [5, 8],
      [11, 8],
      [5, 12],
      [11, 12],
    ],
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label}>
      {pips !== null && (
        <svg viewBox="0 0 16 16" className="text-accent-ink size-3.5" aria-hidden="true">
          <rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          {FACES[pips].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="1.3" fill="currentColor" />
          ))}
        </svg>
      )}
      <span className="text-ink-muted text-sm">{label}</span>
    </span>
  );
}

interface PlayedMeepleProps {
  /** Whether the current member has played it. */
  played: boolean;
  /** Set false where surrounding copy already says what it means (e.g. a stats row). */
  labelled?: boolean;
  className?: string;
}

/** A meeple silhouette, filled once the member has played the game. */
export function PlayedMeeple({ played, labelled = true, className }: PlayedMeepleProps) {
  const title = played ? "Played" : "Not played yet";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={title}>
      <svg
        viewBox="0 0 16 16"
        className={cn("size-3.5", played ? "text-success-mark" : "text-ink-muted/40")}
        aria-hidden="true"
      >
        <path
          d="M8 1.6a1.7 1.7 0 0 1 1.3 2.8c1.25.35 2.2 1.25 2.55 2.4.1.4-.2.75-.6.75h-1.35l.5 3.45c.05.35-.2.7-.55.7H5.65c-.35 0-.6-.35-.55-.7l.5-3.45H4.25c-.4 0-.7-.35-.6-.75.35-1.15 1.3-2.05 2.55-2.4A1.7 1.7 0 0 1 8 1.6Z"
          fill={played ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.1"
        />
      </svg>
      {labelled ? <span className="text-ink-muted text-sm">{title}</span> : <span className="sr-only">{title}</span>}
    </span>
  );
}

interface LoanBadgeProps {
  loaned: boolean;
  className?: string;
}

/** Loan state as its own badge — shape and colour, not colour alone. */
export function LoanBadge({ loaned, className }: LoanBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        loaned ? "bg-warning-tint text-warning-ink" : "bg-success-tint text-success-ink",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
        {loaned ? (
          <path
            d="M2 8h9m0 0-3-3m3 3-3 3M13 3v10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M3 3.5h10v9H3zM3 6.5h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {loaned ? "Loaned" : "On the shelf"}
    </span>
  );
}
