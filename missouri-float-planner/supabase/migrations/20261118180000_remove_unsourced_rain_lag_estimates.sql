-- 20261118180000_remove_unsourced_rain_lag_estimates.sql
--
-- NOT YET APPLIED. Listed under [pending] in production-migrations.txt.
--
-- Clears river_characteristics.rain_lag_hours and rain_lag_note. Eight rivers
-- carried a number of hours "from local rain to gauge response" and a sentence
-- restating it (big-piney 6, courtois 3, current 8, eleven-point 8, huzzah 3,
-- jacks-fork 4, meramec 6, niangua 10). None had a recorded source.
--
-- Lag was then measured from two years of recorded storms at 39 gauges
-- (scripts/research/rain-lag-2026-11). The measured times do not support the
-- estimates: at the gauges on these rivers the river typically started rising
-- 4 to 21 hours after the rain began and crested 13 to 67 hours after its
-- heaviest part, and at most of them the time varied too much from storm to
-- storm to state as a range at all. The gauges that earned a range are listed
-- in src/lib/rainfall/lag-release.ts, which is the only place a lag is read
-- from now.
--
-- The application stopped reading both columns in the same change, so this is
-- safe to apply before or after that deploy: code still running the old
-- version falls back to nothing more than its own built-in copy of the same
-- eight estimates. The columns stay; drop_rate_note is not touched.

update public.river_characteristics
set rain_lag_hours = null,
    rain_lag_note = null
where rain_lag_hours is not null
   or rain_lag_note is not null;
