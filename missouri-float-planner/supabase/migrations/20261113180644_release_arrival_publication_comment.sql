-- The release-arrival trial's results are now published after the fact
-- (docs/release-arrival-trial.md, "What is published"). The table comment
-- written with the tables said they are never shown to users; this corrects
-- the description. It changes no column, grant or policy.

comment on table public.release_arrival_predictions is
  'Release-arrival trial. One row per detected Bull Shoals release increase: whether the frozen rule issued an arrival estimate for the gauge near Norfork, and from what. Append-only; written by /api/cron/log-release-arrivals before the outcome exists. Read by the server only. An estimate is published only together with its outcome (src/lib/arrival-trial/public-results.ts); never a source for a live estimate.';
comment on table public.release_arrival_outcomes is
  'Release-arrival trial. What the gauge did after each logged release increase, read at least 26 hours later. Append-only. Read by the server only; a matched outcome is what allows its estimate to be published.';
