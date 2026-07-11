-- Migration: add the soft-delete marker S-01 deferred.
--
-- Slice S-02 (edit / soft-delete). A game can be marked deleted without
-- physical removal by stamping `deleted_at`; existing rows stay `null` (= live).
-- No RLS change is needed — the shared-catalog `authenticated` update policy from
-- the create-games migration already permits setting `deleted_at`.

alter table public.games add column deleted_at timestamptz;

-- Keep the live-catalog query (`created_at desc where deleted_at is null`) fast.
-- Trivial and additive; household-scale data does not strictly require it.
create index games_live_created_at_idx
  on public.games (created_at desc)
  where deleted_at is null;
