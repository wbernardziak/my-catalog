-- Migration: create the shared board-game catalog table.
--
-- This is the first migration in the project. It seeds slice S-01: the `games`
-- table plus the shared-catalog RLS pattern that every later catalog slice
-- inherits. The catalog is a SINGLE shared catalog — every authenticated
-- household member may read and write every row. `created_by` is stored for
-- later attribution (S-04) but is NOT used to gate access.
--
-- Deliberately omitted (owned by later slices):
--   * `deleted_at`               -> S-02 (edit / soft-delete)
--   * `played` / `preference`    -> S-04 (per-member played + preference tables)

create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  authors text[] not null default '{}',
  genre text not null,
  min_players int not null check (min_players >= 1),
  max_players int not null check (max_players >= min_players),
  avg_play_minutes int not null check (avg_play_minutes > 0),
  loan_status text not null default 'available' check (loan_status in ('available', 'loaned')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared-catalog RLS: enable, then grant the `authenticated` role full access
-- via four granular per-operation policies. No `anon` policy exists, so
-- unauthenticated requests see nothing.
alter table public.games enable row level security;

create policy "authenticated can select games"
  on public.games
  for select
  to authenticated
  using (true);

create policy "authenticated can insert games"
  on public.games
  for insert
  to authenticated
  with check (true);

create policy "authenticated can update games"
  on public.games
  for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated can delete games"
  on public.games
  for delete
  to authenticated
  using (true);
