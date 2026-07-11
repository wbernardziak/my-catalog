import React, { useState } from "react";
import { Type, Users, Clock, Tag, Plus, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { GameRow } from "@/types";

/** String-shaped form values (inputs are always strings) for both add and edit. */
export interface GameFormValues {
  title: string;
  authors: string;
  genre: string;
  minPlayers: string;
  maxPlayers: string;
  avgPlayMinutes: string;
  loanStatus: string;
}

/**
 * Turn a stored `GameRow` into the string-shaped `GameFormValues` the edit form
 * prefills with. Colocated with `GameForm` so edit prefill and the server schema
 * never drift: authors are joined, numbers stringified, loan status passed through.
 */
export function fromRow(row: GameRow): GameFormValues {
  return {
    title: row.title,
    authors: row.authors.join(", "),
    genre: row.genre,
    minPlayers: String(row.min_players),
    maxPlayers: String(row.max_players),
    avgPlayMinutes: String(row.avg_play_minutes),
    loanStatus: row.loan_status,
  };
}

const EMPTY_VALUES: GameFormValues = {
  title: "",
  authors: "",
  genre: "",
  minPlayers: "",
  maxPlayers: "",
  avgPlayMinutes: "",
  loanStatus: "available",
};

interface Props {
  mode: "create" | "edit";
  action: string;
  idPrefix: string;
  initialValues?: GameFormValues;
  serverError?: string | null;
  onCancel?: () => void;
  submitLabel?: string;
  pendingText?: string;
}

const GENRE_SUGGESTIONS = ["Strategy", "Family", "Party", "Cooperative", "Deck-builder", "Abstract"];

type Errors = Partial<Record<"title" | "genre" | "minPlayers" | "maxPlayers" | "avgPlayMinutes", string>>;

const inputBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

export default function GameForm({
  mode,
  action,
  idPrefix,
  initialValues = EMPTY_VALUES,
  serverError,
  onCancel,
  submitLabel,
  pendingText,
}: Props) {
  const [title, setTitle] = useState(initialValues.title);
  const [authors, setAuthors] = useState(initialValues.authors);
  const [genre, setGenre] = useState(initialValues.genre);
  const [minPlayers, setMinPlayers] = useState(initialValues.minPlayers);
  const [maxPlayers, setMaxPlayers] = useState(initialValues.maxPlayers);
  const [avgPlayMinutes, setAvgPlayMinutes] = useState(initialValues.avgPlayMinutes);
  const [loanStatus, setLoanStatus] = useState(initialValues.loanStatus);
  const [errors, setErrors] = useState<Errors>({});

  const genreListId = `${idPrefix}-genre-suggestions`;

  function validate() {
    const next: Errors = {};

    if (!title.trim()) next.title = "Title is required";
    if (!genre.trim()) next.genre = "Genre is required";

    const min = Number(minPlayers);
    const max = Number(maxPlayers);
    const minutes = Number(avgPlayMinutes);

    if (!minPlayers || !Number.isInteger(min) || min < 1) {
      next.minPlayers = "Minimum players must be a whole number of at least 1";
    }
    if (!maxPlayers || !Number.isInteger(max) || max < 1) {
      next.maxPlayers = "Maximum players must be a whole number of at least 1";
    } else if (!next.minPlayers && max < min) {
      next.maxPlayers = "Maximum players must be greater than or equal to minimum players";
    }
    if (!avgPlayMinutes || !Number.isInteger(minutes) || minutes <= 0) {
      next.avgPlayMinutes = "Average play time must be greater than 0";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof Errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id={`${idPrefix}-title`}
        name="title"
        label="Title"
        value={title}
        onChange={(v) => {
          setTitle(v);
          clearError("title");
        }}
        placeholder="e.g. Wingspan"
        error={errors.title}
        icon={<Type className="size-4" />}
      />

      <FormField
        id={`${idPrefix}-authors`}
        name="authors"
        label="Authors"
        value={authors}
        onChange={setAuthors}
        placeholder="Comma-separated, e.g. Elizabeth Hargrave"
        icon={<Users className="size-4" />}
      />

      <div>
        <label htmlFor={`${idPrefix}-genre`} className="mb-1 block text-sm text-blue-100/80">
          Genre
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Tag className="size-4" />
          </span>
          <input
            id={`${idPrefix}-genre`}
            name="genre"
            list={genreListId}
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              clearError("genre");
            }}
            placeholder="e.g. Strategy"
            className={cn(
              inputBase,
              errors.genre ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
          <datalist id={genreListId}>
            {GENRE_SUGGESTIONS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        {errors.genre ? <p className="mt-1 text-xs text-red-300">{errors.genre}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          id={`${idPrefix}-minPlayers`}
          name="minPlayers"
          type="number"
          label="Min players"
          value={minPlayers}
          onChange={(v) => {
            setMinPlayers(v);
            clearError("minPlayers");
          }}
          placeholder="1"
          error={errors.minPlayers}
          icon={<Users className="size-4" />}
        />
        <FormField
          id={`${idPrefix}-maxPlayers`}
          name="maxPlayers"
          type="number"
          label="Max players"
          value={maxPlayers}
          onChange={(v) => {
            setMaxPlayers(v);
            clearError("maxPlayers");
          }}
          placeholder="4"
          error={errors.maxPlayers}
          icon={<Users className="size-4" />}
        />
      </div>

      <FormField
        id={`${idPrefix}-avgPlayMinutes`}
        name="avgPlayMinutes"
        type="number"
        label="Average play time (minutes)"
        value={avgPlayMinutes}
        onChange={(v) => {
          setAvgPlayMinutes(v);
          clearError("avgPlayMinutes");
        }}
        placeholder="60"
        error={errors.avgPlayMinutes}
        icon={<Clock className="size-4" />}
      />

      <div>
        <label htmlFor={`${idPrefix}-loanStatus`} className="mb-1 block text-sm text-blue-100/80">
          Loan status
        </label>
        <select
          id={`${idPrefix}-loanStatus`}
          name="loanStatus"
          value={loanStatus}
          onChange={(e) => {
            setLoanStatus(e.target.value);
          }}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
        >
          <option value="available">Available</option>
          <option value="loaned">Loaned</option>
        </select>
      </div>

      <ServerError message={serverError} />

      {onCancel ? (
        <div className="flex gap-2">
          <div className="flex-1">
            <SubmitButton
              pendingText={pendingText ?? "Adding game..."}
              icon={mode === "edit" ? <Save className="size-4" /> : <Plus className="size-4" />}
            >
              {submitLabel ?? "Add game"}
            </SubmitButton>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-4 py-2 font-medium text-white transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      ) : (
        <SubmitButton
          pendingText={pendingText ?? "Adding game..."}
          icon={mode === "edit" ? <Save className="size-4" /> : <Plus className="size-4" />}
        >
          {submitLabel ?? "Add game"}
        </SubmitButton>
      )}
    </form>
  );
}
