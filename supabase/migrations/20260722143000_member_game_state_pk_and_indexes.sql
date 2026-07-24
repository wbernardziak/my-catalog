-- Migration: promote the per-member state keys to PRIMARY KEY and index member_id.
--
-- Follow-up to 20260722092117 (impl review F2 + F4).
--
-- F4: both tables were created with only `unique (game_id, member_id)`. A table
-- without a primary key gets REPLICA IDENTITY NOTHING, which breaks Supabase
-- Realtime and the UPDATE/DELETE payloads of logical replication. The columns are
-- already `not null`, so the unique key is promoted verbatim — no semantic change,
-- upserts keep working (PostgREST accepts the PK as the `on_conflict` target).
--
-- The promotion has to drop and recreate `game_preference`'s composite FK, because
-- an FK is bound to the specific unique constraint it references and blocks the
-- drop otherwise. Same columns, same `on delete cascade` — see the DELIBERATE note
-- in 20260722092117 for why the cascade is intended.
--
-- F2: `listMemberState` filters both tables by `member_id` alone on every /catalog
-- render. The composite key's leading column is `game_id`, so that filter could not
-- use it and degraded to a sequential scan. Household-scale data makes this
-- harmless today; the index keeps it that way as history grows.

-- game_played: FK from game_preference must go first, then unique -> primary key.
alter table public.game_preference
  drop constraint game_preference_game_id_member_id_fkey;

alter table public.game_played
  drop constraint game_played_game_id_member_id_key;

alter table public.game_played
  add constraint game_played_pkey primary key (game_id, member_id);

alter table public.game_preference
  drop constraint game_preference_game_id_member_id_key;

alter table public.game_preference
  add constraint game_preference_pkey primary key (game_id, member_id);

alter table public.game_preference
  add constraint game_preference_game_id_member_id_fkey
  foreign key (game_id, member_id)
  references public.game_played (game_id, member_id)
  on delete cascade;

-- Single-column lookups by member (the /catalog merge/filter input).
create index game_played_member_id_idx on public.game_played (member_id);
create index game_preference_member_id_idx on public.game_preference (member_id);
