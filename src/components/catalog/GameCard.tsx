import { useState } from "react";
import { CheckCircle2, Circle, Pencil, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoanBadge, PlayedMeeple, PlayerCount, PlayTime } from "@/components/ui/GameMeta";
import type { CatalogGame } from "@/types";
import GameForm, { fromRow } from "./GameForm";

interface Props {
  game: CatalogGame;
  /** Active catalog query string (no leading `?`), posted back by the toggle
   *  forms so their PRG redirect returns to the same filtered view. */
  filters?: string;
}

const toggleBase = "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors";

/**
 * Interactive catalog card: view ↔ inline edit, plus a two-step delete confirm.
 * View mode reproduces the static card markup S-01 rendered in `catalog.astro`;
 * edit mode swaps in the shared `GameForm` pointed at `/api/games/{id}`. The
 * delete confirm submits a separate tiny form to `/api/games/{id}/delete` — the
 * edit form and delete form are never nested.
 */
export default function GameCard({ game, filters = "" }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <div className="border-border bg-card text-foreground rounded-2xl border p-4 backdrop-blur-xl">
        <GameForm
          mode="edit"
          idPrefix={`edit-${game.id}`}
          action={`/api/games/${game.id}`}
          initialValues={fromRow(game)}
          submitLabel="Save changes"
          pendingText="Saving..."
          onCancel={() => {
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="border-border bg-card text-foreground rounded-2xl border p-4 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{game.title}</h2>
        <LoanBadge loaned={game.loan_status === "loaned"} />
      </div>
      {game.authors.length > 0 && <p className="text-ink-muted mt-1 text-sm">{game.authors.join(", ")}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-ink-muted text-sm">{game.genre}</span>
        <PlayerCount min={game.min_players} max={game.max_players} />
        <PlayTime minutes={game.avg_play_minutes} />
        <PlayedMeeple played={game.played} />
      </div>

      {/* Per-member played/preference + shared loan toggles. Each is a tiny PRG
          form posting the DESIRED state (opposite of current) to its endpoint. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form method="POST" action={`/api/games/${game.id}/played`}>
          <input type="hidden" name="filters" value={filters} />
          <input type="hidden" name="played" value={game.played ? "false" : "true"} />
          <button
            type="submit"
            className={cn(
              toggleBase,
              game.played
                ? "border-success/40 bg-success-tint text-success-ink hover:bg-success/25"
                : "border-border text-foreground hover:bg-accent",
            )}
          >
            {game.played ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
            {game.played ? "Played" : "Not played"}
          </button>
        </form>

        {game.played && (
          <>
            <form method="POST" action={`/api/games/${game.id}/preference`}>
              <input type="hidden" name="filters" value={filters} />
              <input type="hidden" name="preference" value={game.preference === "liked" ? "clear" : "liked"} />
              <button
                type="submit"
                aria-pressed={game.preference === "liked"}
                className={cn(
                  toggleBase,
                  game.preference === "liked"
                    ? "border-success/40 bg-success-tint text-success-ink hover:bg-success/25"
                    : "border-border text-foreground hover:bg-accent",
                )}
              >
                <ThumbsUp className="size-3.5" />
                Like
              </button>
            </form>
            <form method="POST" action={`/api/games/${game.id}/preference`}>
              <input type="hidden" name="filters" value={filters} />
              <input type="hidden" name="preference" value={game.preference === "disliked" ? "clear" : "disliked"} />
              <button
                type="submit"
                aria-pressed={game.preference === "disliked"}
                className={cn(
                  toggleBase,
                  game.preference === "disliked"
                    ? "border-warning/40 bg-warning-tint text-warning-ink hover:bg-warning/25"
                    : "border-border text-foreground hover:bg-accent",
                )}
              >
                <ThumbsDown className="size-3.5" />
                Dislike
              </button>
            </form>
          </>
        )}

        <form method="POST" action={`/api/games/${game.id}/loan`}>
          <input type="hidden" name="filters" value={filters} />
          <input type="hidden" name="loanStatus" value={game.loan_status === "loaned" ? "available" : "loaned"} />
          <button type="submit" className={cn(toggleBase, "border-border text-foreground hover:bg-accent")}>
            {game.loan_status === "loaned" ? "Return" : "Loan out"}
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="text-ink-muted text-sm">Delete this game?</span>
            <form method="POST" action={`/api/games/${game.id}/delete`}>
              <button
                type="submit"
                className="bg-destructive text-destructive-foreground rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90"
              >
                Confirm delete
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
              }}
              className="border-border text-foreground hover:bg-accent rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className="border-border text-foreground hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              // `danger-ink` at rest (bare on the card), `destructive-ink` on hover —
              // hover paints the tint behind it, and the two inks target different grounds.
              className="border-destructive/60 text-danger-ink hover:bg-destructive-tint hover:text-destructive-ink flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
