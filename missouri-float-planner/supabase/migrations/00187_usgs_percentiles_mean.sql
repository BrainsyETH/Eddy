-- 00187_usgs_percentiles_mean.sql
-- Add the mean column to the percentile snapshot.
--
-- DailyStatistics (src/lib/flow-providers/types.ts) carries `mean` alongside
-- the percentiles, so the snapshot must store it to reconstruct the type
-- faithfully once the legacy statistics service goes away.

alter table public.usgs_daily_percentiles
    add column if not exists mean numeric;

comment on table public.usgs_daily_percentiles is
    'Day-of-year discharge statistics snapshotted from the USGS legacy statistics service, which has no modern OGC equivalent and is slated for decommission. day_of_year is LEAP-YEAR normalized (Feb 29 = 60, Mar 1 = 61 always) so a given calendar date maps to one row regardless of year.';
