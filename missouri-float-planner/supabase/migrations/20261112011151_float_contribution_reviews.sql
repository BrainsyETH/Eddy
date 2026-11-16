-- Admin review decisions on contributed floats (Admin → Float contributions).
--
-- One optional decision per contributed trip: `use` (checked, fit to compare
-- with Eddy's estimates) or `exclude` (left out of the route summary). This is
-- review evidence only; nothing here changes public estimates.
--
-- Keyed to the archive row and cascading with it, so a trip the paddler deletes
-- (or an account that is removed) takes its review with it. Service role only:
-- RLS on, no policies, no grants to anon/authenticated.
create table public.float_contribution_reviews (
  user_id uuid not null,
  float_id text not null,
  decision text not null check (decision in ('use', 'exclude')),
  note text check (note is null or length(note) <= 1000),
  reviewed_by text not null check (length(reviewed_by) between 1 and 200),
  reviewed_at timestamptz not null default now(),
  primary key (user_id, float_id),
  foreign key (user_id, float_id)
    references public.float_archive (user_id, id) on delete cascade
);

alter table public.float_contribution_reviews enable row level security;
revoke all on public.float_contribution_reviews from public, anon, authenticated;
grant all on public.float_contribution_reviews to service_role;

comment on table public.float_contribution_reviews is
  'Admin review of contributed floats; service role only. Never feeds public estimates.';
