import React, { useState } from "react";
import { Type, Users, Clock, Tag, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

const GENRE_SUGGESTIONS = ["Strategy", "Family", "Party", "Cooperative", "Deck-builder", "Abstract"];

type Errors = Partial<Record<"title" | "genre" | "minPlayers" | "maxPlayers" | "avgPlayMinutes", string>>;

const inputBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

export default function AddGameForm({ serverError }: Props) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [genre, setGenre] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [avgPlayMinutes, setAvgPlayMinutes] = useState("");
  const [loanStatus, setLoanStatus] = useState("available");
  const [errors, setErrors] = useState<Errors>({});

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
    <form method="POST" action="/api/games" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="title"
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
        id="authors"
        label="Authors"
        value={authors}
        onChange={setAuthors}
        placeholder="Comma-separated, e.g. Elizabeth Hargrave"
        icon={<Users className="size-4" />}
      />

      <div>
        <label htmlFor="genre" className="mb-1 block text-sm text-blue-100/80">
          Genre
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Tag className="size-4" />
          </span>
          <input
            id="genre"
            name="genre"
            list="genre-suggestions"
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
          <datalist id="genre-suggestions">
            {GENRE_SUGGESTIONS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        {errors.genre ? <p className="mt-1 text-xs text-red-300">{errors.genre}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          id="minPlayers"
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
          id="maxPlayers"
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
        id="avgPlayMinutes"
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
        <label htmlFor="loanStatus" className="mb-1 block text-sm text-blue-100/80">
          Loan status
        </label>
        <select
          id="loanStatus"
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

      <SubmitButton pendingText="Adding game..." icon={<Plus className="size-4" />}>
        Add game
      </SubmitButton>
    </form>
  );
}
