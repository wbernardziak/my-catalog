import React, { useState } from "react";
import { Users, Clock, Tag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/FormField";
import {
  describeFailure,
  GENERIC_ERROR_MESSAGE,
  type FailureReason,
  type RecommendationViewItem,
} from "@/lib/services/recommendationView";

const GENRE_SUGGESTIONS = ["Strategy", "Family", "Party", "Cooperative", "Deck-builder", "Abstract"];

const inputBase =
  "w-full rounded-lg bg-card border px-3 py-2 pl-10 text-foreground placeholder-ink-muted focus:outline-none focus:ring-2 transition-colors";

/** What the JSON route can return. The modeled union comes back only at HTTP 200;
 * 4xx/5xx carry `{ error }`. The island treats anything without an `ok` field as a
 * generic error (see the transport guard in `submit`). */
type RouteBody =
  | { ok: true; recommendations: RecommendationViewItem[] }
  | { ok: false; reason: FailureReason }
  | { error: string };

/** The panel the island is currently showing. */
type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; items: RecommendationViewItem[] }
  | { kind: "panel"; panel: "error" | "empty"; message: string };

type Errors = Partial<Record<"playerCount" | "availableMinutes", string>>;

export default function RecommendationFlow() {
  const [playerCount, setPlayerCount] = useState("");
  const [availableMinutes, setAvailableMinutes] = useState("");
  const [genre, setGenre] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [view, setView] = useState<ViewState>({ kind: "idle" });

  const loading = view.kind === "loading";

  function validate(): boolean {
    const next: Errors = {};

    const players = Number(playerCount);
    if (!playerCount || !Number.isInteger(players) || players < 1) {
      next.playerCount = "Player count is required and must be a whole number of at least 1";
    }

    if (availableMinutes) {
      const minutes = Number(availableMinutes);
      if (!Number.isInteger(minutes) || minutes < 1) {
        next.availableMinutes = "Available time must be a whole number of at least 1";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof Errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setView({ kind: "loading" });

    let body: RouteBody;
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerCount, availableMinutes, genre }),
      });
      // Guard the transport/error cases before touching the union: a non-2xx
      // response carries `{ error }`, not `{ ok }`.
      if (!response.ok) {
        setView({ kind: "panel", panel: "error", message: GENERIC_ERROR_MESSAGE });
        return;
      }
      body = (await response.json()) as RouteBody;
    } catch {
      setView({ kind: "panel", panel: "error", message: GENERIC_ERROR_MESSAGE });
      return;
    }

    if (!("ok" in body)) {
      setView({ kind: "panel", panel: "error", message: GENERIC_ERROR_MESSAGE });
      return;
    }

    if (body.ok) {
      setView({ kind: "results", items: body.recommendations });
      return;
    }

    const { kind, message } = describeFailure(body.reason);
    setView({ kind: "panel", panel: kind, message });
  }

  return (
    <div className="grid gap-8 md:grid-cols-[360px_1fr]">
      <form
        onSubmit={submit}
        noValidate
        className="border-border bg-card text-foreground h-fit space-y-4 rounded-2xl border p-6 backdrop-blur-xl"
      >
        <FormField
          id="play-playerCount"
          type="number"
          label="Players"
          value={playerCount}
          onChange={(v) => {
            setPlayerCount(v);
            clearError("playerCount");
          }}
          placeholder="e.g. 3"
          error={errors.playerCount}
          icon={<Users className="size-4" />}
        />

        <FormField
          id="play-availableMinutes"
          type="number"
          label="Available time (minutes, optional)"
          value={availableMinutes}
          onChange={(v) => {
            setAvailableMinutes(v);
            clearError("availableMinutes");
          }}
          placeholder="e.g. 45"
          error={errors.availableMinutes}
          icon={<Clock className="size-4" />}
        />

        <div>
          <label htmlFor="play-genre" className="text-ink-muted mb-1 block text-sm">
            Genre (optional)
          </label>
          <div className="relative">
            <span className="text-ink-muted absolute top-1/2 left-3 size-4 -translate-y-1/2">
              <Tag className="size-4" />
            </span>
            <input
              id="play-genre"
              list="play-genre-suggestions"
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value);
              }}
              placeholder="e.g. Strategy"
              className={cn(inputBase, "border-border focus:ring-ring")}
            />
            <datalist id="play-genre-suggestions">
              {GENRE_SUGGESTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2 font-medium transition-colors hover:opacity-90"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
              Finding games...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Recommend games
            </span>
          )}
        </Button>
      </form>

      <section aria-label="Recommendations" aria-busy={loading}>
        <Results view={view} />
      </section>
    </div>
  );
}

function Results({ view }: { view: ViewState }) {
  if (view.kind === "idle") {
    return (
      <div className="border-border bg-surface-subtle text-ink-muted rounded-2xl border p-8 text-center">
        Enter your play criteria and we&apos;ll suggest games from your catalog.
      </div>
    );
  }

  if (view.kind === "loading") {
    return (
      <div className="border-border bg-surface-subtle text-ink-muted rounded-2xl border p-8 text-center">
        Finding the best games for you...
      </div>
    );
  }

  if (view.kind === "panel") {
    return view.panel === "error" ? (
      <div className="border-destructive/40 bg-destructive-tint text-destructive-ink rounded-2xl border p-6">
        {view.message}
      </div>
    ) : (
      <div className="border-border bg-surface-subtle text-ink-muted rounded-2xl border p-8 text-center">
        {view.message}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {view.items.map((item) => (
        <li key={item.gameId} className="border-border bg-card text-foreground rounded-2xl border p-4 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {item.rank}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-ink-muted mt-1 text-sm">{item.reason}</p>
              <p className="text-ink-muted mt-2 text-xs">
                {item.genre} · {item.minPlayers}–{item.maxPlayers} players · {item.averagePlayMinutes} min
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
