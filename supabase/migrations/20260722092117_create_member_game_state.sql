-- Migration: per-member played + preference state (slice S-04).
--
-- The `games` catalog is shared (one physical copy per household), but "have I
-- played this?" and "do I like it?" are PER MEMBER. This migration adds the two
-- per-member tables the S-04 contract needs, keyed `(game_id, member_id)` with
-- `member_id default auth.uid()` (mirroring `games.created_by`). Loan status is
-- NOT here — it stays a shared column on `games`.
--
-- RLS is "read-all / write-own": both household members may SELECT every row
-- (enables the S-06 stats view later), but a member may only INSERT/UPDATE/DELETE
-- rows where `member_id = auth.uid()`.

-- game_played: the EXISTENCE of a row == "this member has played this game".
-- Mark = insert, un-mark = delete. Its `unique (game_id, member_id)` is the key
-- the preference table's composite FK references.
create table public.game_played (
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, member_id)
);

-- game_preference: binary like/dislike, only meaningful for a PLAYED title.
-- FR-005 is enforced in the DB via the composite FK to `game_played`: a
-- preference cannot exist without a played row, and un-marking played cascades
-- the preference away for free (no app-layer cascade needed). No direct FK to
-- `games`/`auth.users` — both are reached transitively through `game_played`.
create table public.game_preference (
  game_id uuid not null,
  member_id uuid not null default auth.uid(),
  preference text not null check (preference in ('liked', 'disliked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, member_id),
  foreign key (game_id, member_id) references public.game_played (game_id, member_id) on delete cascade
);

-- Read-all / write-own RLS on both tables. Four granular `authenticated`
-- policies each; no `anon` policy, so unauthenticated requests see nothing.
alter table public.game_played enable row level security;

create policy "authenticated can select game_played"
  on public.game_played
  for select
  to authenticated
  using (true);

create policy "authenticated can insert own game_played"
  on public.game_played
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy "authenticated can update own game_played"
  on public.game_played
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "authenticated can delete own game_played"
  on public.game_played
  for delete
  to authenticated
  using (member_id = auth.uid());

alter table public.game_preference enable row level security;

create policy "authenticated can select game_preference"
  on public.game_preference
  for select
  to authenticated
  using (true);

create policy "authenticated can insert own game_preference"
  on public.game_preference
  for insert
  to authenticated
  with check (member_id = auth.uid());

create policy "authenticated can update own game_preference"
  on public.game_preference
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "authenticated can delete own game_preference"
  on public.game_preference
  for delete
  to authenticated
  using (member_id = auth.uid());
