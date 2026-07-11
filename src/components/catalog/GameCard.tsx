import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameRow } from "@/types";
import GameForm, { fromRow } from "./GameForm";

interface Props {
  game: GameRow;
}

/**
 * Interactive catalog card: view ↔ inline edit, plus a two-step delete confirm.
 * View mode reproduces the static card markup S-01 rendered in `catalog.astro`;
 * edit mode swaps in the shared `GameForm` pointed at `/api/games/{id}`. The
 * delete confirm submits a separate tiny form to `/api/games/{id}/delete` — the
 * edit form and delete form are never nested.
 */
export default function GameCard({ game }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl">
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
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{game.title}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            game.loan_status === "loaned" ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200",
          )}
        >
          {game.loan_status === "loaned" ? "Loaned" : "Available"}
        </span>
      </div>
      {game.authors.length > 0 && <p className="mt-1 text-sm text-blue-100/70">{game.authors.join(", ")}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100/80">
        <span>{game.genre}</span>
        <span>
          {game.min_players}–{game.max_players} players
        </span>
        <span>~{game.avg_play_minutes} min</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="text-sm text-blue-100/80">Delete this game?</span>
            <form method="POST" action={`/api/games/${game.id}/delete`}>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Confirm delete
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
              }}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
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
              className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/40 px-3 py-1.5 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10"
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
