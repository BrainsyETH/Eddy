-- 20261118180000_remove_unsourced_rain_lag_estimates.sql
--
-- NOT YET APPLIED. Listed under [pending] in production-migrations.txt.
--
-- Clears rain_lag_hours and rain_lag_note on eight rivers, and only on those
-- eight, and only while each still holds the value recorded here. Each carried
-- a number of hours "from local rain to gauge response" and a sentence
-- restating it. None had a recorded source.
--
-- Lag was then measured from two years of recorded storms at 39 gauges
-- (scripts/research/rain-lag-2026-11). The measured times do not support the
-- estimates: at the gauges on these rivers the river typically started rising
-- 4 to 21 hours after the rain began and crested 13 to 67 hours after half of
-- it had fallen, and at most of them the time varied too much from storm to
-- storm to state as a range at all. The gauges that earned a range are listed
-- in src/lib/rainfall/lag-release.ts, which is the only place a lag is read
-- from now.
--
-- Scope. A row is cleared when its river and its hours both match the list
-- below, as read from production on 2026-11-18. A river not on the list, or a
-- listed river whose hours have since been changed, is left as it is: whoever
-- changed it may have had a source. The statement then checks that nothing on
-- the list still holds its old value.
--
-- The application stopped reading both columns in the same change, so this is
-- safe to apply before or after that deploy: code still running the old
-- version falls back to nothing more than its own built-in copy of the same
-- estimates. The columns stay.
--
-- Not touched: drop_rate_note. Those recovery rates are also unsourced and
-- still reach the river Read; they are a separate question.

do $$
declare
  cleared integer;
  remaining integer;
begin
  create temporary table legacy_rain_lag (slug text primary key, hours numeric not null) on commit drop;
  insert into legacy_rain_lag (slug, hours) values
    ('big-piney', 6),
    ('courtois', 3),
    ('current', 8),
    ('eleven-point', 8),
    ('huzzah', 3),
    ('jacks-fork', 4),
    ('meramec', 6),
    ('niangua', 10);

  update public.river_characteristics rc
  set rain_lag_hours = null,
      rain_lag_note = null
  from public.rivers r
  join legacy_rain_lag legacy on legacy.slug = r.slug
  where rc.river_id = r.id
    and rc.rain_lag_hours = legacy.hours;
  get diagnostics cleared = row_count;

  select count(*) into remaining
  from public.river_characteristics rc
  join public.rivers r on r.id = rc.river_id
  join legacy_rain_lag legacy on legacy.slug = r.slug
  where rc.rain_lag_hours = legacy.hours;
  if remaining <> 0 then
    raise exception 'rain lag estimates: % listed rows still hold their old value', remaining;
  end if;

  raise notice 'rain lag estimates: cleared % of 8 listed rivers', cleared;
end $$;
